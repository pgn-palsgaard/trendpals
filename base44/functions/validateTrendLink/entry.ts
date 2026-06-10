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

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { product, trend, matched_keywords } = await req.json();

    const result = await runValidation(product, trend, matched_keywords);
    return Response.json(result);
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});

export async function runValidation(product, trend, matched_keywords) {
  const validated_at = new Date().toISOString();
  try {
    const anthropic = new Anthropic({ apiKey: Deno.env.get('ANTHROPIC_API_KEY') });

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
    // Strip markdown fences if present
    const jsonText = text.replace(/^```(?:json)?\n?/i, '').replace(/\n?```$/i, '').trim();
    const parsed = JSON.parse(jsonText);

    return {
      verdict: parsed.verdict,
      confidence_score: parsed.confidence_score,
      reasoning: parsed.reasoning,
      validated_at
    };
  } catch (e) {
    return {
      verdict: 'ERROR',
      confidence_score: 0,
      reasoning: `LLM validation failed: ${e.message?.slice(0, 100)}`,
      validated_at
    };
  }
}