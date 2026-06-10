import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';
import Anthropic from 'npm:@anthropic-ai/sdk@0.27.3';

// LLM triage of GNPD→trend keyword matches. Every pending link is evaluated with
// full product context, the trend's description/market signal, and up to 5 Mintel
// analyst-curated ExpertExamples as grounding. Outcomes:
//   SUPPORTS ≥70  → auto_applied
//   SUPPORTS <70 / PARTIAL → stays pending WITH the LLM's reasoning
//   NOT_SUPPORT   → auto-rejected into rejected_link_candidates (never reaches the queue)

const SYSTEM_PROMPT = `You are validating whether a GNPD product launch is genuine evidence of a market trend, or whether the keyword overlap is incidental.

A product GENUINELY EXPRESSES a trend when the product's positioning, formulation, or claims actively embody what the trend describes — not merely when the same words happen to appear.

HARD RULE — ingredient presence is NEVER positioning evidence:
The mere presence of an ingredient does not qualify a product for a positioning trend (plant-based, clean label, premium, free-from, health, sustainability, etc.).
Example: coconut oil or almonds in the ingredient list of a DAIRY ice cream does not make it plant-based. A positioning trend requires the product's actual positioning — its claims, descriptors, category placement, or marketing — to express the trend.

Example of genuine evidence:
- Trend: "Plant-based indulgence parity"
- Product: "Oatly Oat-Based Ice Cream Stick with Belgian Chocolate Coating", claims include "vegan, no animal ingredients"
- Verdict: SUPPORTS — the product is explicitly a plant-based version of an indulgent format

Examples of incidental matches:
- Trend: "Plant-based indulgence parity"
- Product: "Black Truffle + Vanilla Mini Ice Creams with Crispy Chocolate Coating" (dairy ice cream; ingredients include coconut oil, almonds)
- Verdict: NOT_SUPPORT — plant ingredients in a dairy product are not plant-based positioning; no vegan or dairy-free claims
- Trend: "Texture innovation — crunch integrity at scale"
- Product: "Dark Chocolate Coated Coconut Chips" (ingredients mention "crunchy")
- Verdict: NOT_SUPPORT — crunch is a passive property of coconut chips, not an innovation the product is built around

If REFERENCE EXAMPLES are provided, they are products Mintel analysts themselves cited as evidence for this trend. Use them to calibrate what genuinely qualifies — a candidate should express the trend in a comparable way.

You will respond ONLY with a JSON object of the form:
{
  "verdict": "SUPPORTS" | "PARTIAL" | "NOT_SUPPORT",
  "confidence_score": <integer 0-100>,
  "reasoning": "<one sentence, max 30 words, why>"
}

Scoring guidance:
- SUPPORTS, score 70-95: product clearly and primarily expresses the trend
- SUPPORTS, score 40-69: product expresses the trend but not as its primary positioning
- PARTIAL, score 40-69: some elements align but the evidence is mixed
- NOT_SUPPORT, score 0-39: the keyword overlap is incidental or contradicts the trend; the product does not express it

No prose outside the JSON. No markdown. No commentary.`;

function formatExpertExamples(examples) {
  if (!examples || examples.length === 0) return '';
  const lines = examples.slice(0, 5).map((ex, i) =>
    `${i + 1}. ${ex.product_name}${ex.brand ? ` (${ex.brand}${ex.country ? ', ' + ex.country : ''})` : ''} — claims: ${(ex.claims || []).join(', ') || 'n/a'}; analyst note: "${(ex.analyst_quote || ex.analyst_framing || '').slice(0, 200)}"`
  );
  return `\nREFERENCE EXAMPLES (Mintel analyst-curated evidence for this trend):\n${lines.join('\n')}\n`;
}

async function runValidation(anthropic, product, trend, matched_keywords, expertExamples = []) {
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
Description: ${(trend.description || '').slice(0, 600)}
Category: ${trend.category || ''}
${formatExpertExamples(expertExamples)}
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
  return /^(Backfill: )?Matched \d+ keyword/i.test(reasoning);
}

// A pending link needs triage until the NEW grounded validator has stamped it
function needsTriage(link) {
  return link.review_status === 'pending' && !link.llm_validated_at;
}

const BATCH_SIZE = 5;
const PAUSE_MS = 10000;
const MAX_TIME_BUDGET_MS = 4 * 60 * 1000;

Deno.serve(async (req) => {
  const base44 = createClientFromRequest(req);
  let job = null;

  try {
    const body = await req.json().catch(() => ({}));
    const isPipeline = body.source === 'auto_parse_chain' || body.source === 'scheduled_resume' || !!body.event;

    let user = null;
    try { user = await base44.auth.me(); } catch (_) { /* automation context */ }
    if (!user && !isPipeline) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    if (user && user.role !== 'admin' && !isPipeline) return Response.json({ error: 'Admin access required' }, { status: 403 });

    const invocationStart = Date.now();
    const timeBudget = Math.min(Number(body.time_budget_ms) || MAX_TIME_BUDGET_MS, MAX_TIME_BUDGET_MS);
    const anthropic = new Anthropic({ apiKey: Deno.env.get('ANTHROPIC_API_KEY') });

    const globalTrends = await base44.asServiceRole.entities.GlobalTrend.filter({ is_active: true });
    const trendMap = {};
    globalTrends.forEach(t => { trendMap[t.id] = t; });

    // ExpertExample grounding — cached per trend
    const expertCache = {};
    async function getExpertExamples(trendId) {
      if (!(trendId in expertCache)) {
        try {
          expertCache[trendId] = await base44.asServiceRole.entities.ExpertExample.filter({ linked_trend_ids: trendId }, null, 5);
        } catch (_) { expertCache[trendId] = []; }
      }
      return expertCache[trendId];
    }

    // ── Audit mode: re-validate existing keyword-only AUTO_APPLIED links ──────
    if (body.mode === 'audit_auto_applied') {
      const auditStart = Date.now();
      let skip = Number(body.cursor) || 0;
      let validated = 0, kept = 0, demoted = 0, auditErrors = 0;
      let auditTimedOut = false;

      auditLoop:
      while (true) {
        if (Date.now() - auditStart > timeBudget) { auditTimedOut = true; break; }
        const batch = await base44.asServiceRole.entities.GNPDProduct.filter({}, 'created_date', 100, skip);
        if (batch.length === 0) break;

        for (const p of batch) {
          if (Date.now() - auditStart > timeBudget) { auditTimedOut = true; break auditLoop; }
          const targets = (p.trend_links || []).filter(
            l => l.review_status === 'auto_applied' && isLegacyReasoning(l.reasoning)
          );
          if (targets.length === 0) continue;

          const updatedLinks = [...p.trend_links];
          let changed = false;

          for (const link of targets) {
            const trend = trendMap[link.trend_id];
            if (!trend) continue;
            const examples = await getExpertExamples(link.trend_id);
            const result = await runValidation(anthropic, p, {
              trend_name: trend.trend_name,
              market_signal: trend.market_signal || '',
              description: trend.description || '',
              category: trend.category || ''
            }, link.matched_keywords || [], examples);
            validated++;

            const idx = updatedLinks.findIndex(l => l.trend_id === link.trend_id && l.review_status === 'auto_applied');
            if (idx === -1) continue;

            if (result.verdict === 'ERROR') {
              auditErrors++;
            } else if (result.verdict === 'SUPPORTS' && result.confidence_score >= 70) {
              updatedLinks[idx] = { ...updatedLinks[idx], confidence: 'high', confidence_score: result.confidence_score, reasoning: result.reasoning, llm_validated_at: result.validated_at };
              kept++; changed = true;
            } else {
              updatedLinks[idx] = {
                ...updatedLinks[idx],
                review_status: 'pending',
                confidence: result.verdict === 'PARTIAL' ? 'medium' : 'low',
                confidence_score: result.confidence_score,
                reasoning: result.reasoning,
                llm_validated_at: result.validated_at
              };
              demoted++; changed = true;
            }
          }

          if (changed) {
            const linkedTrendIds = updatedLinks.filter(l => l.review_status === 'auto_applied').map(l => l.trend_id);
            const hasPending = updatedLinks.some(l => l.review_status === 'pending');
            const supportLabel = updatedLinks.length === 0 ? 'NOT_SUPPORT'
              : updatedLinks.some(l => l.confidence === 'high') ? 'SUPPORTS' : 'PARTIAL';
            await base44.asServiceRole.entities.GNPDProduct.update(p.id, {
              trend_links: updatedLinks,
              linked_trend_ids: linkedTrendIds,
              processing_status: hasPending ? 'trend_linking_pending' : 'trend_linked',
              support_label: supportLabel
            });
          }
        }

        skip += batch.length;
        if (batch.length < 100) break;
      }

      return Response.json({
        mode: 'audit_auto_applied',
        links_validated: validated,
        kept_auto_applied: kept,
        demoted_to_pending: demoted,
        errors: auditErrors,
        next_cursor: auditTimedOut ? skip : null,
        done: !auditTimedOut
      });
    }

    // ── Snapshot product IDs needing triage (stable against status mutations) ─
    const pendingIds = [];
    let scanSkip = 0;
    while (true) {
      const scanBatch = await base44.asServiceRole.entities.GNPDProduct.filter(
        { processing_status: 'trend_linking_pending' }, 'created_date', 100, scanSkip
      );
      if (scanBatch.length === 0) break;
      for (const p of scanBatch) {
        if ((p.trend_links || []).some(needsTriage)) pendingIds.push(p.id);
      }
      if (scanBatch.length < 100) break;
      scanSkip += 100;
    }

    // ── Find or create ProcessingJob ─────────────────────────────────────────
    const existingJobs = await base44.asServiceRole.entities.ProcessingJob.filter(
      { job_type: 'revalidate_trend_links' }, '-created_date', 5
    );
    const activeJob = existingJobs.find(j =>
      j.status === 'running' || j.status === 'paused_timeout'
      || (j.status === 'failed' && j.current_cursor)
    );

    // Nothing to triage — close out any open job and exit cheaply
    if (pendingIds.length === 0) {
      if (activeJob) {
        await base44.asServiceRole.entities.ProcessingJob.update(activeJob.id, {
          status: 'completed', current_cursor: null, last_progress_at: new Date().toISOString(),
        });
      }
      return Response.json({ idle: true, message: 'No pending links need LLM triage' });
    }

    if (activeJob) {
      await base44.asServiceRole.entities.ProcessingJob.update(activeJob.id, {
        status: 'running',
        last_progress_at: new Date().toISOString(),
      });
      job = { ...activeJob, status: 'running' };
      console.log(`[triage] Resuming job ${activeJob.id}, processed: ${activeJob.processed_items}, remaining products: ${pendingIds.length}`);
    } else {
      const newJob = await base44.asServiceRole.entities.ProcessingJob.create({
        job_type: 'revalidate_trend_links',
        status: 'running',
        started_at: new Date().toISOString(),
        last_progress_at: new Date().toISOString(),
        total_items: pendingIds.length,
        processed_items: 0,
        current_cursor: null,
        summary: { links_rejected: 0, links_upgraded_to_auto_applied: 0, links_revalidated: 0, errors: 0 },
        triggered_by: user?.email || body.source || 'pipeline',
      });
      job = newJob;
      console.log(`[triage] Created new job ${job.id}, total_items: ${pendingIds.length}`);
    }

    const existingSummary = job.summary || {};
    let linksRevalidated = existingSummary.links_revalidated || 0;
    let linksUpgraded    = existingSummary.links_upgraded_to_auto_applied || 0;
    let linksRejected    = existingSummary.links_rejected || 0;
    let linksKeptPending = existingSummary.links_kept_pending || 0;
    let linksErrors      = existingSummary.errors || 0;
    const perTrend       = existingSummary.per_trend || {};
    let processedItems   = job.processed_items || 0;
    let lastCursor       = null;
    let timedOut         = false;

    function summarySnapshot() {
      return {
        links_revalidated: linksRevalidated,
        links_upgraded_to_auto_applied: linksUpgraded,
        links_rejected: linksRejected,
        links_kept_pending: linksKeptPending,
        errors: linksErrors,
        per_trend: perTrend,
      };
    }

    async function processProduct(product) {
      const targets = (product.trend_links || []).filter(needsTriage);
      if (targets.length === 0) return;

      const updatedLinks = [...(product.trend_links || [])];
      const rejectedCandidates = [...(product.rejected_link_candidates || [])];
      let changed = false;

      for (const link of targets) {
        const trend = trendMap[link.trend_id];
        if (!trend) continue;

        const examples = await getExpertExamples(link.trend_id);
        const result = await runValidation(anthropic, product, {
          trend_name: trend.trend_name,
          market_signal: trend.market_signal || '',
          description: trend.description || '',
          category: trend.category || ''
        }, link.matched_keywords || [], examples);

        linksRevalidated++;
        const tName = link.trend_name || trend.trend_name;
        if (!perTrend[tName]) perTrend[tName] = { promoted: 0, kept_pending: 0, rejected: 0 };

        const idx = updatedLinks.findIndex(l => l.trend_id === link.trend_id && l.review_status === 'pending' && !l.llm_validated_at);
        if (idx === -1) continue;

        if (result.verdict === 'ERROR') {
          // Leave the link untouched — it will be retried on the next run
          linksErrors++;
          continue;
        }

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
          perTrend[tName].rejected++;
          changed = true;
        } else if (result.verdict === 'SUPPORTS' && result.confidence_score >= 70) {
          updatedLinks[idx] = {
            ...updatedLinks[idx],
            review_status: 'auto_applied',
            confidence: 'high',
            confidence_score: result.confidence_score,
            reasoning: result.reasoning,
            llm_validated_at: result.validated_at
          };
          linksUpgraded++;
          perTrend[tName].promoted++;
          changed = true;
        } else {
          updatedLinks[idx] = {
            ...updatedLinks[idx],
            review_status: 'pending',
            confidence: 'medium',
            confidence_score: result.confidence_score,
            reasoning: result.reasoning,
            llm_validated_at: result.validated_at
          };
          linksKeptPending++;
          perTrend[tName].kept_pending++;
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
      for (const productId of pendingIds) {
        if (Date.now() - invocationStart > timeBudget) { timedOut = true; break; }

        const product = await base44.asServiceRole.entities.GNPDProduct.get(productId);
        if (!product || !(product.trend_links || []).some(needsTriage)) continue;

        await processProduct(product);
        lastCursor = product.id;
        processedItems++;

        await base44.asServiceRole.entities.ProcessingJob.update(job.id, {
          processed_items: processedItems,
          current_cursor: lastCursor,
          last_progress_at: new Date().toISOString(),
          summary: summarySnapshot(),
        });
      }
    } finally {
      const finalStatus = timedOut ? 'paused_timeout' : 'completed';
      try {
        await base44.asServiceRole.entities.ProcessingJob.update(job.id, {
          status: finalStatus,
          processed_items: processedItems,
          current_cursor: timedOut ? lastCursor : null,
          last_progress_at: new Date().toISOString(),
          summary: summarySnapshot(),
        });
        console.log(`[triage] Done — status=${finalStatus}, processed=${processedItems}, rejected=${linksRejected}, promoted=${linksUpgraded}, kept=${linksKeptPending}`);
      } catch (persistErr) {
        console.error('[triage] Failed to persist final status:', persistErr.message);
      }
    }

    return Response.json({
      job_id: job.id,
      status: timedOut ? 'paused_timeout' : 'completed',
      products_processed: processedItems,
      links_revalidated: linksRevalidated,
      links_promoted_to_auto_applied: linksUpgraded,
      links_kept_for_review: linksKeptPending,
      links_auto_rejected: linksRejected,
      links_errors: linksErrors,
      per_trend: perTrend,
    });

  } catch (error) {
    console.error('[triage] Fatal:', error.message);
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