import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

// ── Section-aware extraction ──
// Mintel reports are organised as THEMED SECTIONS. A section states a claim/trend
// (e.g. "Consumers are enticed by chocolate that combines different textures") and the
// product launches beneath it are the EVIDENCE for that claim. We extract the report as
// a hierarchy of sections, then link each section's THESIS to trends once — every product
// in the section inherits those links. This is both more accurate (a product like
// "Fiorella Angel Hair" links to a texture trend via its section, not its name) and faster.

const EXTRACTION_SYSTEM_PROMPT = `You are extracting expert-curated content from a Mintel innovation report.

Mintel reports are organised into THEMED SECTIONS. Each section makes an argument about a market trend (stated in its heading and opening prose), and then cites specific product launches as EVIDENCE supporting that argument. A single thematic section can span multiple pages (e.g. a "texture" theme covers an intro page, a chart page, and one or more product-example pages).

Your job is to reconstruct that structure: identify each thematic section, capture the analyst's claim, and list the product examples that sit under it as evidence.

How to identify a section:
- A section has a thematic heading describing a trend/claim ("Consumers are enticed by chocolate that combines different textures", "Brands get creative with texture to captivate consumers").
- Consecutive pages about the same topic belong to the SAME section, even if each page has its own sub-heading. Group them together.
- The section_thesis is the core argument in your own words, 1-2 sentences (e.g. "Texture is now a primary driver of appeal and premium signalling in chocolate, prompting brands to combine contrasting textures").

How to identify product examples within a section:
- A short bold/italic heading + a product name (often a hyperlink) + a 1-3 sentence analyst description + usually a country in parentheses.
- Extract ONLY explicit product examples. Do NOT extract products mentioned only ambiently in prose ("brands like X and Y..."). Only ones formatted as standalone examples with their own description.
- analyst_quote must be a VERBATIM copy of the report's description, MAXIMUM 2 sentences. Never paraphrase, never exceed 2 sentences (copyright limit).
- analyst_framing is the short headline ABOVE the product example ("Melt-in-mouth angel hair and crunchy pistachio").
- section_evidence_role: one sentence on why THIS product is cited as evidence for the section thesis.
- If a product has no country in parentheses, still extract it but leave country empty.

Skip "Meet the expert" sections, generic "Other innovative launches" lists without a thematic claim, and disclaimer/contents pages.

A section may legitimately have zero products (intro/chart-only pages) — in that case still capture the section with an empty products array if it states a clear thesis, otherwise omit it.

You respond ONLY with a JSON array of SECTION objects. No prose, no markdown, no commentary outside the JSON.

Schema per section:
{
  "section_heading": string,
  "section_thesis": string,
  "page_ref": string or null,
  "products": [
    {
      "product_name": string,
      "brand": string or null,
      "country": string or null,
      "analyst_framing": string,
      "analyst_quote": string (verbatim, max 2 sentences),
      "section_evidence_role": string,
      "claims": [string],
      "flavours": [string],
      "format_notes": string or null,
      "page_ref": string or null,
      "extraction_confidence": "high" | "medium" | "low"
    }
  ]
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

// Map raw category strings to canonical trend category keys (inlined — backend functions
// cannot import project files).
function normalizeCategory(raw) {
  if (!raw) return '';
  const v = String(raw).toLowerCase().trim();
  const direct = ['bakery', 'condiments', 'chocolate_confectionery', 'dairy', 'ice_cream',
    'meat', 'oils_fats', 'plant_based', 'rutf_rusf'];
  if (direct.includes(v)) return v;
  if (/chocolate|confection|candy|sugar/.test(v)) return 'chocolate_confectionery';
  if (/bakery|bread|biscuit|cookie|cake|pastr/.test(v)) return 'bakery';
  if (/dairy|cheese|yog|yoghurt|yogurt|milk/.test(v)) return 'dairy';
  if (/ice ?cream|frozen dessert|gelato/.test(v)) return 'ice_cream';
  if (/meat|poultry|sausage|processed meat/.test(v)) return 'meat';
  if (/condiment|sauce|dressing|mayo|spread/.test(v)) return 'condiments';
  if (/oil|fat|margarine|shortening/.test(v)) return 'oils_fats';
  if (/plant.?based|vegan|dairy.?free|meat.?free/.test(v)) return 'plant_based';
  return '';
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
  const cleaned = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '').trim();
  const start = cleaned.indexOf('[');
  if (start === -1) throw new Error('No JSON array in extraction response');
  let jsonText = cleaned.slice(start);
  try {
    return JSON.parse(jsonText);
  } catch (_) {
    const lastClose = jsonText.lastIndexOf('}');
    if (lastClose === -1) throw new Error('Unparseable extraction response');
    const salvaged = jsonText.slice(0, lastClose + 1) + ']';
    console.warn('[extractExpertExamples] Response truncated — salvaging complete objects');
    return JSON.parse(salvaged);
  }
}

// ── Inline section→trend linking ──
// Runs inside the worker after examples are created. Kept inline (not a separate function
// invoke) because background functions cannot invoke other functions (403). Mirrors the
// standalone linkExpertExampleSections function, which remains for manual/backfill use.
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function mapWithConcurrency(items, limit, worker) {
  const results = new Array(items.length);
  let cursor = 0;
  async function run() {
    while (cursor < items.length) {
      const i = cursor++;
      results[i] = await worker(items[i], i);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, run));
  return results;
}

async function validateSectionTrendLink(apiKey, section, trend) {
  const prompt = `You are evaluating whether a themed section of a Mintel innovation report is genuine evidence of a specific market trend.

TREND
Name: ${trend.trend_name}
Category: ${trend.category || 'Unknown'}
Market signal: ${trend.market_signal || ''}
Description: ${(trend.description || '').slice(0, 400)}
Keywords: ${(trend.trend_keywords || []).join(', ')}

REPORT SECTION
Heading: ${section.section_heading || ''}
Thesis (analyst's argument): ${section.section_thesis || ''}
Example products cited as evidence: ${(section.product_names || []).slice(0, 8).join('; ')}

Scoring guide:
- 80-100 SUPPORTS: The section's thesis is clearly an instance/driver of this trend.
- 50-79 PARTIAL: The section overlaps with the trend but also diverges, or alignment is implicit.
- 0-49 NOT_SUPPORT: Only incidental keyword overlap — the section is not about this trend.

Respond ONLY with JSON:
{"verdict":"SUPPORTS"|"PARTIAL"|"NOT_SUPPORT","confidence_score":0-100,"reasoning":"one sentence"}`;

  let res;
  for (let attempt = 0; attempt < 4; attempt++) {
    res = await fetch('https://api.anthropic.com/v1/messages', {
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
    if (res.status !== 429) break;
    await sleep(1000 * Math.pow(2, attempt));
  }
  if (!res.ok) throw new Error(`Validation API error ${res.status}`);
  const data = await res.json();
  const raw = (data.content?.[0]?.text || '').trim();
  const match = raw.match(/\{[\s\S]*\}/);
  if (!match) return { verdict: 'NOT_SUPPORT', confidence_score: 0, reasoning: 'Parse error' };
  return JSON.parse(match[0]);
}

function sectionTextFor(section) {
  return [section.section_heading, section.section_thesis, ...(section.product_names || [])]
    .filter(Boolean).join(' ').toLowerCase();
}

function keywordOverlapForSection(section, trend) {
  const trendKws = (trend.keywords || []);
  if (trendKws.length === 0) return [];
  const text = sectionTextFor(section);
  return trendKws.filter(kw => text.includes(kw));
}

const MAX_SAME_CATEGORY_FALLBACK = 6;
function selectSectionCandidates(section, sectionCategoryKey, trendIndex) {
  const keywordMatches = [];
  for (const trend of trendIndex) {
    const matched = keywordOverlapForSection(section, trend);
    if (matched.length > 0) keywordMatches.push({ trend, matched });
  }
  if (keywordMatches.length > 0) return keywordMatches;
  if (!sectionCategoryKey) return [];
  return trendIndex
    .filter(t => t.category === sectionCategoryKey)
    .sort((a, b) => (b.keywords?.length || 0) - (a.keywords?.length || 0))
    .slice(0, MAX_SAME_CATEGORY_FALLBACK)
    .map(trend => ({ trend, matched: [] }));
}

function verdictToLink(trend, matched, verdict, now) {
  const score = verdict.confidence_score || 0;
  const v = verdict.verdict;
  if (v === 'NOT_SUPPORT' || score < 40) {
    return {
      rejected: {
        trend_id: trend.id, trend_name: trend.name, matched_keywords: matched,
        llm_verdict: v, llm_reasoning: verdict.reasoning, llm_score: score, rejected_at: now,
      },
    };
  }
  const isAutoApply = v === 'SUPPORTS' && score >= 70;
  return {
    link: {
      trend_id: trend.id, trend_name: trend.name, trend_type: 'global',
      confidence: score >= 70 ? 'high' : 'medium', confidence_score: score,
      reasoning: verdict.reasoning, matched_keywords: matched, linked_via: 'section',
      review_status: isAutoApply ? 'auto_applied' : 'pending', linked_at: now,
    },
    autoApply: isAutoApply,
  };
}

// Links every ExpertExample for a source to trends via its section thesis. Returns counts.
async function linkSectionsInline(base44, apiKey, source_id, sourceCategory) {
  const examples = await base44.asServiceRole.entities.ExpertExample.filter({ source_id }, '-created_date', 500);
  if (examples.length === 0) return { auto_applied: 0, pending: 0, examples_updated: 0 };

  // Group examples by section.
  const sectionMap = new Map();
  for (const ex of examples) {
    const key = ex.mintel_section_heading || ex.section_thesis || `__no_section_${ex.id}`;
    if (!sectionMap.has(key)) {
      sectionMap.set(key, {
        section_heading: ex.mintel_section_heading || '',
        section_thesis: ex.section_thesis || '',
        product_names: [], example_ids: [],
      });
    }
    const sec = sectionMap.get(key);
    if (ex.product_name) sec.product_names.push(ex.product_name);
    sec.example_ids.push(ex.id);
  }
  const sections = Array.from(sectionMap.values());

  const globalTrends = await base44.asServiceRole.entities.GlobalTrend.filter({ is_active: true });
  const trendIndex = globalTrends.map(t => ({
    id: t.id, name: t.trend_name,
    keywords: (t.trend_keywords || []).map(k => k.toLowerCase()),
    category: t.category,
  }));
  const trendDetails = {};
  globalTrends.forEach(t => {
    trendDetails[t.id] = {
      trend_name: t.trend_name, market_signal: t.market_signal || '',
      description: t.description || '', category: t.category || '',
      trend_keywords: t.trend_keywords || [],
    };
  });

  const now = new Date().toISOString();
  const sourceCategoryKey = normalizeCategory(sourceCategory) || '';
  const sectionLinks = sections.map(() => ({ links: [], linkedTrendIds: [], rejectedCandidates: [] }));

  const pairs = [];
  sections.forEach((section, sIdx) => {
    for (const { trend, matched } of selectSectionCandidates(section, sourceCategoryKey, trendIndex)) {
      pairs.push({ sIdx, section, trend, matched });
    }
  });
  console.log(`[extractExpertExamples] linking: ${sections.length} sections, ${pairs.length} section/trend pairs`);

  await mapWithConcurrency(pairs, 6, async ({ sIdx, section, trend, matched }) => {
    const trendWithDetails = { ...trend, ...(trendDetails[trend.id] || {}) };
    let verdict;
    try {
      verdict = await validateSectionTrendLink(apiKey, section, trendWithDetails);
    } catch (e) {
      console.warn(`section link failed for "${section.section_heading}" / ${trend.name}: ${e.message}`);
      return;
    }
    const out = verdictToLink(trend, matched, verdict, now);
    const bucket = sectionLinks[sIdx];
    if (out.rejected) bucket.rejectedCandidates.push(out.rejected);
    else {
      bucket.links.push(out.link);
      if (out.autoApply) bucket.linkedTrendIds.push(trend.id);
    }
  });

  const updates = [];
  sections.forEach((section, sIdx) => {
    const { links, linkedTrendIds, rejectedCandidates } = sectionLinks[sIdx];
    for (const exId of section.example_ids) {
      updates.push({
        id: exId,
        linked_trend_ids: [...linkedTrendIds],
        trend_links: links.map(l => ({ ...l })),
        rejected_link_candidates: rejectedCandidates.map(r => ({ ...r })),
      });
    }
  });

  let updated = 0;
  for (let i = 0; i < updates.length; i += 25) {
    await base44.asServiceRole.entities.ExpertExample.bulkUpdate(updates.slice(i, i + 25));
    updated += Math.min(25, updates.length - i);
  }
  const autoApplied = updates.reduce((n, u) => n + u.linked_trend_ids.length, 0);
  const pending = updates.reduce((n, u) => n + u.trend_links.filter(l => l.review_status === 'pending').length, 0);
  return { auto_applied: autoApplied, pending, examples_updated: updated };
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);

    // Support both direct calls ({source_id}) and entity automation payloads ({event, data})
    const body = await req.json().catch(() => ({}));
    const isAutomation = !!body?.event?.entity_name;
    const isWorker = body.worker === true;
    const source_id = body.source_id || body?.event?.entity_id || body?.data?.id;

    if (!isAutomation && !isWorker) {
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
    if (source.source_type === 'gnpd') {
      return Response.json({ skipped: true, reason: 'gnpd source' });
    }
    if (source.pipeline_stage !== 'extracted') {
      return Response.json({ skipped: true, reason: 'not extracted stage', pipeline_stage: source.pipeline_stage });
    }
    if (!source.excerpts || source.excerpts.length === 0) {
      return Response.json({ skipped: true, reason: 'no excerpts' });
    }
    if (source.source_type !== 'mintel' && source.source_type !== 'market_intel') {
      return Response.json({ skipped: true, reason: 'not a report source', source_type: source.source_type });
    }

    // The full extraction (PDF parse + LLM) runs ~2+ minutes — too long for an entity
    // automation's budget. So when triggered by the automation, hand the heavy work to a
    // background self-invocation and return immediately. The worker call does the real work.
    if (isAutomation) {
      base44.asServiceRole.functions.invoke('extractExpertExamples', { source_id, worker: true })
        .catch(e => console.warn(`[extractExpertExamples] worker invoke failed: ${e.message}`));
      return Response.json({ success: true, source_id, dispatched: true });
    }

    // Fetch file content via signed URL
    let fileContent = '';
    const rawUrl = source.file_url || source.url;
    if (!rawUrl) return Response.json({ error: 'Source has no file_url' }, { status: 400 });

    // PowerPoint files are not PDFs — the PDF parser can never read them. Skip up front
    // so the automation finishes gracefully instead of crashing on the parse attempt.
    const lowerName = (source.title || rawUrl || '').toLowerCase();
    if (lowerName.endsWith('.pptx') || lowerName.endsWith('.ppt')) {
      console.warn(`[extractExpertExamples] Skipping non-PDF (PowerPoint) source: ${source.title}`);
      return Response.json({ success: true, source_id, sections_extracted: 0, examples_created: 0, reason: 'PowerPoint file — not a parseable PDF' });
    }

    let fetchUrl = rawUrl;
    try {
      const signed = await base44.asServiceRole.integrations.Core.CreateFileSignedUrl({
        file_uri: rawUrl, expires_in: 300,
      });
      if (signed?.signed_url) fetchUrl = signed.signed_url;
    } catch (_) {}

    // Pre-flight size guard: parsing very large PDFs can exhaust the isolate's memory during
    // pdf.js document initialization — an OOM crash no try/catch can recover. Skip oversized
    // files up front and flag them for manual handling so the automation never hard-fails.
    const MAX_PDF_BYTES = 15 * 1024 * 1024; // 15 MB
    let fileBytes = source.file_size || 0;
    if (!fileBytes) {
      try {
        const head = await fetch(fetchUrl, { method: 'HEAD', signal: AbortSignal.timeout(30000) });
        const len = head.headers.get('content-length');
        if (len) fileBytes = parseInt(len, 10);
      } catch (_) {}
    }
    if (fileBytes && fileBytes > MAX_PDF_BYTES) {
      console.warn(`[extractExpertExamples] Skipping oversized PDF (${(fileBytes / 1048576).toFixed(1)}MB) for ${source.title}`);
      return Response.json({
        success: true, source_id, sections_extracted: 0, examples_created: 0,
        reason: `PDF too large to parse safely (${(fileBytes / 1048576).toFixed(1)}MB) — needs manual handling`,
      });
    }

    try {
      const { getDocument } = await import('npm:pdfjs-dist@4.4.168/legacy/build/pdf.mjs');
      const res = await fetch(fetchUrl, { signal: AbortSignal.timeout(60000) });
      if (!res.ok) throw new Error(`Fetch failed: ${res.status}`);
      const ab = await res.arrayBuffer();
      // We only need the text layer — disable font face loading and eval to keep the parser
      // lightweight and avoid the graphics/rasterization path that can exhaust the isolate's memory.
      const pdf = await getDocument({
        data: new Uint8Array(ab),
        disableFontFace: true,
        isEvalSupported: false,
        useSystemFonts: false,
      }).promise;
      // Only the first 80K chars are ever sent to the LLM, so there's no need to parse every
      // page. Cap the page count and release each page's resources after reading its text —
      // parsing all pages of a large, graphics-heavy PDF can exhaust the isolate's memory
      // (an OOM crash that no try/catch can recover). We also stop early once we have enough text.
      const MAX_PAGES = 120;
      const pageLimit = Math.min(pdf.numPages, MAX_PAGES);
      const parts = [];
      let charCount = 0;
      for (let i = 1; i <= pageLimit; i++) {
        const page = await pdf.getPage(i);
        const content = await page.getTextContent();
        const pageText = content.items.map(item => item.str).join(' ');
        parts.push(pageText);
        charCount += pageText.length;
        page.cleanup();
        if (charCount >= 85000) break; // enough for the LLM; stop reading further pages
      }
      fileContent = parts.join('\n');
    } catch (e) {
      // Unreadable/corrupt PDF — not recoverable by retrying. Finish gracefully so the
      // automation doesn't keep retrying it.
      console.warn(`[extractExpertExamples] Could not read PDF for ${source.title}: ${e.message}`);
      return Response.json({ success: true, source_id, sections_extracted: 0, examples_created: 0, reason: `unreadable PDF: ${e.message}` });
    }

    if (!fileContent || fileContent.length < 100) {
      return Response.json({ error: 'Could not extract text from PDF', examples_created: 0 });
    }

    const MAX_CHARS = 80000;
    const contentForLLM = fileContent.length > MAX_CHARS
      ? fileContent.slice(0, MAX_CHARS) + '\n\n[Content truncated]'
      : fileContent;

    // --- Pass 1: extract the report as themed sections ---
    console.log(`[extractExpertExamples] Extracting sections from ${source.title} (${contentForLLM.length} chars)`);
    let rawSections;
    try {
      rawSections = await callAnthropicExtraction(apiKey, contentForLLM, source.title || 'Unknown report');
    } catch (e) {
      // A market-sizing report (vs a product-innovation report) often yields no parseable
      // section JSON. Treat that as "nothing to extract" rather than a hard failure, so the
      // automation doesn't keep retrying a report that has no curated product examples.
      console.warn(`[extractExpertExamples] No extractable sections from ${source.title}: ${e.message}`);
      return Response.json({ success: true, source_id, sections_extracted: 0, examples_created: 0, reason: 'no extractable product sections' });
    }
    if (!Array.isArray(rawSections)) rawSections = [];

    // Keep only sections that actually have product examples to record.
    const sections = rawSections
      .filter(s => Array.isArray(s.products) && s.products.length > 0)
      .map(s => ({
        section_heading: s.section_heading || '',
        section_thesis: s.section_thesis || '',
        page_ref: s.page_ref || null,
        products: s.products.filter(p => p.product_name && p.analyst_framing).map(p => ({
          ...p,
          analyst_quote: p.analyst_quote ? truncateTo2Sentences(p.analyst_quote) : null,
        })),
      }))
      .filter(s => s.products.length > 0);

    const totalProducts = sections.reduce((n, s) => n + s.products.length, 0);
    console.log(`[extractExpertExamples] Got ${sections.length} sections, ${totalProducts} products`);

    // Build one ExpertExample per product, carrying its section context. Trend linking happens
    // in a separate phase (linkExpertExampleSections) so this call stays within the time budget.
    const now = new Date().toISOString();
    const toCreate = [];
    sections.forEach((section) => {
      section.products.forEach(p => {
        toCreate.push({
          source_id,
          report_title: source.title || '',
          product_name: p.product_name,
          brand: p.brand || null,
          company: null,
          country: p.country || null,
          region_code: mapRegion(p.country),
          category: source.category || null,
          sub_category: null,
          analyst_framing: p.analyst_framing,
          analyst_quote: p.analyst_quote || null,
          page_ref: p.page_ref || section.page_ref || null,
          claims: Array.isArray(p.claims) ? p.claims : [],
          flavours: Array.isArray(p.flavours) ? p.flavours : [],
          format_notes: p.format_notes || null,
          mintel_section_heading: section.section_heading || null,
          mintel_trend_label: section.section_heading || null,
          section_thesis: section.section_thesis || null,
          section_evidence_role: p.section_evidence_role || null,
          extraction_confidence: p.extraction_confidence || 'medium',
          linked_trend_ids: [],
          trend_links: [],
          rejected_link_candidates: [],
          image_url: null,
          extracted_at: now,
          extracted_via_run_id: null,
        });
      });
    });

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

    // Phase 2: link each section's thesis to trends, inline. Every product in a section
    // inherits its section's links. Done inline (not via a separate invoke) because a
    // background worker can't invoke another function.
    let linking = { auto_applied: 0, pending: 0, examples_updated: 0 };
    if (created > 0) {
      try {
        linking = await linkSectionsInline(base44, apiKey, source_id, source.category);
        console.log(`[extractExpertExamples] linked: ${linking.auto_applied} auto-applied, ${linking.pending} pending`);
      } catch (e) {
        console.warn(`[extractExpertExamples] inline linking failed: ${e.message}`);
      }
    }

    return Response.json({
      success: true,
      source_id,
      sections_extracted: sections.length,
      examples_extracted: totalProducts,
      examples_created: created,
      trend_links_auto_applied: linking.auto_applied,
      trend_links_pending: linking.pending,
    });

  } catch (error) {
    console.error('[extractExpertExamples] Fatal:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});