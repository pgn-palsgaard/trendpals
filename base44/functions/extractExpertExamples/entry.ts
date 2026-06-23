import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

const EXTRACTION_SYSTEM_PROMPT = `You are extracting expert-curated product examples from a Mintel innovation report.

Mintel analysts select specific product launches as illustrations of trends they are discussing. These look like:
- A short bold or italic heading ("Turmeric biscuits with candied fennel seed", "Embracing the Dubai chocolate trend")
- A product name in distinctive formatting (often a hyperlink in the source)
- A 1-3 sentence description from the analyst
- A country in parentheses at the end

Your job is to extract every such example, capturing only what is in the report itself.

Critical rules:
- Extract ONLY explicit product examples. Do not extract products mentioned ambiently in prose ("brands like X and Y are launching..."), only ones that are formatted as standalone examples with their own description and a country attribution.
- The analyst_quote must be a verbatim copy of the report's description, maximum 2 sentences. Do NOT exceed 2 sentences. Do NOT paraphrase the quote — it is the literal evidence anchor, governed by copyright limits.
- The mintel_trend_label is what the analyst calls the trend in their own words (the section heading or the example's bold heading). Do NOT invent a trend label.
- analyst_framing is the short headline ABOVE the product example ("Turmeric biscuits with candied fennel seed"), not the surrounding prose.
- Skip "Meet the expert" sections, "Other innovative launches" without category context, and disclaimer pages.
- If a product example has no country attribution at the end (in parentheses), still extract it but leave country empty.
- mintel_section_heading is the larger section title the example sits under (e.g. "Europe: flavour innovation continues to drive sweet biscuit launches").
- Set extraction_confidence to "high" when all key fields are clearly present; "medium" when product name is clear but framing or quote is ambiguous; "low" only if you are genuinely uncertain whether this is an example at all (in which case lean toward not extracting it).

You respond ONLY with a JSON array of example objects. No prose. No markdown. No commentary outside the JSON.

Schema per example:
{
  "product_name": string,
  "brand": string or null,
  "country": string or null,
  "analyst_framing": string,
  "analyst_quote": string (verbatim, max 2 sentences),
  "mintel_section_heading": string,
  "mintel_trend_label": string,
  "claims": [string],
  "flavours": [string],
  "format_notes": string or null,
  "page_ref": string or null,
  "extraction_confidence": "high" | "medium" | "low"
}`;

const REGION_MAP = {
  china: 'ASPAC', japan: 'ASPAC', australia: 'ASPAC', india: 'ASPAC',
  'south korea': 'ASPAC', indonesia: 'ASPAC', thailand: 'ASPAC', singapore: 'ASPAC',
  'united states': 'AMERICAS', usa: 'AMERICAS', brazil: 'AMERICAS',
  mexico: 'AMERICAS', canada: 'AMERICAS', argentina: 'AMERICAS', colombia: 'AMERICAS',
  germany: 'EMEC', france: 'EMEC', 'united kingdom': 'EMEC', uk: 'EMEC',
  spain: 'EMEC', italy: 'EMEC', netherlands: 'EMEC', poland: 'EMEC',
  sweden: 'EMEC', denmark: 'EMEC', norway: 'EMEC', finland: 'EMEC',
  'saudi arabia': 'IMEA', uae: 'IMEA', turkey: 'IMEA', egypt: 'IMEA',
  'south africa': 'IMEA', nigeria: 'IMEA',
};

function mapRegion(country) {
  if (!country) return null;
  const key = country.toLowerCase().trim();
  return REGION_MAP[key] || null;
}

function truncateTo2Sentences(text) {
  if (!text) return text;
  const sentences = text.match(/[^.!?]+[.!?]+/g) || [];
  return sentences.slice(0, 2).join(' ').trim() || text.substring(0, 300);
}

async function callAnthropicExtraction(apiKey, content, sourceTitle) {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-5',
      max_tokens: 16000,
      system: EXTRACTION_SYSTEM_PROMPT,
      messages: [{
        role: 'user',
        content: `Report title: ${sourceTitle}\n\nReport content:\n${content}`
      }],
    }),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Anthropic API error ${res.status}: ${err.slice(0, 200)}`);
  }
  const data = await res.json();
  const raw = data.content?.[0]?.text || '';
  // Strip markdown code fences if present
  const cleaned = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '').trim();
  const start = cleaned.indexOf('[');
  if (start === -1) throw new Error('No JSON array in extraction response');
  let jsonText = cleaned.slice(start);
  try {
    return JSON.parse(jsonText);
  } catch (_) {
    // Salvage a truncated array: cut back to the last complete object and close the array
    const lastClose = jsonText.lastIndexOf('}');
    if (lastClose === -1) throw new Error('Unparseable extraction response');
    const salvaged = jsonText.slice(0, lastClose + 1) + ']';
    console.warn('[extractExpertExamples] Response truncated — salvaging complete objects');
    return JSON.parse(salvaged);
  }
}

async function validateTrendLinkLocal(apiKey, product, trend) {
  const productText = [
    product.product_name,
    product.analyst_framing,
    product.analyst_quote,
    product.mintel_section_heading,
    product.mintel_trend_label,
    ...(product.claims || []),
    ...(product.flavours || []),
  ].filter(Boolean).join(' ');

  const prompt = `You are evaluating whether a product launch is genuine evidence of a specific market trend.

TREND
Name: ${trend.trend_name}
Category: ${trend.category || 'Unknown'}
Market signal: ${trend.market_signal || ''}
Description: ${(trend.description || '').slice(0, 400)}
Keywords: ${(trend.trend_keywords || []).join(', ')}

PRODUCT (from Mintel expert report)
Product: ${product.product_name}
Brand: ${product.brand || ''}
Country: ${product.country || ''}
Analyst framing: ${product.analyst_framing}
Analyst quote: ${product.analyst_quote || ''}
Claims: ${(product.claims || []).join(', ')}
Flavours: ${(product.flavours || []).join(', ')}
Matched keywords: ${(trend._matchedKeywords || []).join(', ')}

ANALYST'S ORIGINAL LABEL
Mintel section: ${product.mintel_section_heading || ''}
Mintel trend label: ${product.mintel_trend_label || ''}

Scoring guide:
- 80-100 SUPPORTS: Product is clearly and deliberately an instance of this trend. Analyst framing or trend label directly aligns.
- 50-79 PARTIAL: Product has some features of the trend but also diverges, or alignment is implicit.
- 0-49 NOT_SUPPORT: Product name or keywords overlap incidentally — the trend is not the product's purpose.

When the analyst's own Mintel trend label closely matches the GlobalTrend name/signal, heavily favor SUPPORTS.

Respond ONLY with JSON:
{"verdict":"SUPPORTS"|"PARTIAL"|"NOT_SUPPORT","confidence_score":0-100,"reasoning":"one sentence"}`;

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5',
      max_tokens: 200,
      messages: [{ role: 'user', content: prompt }],
    }),
  });
  if (!res.ok) throw new Error(`Validation API error ${res.status}`);
  const data = await res.json();
  const raw = (data.content?.[0]?.text || '').trim();
  const match = raw.match(/\{[\s\S]*\}/);
  if (!match) return { verdict: 'NOT_SUPPORT', confidence_score: 0, reasoning: 'Parse error' };
  return JSON.parse(match[0]);
}

function keywordOverlap(product, trend) {
  const trendKws = (trend.trend_keywords || []).map(k => k.toLowerCase());
  if (trendKws.length === 0) return [];
  const text = [
    product.product_name,
    product.analyst_framing,
    product.analyst_quote,
    product.mintel_section_heading,
    product.mintel_trend_label,
    ...(product.claims || []),
    ...(product.flavours || []),
  ].filter(Boolean).join(' ').toLowerCase();

  return trendKws.filter(kw => text.includes(kw));
}

async function linkExampleToTrends(apiKey, example, trendIndex, trendDetails) {
  const links = [];
  const rejectedCandidates = [];
  const linkedTrendIds = [];

  // Lower threshold for ExpertExamples: ≥1 keyword overlap (vs ≥2 for GNPD)
  for (const trend of trendIndex) {
    const matched = keywordOverlap(example, trend);
    if (matched.length === 0) continue;

    const trendWithDetails = {
      ...trend,
      ...(trendDetails[trend.id] || {}),
      _matchedKeywords: matched,
    };

    let verdict;
    try {
      verdict = await validateTrendLinkLocal(apiKey, example, trendWithDetails);
    } catch (e) {
      console.warn(`validateTrendLink failed for ${example.product_name} / ${trend.trend_name}: ${e.message}`);
      continue;
    }

    const score = verdict.confidence_score || 0;
    const v = verdict.verdict;

    if (v === 'NOT_SUPPORT' || score < 40) {
      rejectedCandidates.push({
        trend_id: trend.id,
        trend_name: trend.name,
        matched_keywords: matched,
        llm_verdict: v,
        llm_reasoning: verdict.reasoning,
        llm_score: score,
        rejected_at: new Date().toISOString(),
      });
      continue;
    }

    // SUPPORTS ≥70 → auto_applied/high; else pending/medium
    const isAutoApply = v === 'SUPPORTS' && score >= 70;
    const confidence = score >= 70 ? 'high' : 'medium';
    const reviewStatus = isAutoApply ? 'auto_applied' : 'pending';

    links.push({
      trend_id: trend.id,
      trend_name: trend.name,
      trend_type: 'global',
      confidence,
      confidence_score: score,
      reasoning: verdict.reasoning,
      matched_keywords: matched,
      review_status: reviewStatus,
      linked_at: new Date().toISOString(),
    });

    if (isAutoApply) linkedTrendIds.push(trend.id);
  }

  return { links, linkedTrendIds, rejectedCandidates };
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);

    // Support both direct calls ({source_id}) and entity automation payloads ({event, data})
    const body = await req.json().catch(() => ({}));
    const isAutomation = !!body?.event?.entity_name;
    const source_id = body.source_id || body?.event?.entity_id || body?.data?.id;

    if (!isAutomation) {
      const user = await base44.auth.me();
      if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (!source_id) return Response.json({ error: 'source_id required' }, { status: 400 });

    const apiKey = Deno.env.get('ANTHROPIC_API_KEY');
    if (!apiKey) return Response.json({ error: 'ANTHROPIC_API_KEY not set' }, { status: 500 });

    // Load the source
    const source = await base44.asServiceRole.entities.Source.get(source_id);

    // ── Guard clauses (fires on every Source.update; must skip ineligible work) ──
    if (!source) return Response.json({ skipped: true, reason: 'no source' });
    // GNPD sources never produce expert examples
    if (source.source_type === 'gnpd') {
      return Response.json({ skipped: true, reason: 'gnpd source' });
    }
    // Only process sources that have completed extraction
    if (source.pipeline_stage !== 'extracted') {
      return Response.json({ skipped: true, reason: 'not extracted stage', pipeline_stage: source.pipeline_stage });
    }
    // Nothing to extract from without excerpts
    if (!source.excerpts || source.excerpts.length === 0) {
      return Response.json({ skipped: true, reason: 'no excerpts' });
    }
    // The PDF extraction path below is mintel-specific
    if (source.source_type !== 'mintel') {
      return Response.json({ skipped: true, reason: 'not mintel source', source_type: source.source_type });
    }

    // Fetch file content via signed URL
    let fileContent = '';
    const rawUrl = source.file_url || source.url;
    if (!rawUrl) return Response.json({ error: 'Source has no file_url' }, { status: 400 });

    let fetchUrl = rawUrl;
    try {
      const signed = await base44.asServiceRole.integrations.Core.CreateFileSignedUrl({
        file_uri: rawUrl, expires_in: 300,
      });
      if (signed?.signed_url) fetchUrl = signed.signed_url;
    } catch (_) {}

    const { getDocument } = await import('npm:pdfjs-dist@4.4.168/legacy/build/pdf.mjs');
    const res = await fetch(fetchUrl, { signal: AbortSignal.timeout(60000) });
    if (!res.ok) throw new Error(`Fetch failed: ${res.status}`);
    const ab = await res.arrayBuffer();
    const pdf = await getDocument({ data: new Uint8Array(ab) }).promise;
    const parts = [];
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const content = await page.getTextContent();
      parts.push(content.items.map(item => item.str).join(' '));
    }
    fileContent = parts.join('\n');

    if (!fileContent || fileContent.length < 100) {
      return Response.json({ error: 'Could not extract text from PDF', examples_created: 0 });
    }

    // Truncate for token limits (target ~20k tokens input)
    const MAX_CHARS = 80000;
    const contentForLLM = fileContent.length > MAX_CHARS
      ? fileContent.slice(0, MAX_CHARS) + '\n\n[Content truncated]'
      : fileContent;

    // --- Pass 1: extract raw examples via LLM ---
    console.log(`[extractExpertExamples] Extracting from ${source.title} (${contentForLLM.length} chars)`);
    let rawExamples;
    try {
      rawExamples = await callAnthropicExtraction(apiKey, contentForLLM, source.title || 'Unknown report');
    } catch (e) {
      return Response.json({ error: `Extraction failed: ${e.message}`, examples_created: 0 }, { status: 500 });
    }

    console.log(`[extractExpertExamples] Got ${rawExamples.length} raw examples`);

    // --- Validate and sanitize ---
    const validExamples = [];
    for (const ex of rawExamples) {
      if (!ex.product_name || !ex.analyst_framing) {
        console.warn('[extractExpertExamples] Skipping invalid example (missing required fields):', ex.product_name);
        continue;
      }
      // Enforce 2-sentence limit on analyst_quote
      if (ex.analyst_quote) {
        ex.analyst_quote = truncateTo2Sentences(ex.analyst_quote);
      }
      validExamples.push(ex);
    }

    // --- Load trend index for linking ---
    const [globalTrends, megaTrends] = await Promise.all([
      base44.asServiceRole.entities.GlobalTrend.filter({ is_active: true }),
      base44.asServiceRole.entities.MegaTrend.filter({ is_active: true }),
    ]);

    const trendIndex = globalTrends.map(t => ({
      id: t.id,
      name: t.trend_name,
      keywords: (t.trend_keywords || []).map(k => k.toLowerCase()),
      mega_trend: t.mega_trend,
      category: t.category,
    }));

    const trendDetails = {};
    globalTrends.forEach(t => {
      trendDetails[t.id] = {
        market_signal: t.market_signal || '',
        description: t.description || '',
        category: t.category || '',
        trend_keywords: t.trend_keywords || [],
      };
    });

    // --- Pass 2: link each example to trends ---
    const now = new Date().toISOString();
    const toCreate = [];

    for (const ex of validExamples) {
      const { links, linkedTrendIds, rejectedCandidates } = await linkExampleToTrends(
        apiKey, ex, trendIndex, trendDetails
      );

      toCreate.push({
        source_id,
        report_title: source.title || '',
        product_name: ex.product_name,
        brand: ex.brand || null,
        company: null,
        country: ex.country || null,
        region_code: mapRegion(ex.country),
        category: source.category || null,
        sub_category: null,
        analyst_framing: ex.analyst_framing,
        analyst_quote: ex.analyst_quote || null,
        page_ref: ex.page_ref || null,
        claims: Array.isArray(ex.claims) ? ex.claims : [],
        flavours: Array.isArray(ex.flavours) ? ex.flavours : [],
        format_notes: ex.format_notes || null,
        mintel_section_heading: ex.mintel_section_heading || null,
        mintel_trend_label: ex.mintel_trend_label || null,
        extraction_confidence: ex.extraction_confidence || 'medium',
        linked_trend_ids: linkedTrendIds,
        trend_links: links,
        rejected_link_candidates: rejectedCandidates,
        image_url: null,
        extracted_at: now,
        extracted_via_run_id: null,
      });
    }

    // Idempotency: remove any existing examples for this source before recreating
    const existing = await base44.asServiceRole.entities.ExpertExample.filter({ source_id }, '-created_date', 500);
    for (const old of existing) {
      await base44.asServiceRole.entities.ExpertExample.delete(old.id);
    }
    if (existing.length > 0) {
      console.log(`[extractExpertExamples] Replaced ${existing.length} existing examples for source ${source_id}`);
    }

    // Bulk create in batches of 25
    let created = 0;
    for (let i = 0; i < toCreate.length; i += 25) {
      const batch = toCreate.slice(i, i + 25);
      await base44.asServiceRole.entities.ExpertExample.bulkCreate(batch);
      created += batch.length;
    }

    console.log(`[extractExpertExamples] Created ${created} ExpertExample records for source ${source_id}`);

    return Response.json({
      success: true,
      source_id,
      examples_extracted: validExamples.length,
      examples_created: created,
      trend_links_auto_applied: toCreate.reduce((n, e) => n + e.linked_trend_ids.length, 0),
      trend_links_pending: toCreate.reduce((n, e) => n + e.trend_links.filter(l => l.review_status === 'pending').length, 0),
    });

  } catch (error) {
    console.error('[extractExpertExamples] Fatal:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});