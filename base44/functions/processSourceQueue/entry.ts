import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';
import { readSourceText as readText } from '../../shared/extractText.ts';
import { divisionOf, framing, categoryKeysFor } from '../../shared/divisionFraming.ts';

// ── Inline category validator ──────────────────────────────────────────────
const VALID_CATEGORY_VALUES = ['bakery','condiments','chocolate_confectionery','dairy','ice_cream','meat','oils_fats','plant_based','rutf_rusf','personal_care','out_of_scope','needs_human_review'];
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

// ── Phase 2C: source-level pre-extraction gate ─────────────────────────────
// Stages a source can be in when it becomes eligible for the pre-gate. The
// skipped_low_value transition is conditional on the prior stage being one of
// these — never a blind flip. Confirmed against the current normal-path
// eligibility (review_status approved + verified + pipeline_stage in this set).
const PRE_GATE_ELIGIBLE_STAGES = ['uploaded', 'metadata_extracted', 'pre_gate_error', 'skipped', 'failed'];
// Stages a source may be re-processed from when explicitly requested/eligible.
// 'skipped' and 'failed' are included so a source that failed on a transient
// error (or was skipped on an unreadable read) can be reprocessed.
const RETRYABLE_STAGES = ['uploaded', 'metadata_extracted', 'pre_gate_error', 'skipped', 'failed'];
const PRE_GATE_TEXT_CHARS = 2000;

// Cheap single-shot pre-gate. Returns one of:
//   { proceed: true|false, confidence: 'high'|'low', reason }   — valid decision
//   { error: '<message>' }                                      — call/parse failure → pre_gate_error path
// NO silent default: a malformed or failed call returns { error }, never a proceed/skip guess.
// confidence only steers a proceed:false outcome:
//   proceed:false + high → skipped_low_value (permanent skip)
//   proceed:false + low  → pre_gate_review (flagged for human review, not permanent)
// Missing/invalid confidence on a proceed:false is treated as 'low' (safe default).
async function runPreGate(source, openingText) {
  const summary = source.metadata_extraction?.summary || '';
  const description = source.subtitle || source.notes || '';
  const opening = (openingText || '').slice(0, PRE_GATE_TEXT_CHARS);
  // The gate must judge the source against ITS OWN division's industry — a food-framed
  // gate rejects every Personal Care source as "not relevant to food".
  const f = framing(divisionOf(source));

  const prompt = `You are evaluating whether a source document should be extracted for TrendPals, an outside-in market intelligence tool for commercial teams in the ${f.industry}. TrendPals captures market signals in this scope: ${f.signalScope} — to help account managers prepare better customer conversations.
Judge relevance ONLY against the ${f.industry}. Do not reject a source for being outside any other industry.
Given the title, summary, and opening text below, answer:

Does this source plausibly contain ANY market-intelligence signal of this kind?
Be inclusive — uncertain → proceed. Only reject sources that are clearly off-scope (e.g. ${f.offScopeExamples}).
A product-launch database extract for this industry (e.g. a Mintel GNPD product listing) DOES carry category and claim signals — treat it as in scope.
Ingredient mentions are NOT required. A signal-rich, ingredient-free source is fully in scope.

When returning proceed: false, also assess your confidence:

"high" — you are certain this source has no market-intelligence value (e.g. equipment manual, HR policy, unrelated regulatory filing, pure advertising with zero category content). The source will be permanently skipped.
"low" — you lean toward no, but the source might contain some signal that isn't obvious from the title and opening text. The source will be flagged for human review, not permanently skipped.

When in doubt between high and low, choose low. A false "high" permanently loses a source; a false "low" only adds one item to a review queue.
When returning proceed: true, set confidence to "high" (the field is required but has no behavioural effect on proceed:true).

Title: ${source.title || 'Unknown'}
Summary: ${summary || 'None provided'}
Description: ${description || 'None provided'}
Opening text (first ~${PRE_GATE_TEXT_CHARS} chars):
${opening || 'None provided'}

Return JSON: { "proceed": boolean, "confidence": "high" | "low", "reason": "one short sentence" }.`;

  let usage = null;
  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': Deno.env.get('ANTHROPIC_API_KEY'),
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5',
        max_tokens: 256,
        messages: [{ role: 'user', content: prompt }],
      }),
    });
    if (!res.ok) {
      const errText = await res.text();
      return { error: `pre_gate API error ${res.status}: ${errText.slice(0, 200)}` };
    }
    const data = await res.json();
    usage = data.usage || null;
    const rawText = data.content?.[0]?.text || '';
    const jsonMatch = rawText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return { error: 'pre_gate: no JSON in response', usage };
    let parsed;
    try {
      parsed = JSON.parse(jsonMatch[0]);
    } catch (parseErr) {
      return { error: `pre_gate: malformed JSON (${parseErr.message})`, usage };
    }
    // Parse-time validation — proceed MUST be a real boolean, reason a string.
    if (typeof parsed.proceed !== 'boolean') {
      return { error: `pre_gate: invalid 'proceed' (got ${JSON.stringify(parsed.proceed)})`, usage };
    }
    const reason = typeof parsed.reason === 'string' && parsed.reason.trim()
      ? parsed.reason.trim().slice(0, 300)
      : (parsed.proceed ? 'proceed (no reason given)' : 'rejected (no reason given)');
    // Missing/invalid confidence on a proceed:false is the safe default 'low'
    // (flag for review, never permanent-skip on malformed output).
    const confidence = parsed.confidence === 'high' ? 'high' : 'low';
    return { proceed: parsed.proceed, confidence, reason, usage };
  } catch (err) {
    return { error: `pre_gate: ${err.message || 'network error'}`, usage };
  }
}

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
        // Branch A: normal approved+verified path. pre_gate_error is included so a
        // transient pre-gate failure is retried (pre_gate_evaluated stays false).
        const normalPath = s.metadata_extraction?.verified === true &&
          s.review_status === 'approved' &&
          RETRYABLE_STAGES.includes(s.pipeline_stage);
        // Branch B: stuck-extracting recovery (no verification requirement)
        const recoveryPath = isEligibleForStuckRecovery(s);
        return normalPath || recoveryPath;
      });
      console.log(`[processSourceQueue] Requested ${sourceIds.length} IDs, found ${sourcesToProcess.length} eligible sources`);
    } else {
      const [up, metaDone, extracting, preGateErr] = await Promise.all([
        db.entities.Source.filter({ pipeline_stage: 'uploaded' }, '-created_date', 500),
        db.entities.Source.filter({ pipeline_stage: 'metadata_extracted' }, '-created_date', 500),
        db.entities.Source.filter({ pipeline_stage: 'extracting' }, '-created_date', 100),
        db.entities.Source.filter({ pipeline_stage: 'pre_gate_error' }, '-created_date', 200),
      ]);
      const all = [...up, ...metaDone, ...extracting, ...preGateErr];
      sourcesToProcess = all.filter(s => {
        if (!s || SKIP_TYPES.has(s.source_type)) return false;
        if (s.excerpts?.length > 0) return false;
        const normalPath = s.metadata_extraction?.verified === true &&
          s.review_status === 'approved' &&
          RETRYABLE_STAGES.includes(s.pipeline_stage);
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

        // Content read is hoisted to loop scope so the pre-gate and full
        // extraction share a single read (no double read). Uses the shared
        // extractor directly — a cross-function invoke resolved to a stale
        // deployment and failed every PDF ("No such module pdf.worker.mjs").
        let fileContent = '';
        const readSourceText = async () => {
          if (!(source.file_url || source.url)) return;
          let readData;
          try {
            readData = await readText(base44.asServiceRole, source);
          } catch (readErr) {
            readData = { ok: false, error: readErr.message };
          }
          if (readData?.ok) {
            fileContent = readData.content || '';
            console.log(`[processSourceQueue] Got ${fileContent.length} chars (${readData.mime_type}) for ${source.id}`);
          } else {
            console.warn(`[processSourceQueue] Could not read content for ${source.id}: ${readData?.error || 'unknown'}`);
          }
        };

        // ── Phase 2C: SOURCE-LEVEL PRE-EXTRACTION GATE ─────────────────────
        // Runs at most once per source (guarded by pre_gate_evaluated). Forward-
        // facing: a source with pre_gate_evaluated===true skips straight to the
        // atomic claim + extraction below. Recovery sources also skip the gate —
        // they were already past the gate when first claimed; re-gating them would
        // re-spend tokens and is not the recovery path's job.
        if (source.pre_gate_evaluated !== true && !isRecovery) {
          await readSourceText();
          // No readable content → leave the existing 'no readable content' path
          // (the claim+extraction block below) to mark it skipped. Don't pre-gate emptiness.
          if (fileContent && fileContent.trim().length >= 50) {
            const gate = await runPreGate(source, fileContent);

            if (gate.error) {
              // NO silent default. Transient error state; pre_gate_evaluated stays false.
              // Conditional: only move INTO pre_gate_error from an eligible pre-gate stage,
              // so a concurrent writer that already advanced the source isn't clobbered.
              console.warn(`[processSourceQueue] PRE-GATE ERROR: ${source.id} — ${gate.error}`);
              await db.entities.Source.updateMany(
                { id: source.id, pipeline_stage: { $in: PRE_GATE_ELIGIBLE_STAGES } },
                { $set: { pipeline_stage: 'pre_gate_error', processing_error: gate.error.slice(0, 500) } }
              );
              skipped++;
              continue;
            }

            if (gate.proceed === false) {
              // Confidence split:
              //   high → skipped_low_value (permanent skip unless manually overridden)
              //   low  → pre_gate_review (flagged for human review, not permanently skipped)
              // Either way pre_gate_evaluated=true is written in the SAME atomic $set, so
              // the gate never re-runs. Conditional on an eligible stage + not-yet-evaluated;
              // updated===0 → another caller already advanced it; abort silently.
              const targetStage = gate.confidence === 'high' ? 'skipped_low_value' : 'pre_gate_review';
              const skipRes = await db.entities.Source.updateMany(
                { id: source.id, pipeline_stage: { $in: PRE_GATE_ELIGIBLE_STAGES }, pre_gate_evaluated: { $ne: true } },
                { $set: { pipeline_stage: targetStage, pre_gate_evaluated: true, pre_gate_reason: gate.reason } }
              );
              if (!skipRes || skipRes.updated === 0) {
                console.log(`[processSourceQueue] PRE-GATE reject claim lost: ${source.id} — already evaluated/advanced. Aborting.`);
              } else {
                console.log(`[processSourceQueue] PRE-GATE → ${targetStage} (confidence=${gate.confidence}): ${source.id} — ${gate.reason}`);
              }
              skipped++;
              continue; // do NOT run full extraction
            }

            // proceed === true: mark evaluated (+reason) in one conditional write,
            // conditional on pre_gate_evaluated !== true (idempotent — second caller
            // sees updated===0 but still falls through to the atomic claim, which
            // is itself the concurrency guard for extraction).
            await db.entities.Source.updateMany(
              { id: source.id, pre_gate_evaluated: { $ne: true } },
              { $set: { pre_gate_evaluated: true, pre_gate_reason: gate.reason } }
            );
            console.log(`[processSourceQueue] PRE-GATE → proceed: ${source.id} — ${gate.reason}`);
          }
        }

        // ── ATOMIC CLAIM (TOCTOU fix) ──────────────────────────────────────
        // Single conditional DB op: flip pipeline_stage → 'extracting' ONLY if the
        // source is still claimable (in a pre-extraction stage). updateMany matches
        // and writes atomically; updated === 0 means another caller already claimed
        // it (or it left a claimable stage) — abort silently, no LLM spend.
        // For a stuck-recovery source the current stage IS 'extracting', so the
        // claim guard explicitly includes 'extracting' but ANDs on excerpts being
        // empty (verified separately just below via re-fetch) to stay hermetic.
        const claimableStages = isRecovery
          ? ['extracting', 'uploaded', 'metadata_extracted', 'failed']
          : RETRYABLE_STAGES;
        const claimRes = await db.entities.Source.updateMany(
          { id: source.id, pipeline_stage: { $in: claimableStages } },
          { $set: { pipeline_stage: 'extracting', processing_started_at: new Date().toISOString() } }
        );
        if (!claimRes || claimRes.updated === 0) {
          console.log(`[processSourceQueue] CLAIM LOST: ${source.id} — another caller is processing it. Aborting silently.`);
          skipped++;
          continue;
        }
        // Defence-in-depth: re-fetch and confirm no excerpts were written by a
        // writer that claimed-then-completed in the gap. Hermetic for the count jump.
        const claimed = await db.entities.Source.get(source.id);
        if (claimed?.excerpts?.length > 0) {
          console.log(`[processSourceQueue] CLAIM STALE: ${source.id} already has ${claimed.excerpts.length} excerpts from a concurrent run. Aborting.`);
          skipped++;
          continue;
        }
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
          // Reuse the content already read for the pre-gate; only read here if the
          // gate path was skipped (recovery / already-evaluated source).
          if (!fileContent) {
            await readSourceText();
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

          const fr = framing(divisionOf(source));
          const prompt = `You are an outside-in market intelligence processor for TrendPals, a commercial signal tool used by account managers and category teams in the ${fr.industry} preparing customer conversations. Extract structured market intelligence excerpts that surface ${fr.signalScope}.

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
2. customer_pain: The specific challenge this creates for ${fr.manufacturers} (1-2 sentences)
3. palsgaard_angle: OPTIONAL. If — and only if — the signal points to ${fr.angle}, describe the angle in one short sentence. Phrase as capability-led (e.g. "Deep expertise in X enables…") — never with "Palsgaard" as grammatical subject. If no clear angle exists, return empty string "". An empty value is a fully valid result and must NOT lower any score.
4. has_direct_role: OPTIONAL. true only when an ingredient angle is concretely identifiable in the excerpt; false otherwise. This is a tag for downstream filtering, NOT a quality signal. It must not influence relevance_score or quality_score.
5. capability_area: One of: sustainability, texture_quality, cost_efficiency, compliance_regulatory, new_product_development, food_safety, supply_chain, plant_based, general
6. confidence: high/medium/low based on how clearly the source supports this excerpt
7. relevance_score: Integer 0-100. How commercially useful is this signal for a TrendPals user preparing a customer conversation — i.e. does it surface a category movement, consumer driver, regional expression, or competitive/innovation activity that could become a better question to ask a customer? Score purely on signal value. Ingredient mentions (emulsifiers, stabilisers, any specific ingredient class) neither raise nor lower this score. A signal-rich, ingredient-free excerpt and a signal-rich, ingredient-heavy excerpt receive the same relevance score. 0 = no signal (generic chatter, wrong industry, off-category). 100 = a sharp, specific, conversation-starting market signal. Be strict on signal value; be neutral on ingredient presence.
8. quality_score: Integer 0-100. Specificity and evidence strength of the excerpt itself. 0 = boilerplate, navigation copy, vague generalities, unsupported speculation. 100 = a concrete claim with a figure, a named brand/launch/region, a quoted statistic, or a specific dated event. Penalise filler hard.
8b. signal_type: One of: consumer_driver, category_movement, regional_expression, competitive_activity, other. The kind of market signal this excerpt carries. Use "other" if none cleanly fits.
9. source_quote: A verbatim quote from the document (max 200 chars)
10. category_relevance: Array of canonical Palsgaard solution keys. Valid values for this source: ${categoryKeysFor(divisionOf(source)).join(', ')}. For cross-category sources, populate all relevant keys — do NOT use needs_human_review when the source legitimately spans multiple categories; instead return multiple canonical keys.
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

          // Gateway timeouts (524/529/overloaded) are transient on long documents —
          // retry with a progressively shorter prompt instead of failing the source.
          let anthropicData = null;
          let lastErr = null;
          for (let attempt = 0; attempt < 3; attempt++) {
            const shrink = attempt === 0 ? 1 : (attempt === 1 ? 0.6 : 0.35);
            const attemptPrompt = shrink === 1
              ? prompt
              : prompt.replace(contentForLLM, contentForLLM.slice(0, Math.floor(contentForLLM.length * shrink)));
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
                messages: [{ role: 'user', content: attemptPrompt }],
              }),
            });
            if (anthropicRes.ok) { anthropicData = await anthropicRes.json(); break; }
            const errText = await anthropicRes.text();
            lastErr = new Error(`Anthropic API error ${anthropicRes.status}: ${errText.slice(0, 200)}`);
            if (![429, 500, 502, 503, 524, 529].includes(anthropicRes.status)) throw lastErr;
            console.warn(`[processSourceQueue] Anthropic ${anthropicRes.status} — retry ${attempt + 2}/3 with shorter prompt`);
            await sleep(4000);
          }
          if (!anthropicData) throw lastErr;
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