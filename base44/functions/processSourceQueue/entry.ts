import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

// ── Inline category validator ──────────────────────────────────────────────
const VALID_CATEGORY_VALUES = ['bakery','condiments','chocolate_confectionery','dairy','ice_cream','meat','oils_fats','plant_based','rutf_rusf','out_of_scope','needs_human_review'];
const BRIEF_NORM = {'confectionery':'chocolate_confectionery','chocolate':'chocolate_confectionery','chocolate confectionery':'chocolate_confectionery','chocolate & confectionery':'chocolate_confectionery','bakery':'bakery','cake':'bakery','cake gels':'bakery','baking':'bakery','dairy':'dairy','ice cream':'ice_cream','ice-cream':'ice_cream','soft serve ice cream':'ice_cream','soft serve':'ice_cream','meat':'meat','processed meat':'meat','oils':'oils_fats','oils & fats':'oils_fats','fats':'oils_fats','margarine':'oils_fats','plant based':'plant_based','plant-based':'plant_based','plant based products':'plant_based','plant based dairy alternatives':'plant_based','plant-based dairy alternatives':'plant_based','plant based beverages and dairy alternatives':'plant_based','rutf':'rutf_rusf','rusf':'rutf_rusf','rutf and rusf':'rutf_rusf','condiments':'condiments','condiments & sauces':'condiments','sauces':'condiments','dressings':'condiments','spreads':'condiments','sweet spreads':'condiments','coffee creamer':'dairy','creamer':'dairy','creamers':'dairy'};

function validateCategoryArray(arr, sourceId, svc) {
  if (!Array.isArray(arr)) return [];
  const canonical = [];
  for (const raw of arr) {
    if (!raw) continue;
    if (VALID_CATEGORY_VALUES.includes(raw)) { canonical.push(raw); continue; }
    const normalized = BRIEF_NORM[raw.trim().toLowerCase()];
    if (normalized) {
      canonical.push(normalized);
      console.warn(`[processSourceQueue] Non-canonical category_relevance: "${raw}" → ${normalized}`);
      if (svc && sourceId) svc.entities.LLMCategoryDeviation.create({ source_id: sourceId, function_name: 'processSourceQueue', field_name: 'category_relevance', raw_llm_value: raw, normalized_to: normalized, normalization_succeeded: true, detected_at: new Date().toISOString() }).catch(() => {});
    } else {
      console.warn(`[processSourceQueue] Dropping unknown category_relevance: "${raw}"`);
      if (svc && sourceId) svc.entities.LLMCategoryDeviation.create({ source_id: sourceId, function_name: 'processSourceQueue', field_name: 'category_relevance', raw_llm_value: raw, normalized_to: null, normalization_succeeded: false, detected_at: new Date().toISOString() }).catch(() => {});
    }
  }
  return [...new Set(canonical)];
}

// ── Inline canonical region validator (mirrors lib/regions.js — no local imports in Deno) ──
const CANONICAL_REGION_KEYS = ['aspac', 'europe', 'north_america', 'latam', 'mena', 'sub_saharan_africa'];
function sanitizeRegions(arr) {
  if (!Array.isArray(arr)) return [];
  return [...new Set(arr.filter(r => CANONICAL_REGION_KEYS.includes(r)))];
}

const SKIP_TYPES = new Set(['gnpd']);
const EXTRACTING_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes

// ── Excerpt verification (non-destructive) ─────────────────────────────────
// Capture broad, promote narrow. NO excerpt is dropped — every extracted excerpt
// is stored with a promotion_status. Only 'promoted' feeds downstream report tokens.
//   QUALITY_MIN — HARD bar: boilerplate suppression is safe.
//   RELEVANCE_MIN — SOFT bar: protect signal-light-but-quality-high excerpts.
// Tunable per-call via qualityMin / relevanceMin in the request body.
const DEFAULT_QUALITY_MIN = 65;    // HARD
const DEFAULT_RELEVANCE_MIN = 35;  // SOFT

const SIGNAL_TYPES = new Set(['consumer_driver', 'category_movement', 'regional_expression', 'competitive_activity', 'other']);

// Classify an excerpt's promotion_status non-destructively. Never deletes.
function classifyExcerpt(e, qualityMin, relevanceMin) {
  const rel = Number(e.relevance_score);
  const qual = Number(e.quality_score);
  const inRange = (n) => Number.isFinite(n) && n >= 0 && n <= 100;
  if (!inRange(rel) || !inRange(qual)) {
    return { promotion_status: 'pending_review', promotion_reason: 'score missing or out of range' };
  }
  if (qual < qualityMin) {
    return { promotion_status: 'demoted', promotion_reason: `quality below threshold (${qual} < ${qualityMin})` };
  }
  if (rel < relevanceMin) {
    return { promotion_status: 'demoted', promotion_reason: `relevance below threshold (${rel} < ${relevanceMin})` };
  }
  return { promotion_status: 'promoted', promotion_reason: 'promoted' };
}

const MAX_RETRIES = 3;
// CL-18: separate cap for stuck-extracting recovery — never mixes semantics with retry_count
const MAX_STUCK_RECOVERIES = 2;

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// CL-18 FIX: use metadata_extraction.last_attempted (not updated_date) for staleness.
// updated_date is reset by any incidental write and would cause false negatives.
function isStuckExtracting(s) {
  if (s.pipeline_stage !== 'extracting') return false;
  const lastAttempted = s.metadata_extraction?.last_attempted;
  if (!lastAttempted) {
    // No last_attempted timestamp at all — fall back to updated_date as a conservative estimate
    const lastUpdate = new Date(s.updated_date).getTime();
    return (Date.now() - lastUpdate) > EXTRACTING_TIMEOUT_MS;
  }
  return (Date.now() - new Date(lastAttempted).getTime()) > EXTRACTING_TIMEOUT_MS;
}

// CL-18: recovery branch — only requires NOT gnpd, NOT already excerpted.
// Deliberately does NOT require verified===true or review_status==='approved' because
// a stuck-extracting record was placed in 'extracting' by autoExtractMetadata before
// human approval happens (verified is set during metadata extraction, not before it).
function isEligibleForStuckRecovery(s) {
  if (!isStuckExtracting(s)) return false;
  if (SKIP_TYPES.has(s.source_type)) return false;
  if (s.excerpts?.length > 0) return false; // already has content — not truly stuck
  if ((s.stuck_recovery_count || 0) >= MAX_STUCK_RECOVERIES) return false; // cap exhausted
  return true;
}

function detectFailureReason(err) {
  const msg = (err?.message || '').toLowerCase();
  if (msg.includes('429') || msg.includes('rate limit') || msg.includes('rate_limit')) return 'rate_limit';
  if (msg.includes('timeout') || msg.includes('timed out')) return 'timeout';
  if (msg.includes('parse') || msg.includes('json')) return 'parse_error';
  return 'unknown';
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json().catch(() => ({}));
    let { sourceIds, batchSize = 5, delaySeconds = 45, qualityMin, relevanceMin } = body;
    const QUALITY_MIN = Number.isFinite(qualityMin) ? qualityMin : DEFAULT_QUALITY_MIN;
    const RELEVANCE_MIN = Number.isFinite(relevanceMin) ? relevanceMin : DEFAULT_RELEVANCE_MIN;

    // Entity automation payload (Source update: verified + approved + uploaded)
    let isAutomation = false;
    if ((!sourceIds || sourceIds.length === 0) && body.event && body.data?.id) {
      sourceIds = [body.data.id];
      isAutomation = true;
    }

    let user = null;
    try { user = await base44.auth.me(); } catch (_) { /* automation context */ }
    if (!user && !isAutomation) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    const db = user ? base44 : base44.asServiceRole;

    // Resolve which sources to process
    let sourcesToProcess;
    if (Array.isArray(sourceIds) && sourceIds.length > 0) {
      const fetched = await Promise.all(sourceIds.map(async (id) => {
        try { return await db.entities.Source.get(id); } catch { return null; }
      }));
      // CL-18: two distinct eligibility branches — never conflated
      sourcesToProcess = fetched.filter(s => {
        if (!s || SKIP_TYPES.has(s.source_type)) return false;
        if (s.excerpts?.length > 0) return false;
        // Branch A: normal approved+verified path
        const normalPath = s.metadata_extraction?.verified === true &&
          s.review_status === 'approved' &&
          ['uploaded', 'metadata_extracted'].includes(s.pipeline_stage);
        // Branch B: stuck-extracting recovery (no verification requirement)
        const recoveryPath = isEligibleForStuckRecovery(s);
        return normalPath || recoveryPath;
      });
      console.log(`[processSourceQueue] Requested ${sourceIds.length} IDs, found ${sourcesToProcess.length} eligible sources`);
    } else {
      const [up, metaDone, extracting] = await Promise.all([
        db.entities.Source.filter({ pipeline_stage: 'uploaded' }, '-created_date', 500),
        db.entities.Source.filter({ pipeline_stage: 'metadata_extracted' }, '-created_date', 500),
        db.entities.Source.filter({ pipeline_stage: 'extracting' }, '-created_date', 100),
      ]);
      const all = [...up, ...metaDone, ...extracting];
      sourcesToProcess = all.filter(s => {
        if (!s || SKIP_TYPES.has(s.source_type)) return false;
        if (s.excerpts?.length > 0) return false;
        const normalPath = s.metadata_extraction?.verified === true &&
          s.review_status === 'approved' &&
          ['uploaded', 'metadata_extracted'].includes(s.pipeline_stage);
        const recoveryPath = isEligibleForStuckRecovery(s);
        return normalPath || recoveryPath;
      });
    }

    if (sourcesToProcess.length === 0) {
      return Response.json({ processed: 0, succeeded: 0, failed: 0, skipped: 0, batches: 0, message: 'No eligible sources found' });
    }

    const batches = [];
    for (let i = 0; i < sourcesToProcess.length; i += batchSize) {
      batches.push(sourcesToProcess.slice(i, i + batchSize));
    }

    console.log(`[processSourceQueue] ${sourcesToProcess.length} sources → ${batches.length} batches (size ${batchSize}, delay ${delaySeconds}s)`);

    let succeeded = 0;
    let failed = 0;
    let skipped = 0;
    let processedCount = 0;
    let timedOut = false;
    const promotionTotals = { promoted: 0, demoted: 0, pending_review: 0 };
    const perSourceCounts = [];

    const TIME_BUDGET_MS = 140000;
    const startTime = Date.now();

    outer:
    for (let batchIdx = 0; batchIdx < batches.length; batchIdx++) {
      const batch = batches[batchIdx];
      console.log(`[processSourceQueue] Starting batch ${batchIdx + 1}/${batches.length} (${batch.length} sources)`);

      for (const source of batch) {
        if (Date.now() - startTime > TIME_BUDGET_MS) {
          console.log('[processSourceQueue] Time budget reached — stopping');
          timedOut = true;
          break outer;
        }
        processedCount++;

        const isRecovery = isStuckExtracting(source);
        if (isRecovery) {
          const newCount = (source.stuck_recovery_count || 0) + 1;
          console.warn(`[processSourceQueue] STUCK RECOVERY: ${source.id} (attempt ${newCount}/${MAX_STUCK_RECOVERIES})`);
          // CL-18: increment stuck_recovery_count + last_stuck_recovery_at before attempting
          await db.entities.Source.update(source.id, {
            stuck_recovery_count: newCount,
            last_stuck_recovery_at: new Date().toISOString(),
          });
        }

        if (source.file_size && source.file_size > 5 * 1024 * 1024) {
          console.warn(`[processSourceQueue] LARGE FILE WARNING: ${source.title} (${Math.round(source.file_size / 1024 / 1024)}MB)`);
        }

        await db.entities.Source.update(source.id, { pipeline_stage: 'extracting' });
        const runStartedAt = new Date();
        const run = await base44.asServiceRole.entities.ProcessingRun.create({
          source_id: source.id,
          source_title: source.title || '',
          source_publisher: source.publisher || null,
          source_type_snapshot: source.source_type || null,
          triggered_by: isAutomation ? 'auto_upload' : 'manual_button',
          triggered_by_user: user?.email || 'automation',
          status: 'running',
          started_at: runStartedAt.toISOString(),
          agent_model: 'claude-sonnet-4-5',
        });

        try {
          let fileContent = '';
          if (source.file_url || source.url) {
            let readData;
            try {
              const readRes = await base44.asServiceRole.functions.invoke('readSourceContent', { source_id: source.id });
              readData = readRes?.data ?? readRes;
            } catch (invokeErr) {
              console.warn(`[processSourceQueue] asServiceRole invoke failed (${invokeErr.message}) — retrying via direct HTTP`);
              const fnUrl = `https://base44.app/api/apps/${Deno.env.get('BASE44_APP_ID')}/functions/readSourceContent`;
              const headers = { 'Content-Type': 'application/json' };
              for (const h of ['authorization', 'api_key', 'x-api-key', 'cookie']) {
                const v = req.headers.get(h);
                if (v) headers[h] = v;
              }
              const httpRes = await fetch(fnUrl, { method: 'POST', headers, body: JSON.stringify({ source_id: source.id }) });
              if (!httpRes.ok) throw new Error(`readSourceContent HTTP ${httpRes.status}: ${(await httpRes.text()).slice(0, 200)}`);
              readData = await httpRes.json();
            }
            if (readData?.ok) {
              fileContent = readData.content || '';
              console.log(`[processSourceQueue] Got ${fileContent.length} chars (${readData.mime_type}) for ${source.id}`);
            } else {
              console.warn(`[processSourceQueue] Could not read content for ${source.id}: ${readData?.error || 'unknown'}`);
            }
          }

          if (!fileContent || fileContent.trim().length < 50) {
            console.log(`[processSourceQueue] Skipping ${source.id} — no readable content`);
            await db.entities.Source.update(source.id, { pipeline_stage: 'skipped', skip_reason: 'image_only' });
            await base44.asServiceRole.entities.ProcessingRun.update(run.id, {
              status: 'skipped',
              skip_reason: 'no readable content',
              completed_at: new Date().toISOString(),
              duration_seconds: Math.round((Date.now() - runStartedAt.getTime()) / 1000),
              actions: [{ action_type: 'skip_rule_applied', timestamp: new Date().toISOString() }],
            });
            skipped++;
            continue;
          }

          const MAX_CHARS = 25000;
          const contentForLLM = fileContent.length > MAX_CHARS
            ? fileContent.slice(0, MAX_CHARS) + '\n\n[Content truncated for token limits]'
            : fileContent;

          const prompt = `You are an outside-in market intelligence processor for TrendPals, a commercial signal tool used by account managers and category teams preparing customer conversations. Extract structured market intelligence excerpts that surface category movements, consumer drivers, regional expressions, and competitive activity.

Source metadata:
- Title: ${source.title || 'Unknown'}
- Publisher: ${source.publisher || 'Unknown'}
- Source type: ${source.source_type || 'unknown'}
- Category: ${source.category || 'Unknown'}
- Date published: ${source.date_published || 'Unknown'}

Document content:
${contentForLLM}

Extract market intelligence excerpts that carry an outside-in market signal useful for a commercial team preparing customer conversations — category movements, consumer drivers, regional expressions, and competitive/innovation activity. Capture broad: do not pad with filler, but do not suppress a signal-rich excerpt just because it lacks an ingredient angle. Skip insights with no plausible market-intelligence value — generic boilerplate, navigation copy, table-of-contents fragments, advertising disclaimers. Do NOT skip an insight because it lacks an ingredient angle; signal-rich, ingredient-free excerpts are explicitly in scope.

For each excerpt, identify:
1. market_signal: What is the observable market trend or shift (1-2 sentences, outside-in, factual)
2. customer_pain: The specific challenge this creates for food manufacturers (1-2 sentences)
3. palsgaard_angle: OPTIONAL. If — and only if — the signal points to a specific application area where deep emulsifier/stabiliser expertise is plausibly relevant, describe the angle in one short sentence. Phrase as capability-led (e.g. "Deep expertise in X enables…") — never with "Palsgaard" as grammatical subject. If no clear angle exists, return empty string "". An empty value is a fully valid result and must NOT lower any score.
4. has_direct_role: OPTIONAL. true only when an ingredient angle is concretely identifiable in the excerpt; false otherwise. This is a tag for downstream filtering, NOT a quality signal. It must not influence relevance_score or quality_score.
5. capability_area: One of: sustainability, texture_quality, cost_efficiency, compliance_regulatory, new_product_development, food_safety, supply_chain, plant_based, general
6. confidence: high/medium/low based on how clearly the source supports this excerpt
7. relevance_score: Integer 0-100. How commercially useful is this signal for a TrendPals user preparing a customer conversation — i.e. does it surface a category movement, consumer driver, regional expression, or competitive/innovation activity that could become a better question to ask a customer? Score purely on signal value. Ingredient mentions (emulsifiers, stabilisers, any specific ingredient class) neither raise nor lower this score. A signal-rich, ingredient-free excerpt and a signal-rich, ingredient-heavy excerpt receive the same relevance score. 0 = no signal (generic chatter, non-food, off-category). 100 = a sharp, specific, conversation-starting market signal. Be strict on signal value; be neutral on ingredient presence.
8. quality_score: Integer 0-100. Specificity and evidence strength of the excerpt itself. 0 = boilerplate, navigation copy, vague generalities, unsupported speculation. 100 = a concrete claim with a figure, a named brand/launch/region, a quoted statistic, or a specific dated event. Penalise filler hard.
8b. signal_type: One of: consumer_driver, category_movement, regional_expression, competitive_activity, other. The kind of market signal this excerpt carries. Use "other" if none cleanly fits.
9. source_quote: A verbatim quote from the document (max 200 chars)
10. category_relevance: Array of canonical Palsgaard solution keys (e.g. ["ice_cream", "bakery"]). Valid values: bakery, condiments, chocolate_confectionery, dairy, ice_cream, meat, oils_fats, plant_based, rutf_rusf, out_of_scope, needs_human_review. For cross-category sources, populate all relevant keys — do NOT use needs_human_review when the source legitimately spans multiple categories; instead return multiple canonical keys.
11. trend_keywords: Array of 3-5 keyword phrases from this excerpt
12. regions: Array of canonical region keys mentioned or implied in this excerpt. Use ONLY these keys: aspac, europe, north_america, latam, mena, sub_saharan_africa.
   Rules:
   - If the excerpt explicitly mentions a region or country, tag the corresponding region key.
   - If the excerpt mentions a country, map it to its region (e.g. "Japan" → aspac, "Brazil" → latam, "Germany" → europe, "USA" → north_america, "UAE" → mena, "Nigeria" → sub_saharan_africa).
   - If the excerpt is global or mentions no region, set regions to an empty array [].
   - Multiple regions are allowed (e.g. "across Asia and Latin America" → ["aspac", "latam"]).
   - Do NOT guess. Only tag regions the text explicitly states or clearly implies.

Return ONLY a JSON object with this structure:
{
  "excerpts": [...],
  "ai_summary": "2-3 sentence summary of the document's key market intelligence insights"
}`;

          const anthropicRes = await fetch('https://api.anthropic.com/v1/messages', {
            method: 'POST',
            headers: {
              'x-api-key': Deno.env.get('ANTHROPIC_API_KEY'),
              'anthropic-version': '2023-06-01',
              'content-type': 'application/json',
            },
            body: JSON.stringify({
              model: 'claude-sonnet-4-5',
              max_tokens: 8192,
              messages: [{ role: 'user', content: prompt }],
            }),
          });
          if (!anthropicRes.ok) {
            const errText = await anthropicRes.text();
            throw new Error(`Anthropic API error ${anthropicRes.status}: ${errText}`);
          }
          const anthropicData = await anthropicRes.json();
          const rawText = anthropicData.content?.[0]?.text || '';
          const jsonMatch = rawText.match(/\{[\s\S]*\}/);
          if (!jsonMatch) throw new Error('No JSON found in Anthropic response');
          const result = JSON.parse(jsonMatch[0]);

          const rawExcerpts = result?.excerpts || [];

          // A document with content but no excerpts at all is a likely rate-limit/empty
          // response — treat as a failure so it retries. (Distinct from "all demoted".)
          if (rawExcerpts.length === 0) {
            throw new Error('LLM returned 0 excerpts — likely a rate limit or empty response');
          }

          // Non-destructive verification: classify EVERY excerpt, store all of them.
          // Filtering = promotion_status, never deletion. Only 'promoted' feeds reports.
          const tsNow = Date.now();
          const excerpts = rawExcerpts.map((e, i) => {
            const cls = classifyExcerpt(e, QUALITY_MIN, RELEVANCE_MIN);
            const sig = SIGNAL_TYPES.has(e.signal_type) ? e.signal_type : 'other';
            return {
              ...e,
              id: `${source.id}_exc_${tsNow}_${i}`,
              relevance_score: Number.isFinite(Number(e.relevance_score)) ? Number(e.relevance_score) : null,
              quality_score: Number.isFinite(Number(e.quality_score)) ? Number(e.quality_score) : null,
              signal_type: sig,
              promotion_status: cls.promotion_status,
              promotion_reason: cls.promotion_reason,
              category_relevance: validateCategoryArray(e.category_relevance, source.id, base44.asServiceRole),
              regions: sanitizeRegions(e.regions),
            };
          });

          const counts = { promoted: 0, demoted: 0, pending_review: 0 };
          for (const e of excerpts) counts[e.promotion_status]++;
          promotionTotals.promoted += counts.promoted;
          promotionTotals.demoted += counts.demoted;
          promotionTotals.pending_review += counts.pending_review;
          perSourceCounts.push({ source_id: source.id, ...counts });
          console.log(`[processSourceQueue] ${source.id} — verified ${excerpts.length} excerpts:`, counts);

          await db.entities.Source.update(source.id, {
            pipeline_stage: 'extracted',
            excerpts,
            rag_excerpt_count: counts.promoted,
            ai_summary: result?.ai_summary || '',
            processing_completed_at: new Date().toISOString(),
            processing_error: null,
            skip_reason: null,
            failure_reason: null,
          });

          await base44.asServiceRole.entities.ProcessingRun.update(run.id, {
            status: 'completed',
            completed_at: new Date().toISOString(),
            duration_seconds: Math.round((Date.now() - runStartedAt.getTime()) / 1000),
            excerpts_extracted: excerpts.length,
            actions: excerpts.map(e => ({
              action_type: 'excerpt_extracted',
              excerpt_id: e.id,
              link_confidence: e.confidence || null,
              timestamp: new Date().toISOString(),
            })),
          });

          console.log(`[processSourceQueue] ✓ ${source.id} — ${excerpts.length} excerpts`);
          succeeded++;

        } catch (err) {
          const reason = detectFailureReason(err);
          const newRetryCount = (source.retry_count || 0) + 1;
          console.error(`[processSourceQueue] ✗ ${source.id} (${reason}, attempt ${newRetryCount}): ${err.message}`);

          if (isRecovery) {
            // CL-18: stuck recovery failure path — separate field, separate failure_reason
            const recoveryCount = (source.stuck_recovery_count || 0) + 1; // already incremented above
            const exhausted = recoveryCount >= MAX_STUCK_RECOVERIES;
            await db.entities.Source.update(source.id, {
              pipeline_stage: 'failed',
              failure_reason: exhausted
                ? `stuck_extracting_retry_exhausted: ${recoveryCount} recovery attempts, last: ${reason}`
                : `stuck_extracting_attempt_${recoveryCount}_failed: ${reason}`,
              processing_error: err.message?.slice(0, 500) || 'Unknown error',
            });
          } else {
            const failureReason = newRetryCount > MAX_RETRIES
              ? `extraction_retry_limit: failed ${newRetryCount} times (last: ${reason})`
              : reason;
            await db.entities.Source.update(source.id, {
              pipeline_stage: 'failed',
              failure_reason: failureReason,
              processing_error: err.message?.slice(0, 500) || 'Unknown error',
              retry_count: newRetryCount,
              last_retry_at: new Date().toISOString(),
            });
          }
          await base44.asServiceRole.entities.ProcessingRun.update(run.id, {
            status: 'failed',
            fatal_error: err.message?.slice(0, 500) || 'Unknown error',
            completed_at: new Date().toISOString(),
            duration_seconds: Math.round((Date.now() - runStartedAt.getTime()) / 1000),
          });
          failed++;
        }
      }

      if (batchIdx < batches.length - 1 && Date.now() - startTime + delaySeconds * 1000 < TIME_BUDGET_MS) {
        console.log(`[processSourceQueue] Batch ${batchIdx + 1} done. Waiting ${delaySeconds}s...`);
        await sleep(delaySeconds * 1000);
      } else if (batchIdx < batches.length - 1) {
        console.log('[processSourceQueue] Not enough budget for another batch — stopping');
        timedOut = true;
        break;
      }
    }

    const remainingSources = sourcesToProcess.slice(processedCount);
    const summary = {
      processed: processedCount,
      succeeded,
      failed,
      skipped,
      remaining: remainingSources.length,
      remaining_ids: remainingSources.map(s => s.id),
      timed_out: timedOut,
      promotion_totals: promotionTotals,
      per_source_counts: perSourceCounts,
    };
    console.log('[processSourceQueue] Done:', summary);
    return Response.json(summary);

  } catch (error) {
    console.error('[processSourceQueue] Fatal error:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});