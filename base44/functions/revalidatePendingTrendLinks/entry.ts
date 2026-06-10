import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';
import Anthropic from 'npm:@anthropic-ai/sdk@0.27.3';

// Inline validation logic (no local imports)
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

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    if (user.role !== 'admin') return Response.json({ error: 'Admin access required' }, { status: 403 });

    const body = await req.json().catch(() => ({}));
    const productId = body.product_id || null; // optional: single product
    const BATCH_SIZE = 5;
    const PAUSE_MS = 30000;

    const anthropic = new Anthropic({ apiKey: Deno.env.get('ANTHROPIC_API_KEY') });

    // Load trend lookup map
    const globalTrends = await base44.asServiceRole.entities.GlobalTrend.filter({ is_active: true });
    const trendMap = {};
    globalTrends.forEach(t => { trendMap[t.id] = t; });

    let productsProcessed = 0;
    let linksRevalidated = 0;
    let linksUpgraded = 0;    // pending → auto_applied
    let linksRejected = 0;    // removed as NOT_SUPPORT
    let linksErrors = 0;

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
          // Remove the link, add to rejected audit trail
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
          // Keep as pending, update reasoning
          updatedLinks[idx] = {
            ...updatedLinks[idx],
            confidence: 'low',
            confidence_score: 0,
            reasoning: result.reasoning
          };
          linksErrors++;
          changed = true;
        } else {
          // SUPPORTS or PARTIAL — update status and reasoning
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

      productsProcessed++;
    }

    if (productId) {
      // Single-product mode
      const products = await base44.asServiceRole.entities.GNPDProduct.filter({ id: productId }, null, 1);
      if (products[0]) await processProduct(products[0]);
    } else {
      // Full sweep with batching + rate-limit pauses
      let skip = 0;
      while (true) {
        const batch = await base44.asServiceRole.entities.GNPDProduct.filter(
          { processing_status: 'trend_linking_pending' }, null, BATCH_SIZE, skip
        );
        if (batch.length === 0) break;

        for (const product of batch) {
          await processProduct(product);
        }

        skip += batch.length;
        if (batch.length === BATCH_SIZE) {
          // Pause between batches to stay under rate limits
          await new Promise(r => setTimeout(r, PAUSE_MS));
        } else {
          break;
        }
      }
    }

    return Response.json({
      products_processed: productsProcessed,
      links_revalidated: linksRevalidated,
      links_upgraded_to_auto_applied: linksUpgraded,
      links_rejected: linksRejected,
      links_errors: linksErrors
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});