import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';
import Anthropic from 'npm:@anthropic-ai/sdk@0.27.3';

// LLM triage of GNPD→trend keyword matches. Every pending link is evaluated with
// full product context, the trend's description/market signal, and up to 5 Mintel
// analyst-curated ExpertExamples as grounding. Outcomes:
//   SUPPORTS ≥70  → auto_applied
//   SUPPORTS <70 / PARTIAL → stays pending WITH the LLM's reasoning
//   NOT_SUPPORT   → auto-rejected into rejected_link_candidates (never reaches the queue)

// CROSS-REFERENCE — this SYSTEM_PROMPT is duplicated in
// base44/functions/validateTrendLink/entry.ts (backend functions cannot import from
// lib/). The CATEGORY CONSTRAINT block below must be kept identical in both files.
const SYSTEM_PROMPT = `You are validating whether a GNPD product launch is genuine evidence of a market trend, or whether the keyword overlap is incidental.

A product GENUINELY EXPRESSES a trend when the product's positioning, formulation, or claims actively embody what the trend describes — not merely when the same words happen to appear.

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

async function runValidation(anthropic, product, trend, matched_keywords, expertExamples = [], model = DEFAULT_MODEL) {
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
      model,
      max_tokens: 800,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: userPrompt }]
    });

    const text = (response.content || []).filter(b => b?.type === 'text').map(b => b.text || '').join('\n').trim() || '';
    const jsonText = text.replace(/^```(?:json)?\n?/i, '').replace(/\n?```$/i, '').trim();
    const parsed = JSON.parse(jsonText);
    return { verdict: parsed.verdict, confidence_score: parsed.confidence_score, reasoning: parsed.reasoning, validated_at };
  } catch (e) {
    console.error('[triage] LLM validation error:', e.message?.slice(0, 300));
    return { verdict: 'ERROR', confidence_score: 0, reasoning: `LLM validation failed: ${e.message?.slice(0, 100)}`, validated_at };
  }
}

// ── Cost/speed settings (2 Nov 2026) ─────────────────────────────────────────
// Haiku is the default triage model: this is a constrained classification task with
// explicit rules and Mintel reference examples. Sonnet stays selectable via body.model
// (e.g. for compare_models runs or a re-audit).
// 9 Nov 2026: default moved to Haiku 5.5 after compare_models on 100 bakery pairs:
// stricter and, on manual check of every hard flip, more faithful to trend definitions
// than Haiku 4.5; ~85% cheaper per call with prompt caching (system prompt cached).
const DEFAULT_MODEL = 'claude-haiku-5-5';
const ALLOWED_MODELS = ['claude-haiku-4-5', 'claude-haiku-5-5', 'claude-sonnet-4-5', 'claude-sonnet-5-5'];
const INGREDIENTS_MAX = 600;   // enough to judge e.g. vegetable fat in a coating
const DESCRIPTION_MAX = 800;

// Batched variant of SYSTEM_PROMPT: identical rules, but ONE call judges every
// candidate trend for a product, so the product context is sent once, not per trend.
const FORMAT_MARKER = 'You will respond ONLY with a JSON object of the form:';
const BATCH_SYSTEM_PROMPT = SYSTEM_PROMPT.slice(0, SYSTEM_PROMPT.indexOf(FORMAT_MARKER)) +
`CATEGORY NOTE FOR THIS TASK: the category match has ALREADY been verified by the pipeline using Palsgaard's own category mapping, shown as "Palsgaard category" on the product and "Category" on each trend. Palsgaard's ice_cream category deliberately includes water ices, ice lollies, sorbets, frozen yogurt and other frozen desserts. Mintel's sub-category label is context only. Do NOT reject a candidate on category grounds; judge only whether the product's positioning genuinely expresses the trend.

You may be asked to evaluate SEVERAL trends for the same product. Judge EACH trend independently, as if it were the only one. Never let one trend's verdict influence another's.

You will respond ONLY with a JSON array containing exactly one object per trend, in the order the trends are numbered:
[
  {"trend": <trend number>, "verdict": "SUPPORTS" | "PARTIAL" | "NOT_SUPPORT", "confidence_score": <integer 0-100>, "reasoning": "<one sentence, max 30 words, why>"}
]

` + SYSTEM_PROMPT.slice(SYSTEM_PROMPT.indexOf('Scoring guidance:'));

function clip(s, max, tag = '…') {
  const v = String(s || '');
  return v.length > max ? v.slice(0, max) + tag : v;
}

function productBlock(product) {
  return `PRODUCT
Name: ${product.product_name || ''}
Brand: ${product.brand || ''} (${product.company || ''})
Country: ${product.country || ''}
Palsgaard category: ${product.palsgaard_category || ''}
Mintel category: ${product.category || ''} / ${product.sub_category || ''}
Description: ${clip(product.product_description, DESCRIPTION_MAX)}
Claims: ${Array.isArray(product.claims) ? product.claims.join(', ') : (product.claims || '')}
Flavours: ${Array.isArray(product.flavours) ? product.flavours.join(', ') : (product.flavours || '')}
Ingredients: ${clip(product.ingredients, INGREDIENTS_MAX, '… [truncated]')}`;
}

// items: [{ trend: {trend_name, market_signal, description, category}, matched_keywords, examples }]
// Returns one result per item, same order. Any parse problem marks ALL items ERROR so
// they stay pending and are retried — never silently approved or rejected.
async function runBatchValidation(anthropic, model, product, items, usage) {
  const validated_at = new Date().toISOString();
  const errAll = (msg) => items.map(() => ({ verdict: 'ERROR', confidence_score: 0, reasoning: `LLM validation failed: ${msg}`.slice(0, 140), validated_at }));
  try {
    const trendBlocks = items.map((it, i) => `TREND ${i + 1}
Name: ${it.trend.trend_name || ''}
Market signal: ${it.trend.market_signal || ''}
Description: ${(it.trend.description || '').slice(0, 600)}
Category: ${it.trend.category || ''}
${formatExpertExamples(it.examples)}Keyword overlap: ${(it.matched_keywords || []).join(', ')}`).join('\n\n');

    const userPrompt = `${productBlock(product)}

${trendBlocks}

For each of the ${items.length} trend(s) above: is this product genuine evidence of it? Respond with the JSON array only.`;

    // Prompt caching (9 Nov 2026): the system prompt is identical on every call, so it
    // carries an explicit cache breakpoint. Below a model's minimum cacheable length
    // (Haiku 4.5: 4,096 tokens; Haiku 5.5: 512) the API silently skips caching, so this
    // is safe on every model. Cache reads are billed at 0.1x input.
    const response = await anthropic.messages.create({
      model,
      // Newer models may spend part of the budget before the JSON (e.g. thinking), so
      // they get more headroom; output is only billed for what is actually generated.
      max_tokens: model === 'claude-haiku-4-5' ? 150 * items.length + 50 : 400 * items.length + 600,
      system: [{ type: 'text', text: BATCH_SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } }],
      messages: [{ role: 'user', content: userPrompt }]
    });
    if (usage) {
      usage.llm_calls++;
      usage.input_tokens += response.usage?.input_tokens || 0;
      usage.output_tokens += response.usage?.output_tokens || 0;
      usage.cache_read_tokens = (usage.cache_read_tokens || 0) + (response.usage?.cache_read_input_tokens || 0);
      usage.cache_write_tokens = (usage.cache_write_tokens || 0) + (response.usage?.cache_creation_input_tokens || 0);
    }

    // Read every text block (a response can start with a non-text block, e.g. thinking).
    const text = (response.content || []).filter(b => b?.type === 'text').map(b => b.text || '').join('\n').trim();
    const start = text.indexOf('[');
    const end = text.lastIndexOf(']');
    if (start === -1 || end === -1) {
      const kinds = (response.content || []).map(b => b?.type).join(',');
      throw new Error(`No JSON array in response (stop_reason=${response.stop_reason}; blocks=${kinds}; head=${text.slice(0, 60).replace(/\s+/g, ' ')})`);
    }
    const parsed = JSON.parse(text.slice(start, end + 1));
    if (!Array.isArray(parsed)) throw new Error('Response is not an array');

    return items.map((_, i) => {
      const r = parsed.find(x => Number(x?.trend) === i + 1) || (parsed.length === items.length ? parsed[i] : null);
      if (!r || !['SUPPORTS', 'PARTIAL', 'NOT_SUPPORT'].includes(r.verdict)) {
        return { verdict: 'ERROR', confidence_score: 0, reasoning: 'LLM validation failed: missing or invalid verdict for this trend', validated_at };
      }
      return {
        verdict: r.verdict,
        confidence_score: Math.max(0, Math.min(100, Math.round(Number(r.confidence_score) || 0))),
        reasoning: String(r.reasoning || '').slice(0, 300),
        validated_at
      };
    });
  } catch (e) {
    console.error('[triage] LLM batch validation error:', e.message?.slice(0, 300));
    return errAll(e.message?.slice(0, 100) || 'unknown');
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
const CONCURRENCY = 4; // products processed in parallel within one time-budgeted run

// ── Write throttle (2 Nov 2026) ──────────────────────────────────────────────────
// Base44 allows 350 entity updates per 60 s per caller. Products with no candidate
// are finalised without an LLM call, so bakery runs hit that limit and every run
// ended in HTTP 500 (workflow auto-disabled after 5 failures). All writes go through
// one shared slot reservation (≈250/min, headroom for other writers) and a rate-limit
// error waits for the server's Retry-After and tries again instead of failing.
const MIN_UPDATE_INTERVAL_MS = 240;
let nextUpdateAt = 0;
async function throttledUpdate(entity, id, data) {
  for (let attempt = 0; attempt < 3; attempt++) {
    const slot = Math.max(Date.now(), nextUpdateAt);
    nextUpdateAt = slot + MIN_UPDATE_INTERVAL_MS;
    const wait = slot - Date.now();
    if (wait > 0) await new Promise(r => setTimeout(r, wait));
    try {
      return await entity.update(id, data);
    } catch (e) {
      const msg = String(e?.message || '');
      if (/rate limit/i.test(msg) && attempt < 2) {
        const ra = msg.match(/Retry after (\d+)s/i);
        const pause = ((ra ? Number(ra[1]) : 10) + 1) * 1000;
        nextUpdateAt = Date.now() + pause;
        await new Promise(r => setTimeout(r, pause));
        continue;
      }
      throw e;
    }
  }
}
const PAUSE_MS = 10000;
// Must stay well under the platform's request gateway timeout (~2 min),
// otherwise the run 504s even though work is still progressing.
const MAX_TIME_BUDGET_MS = 80 * 1000;

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
    const model = ALLOWED_MODELS.includes(body.model) ? body.model : DEFAULT_MODEL;
    const usage = { llm_calls: 0, input_tokens: 0, output_tokens: 0 };

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


    // ── TEMPORARY model_probe mode (9 Nov 2026): smoke-tests the Haiku 5.5 / Sonnet 5.5
    // migration against the real prompt contracts of the migrated functions. Writes
    // nothing. Remove once the migration is verified.
    if (body.mode === 'model_probe') {
      const KEY = Deno.env.get('ANTHROPIC_API_KEY');
      const PROBE_EXTRACT = "You are extracting expert-curated content from a Mintel innovation report.\n\nMintel reports are organised into THEMED SECTIONS. Each section makes an argument about a market trend (stated in its heading and opening prose), and then cites specific product launches as EVIDENCE supporting that argument. A single thematic section can span multiple pages (e.g. a \"texture\" theme covers an intro page, a chart page, and one or more product-example pages).\n\nYour job is to reconstruct that structure: identify each thematic section, capture the analyst's claim, and list the product examples that sit under it as evidence.\n\nHow to identify a section:\n- A section has a thematic heading describing a trend/claim (\"Consumers are enticed by chocolate that combines different textures\", \"Brands get creative with texture to captivate consumers\").\n- Consecutive pages about the same topic belong to the SAME section, even if each page has its own sub-heading. Group them together.\n- The section_thesis is the core argument in your own words, 1-2 sentences (e.g. \"Texture is now a primary driver of appeal and premium signalling in chocolate, prompting brands to combine contrasting textures\").\n\nHow to identify product examples within a section:\n- A short bold/italic heading + a product name (often a hyperlink) + a 1-3 sentence analyst description + usually a country in parentheses.\n- Extract ONLY explicit product examples. Do NOT extract products mentioned only ambiently in prose (\"brands like X and Y...\"). Only ones formatted as standalone examples with their own description.\n- analyst_quote must be a VERBATIM copy of the report's description, MAXIMUM 2 sentences. Never paraphrase, never exceed 2 sentences (copyright limit).\n- analyst_framing is the short headline ABOVE the product example (\"Melt-in-mouth angel hair and crunchy pistachio\").\n- section_evidence_role: one sentence on why THIS product is cited as evidence for the section thesis.\n- If a product has no country in parentheses, still extract it but leave country empty.\n\nSkip \"Meet the expert\" sections, generic \"Other innovative launches\" lists without a thematic claim, and disclaimer/contents pages.\n\nA section may legitimately have zero products (intro/chart-only pages) \u2014 in that case still capture the section with an empty products array if it states a clear thesis, otherwise omit it.\n\nYou respond ONLY with a JSON array of SECTION objects. No prose, no markdown, no commentary outside the JSON.\n\nSchema per section:\n{\n  \"section_heading\": string,\n  \"section_thesis\": string,\n  \"page_ref\": string or null,\n  \"products\": [\n    {\n      \"product_name\": string,\n      \"brand\": string or null,\n      \"country\": string or null,\n      \"analyst_framing\": string,\n      \"analyst_quote\": string (verbatim, max 2 sentences),\n      \"section_evidence_role\": string,\n      \"claims\": [string],\n      \"flavours\": [string],\n      \"format_notes\": string or null,\n      \"page_ref\": string or null,\n      \"extraction_confidence\": \"high\" | \"medium\" | \"low\"\n    }\n  ]\n}";
      const PROBE_VERDICT = "You are validating whether a GNPD product launch is genuine evidence of a market trend, or whether the keyword overlap is incidental.\n\nA product GENUINELY EXPRESSES a trend when the product's positioning, formulation, or claims actively embody what the trend describes \u2014 not merely when the same words happen to appear.\n\nHARD RULE \u2014 CATEGORY CONSTRAINT:\nThe product's category and the trend's category must be the same category. A product from one category is NEVER evidence for a trend belonging to another category, however strong the wording overlap is. A biscuit is not evidence of an ice cream trend; a chocolate bar is not evidence of a dairy trend. If the two categories shown below differ, the verdict is NOT_SUPPORT with a score of 0 \u2014 no exceptions, no partial credit.\n(The pipeline gates on category BEFORE calling you, so a category mismatch reaching you is a defect: say so in your reasoning.)\n\nHARD RULE \u2014 ingredient presence is NEVER positioning evidence:\nThe mere presence of an ingredient does not qualify a product for a positioning trend (plant-based, clean label, premium, free-from, health, sustainability, etc.).\nExample: coconut oil or almonds in the ingredient list of a DAIRY ice cream does not make it plant-based. A positioning trend requires the product's actual positioning \u2014 its claims, descriptors, category placement, or marketing \u2014 to express the trend.\n\nExample of genuine evidence:\n- Trend: \"Plant-based indulgence parity\"\n- Product: \"Oatly Oat-Based Ice Cream Stick with Belgian Chocolate Coating\", claims include \"vegan, no animal ingredients\"\n- Verdict: SUPPORTS \u2014 the product is explicitly a plant-based version of an indulgent format\n\nExamples of incidental matches:\n- Trend: \"Plant-based indulgence parity\"\n- Product: \"Black Truffle + Vanilla Mini Ice Creams with Crispy Chocolate Coating\" (dairy ice cream; ingredients include coconut oil, almonds)\n- Verdict: NOT_SUPPORT \u2014 plant ingredients in a dairy product are not plant-based positioning; no vegan or dairy-free claims\n- Trend: \"Texture innovation \u2014 crunch integrity at scale\"\n- Product: \"Dark Chocolate Coated Coconut Chips\" (ingredients mention \"crunchy\")\n- Verdict: NOT_SUPPORT \u2014 crunch is a passive property of coconut chips, not an innovation the product is built around\n\nIf REFERENCE EXAMPLES are provided, they are products Mintel analysts themselves cited as evidence for this trend. Use them to calibrate what genuinely qualifies \u2014 a candidate should express the trend in a comparable way.\n\nYou will respond ONLY with a JSON object of the form:\n{\n  \"verdict\": \"SUPPORTS\" | \"PARTIAL\" | \"NOT_SUPPORT\",\n  \"confidence_score\": <integer 0-100>,\n  \"reasoning\": \"<one sentence, max 30 words, why>\"\n}\n\nScoring guidance:\n- SUPPORTS, score 70-95: product clearly and primarily expresses the trend\n- SUPPORTS, score 40-69: product expresses the trend but not as its primary positioning\n- PARTIAL, score 40-69: some elements align but the evidence is mixed\n- NOT_SUPPORT, score 0-39: the keyword overlap is incidental or contradicts the trend; the product does not express it\n\nNo prose outside the JSON. No markdown. No commentary.";
      const PROBE_BASE = "You are a food industry expert working for Palsgaard, a producer of plant-based emulsifiers and stabilisers founded in 1917.\n\nYour job is to extract structured insights from documents. These insights will power trend reports that open conversations with food manufacturers \u2014 they are NOT sales pitches.\n\nCRITICAL RULES:\n- Do NOT mention specific product names (e.g. Palsgaard\u00ae ArtisanIce 158, Emulpals\u00ae 117)\n- Do NOT mention dosage figures (e.g. 0.45%, 0.18%)\n- Do NOT mention E-numbers as the main point (e.g. E471, E401)\n- DO frame insights as industry expertise and technical know-how\n- DO include insights where Palsgaard knowledge is relevant even if no specific product is needed \u2014 showing broad expertise builds credibility\n\nFor each meaningful insight in the document, return a JSON object with this exact structure:\n\n{\n  \"id\": \"unique_snake_case_id\",\n  \"market_signal\": \"What is happening in the market or industry \u2014 a consumer shift, regulatory pressure, economic driver, sustainability challenge, or category trend. Write from the outside in. Max 2 sentences.\",\n  \"customer_pain\": \"The concrete challenge or pressure this creates for food manufacturers. What makes this hard for them? What are they struggling with? Max 2 sentences.\",\n  \"palsgaard_angle\": \"How deep food industry expertise and technical capability can address this challenge. Write in third person as industry knowledge \u2014 e.g. 'Deep expertise in emulsification enables...' or 'Technical know-how in stabiliser systems allows manufacturers to...'. NEVER use 'Palsgaard' as the subject. No product names, no dosages. Max 2 sentences.\",\n  \"has_direct_role\": true,\n  \"capability_area\": \"sustainability | texture_quality | cost_efficiency | compliance_regulatory | new_product_development | food_safety | supply_chain | plant_based | general\",\n  \"category_relevance\": [\"ice_cream\", \"dairy\", \"chocolate_confectionery\", \"bakery\", \"condiments\", \"plant_based\", \"meat\", \"oils_fats\", \"rutf_rusf\"],\n  // Use canonical Palsgaard solution keys only. Populate ALL relevant keys for cross-category sources.\n  \"confidence\": \"high | medium | low\",\n  \"source_quote\": \"A short grounding quote or data point from the source that supports this insight. Max 1-2 sentences. No product names.\",\n  \"trend_keywords\": [\"clean label\", \"resource scarcity\", \"sustainability\"],\n  \"page_ref\": \"page 3 or slide 7\",\n  \"relevance_score\": 72,\n  \"quality_score\": 80\n}\n\nrelevance_score: Integer 0-100 \u2014 commercial market-signal value (category movement, consumer driver, regional expression, competitive activity). Ingredient presence alone should not affect this score.\nquality_score: Integer 0-100 \u2014 specificity/evidence strength of the excerpt (0 = boilerplate/vague, 100 = a concrete claim with a figure, named brand/launch/region, quoted statistic, or specific dated event). Both scores are required on every insight.\n\nSet has_direct_role to false when the insight represents valuable expert industry framing but does not require a Palsgaard product to address. This is intentional and valuable.\n\nReturn only a JSON array of insight objects. No explanatory text, no markdown, no preamble.";
      const S = base44.asServiceRole.entities;
      const ex = (await S.ExpertExample.filter({ id: '6a29a77e515a6d0886a854a7' }))[0] || {};
      const heritage = trendMap['6a7ae020174e988c982f8751'] || {};
      const theme = (await S.CommunicationTheme.filter({ id: '6a3430ee2d45ab1cd3946d36' }))[0] || {};
      const src = ex.source_id ? (await S.Source.filter({ id: ex.source_id }))[0] : null;
      // Report-like text rebuilt from the examples already extracted from this report
      // (sections, theses, cited products), since report text is read from the PDF at run time.
      const reportExamples = ex.source_id ? await S.ExpertExample.filter({ source_id: ex.source_id }, 'mintel_section_heading', 40) : [];
      const bySection = {};
      for (const r of reportExamples) {
        const h = r.mintel_section_heading || 'Other';
        (bySection[h] = bySection[h] || { thesis: r.section_thesis || '', items: [] }).items.push(`- ${r.product_name} (${r.brand || ''}, ${r.country || ''}): ${r.analyst_framing || ''}`);
      }
      const chunks = Object.entries(bySection).map(([h, v]) => `## ${h}\n${v.thesis}\n${v.items.join('\n')}`).join('\n\n').slice(0, 12000);
      const prod = (await S.GNPDProduct.filter({ gnpd_record_id: '14714124' }))[0] || {};
      // One small record only: full Source rows carry large chunk/excerpt arrays.
      const pdfSrc = (await S.Source.filter({ file_url: { $regex: '\\.pdf$' }, source_type: { $ne: 'gnpd' }, title: { $regex: 'patent|trending', $options: 'i' } }, '-created_date', 1))[0] || null;
      async function call(name, model, max_tokens, system, content, extraHeaders = {}, expect = 'json') {
        const t0 = Date.now();
        try {
          const res = await fetch('https://api.anthropic.com/v1/messages', {
            method: 'POST',
            headers: { 'x-api-key': KEY, 'anthropic-version': '2023-06-01', 'content-type': 'application/json', ...extraHeaders },
            body: JSON.stringify({ model, max_tokens, ...(system ? { system } : {}), messages: [{ role: 'user', content }] }),
          });
          const data = await res.json();
          if (!res.ok) return { name, model, ok: false, http: res.status, error: JSON.stringify(data).slice(0, 300), ms: Date.now() - t0 };
          const text = (data.content || []).filter(b => b?.type === 'text').map(b => b.text || '').join('\n');
          let parse_ok = expect === 'text' ? text.trim().length > 0 : false;
          let parse_error = null, items = null;
          if (expect !== 'text') {
            const a = text.indexOf(expect === 'array' ? '[' : '{'), b = text.lastIndexOf(expect === 'array' ? ']' : '}');
            try { if (a !== -1 && b > a) { const v = JSON.parse(text.slice(a, b + 1)); parse_ok = true; items = Array.isArray(v) ? v.length : null; } else parse_error = 'no brackets'; }
            catch (e) {
              parse_error = String(e.message).slice(0, 160);
              const pos = Number((String(e.message).match(/position (\d+)/) || [])[1]);
              if (!Number.isNaN(pos)) parse_error += ' | around: ' + text.slice(a + Math.max(0, pos - 160), a + pos + 80).replace(/\n/g, '\\n');
            }
          }
          return { name, model, ok: true, stop: data.stop_reason, parse_ok, items, parse_error, blocks: (data.content || []).map(b => b.type).join(','), in: data.usage?.input_tokens, out: data.usage?.output_tokens, ms: Date.now() - t0, head: text.slice(0, 140).replace(/\s+/g, ' '), tail: parse_ok ? undefined : text.slice(-220).replace(/\s+/g, ' ') };
        } catch (e) { return { name, model, ok: false, error: String(e.message).slice(0, 200), ms: Date.now() - t0 }; }
      }
      const recatPrompt = `You are a product categorization specialist for Palsgaard (emulsifiers & stabilisers for food manufacturers).\n\nClassify this product example into exactly ONE Palsgaard solution category.\nReturn a JSON object with two fields: "category" (the key string) and "confidence" (integer 0-100).\n\nProduct: ${ex.product_name}\nBrand: ${ex.brand}\nCountry: ${ex.country}\nSub-category: ${ex.sub_category || ''}\nAnalyst framing: ${ex.analyst_framing || ''}\nReport title: ${ex.report_title || ''}\n\nValid categories (return the KEY): bakery, chocolate_confectionery, dairy, ice_cream, meat, oils_fats, plant_based, condiments, rutf_rusf, out_of_scope, needs_human_review\n\nReturn ONLY valid JSON: {"category": "key", "confidence": 90, "reasoning": "one sentence"}`;
      const sectionPrompt = `You are evaluating whether a themed section of a Mintel innovation report is genuine evidence of a specific market trend.\n\nTREND\nName: ${heritage.trend_name}\nCategory: ${heritage.category}\nMarket signal: ${heritage.market_signal || ''}\nDescription: ${(heritage.description || '').slice(0, 400)}\nKeywords: ${(heritage.trend_keywords || []).join(', ')}\n\nREPORT SECTION\nHeading: ${ex.mintel_section_heading || ''}\nThesis (analyst's argument): ${ex.section_thesis || ''}\nExample products cited as evidence: ${ex.product_name}\n\nScoring guide:\n- 80-100 SUPPORTS\n- 50-79 PARTIAL\n- 0-49 NOT_SUPPORT\n\nRespond ONLY with JSON:\n{"verdict":"SUPPORTS"|"PARTIAL"|"NOT_SUPPORT","confidence_score":0-100,"reasoning":"one sentence"}`;
      const gatePrompt = `Decide whether this uploaded document is worth processing as food & beverage market evidence for a food-ingredients company.\nTitle: ${src?.title || 'A Year of Innovation'}\nSummary: ${(src?.ai_summary || '').slice(0, 500)}\nOpening text:\n${chunks.slice(0, 1500)}\n\nReturn JSON: { "proceed": boolean, "confidence": "high" | "low", "reason": "one short sentence" }.`;
      const trendsText = globalTrends.map(t => `ID: ${t.id} | Name: ${t.trend_name} | Category: ${t.category || 'unknown'} | Signal: ${(t.market_signal || '').slice(0, 120)}`).join('\n');
      const themePrompt = `You are an editorial strategist at Palsgaard. Match GlobalTrends to a Communication Theme.\n\nCOMMUNICATION THEME: ${theme.name} (${theme.year})\nTagline: ${theme.tagline || ''}\n\nACTIVE GLOBAL TRENDS (${globalTrends.length} total):\n${trendsText}\n\nIdentify which trends genuinely support this theme. For each match give a 1-2 sentence rationale and a relevance_score 0-100.\n\nReturn ONLY a JSON array (no markdown fences):\n[{"global_trend_id": "...", "proposed_rationale": "...", "relevance_score": 85}]\n\nOnly include trends with relevance_score >= 50.`;
      const verdictUser = `PRODUCT\nName: ${prod.product_name}\nBrand: ${prod.brand}\nCountry: ${prod.country}\nCategory: ${prod.category} / ${prod.sub_category}\nDescription: ${String(prod.product_description || '').slice(0, 800)}\nClaims: ${(prod.claims || []).join(', ')}\n\nTREND\nName: ${heritage.trend_name}\nMarket signal: ${heritage.market_signal || ''}\nDescription: ${(heritage.description || '').slice(0, 600)}\nCategory: ${heritage.category}\n\nKEYWORD OVERLAP\nMatched: traditional\n\nIs this product genuine evidence of this trend? Respond with JSON only.`;
      let pdfB64 = null, pdfNote = 'no pdf source found';
      if (pdfSrc) {
        try {
          const r = await fetch(pdfSrc.file_url);
          const buf = new Uint8Array(await r.arrayBuffer());
          if (buf.length < 3_500_000) {
            let bin = ''; for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode(...buf.subarray(i, i + 0x8000));
            pdfB64 = btoa(bin); pdfNote = `${pdfSrc.title} (${Math.round(buf.length / 1024)} KB)`;
          } else pdfNote = `skipped: ${pdfSrc.title} is ${Math.round(buf.length / 1048576)} MB`;
        } catch (e) { pdfNote = 'pdf fetch failed: ' + e.message; }
      }
      const cases = [
        call('H_recategorize', 'claude-haiku-5-5', 600, null, recatPrompt),
        call('H_section_trend', 'claude-haiku-5-5', 800, null, sectionPrompt),
        call('H_source_gate', 'claude-haiku-5-5', 800, null, gatePrompt),
        call('H_theme_links', 'claude-haiku-5-5', 3000, null, themePrompt, {}, 'array'),
        call('S_mintel_extract', 'claude-sonnet-5-5', 16000, PROBE_EXTRACT, `Report title: ${src?.title || ''}\n\nReport content:\n${chunks}`, {}, 'array'),
        call('S_trend_verdict', 'claude-sonnet-5-5', 1200, PROBE_VERDICT, verdictUser),
        call('S_brief_chat', 'claude-sonnet-5-5', 1000, 'You help Palsgaard sales colleagues submit a trend brief. Ask for any missing required field in one short sentence.', 'I need trend input for a bakery customer in Saudi Arabia next month.', {}, 'text'),
      ];
      if (pdfB64) cases.push(call('S_pdf_document', 'claude-sonnet-5-5', 10000, PROBE_BASE.replace('Return only a JSON array of insight objects.', 'Return at most 15 insights: the most commercially relevant ones (highest relevance_score), merging near-duplicates rather than listing each separately.\n\nReturn only a JSON array of insight objects.'), [
        { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: pdfB64 } },
        { type: 'text', text: `Extract structured insights from this document titled: "${pdfSrc.title}". Return only valid JSON, no markdown fences.` }
      ], { 'anthropic-beta': 'pdfs-2024-09-25' }));
      const results = await Promise.all(cases);
      results.forEach(r => console.log('[probe] RESULT ' + JSON.stringify(r)));
      await new Promise(r => setTimeout(r, 5));
      const summary = { mode: 'model_probe', passed: results.filter(r => r.ok && r.parse_ok && r.stop !== 'max_tokens').length, total: results.length, pdf: pdfNote, mintel_source: src?.title || null, chunk_chars: chunks.length };
      console.log('[probe] SUMMARY ' + JSON.stringify(summary));
      return Response.json({ summary, results });
    }

    // ── Compare mode: re-judge links the previous validator already decided, WITHOUT writing.
    // Used to check a cheaper model / the batched prompt against existing verdicts before
    // switching. Results go to the function log ([compare] lines) and the response.
    if (body.mode === 'compare_models') {
      const cmpStart = Date.now();
      const since = String(body.since || '2026-11-02T00:00:00');
      const sampleTarget = Math.min(Number(body.sample_size) || 40, 100);
      const q = {};
      if (body.category) q.palsgaard_category = String(body.category).trim();
      const pool = await base44.asServiceRole.entities.GNPDProduct.filter(q, '-updated_date', 400);
      const sample = [];
      let pairCount = 0;
      for (const p of pool) {
        const items = [];
        for (const l of (p.trend_links || [])) {
          if (!l.llm_validated_at || l.llm_validated_at < since || !trendMap[l.trend_id]) continue;
          items.push({ trend_id: l.trend_id, matched_keywords: l.matched_keywords || [], old: l.review_status === 'auto_applied' ? 'auto_applied' : 'pending', old_score: l.confidence_score });
        }
        for (const r of (p.rejected_link_candidates || [])) {
          if (r.llm_verdict !== 'NOT_SUPPORT' || !r.rejected_at || r.rejected_at < since || !trendMap[r.trend_id]) continue;
          if (/inactive|no longer exists/i.test(r.llm_reasoning || '')) continue;
          items.push({ trend_id: r.trend_id, matched_keywords: r.matched_keywords || [], old: 'rejected', old_score: r.llm_score });
        }
        if (items.length === 0) continue;
        sample.push({ p, items });
        pairCount += items.length;
        if (pairCount >= sampleTarget) break;
      }

      const bucket = (res) => res.verdict === 'ERROR' ? 'error'
        : (res.verdict === 'SUPPORTS' && res.confidence_score >= 70) ? 'auto_applied'
        : res.verdict === 'NOT_SUPPORT' ? 'rejected' : 'pending';
      const rows = [];
      let cmpIdx = 0;
      async function cmpWorker() {
        while (true) {
          if (Date.now() - cmpStart > timeBudget) return;
          const i = cmpIdx++;
          if (i >= sample.length) return;
          const { p, items } = sample[i];
          const llmItems = [];
          for (const it of items) {
            const t = trendMap[it.trend_id];
            llmItems.push({
              trend: { trend_name: t.trend_name, market_signal: t.market_signal || '', description: t.description || '', category: t.category || '' },
              matched_keywords: it.matched_keywords,
              examples: await getExpertExamples(it.trend_id)
            });
          }
          const results = await runBatchValidation(anthropic, model, p, llmItems, usage);
          items.forEach((it, k) => rows.push({
            product: p.product_name, brand: p.brand, trend: trendMap[it.trend_id].trend_name,
            old: it.old, old_score: it.old_score,
            new: bucket(results[k]), new_score: results[k].confidence_score, new_reasoning: results[k].reasoning
          }));
        }
      }
      await Promise.all(Array.from({ length: CONCURRENCY }, () => cmpWorker()));

      const matrix = {};
      for (const r of rows) { const key = `${r.old}->${r.new}`; matrix[key] = (matrix[key] || 0) + 1; }
      const agree = rows.filter(r => r.old === r.new).length;
      const hardFlips = rows.filter(r => (r.old === 'auto_applied' && r.new === 'rejected') || (r.old === 'rejected' && r.new === 'auto_applied')).length;
      const disagreements = rows.filter(r => r.old !== r.new);
      const report = {
        mode: 'compare_models', model, category: body.category || null,
        pairs: rows.length, products: sample.length,
        agreement_pct: rows.length ? Math.round(100 * agree / rows.length) : null,
        hard_flips: hardFlips, matrix, usage
      };
      // DIFF lines first, SUMMARY last: the logs API returns newest first, so the
      // summary is then the first line a reader sees.
      disagreements.forEach(d => console.log('[compare] DIFF ' + JSON.stringify(d)));
      await new Promise(r => setTimeout(r, 5));
      console.log('[compare] SUMMARY ' + JSON.stringify(report));
      return Response.json({ ...report, disagreements });
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
            await throttledUpdate(base44.asServiceRole.entities.GNPDProduct, p.id, {
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

    // ── Seed mode (2 Nov 2026): add candidates for ONE trend to products that
    // already have links. Candidate generation otherwise runs only for products with
    // zero links, so a trend that becomes product_observable later would never be
    // tested against products already linked to other trends. Same matcher rules as
    // generateCandidates (positioning text, keyword length > 3, category gate, trend
    // must be active + observable). Writes only a pending candidate and flips the
    // product back to trend_linking_pending; the normal drain then validates it.
    // Idempotent: products that already carry or rejected this trend are skipped, so a
    // timed-out run is simply started again (body.skip resumes from a page offset).
    if (body.mode === 'seed_trend') {
      const seedStart = Date.now();
      const t = trendMap[String(body.trend_id || '')];
      if (!t) return Response.json({ error: 'trend_id not found among active trends' }, { status: 400 });
      if (t.product_observable !== true) return Response.json({ error: 'trend is not product_observable' }, { status: 400 });
      const kws = (t.trend_keywords || []).map(k => String(k).toLowerCase()).filter(k => k.length > 3);
      const q = { palsgaard_category: String(t.category || '').trim(), processing_status: { $in: ['trend_linked', 'trend_linking_pending'] } };
      if (Array.isArray(body.regions) && body.regions.length > 0) q.region = { $in: body.regions.map(r => String(r).trim()) };
      let skip = Number(body.skip) || 0, scanned = 0, seeded = 0, timedOutSeed = false;
      const now = new Date().toISOString();
      while (true) {
        if (Date.now() - seedStart > timeBudget) { timedOutSeed = true; break; }
        const page = await base44.asServiceRole.entities.GNPDProduct.filter(q, 'created_date', 100, skip);
        if (page.length === 0) break;
        for (const p of page) {
          scanned++;
          const links = p.trend_links || [];
          if (links.length === 0) continue; // zero-link products get candidates from the normal drain
          if (links.some(l => l.trend_id === t.id)) continue;
          if ((p.rejected_link_candidates || []).some(r => r.trend_id === t.id)) continue;
          const text = [p.product_name, p.product_description, Array.isArray(p.claims) ? p.claims.join(' ') : p.claims]
            .filter(Boolean).join(' ').toLowerCase();
          const matched = kws.filter(kw => text.includes(kw));
          if (matched.length === 0) continue;
          await throttledUpdate(base44.asServiceRole.entities.GNPDProduct, p.id, {
            trend_links: [...links, {
              trend_id: t.id, trend_name: t.trend_name, trend_type: 'global',
              confidence: 'low', confidence_score: 0, matched_keywords: matched,
              reasoning: 'Candidate (seed_trend): keyword match, awaiting LLM validation',
              review_status: 'pending', linked_at: now
            }],
            processing_status: 'trend_linking_pending'
          });
          seeded++;
        }
        skip += page.length;
        if (page.length < 100) break;
      }
      const seedReport = { mode: 'seed_trend', trend: t.trend_name, category: t.category, regions: body.regions || null, scanned, seeded, next_skip: timedOutSeed ? skip : null, done: !timedOutSeed };
      console.log('[seed] ' + JSON.stringify(seedReport));
      return Response.json(seedReport);
    }

    // ── Snapshot product IDs needing triage (stable against status mutations) ─
    // Phase 6 — the drain is run ONE CATEGORY AT A TIME (body.category, e.g. 'bakery').
    // A category's drain must not begin until its trends are individually marked
    // product_observable, so scoping is explicit rather than a whole-database sweep.
    const scopeCategory = body.category ? String(body.category).trim() : null;
    const scanQuery = { processing_status: 'trend_linking_pending' };
    if (scopeCategory) scanQuery.palsgaard_category = scopeCategory;
    // Optional region scope (2 Nov 2026): body.regions = canonical region keys from
    // GNPDProduct.region, e.g. ['mena', 'sub_saharan_africa'].
    if (Array.isArray(body.regions) && body.regions.length > 0) {
      scanQuery.region = { $in: body.regions.map(r => String(r).trim()) };
    }
    const pendingIds = [];
    let scanSkip = 0;
    while (true) {
      const scanBatch = await base44.asServiceRole.entities.GNPDProduct.filter(
        scanQuery, 'created_date', 100, scanSkip
      );
      if (scanBatch.length === 0) break;
      for (const p of scanBatch) {
        // Products with zero links were bulk-ingested with skipTrendLinking — they
        // still need candidate GENERATION, not just triage of existing candidates.
        if ((p.trend_links || []).length === 0 || (p.trend_links || []).some(needsTriage)) pendingIds.push(p.id);
      }
      if (pendingIds.length >= 800) break; // enough for one time-budgeted run
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
        await throttledUpdate(base44.asServiceRole.entities.ProcessingJob, activeJob.id, {
          status: 'completed', current_cursor: null, last_progress_at: new Date().toISOString(),
        });
      }
      return Response.json({ idle: true, message: 'No pending links need LLM triage' });
    }

    if (activeJob) {
      await throttledUpdate(base44.asServiceRole.entities.ProcessingJob, activeJob.id, {
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
    // Phase 2 / Phase 6 gate counters — reported per batch so a zero-link outcome can
    // always be attributed to a named gate instead of looking like emptiness.
    let candidatesGenerated       = existingSummary.candidates_generated || 0;
    let rejectedByCategoryGate    = existingSummary.rejected_by_category_gate || 0;
    let skippedNonObservable      = existingSummary.skipped_non_observable || 0;
    let skippedUnresolvedCategory = existingSummary.skipped_unresolved_category || 0;
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
        candidates_generated: candidatesGenerated,
        rejected_by_category_gate: rejectedByCategoryGate,
        skipped_non_observable: skippedNonObservable,
        skipped_unresolved_category: skippedUnresolvedCategory,
        per_trend: perTrend,
        model,
        llm_calls: (existingSummary.llm_calls || 0) + usage.llm_calls,
        input_tokens: (existingSummary.input_tokens || 0) + usage.input_tokens,
        output_tokens: (existingSummary.output_tokens || 0) + usage.output_tokens,
        cache_read_tokens: (existingSummary.cache_read_tokens || 0) + (usage.cache_read_tokens || 0),
        cache_write_tokens: (existingSummary.cache_write_tokens || 0) + (usage.cache_write_tokens || 0),
      };
    }

    // ── Candidate generation for products with no links yet ──────────────────
    // Two paths into candidacy: (1) ≥1 trend-keyword match in the product's
    // POSITIONING text, (2) the product matches a Mintel analyst-cited ExpertExample
    // for the trend (same brand + shared product-name token, or brand + ≥1 keyword).
    // All candidates then go through the same grounded LLM validation below.
    //
    // MATCHER TEXT (defined here only — cross-reference for anyone changing it):
    // product_name + product_description + claims. ingredients and flavours are
    // DELIBERATELY EXCLUDED — ingredient presence is not positioning (the same HARD
    // RULE the validator enforces), and including them manufactured false positives
    // such as 'protein' picked up from an ingredient declaration.
    // THRESHOLD: ≥1 hit in those positioning fields. It was ≥2 across all fields,
    // which is why obvious embodiments ('Whole Wheat Sourdough Bread' vs 'Sourdough
    // as functional platform') generated zero candidates — the diagnosed emptiness root.
    const nameTokens = (s) => String(s || '').toLowerCase().split(/[^a-z0-9]+/).filter(w => w.length > 4);
    // A product whose Palsgaard category cannot be resolved cannot be category-gated,
    // so it generates nothing and is logged (fail-closed, never widened).
    const UNRESOLVED_CATEGORIES = ['out_of_scope', 'needs_human_review'];

    async function generateCandidates(product) {
      const productCategory = String(product.palsgaard_category || '').trim();
      if (!productCategory || UNRESOLVED_CATEGORIES.includes(productCategory)) {
        skippedUnresolvedCategory++;
        console.log(`[gate] ${product.gnpd_record_id}: zero candidates — palsgaard_category unresolved (${productCategory || 'null'})`);
        return [];
      }
      const text = [product.product_name, product.product_description,
        Array.isArray(product.claims) ? product.claims.join(' ') : product.claims
      ].filter(Boolean).join(' ').toLowerCase();
      const brand = String(product.brand || '').toLowerCase().trim();
      const pTokens = new Set(nameTokens(product.product_name));
      const now = new Date().toISOString();
      const candidates = [];
      for (const t of globalTrends) {
        const trendCategory = String(t.category || '').trim();
        // ── Gate 1 — CATEGORY. Applied before candidacy: a cross-category pair never
        // becomes a candidate and never reaches the validator. This is the
        // contamination root (63 cross-category links, confidence 72-88).
        if (trendCategory !== productCategory) {
          // Counted, not logged per pair: per-pair audit lines produced ~30k log lines
          // per run. The counter in the job summary still attributes every rejection.
          rejectedByCategoryGate++;
          continue;
        }
        // ── Gate 2 — PRODUCT OBSERVABILITY. null and false BOTH skip: an unmarked
        // trend is an unfinished curation, so it is skipped and logged rather than
        // attempted and silently producing zero links.
        if (t.product_observable !== true) {
          skippedNonObservable++;
          continue;
        }
        const kws = (t.trend_keywords || []).map(k => String(k).toLowerCase());
        const matched = kws.filter(kw => kw.length > 3 && text.includes(kw));
        let expertMatch = false;
        if (matched.length < 1) {
          const examples = await getExpertExamples(t.id);
          expertMatch = examples.some(ex => {
            const exBrand = String(ex.brand || '').toLowerCase().trim();
            const brandHit = exBrand.length > 3 && brand.length > 3 && (brand.includes(exBrand) || exBrand.includes(brand));
            if (!brandHit) return false;
            return matched.length >= 1 || nameTokens(ex.product_name).some(tok => pTokens.has(tok));
          });
        }
        if (matched.length >= 1 || expertMatch) {
          candidatesGenerated++;
          candidates.push({
            trend_id: t.id, trend_name: t.trend_name, trend_type: 'global',
            confidence: 'low', confidence_score: 0,
            matched_keywords: expertMatch ? [...matched, 'expert_example_match'] : matched,
            reasoning: expertMatch
              ? 'Candidate: matches a Mintel analyst-cited product for this trend'
              : 'Candidate: keyword match, awaiting LLM validation',
            review_status: 'pending', linked_at: now
          });
        }
      }
      return candidates;
    }

    const deadlineReached = () => Date.now() - invocationStart > timeBudget;

    async function processProduct(product) {
      if ((product.trend_links || []).length === 0) {
        const candidates = await generateCandidates(product);
        if (candidates.length === 0) {
          // No plausible trend for this product — finalize so it leaves the queue
          await throttledUpdate(base44.asServiceRole.entities.GNPDProduct, product.id, {
            processing_status: 'trend_linked', support_label: 'NOT_SUPPORT'
          });
          return;
        }
        product = { ...product, trend_links: candidates };
      }
      const targets = (product.trend_links || []).filter(needsTriage);
      if (targets.length === 0) return;

      const updatedLinks = [...(product.trend_links || [])];
      const rejectedCandidates = [...(product.rejected_link_candidates || [])];
      let changed = false;

      // 1) Links to inactive/deleted trends are rejected without an LLM call.
      // 2) All remaining targets for this product are judged in ONE batched call.
      const liveTargets = [];
      for (const link of targets) {
        const trend = trendMap[link.trend_id];
        if (trend) { liveTargets.push(link); continue; }
        {
          // Trend is inactive or deleted — the link can never be approved; reject it
          const idxDead = updatedLinks.findIndex(l => l.trend_id === link.trend_id && l.review_status === 'pending' && !l.llm_validated_at);
          if (idxDead !== -1) {
            updatedLinks.splice(idxDead, 1);
            rejectedCandidates.push({
              trend_id: link.trend_id,
              trend_name: link.trend_name,
              matched_keywords: link.matched_keywords || [],
              llm_verdict: 'NOT_SUPPORT',
              llm_reasoning: 'Target trend is inactive or no longer exists',
              llm_score: 0,
              rejected_at: new Date().toISOString()
            });
            linksRejected++;
            changed = true;
          }
        }
      }

      let batchResults = [];
      if (liveTargets.length > 0 && !deadlineReached()) {
        const llmItems = [];
        for (const link of liveTargets) {
          const t = trendMap[link.trend_id];
          llmItems.push({
            trend: { trend_name: t.trend_name, market_signal: t.market_signal || '', description: t.description || '', category: t.category || '' },
            matched_keywords: link.matched_keywords || [],
            examples: await getExpertExamples(link.trend_id)
          });
        }
        batchResults = await runBatchValidation(anthropic, model, product, llmItems, usage);
      }

      for (let k = 0; k < batchResults.length; k++) {
        const link = liveTargets[k];
        const trend = trendMap[link.trend_id];
        const result = batchResults[k];

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
        await throttledUpdate(base44.asServiceRole.entities.GNPDProduct, product.id, {
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
      // CONCURRENCY workers pull products from the shared snapshot. Each product is
      // still processed atomically (one read, one batched LLM call, one write).
      let nextIdx = 0;
      let progressWriting = false;
      async function worker() {
        while (true) {
          if (Date.now() - invocationStart > timeBudget) { timedOut = true; return; }
          const i = nextIdx++;
          if (i >= pendingIds.length) return;

          const product = await base44.asServiceRole.entities.GNPDProduct.get(pendingIds[i]);
          if (!product) continue;
          const existingLinks = product.trend_links || [];
          if (existingLinks.length > 0 && !existingLinks.some(needsTriage)) continue;

          await processProduct(product);
          lastCursor = product.id;
          processedItems++;

          // Persist progress every 10 products; one write at a time across workers
          if (processedItems % 10 === 0 && !progressWriting) {
            progressWriting = true;
            try {
              await throttledUpdate(base44.asServiceRole.entities.ProcessingJob, job.id, {
                processed_items: processedItems,
                current_cursor: lastCursor,
                last_progress_at: new Date().toISOString(),
                summary: summarySnapshot(),
              });
            } catch (e) {
              console.error('[triage] progress write failed:', e.message?.slice(0, 200));
            } finally {
              progressWriting = false;
            }
          }
        }
      }
      await Promise.all(Array.from({ length: CONCURRENCY }, () => worker()));
    } finally {
      const finalStatus = timedOut ? 'paused_timeout' : 'completed';
      try {
        await throttledUpdate(base44.asServiceRole.entities.ProcessingJob, job.id, {
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
      scope_category: scopeCategory,
      products_claimed: pendingIds.length,
      products_processed: processedItems,
      candidates_generated: candidatesGenerated,
      rejected_by_category_gate: rejectedByCategoryGate,
      skipped_non_observable: skippedNonObservable,
      skipped_unresolved_category: skippedUnresolvedCategory,
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
        await throttledUpdate(base44.asServiceRole.entities.ProcessingJob, job.id, {
          status: 'failed',
          last_error: error.message,
          last_progress_at: new Date().toISOString(),
        });
      } catch (e) { /* ignore */ }
    }
    return Response.json({ error: error.message }, { status: 500 });
  }
});