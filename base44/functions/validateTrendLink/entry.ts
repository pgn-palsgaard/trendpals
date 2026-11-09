import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';
import Anthropic from 'npm:@anthropic-ai/sdk@0.27.3';

// CROSS-REFERENCE — this SYSTEM_PROMPT is duplicated in
// base44/functions/revalidatePendingTrendLinks/entry.ts (backend functions cannot
// import from lib/). The CATEGORY CONSTRAINT block below must be kept identical in
// both files.
const SYSTEM_PROMPT = `You are validating whether a GNPD product launch is genuine evidence of a market trend, or whether the keyword overlap is incidental.

THE STANDARD — read the product the way a Mintel analyst does (calibrated 9 Nov 2026 on products Mintel itself cites):
A product is evidence of a trend when it VISIBLY CARRIES the trend's marker in its name, description, claims or format, so that an analyst could cite it as an example of the trend. Mintel cites a product for ONE clear, deliberate attribute: a pistachio-cream filling in a classic pastry illustrates a flavour-twist/heritage trend; freeze-dried fruit pieces on a cake illustrate a chunky-texture trend; '13g protein' on pancakes illustrates a protein trend.
The product does NOT have to be built around the trend, make it its primary or only positioning, or match every element of the trend description. The description explains WHY the trend matters (market data, drivers, regulation, supplier strategy); you judge only whether THIS product visibly shows the trend's marker.
If an 'Evidence test' is given for a trend, it defines the observable marker: apply it as written.
Does NOT count: a word that matches but means something else; or a property every product of this type has that this product does not call out (every cracker is crisp, plain bread is soft) — unless the product makes it a selling point in its name, description or claims.

HARD RULE — CATEGORY CONSTRAINT:
The product's category and the trend's category must be the same category. A product from one category is NEVER evidence for a trend belonging to another category, however strong the wording overlap is. A biscuit is not evidence of an ice cream trend; a chocolate bar is not evidence of a dairy trend. If the two categories shown below differ, the verdict is NOT_SUPPORT with a score of 0 — no exceptions, no partial credit.
(The pipeline gates on category BEFORE calling you, so a category mismatch reaching you is a defect: say so in your reasoning.)

HARD RULE — ingredient presence is NEVER positioning evidence:
The mere presence of an ingredient does not qualify a product for a positioning trend (plant-based, clean label, premium, free-from, health, sustainability, etc.).
Example: coconut oil or almonds in the ingredient list of a DAIRY ice cream does not make it plant-based. A positioning trend requires the product's actual positioning — its claims, descriptors, category placement, or marketing — to express the trend.

Example of genuine evidence:
- Trend: "Plant-based indulgence parity"
- Product: "Oatly Oat-Based Ice Cream Stick with Belgian Chocolate Coating", claims include "vegan, no animal ingredients"
- Verdict: SUPPORTS — the product is explicitly a plant-based version of an indulgent format
- Trend: "Texture as primary driver of bakery indulgence"
- Product: "Tre Marie Panettone with Semi Candied Pineapple" — naturally leavened panettone; semi-candied pineapple pieces add a fresh taste to the soft dough
- Verdict: SUPPORTS — visible fruit-piece inclusions in a soft dough are a deliberate texture contrast (Mintel cites this product for chunky textures), even though the product leads on heritage and flavour

Examples of incidental matches:
- Trend: "Plant-based indulgence parity"
- Product: "Black Truffle + Vanilla Mini Ice Creams with Crispy Chocolate Coating" (dairy ice cream; ingredients include coconut oil, almonds)
- Verdict: NOT_SUPPORT — plant ingredients in a dairy product are not plant-based positioning; no vegan or dairy-free claims
- Trend: "Texture innovation — crunch integrity at scale"
- Product: "Dark Chocolate Coated Coconut Chips" (ingredients mention "crunchy")
- Verdict: NOT_SUPPORT — crunch is a passive property of coconut chips, not an innovation the product is built around

If REFERENCE EXAMPLES are provided, they are products Mintel analysts themselves cited as evidence for this trend. Use them to calibrate what genuinely qualifies — a candidate qualifies when it shows the same KIND of marker, not when it is as strongly or exclusively positioned on the trend.

You will respond ONLY with a JSON object of the form:
{
  "verdict": "SUPPORTS" | "PARTIAL" | "NOT_SUPPORT",
  "confidence_score": <integer 0-100>,
  "reasoning": "<one sentence, max 30 words, why>"
}

Scoring guidance:
- SUPPORTS, score 70-95: the trend's marker is clearly and deliberately visible in the product's name, description or claims (it need not be the only or primary selling point)
- SUPPORTS, score 40-69: the marker is present but implicit or minor (e.g. only in the ingredient list or one passing word)
- PARTIAL, score 40-69: some elements align but the evidence is mixed
- NOT_SUPPORT, score 0-39: the keyword overlap is incidental or contradicts the trend; the product shows no marker of it

No prose outside the JSON. No markdown. No commentary.`;

function formatExpertExamples(examples) {
  if (!examples || examples.length === 0) return '';
  const lines = examples.slice(0, 5).map((ex, i) =>
    `${i + 1}. ${ex.product_name}${ex.brand ? ` (${ex.brand}${ex.country ? ', ' + ex.country : ''})` : ''} — claims: ${(ex.claims || []).join(', ') || 'n/a'}; analyst note: "${(ex.analyst_quote || ex.analyst_framing || '').slice(0, 200)}"`
  );
  return `\nREFERENCE EXAMPLES (Mintel analyst-curated evidence for this trend):\n${lines.join('\n')}\n`;
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { product, trend, matched_keywords } = await req.json();

    // Grounding: up to 5 Mintel analyst-curated examples linked to this trend
    let expertExamples = [];
    const trendId = trend?.trend_id || trend?.id;
    if (trendId) {
      try {
        expertExamples = await base44.asServiceRole.entities.ExpertExample.filter({ linked_trend_ids: trendId }, null, 5);
      } catch (_) { /* grounding optional */ }
    }

    const result = await runValidation(product, trend, matched_keywords, expertExamples);
    return Response.json(result);
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});

export async function runValidation(product, trend, matched_keywords, expertExamples = []) {
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
Description: ${(trend.description || '').slice(0, 600)}
Category: ${trend.category || ''}
${formatExpertExamples(expertExamples)}
KEYWORD OVERLAP
Matched: ${(matched_keywords || []).join(', ')}

Is this product genuine evidence of this trend? Respond with JSON only.`;

    const response = await anthropic.messages.create({
      model: 'claude-sonnet-5-5',
      max_tokens: 1200,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: userPrompt }]
    });

    const text = (response.content || []).filter(b => b?.type === 'text').map(b => b.text || '').join('\n').trim() || '';
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