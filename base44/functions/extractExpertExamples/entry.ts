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
      return Response.json({ error: `Extraction failed: ${e.message}`, examples_created: 0 }, { status: 500 });
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

    // Phase 2: link each section to trends in a separate call so neither phase times out.
    // Fire-and-forget — extraction is done; linking proceeds in the background.
    let linkingTriggered = false;
    if (created > 0) {
      base44.functions.invoke('linkExpertExampleSections', { source_id })
        .catch(e => console.warn(`[extractExpertExamples] linker invoke failed: ${e.message}`));
      linkingTriggered = true;
    }

    return Response.json({
      success: true,
      source_id,
      sections_extracted: sections.length,
      examples_extracted: totalProducts,
      examples_created: created,
      linking_triggered: linkingTriggered,
    });

  } catch (error) {
    console.error('[extractExpertExamples] Fatal:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});