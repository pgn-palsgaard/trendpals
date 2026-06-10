import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';
import Anthropic from 'npm:@anthropic-ai/sdk@0.27.3';

const SYSTEM_PROMPT = `You are validating whether a GNPD product launch is genuine evidence of a market trend, or whether the keyword overlap is incidental.

A product GENUINELY EXPRESSES a trend when the product's positioning, formulation, or claims actively embody what the trend describes — not merely when the same words happen to appear.

Example of genuine evidence:
- Trend: "Plant-based indulgence parity"
- Product: "Oatly Oat-Based Ice Cream Stick with Belgian Chocolate Coating", claims include "vegan, no animal ingredients"
- Verdict: SUPPORTS — the product is explicitly a plant-based version of an indulgent format

Example of incidental match:
- Trend: "Texture innovation — crunch integrity at scale"
- Product: "Dark Chocolate Coated Coconut Chips" (ingredients mention "crunchy")
- Verdict: NOT_SUPPORT — crunch is a passive property of coconut chips, not an innovation the product is built around

You will respond ONLY with a JSON object of the form:
{
  "verdict": "SUPPORTS" | "PARTIAL" | "NOT_SUPPORT",
  "confidence_score": <integer 0-100>,
  "reasoning": "<one sentence, max 30 words, why>"
}

Scoring guidance:
- SUPPORTS, score 70-95: product clearly and primarily expresses the trend
- PARTIAL, score 40-69: some elements align but the product is not primarily about this trend
- NOT_SUPPORT, score 0-39: the keyword overlap is incidental; the product does not express this trend

No prose outside the JSON. No markdown. No commentary.`;

async function runValidation(anthropic, product, trend, matched_keywords) {
  const validated_at = new Date().toISOString();
  try {
    const userPrompt = `PRODUCT
Name: ${product.product_name || ''}
Brand: ${product.brand || ''} (${product.company || ''})
Country: ${product.country || ''}
Category: ${product.category || ''} / ${product.sub_category || ''}
Description: ${product.product_description || ''}
Claims: ${Array.isArray(product.claims) ? product.claims.join(', ') : (product.claims || '')}
Flavours: ${Array.isArray(product.flavours) ? product.flavours.join(', ') : (product.flavours || '')}
Ingredients: ${product.ingredients || ''}

TREND
Name: ${trend.trend_name || ''}
Market signal: ${trend.market_signal || ''}
Description: ${(trend.description || '').slice(0, 400)}
Category: ${trend.category || ''}

KEYWORD OVERLAP
Matched: ${(matched_keywords || []).join(', ')}

Is this product genuine evidence of this trend? Respond with JSON only.`;

    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 400,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: userPrompt }]
    });

    const text = response.content[0]?.text?.trim() || '';
    const jsonText = text.replace(/^```(?:json)?\n?/i, '').replace(/\n?```$/i, '').trim();
    const parsed = JSON.parse(jsonText);
    return { verdict: parsed.verdict, confidence_score: parsed.confidence_score, reasoning: parsed.reasoning, validated_at };
  } catch (e) {
    return { verdict: 'ERROR', confidence_score: 0, reasoning: `LLM validation failed: ${e.message?.slice(0, 100)}`, validated_at };
  }
}

function isLegacyReasoning(reasoning) {
  if (!reasoning) return true;
  return /^Matched \d+ keyword/i.test(reasoning);
}

const BATCH_SIZE = 5;
const PAUSE_MS = 30000;
const TIME_BUDGET_MS = 4 * 60 * 1000; // 4 minutes soft cap

Deno.serve(async (req) => {
  const base44 = createClientFromRequest(req);
  let job = null;

  try {
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    if (user.role !== 'admin') return Response.json({ error: 'Admin access required' }, { status: 403 });

    const invocationStart = Date.now();
    const anthropic = new Anthropic({ apiKey: Deno.env.get('ANTHROPIC_API_KEY') });

    const globalTrends = await base44.asServiceRole.entities.GlobalTrend.filter({ is_active: true });
    const trendMap = {};
    globalTrends.forEach(t => { trendMap[t.id] = t; });

    // ── Find or create ProcessingJob ─────────────────────────────────────────
    const existingJobs = await base44.asServiceRole.entities.ProcessingJob.filter(
      { job_type: 'revalidate_trend_links' }, '-created_date', 5
    );
    const activeJob = existingJobs.find(j => j.status === 'running' || j.status === 'paused_timeout');

    let resumeCursor = null;

    if (activeJob) {
      resumeCursor = activeJob.current_cursor || null;
      await base44.asServiceRole.entities.ProcessingJob.update(activeJob.id, {
        status: 'running',
        last_progress_at: new Date().toISOString(),
      });
      job = { ...activeJob, status: 'running' };
      console.log(`[revalidate] Resuming job ${activeJob.id} from cursor ${resumeCursor}, processed so far: ${activeJob.processed_items}`);
    } else {
      let totalItems = 0;
      let countSkip = 0;
      while (true) {
        const batch = await base44.asServiceRole.entities.GNPDProduct.filter(
          { processing_status: 'trend_linking_pending' }, null, 100, countSkip
        );
        if (batch.length === 0) break;
        for (const p of batch) {
          const hasLegacy = (p.trend_links || []).some(
            l => l.review_status === 'pending' && isLegacyReasoning(l.reasoning)
          );
          if (hasLegacy) totalItems++;
        }
        if (batch.length < 100) break;
        countSkip += 100;
      }

      const newJob = await base44.asServiceRole.entities.ProcessingJob.create({
        job_type: 'revalidate_trend_links',
        status: 'running',
        started_at: new Date().toISOString(),
        last_progress_at: new Date().toISOString(),
        total_items: totalItems,
        processed_items: 0,
        current_cursor: null,
        summary: { links_rejected: 0, links_upgraded_to_auto_applied: 0, links_revalidated: 0, errors: 0 },
        triggered_by: user.email || user.id,
      });
      job = newJob;
      console.log(`[revalidate] Created new job ${job.id}, total_items: ${totalItems}`);
    }

    const existingSummary = job.summary || {};
    let linksRevalidated = existingSummary.links_revalidated || 0;
    let linksUpgraded    = existingSummary.links_upgraded_to_auto_applied || 0;
    let linksRejected    = existingSummary.links_rejected || 0;
    let linksErrors      = existingSummary.errors || 0;
    let processedItems   = job.processed_items || 0;
    let lastCursor       = resumeCursor;
    let timedOut         = false;

    async function processProduct(product) {
      const pendingLegacyLinks = (product.trend_links || []).filter(
        l => l.review_status === 'pending' && isLegacyReasoning(l.reasoning)
      );
      if (pendingLegacyLinks.length === 0) return;

      const updatedLinks = [...(product.trend_links || [])];
      const rejectedCandidates = [...(product.rejected_link_candidates || [])];
      let changed = false;

      for (const link of pendingLegacyLinks) {
        const trend = trendMap[link.trend_id];
        if (!trend) continue;

        const result = await runValidation(anthropic, product, {
          trend_id: trend.id,
          trend_name: trend.trend_name,
          market_signal: trend.market_signal || '',
          description: trend.description || '',
          category: trend.category || '',
          trend_keywords: trend.trend_keywords || []
        }, link.matched_keywords || []);

        linksRevalidated++;

        const idx = updatedLinks.findIndex(l => l.trend_id === link.trend_id && l.review_status === 'pending');
        if (idx === -1) continue;

        if (result.verdict === 'NOT_SUPPORT') {
          updatedLinks.splice(idx, 1);
          rejectedCandidates.push({
            trend_id: link.trend_id,
            trend_name: link.trend_name,
            matched_keywords: link.matched_keywords || [],
            llm_verdict: result.verdict,
            llm_reasoning: result.reasoning,
            llm_score: result.confidence_score,
            rejected_at: result.validated_at
          });
          linksRejected++;
          changed = true;
        } else if (result.verdict === 'ERROR') {
          updatedLinks[idx] = { ...updatedLinks[idx], confidence: 'low', confidence_score: 0, reasoning: result.reasoning };
          linksErrors++;
          changed = true;
        } else {
          let newStatus = 'pending';
          let newConfidence = 'medium';
          if (result.verdict === 'SUPPORTS' && result.confidence_score >= 70) {
            newStatus = 'auto_applied';
            newConfidence = 'high';
            linksUpgraded++;
          }
          updatedLinks[idx] = {
            ...updatedLinks[idx],
            review_status: newStatus,
            confidence: newConfidence,
            confidence_score: result.confidence_score,
            reasoning: result.reasoning
          };
          changed = true;
        }
      }

      if (changed) {
        const linkedTrendIds = updatedLinks.filter(l => l.review_status === 'auto_applied').map(l => l.trend_id);
        const hasPending = updatedLinks.some(l => l.review_status === 'pending');
        const supportLabel = updatedLinks.length === 0 ? 'NOT_SUPPORT'
          : updatedLinks.some(l => l.confidence === 'high') ? 'SUPPORTS' : 'PARTIAL';
        await base44.asServiceRole.entities.GNPDProduct.update(product.id, {
          trend_links: updatedLinks,
          rejected_link_candidates: rejectedCandidates,
          linked_trend_ids: linkedTrendIds,
          processing_status: hasPending ? 'trend_linking_pending' : 'trend_linked',
          support_label: supportLabel
        });
      }
    }

    // ── Main loop wrapped in try/finally ─────────────────────────────────────
    try {
      let skip = 0;
      let passedCursor = !resumeCursor;

      outerLoop:
      while (true) {
        if (Date.now() - invocationStart > TIME_BUDGET_MS) {
          timedOut = true;
          break;
        }

        const batch = await base44.asServiceRole.entities.GNPDProduct.filter(
          { processing_status: 'trend_linking_pending' }, 'created_date', BATCH_SIZE, skip
        );
        if (batch.length === 0) break;

        for (const product of batch) {
          if (!passedCursor) {
            if (product.id === resumeCursor) passedCursor = true;
            continue;
          }

          // Check time AFTER each product (not just between batches)
          if (Date.now() - invocationStart > TIME_BUDGET_MS) {
            timedOut = true;
            break outerLoop;
          }

          await processProduct(product);
          lastCursor = product.id;
          processedItems++;

          // Persist progress immediately after each product
          await base44.asServiceRole.entities.ProcessingJob.update(job.id, {
            processed_items: processedItems,
            current_cursor: lastCursor,
            last_progress_at: new Date().toISOString(),
            summary: {
              links_revalidated: linksRevalidated,
              links_upgraded_to_auto_applied: linksUpgraded,
              links_rejected: linksRejected,
              errors: linksErrors,
            },
          });

          // Check time again after persisting
          if (Date.now() - invocationStart > TIME_BUDGET_MS) {
            timedOut = true;
            break outerLoop;
          }
        }

        skip += batch.length;
        if (timedOut) break;

        if (batch.length === BATCH_SIZE) {
          await new Promise(r => setTimeout(r, PAUSE_MS));
        } else {
          break;
        }
      }
    } finally {
      // ALWAYS write final status — even if an exception escaped the loop
      const finalStatus = timedOut ? 'paused_timeout' : 'completed';
      try {
        await base44.asServiceRole.entities.ProcessingJob.update(job.id, {
          status: finalStatus,
          processed_items: processedItems,
          current_cursor: timedOut ? lastCursor : null,
          last_progress_at: new Date().toISOString(),
          summary: {
            links_revalidated: linksRevalidated,
            links_upgraded_to_auto_applied: linksUpgraded,
            links_rejected: linksRejected,
            errors: linksErrors,
          },
        });
        console.log(`[revalidate] Done — status=${finalStatus}, processed=${processedItems}, rejected=${linksRejected}, upgraded=${linksUpgraded}`);
      } catch (persistErr) {
        console.error('[revalidate] Failed to persist final status:', persistErr.message);
      }
    }

    return Response.json({
      job_id: job.id,
      status: timedOut ? 'paused_timeout' : 'completed',
      products_processed: processedItems,
      links_revalidated: linksRevalidated,
      links_upgraded_to_auto_applied: linksUpgraded,
      links_rejected: linksRejected,
      links_errors: linksErrors,
    });

  } catch (error) {
    console.error('[revalidate] Fatal:', error.message);
    // If job was created, mark it failed
    if (job?.id) {
      try {
        await base44.asServiceRole.entities.ProcessingJob.update(job.id, {
          status: 'failed',
          last_error: error.message,
          last_progress_at: new Date().toISOString(),
        });
      } catch (e) { /* ignore */ }
    }
    return Response.json({ error: error.message }, { status: 500 });
  }
});