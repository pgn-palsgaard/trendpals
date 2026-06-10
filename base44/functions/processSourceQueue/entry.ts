import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

const SKIP_TYPES = new Set(['gnpd']);
const SKIP_STAGES = new Set(['extracting', 'extracted', 'gnpd_ready']);

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
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
    let { sourceIds, batchSize = 5, delaySeconds = 45 } = body;

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
      // Fetch requested sources directly by ID — no list cap
      const fetched = await Promise.all(sourceIds.map(async (id) => {
        try { return await db.entities.Source.get(id); } catch { return null; }
      }));
      // When specific IDs are passed, skip GNPD type and enforce the human verification gate
      // Idempotency: only 'uploaded' sources without existing excerpts are eligible
      sourcesToProcess = fetched.filter(s =>
        s && !SKIP_TYPES.has(s.source_type) &&
        s.metadata_extraction?.verified === true &&
        s.review_status === 'approved' &&
        s.pipeline_stage === 'uploaded' &&
        !(s.excerpts?.length > 0)
      );
      console.log(`[processSourceQueue] Requested ${sourceIds.length} IDs, found ${sourcesToProcess.length} eligible sources`);
    } else {
      // Find all uploaded sources (excluding GNPD)
      const uploaded = await db.entities.Source.filter({ pipeline_stage: 'uploaded' }, '-created_date', 500);
      // Verification gate: only human-verified + approved sources may be extracted
      sourcesToProcess = uploaded.filter(s =>
        !SKIP_TYPES.has(s.source_type) &&
        s.metadata_extraction?.verified === true &&
        s.review_status === 'approved' &&
        !(s.excerpts?.length > 0)
      );
    }

    if (sourcesToProcess.length === 0) {
      return Response.json({ processed: 0, succeeded: 0, failed: 0, skipped: 0, batches: 0, message: 'No eligible sources found' });
    }

    // Split into batches
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

    // Stay under the ~3 min function limit; remaining sources are handled by a follow-up call
    const TIME_BUDGET_MS = 140000;
    const startTime = Date.now();

    outer:
    for (let batchIdx = 0; batchIdx < batches.length; batchIdx++) {
      const batch = batches[batchIdx];
      console.log(`[processSourceQueue] Starting batch ${batchIdx + 1}/${batches.length} (${batch.length} sources)`);

      for (const source of batch) {
        if (Date.now() - startTime > TIME_BUDGET_MS) {
          console.log('[processSourceQueue] Time budget reached — stopping, remaining sources left in queue');
          timedOut = true;
          break outer;
        }
        processedCount++;
        // Warn about large files
        if (source.file_size && source.file_size > 5 * 1024 * 1024) {
          console.warn(`[processSourceQueue] LARGE FILE WARNING: ${source.title} (${Math.round(source.file_size / 1024 / 1024)}MB) — may cause rate limiting`);
        }

        // Mark as extracting + open a ProcessingRun audit record
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
          // Read the source content via the shared extractor (PDF/PPTX/DOCX/HTML/TXT/MD)
          let fileContent = '';
          if (source.file_url || source.url) {
            const readRes = await base44.asServiceRole.functions.invoke('readSourceContent', { source_id: source.id });
            const readData = readRes?.data ?? readRes;
            if (readData?.ok) {
              fileContent = readData.content || '';
              console.log(`[processSourceQueue] Got ${fileContent.length} chars (${readData.mime_type}) for ${source.id}`);
            } else {
              console.warn(`[processSourceQueue] Could not read content for ${source.id}: ${readData?.error || 'unknown'}`);
            }
          }

          if (!fileContent || fileContent.trim().length < 50) {
            console.log(`[processSourceQueue] Skipping ${source.id} — no readable content`);
            await db.entities.Source.update(source.id, {
              pipeline_stage: 'skipped',
              skip_reason: 'image_only',
            });
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

          // Truncate to stay under 30k input tokens/min rate limit (~4 chars per token, target ~20k tokens)
          const MAX_CHARS = 25000;
          const truncated = fileContent.length > MAX_CHARS;
          const contentForLLM = truncated ? fileContent.slice(0, MAX_CHARS) + '\n\n[Content truncated for token limits]' : fileContent;

          const prompt = `You are a market intelligence processor for an emulsifier and stabilizer supplier. Extract structured market intelligence excerpts from the following document.

Source metadata:
- Title: ${source.title || 'Unknown'}
- Publisher: ${source.publisher || 'Unknown'}
- Source type: ${source.source_type || 'unknown'}
- Category: ${source.category || 'Unknown'}
- Date published: ${source.date_published || 'Unknown'}

Document content:
${contentForLLM}

Extract 3-8 structured excerpts from this document. Each excerpt should represent a distinct market signal, customer pain point, or strategic insight relevant to an emulsifier and stabilizer supplier.

For each excerpt, identify:
1. market_signal: What is the observable market trend or shift (1-2 sentences, outside-in, factual)
2. customer_pain: The specific challenge this creates for food manufacturers (1-2 sentences)
3. palsgaard_angle: How emulsifier/stabilizer expertise can address this challenge (1-2 sentences, NO product names, NO dosages)
4. has_direct_role: true if emulsifier/stabilizer expertise can directly help, false if it's general market context
5. capability_area: One of: sustainability, texture_quality, cost_efficiency, compliance_regulatory, new_product_development, food_safety, supply_chain, plant_based, general
6. confidence: high/medium/low based on how clearly the source supports this excerpt
7. source_quote: A verbatim quote from the document (max 200 chars)
8. category_relevance: Array of relevant food categories (e.g. ["Ice Cream", "Bakery"])
9. trend_keywords: Array of 3-5 keyword phrases from this excerpt

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
              max_tokens: 4096,
              messages: [{ role: 'user', content: prompt }],
            }),
          });
          if (!anthropicRes.ok) {
            const errText = await anthropicRes.text();
            throw new Error(`Anthropic API error ${anthropicRes.status}: ${errText}`);
          }
          const anthropicData = await anthropicRes.json();
          const rawText = anthropicData.content?.[0]?.text || '';
          // Extract JSON from response
          const jsonMatch = rawText.match(/\{[\s\S]*\}/);
          if (!jsonMatch) throw new Error('No JSON found in Anthropic response');
          const result = JSON.parse(jsonMatch[0]);

          const excerpts = (result?.excerpts || []).map((e, i) => ({
            ...e,
            id: `${source.id}_exc_${Date.now()}_${i}`,
          }));

          if (excerpts.length === 0) {
            throw new Error('LLM returned 0 excerpts — likely a rate limit or empty response');
          }

          await db.entities.Source.update(source.id, {
            pipeline_stage: 'extracted',
            excerpts,
            rag_excerpt_count: excerpts.length,
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

          // Expert example extraction for Mintel reports is handled automatically
          // by the "Extract Expert Examples on Mintel extraction" entity automation
          // (fires when pipeline_stage changes to 'extracted').

        } catch (err) {
          const reason = detectFailureReason(err);
          console.error(`[processSourceQueue] ✗ ${source.id} (${reason}): ${err.message}`);
          await db.entities.Source.update(source.id, {
            pipeline_stage: 'failed',
            failure_reason: reason,
            processing_error: err.message?.slice(0, 500) || 'Unknown error',
            retry_count: (source.retry_count || 0) + 1,
            last_retry_at: new Date().toISOString(),
          });
          await base44.asServiceRole.entities.ProcessingRun.update(run.id, {
            status: 'failed',
            fatal_error: err.message?.slice(0, 500) || 'Unknown error',
            completed_at: new Date().toISOString(),
            duration_seconds: Math.round((Date.now() - runStartedAt.getTime()) / 1000),
          });
          failed++;
        }
      }

      // Delay between batches (skip after last batch or when out of budget)
      if (batchIdx < batches.length - 1 && Date.now() - startTime + delaySeconds * 1000 < TIME_BUDGET_MS) {
        console.log(`[processSourceQueue] Batch ${batchIdx + 1} done. Waiting ${delaySeconds}s before next batch...`);
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
    };
    console.log('[processSourceQueue] Done:', summary);
    return Response.json(summary);

  } catch (error) {
    console.error('[processSourceQueue] Fatal error:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});