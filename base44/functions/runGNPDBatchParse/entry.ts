import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';
import * as XLSX from 'npm:xlsx@0.18.5';
import Anthropic from 'npm:@anthropic-ai/sdk@0.27.3';

const EMULSIFIER_TERMS = [
  'lecithin', 'mono and diglycerides', 'monoglycerides', 'diglycerides',
  'e471', 'e472', 'e473', 'e474', 'e475', 'e476', 'e477', 'e481', 'e482',
  'pgpr', 'ammonium phosphatide', 'sorbitan', 'polysorbate', 'ssl',
  'csl', 'datem', 'acetylated', 'diacetyl', 'propylene glycol',
  'carrageenan', 'locust bean', 'guar gum', 'xanthan', 'gelatin',
  'pectin', 'agar', 'carob', 'tara gum', 'konjac', 'cellulose',
  'maltodextrin', 'modified starch', 'hydroxypropyl'
];

const COUNTRY_REGION = {
  'USA': 'AMERICAS', 'United States': 'AMERICAS', 'Canada': 'AMERICAS',
  'Brazil': 'AMERICAS', 'Mexico': 'AMERICAS', 'Argentina': 'AMERICAS',
  'Chile': 'AMERICAS', 'Colombia': 'AMERICAS', 'Peru': 'AMERICAS',
  'UK': 'EMEC', 'United Kingdom': 'EMEC', 'Germany': 'EMEC',
  'France': 'EMEC', 'Italy': 'EMEC', 'Spain': 'EMEC', 'Netherlands': 'EMEC',
  'Poland': 'EMEC', 'Sweden': 'EMEC', 'Denmark': 'EMEC', 'Norway': 'EMEC',
  'Finland': 'EMEC', 'Belgium': 'EMEC', 'Switzerland': 'EMEC',
  'Austria': 'EMEC', 'Russia': 'EMEC', 'Turkey': 'IMEA',
  'South Africa': 'IMEA', 'Nigeria': 'IMEA', 'Saudi Arabia': 'IMEA',
  'UAE': 'IMEA', 'Egypt': 'IMEA', 'Israel': 'IMEA',
  'China': 'ASPAC', 'Japan': 'ASPAC', 'South Korea': 'ASPAC',
  'India': 'ASPAC', 'Australia': 'ASPAC', 'Indonesia': 'ASPAC',
  'Thailand': 'ASPAC', 'Vietnam': 'ASPAC', 'Malaysia': 'ASPAC',
  'Philippines': 'ASPAC', 'New Zealand': 'ASPAC', 'Taiwan': 'ASPAC',
  'Hong Kong': 'ASPAC', 'Singapore': 'ASPAC'
};

// ── Canonical region layer (mirrors lib/regions.js — no local imports in Deno) ──
const MARKET_TO_REGION = {
  'japan': 'aspac', 'china': 'aspac', 'south korea': 'aspac', 'korea': 'aspac',
  'indonesia': 'aspac', 'thailand': 'aspac', 'vietnam': 'aspac', 'philippines': 'aspac',
  'malaysia': 'aspac', 'singapore': 'aspac', 'australia': 'aspac', 'new zealand': 'aspac',
  'india': 'aspac', 'taiwan': 'aspac', 'hong kong': 'aspac',
  'taiwan, china': 'aspac', 'hong kong, china': 'aspac', 'sri lanka': 'aspac',
  'bangladesh': 'aspac', 'pakistan': 'aspac', 'cambodia': 'aspac',
  'myanmar': 'aspac', 'laos': 'aspac',
  'uk': 'europe', 'united kingdom': 'europe', 'great britain': 'europe',
  'germany': 'europe', 'france': 'europe', 'italy': 'europe', 'spain': 'europe',
  'netherlands': 'europe', 'belgium': 'europe', 'sweden': 'europe', 'denmark': 'europe',
  'norway': 'europe', 'finland': 'europe', 'poland': 'europe', 'switzerland': 'europe',
  'austria': 'europe', 'ireland': 'europe', 'czech republic': 'europe', 'czechia': 'europe',
  'portugal': 'europe', 'greece': 'europe', 'romania': 'europe', 'hungary': 'europe',
  'russia': 'europe', 'lithuania': 'europe', 'slovenia': 'europe',
  'latvia': 'europe', 'croatia': 'europe',
  'united states': 'north_america', 'us': 'north_america', 'usa': 'north_america',
  'u.s.': 'north_america', 'u.s.a.': 'north_america', 'canada': 'north_america',
  'brazil': 'latam', 'mexico': 'latam', 'argentina': 'latam', 'colombia': 'latam',
  'chile': 'latam', 'peru': 'latam', 'ecuador': 'latam',
  'puerto rico': 'latam', 'venezuela': 'latam', 'guatemala': 'latam', 'panama': 'latam',
  'uae': 'mena', 'united arab emirates': 'mena', 'saudi arabia': 'mena', 'egypt': 'mena',
  'turkey': 'mena', 'israel': 'mena', 'south africa': 'mena', 'morocco': 'mena',
  'tunisia': 'mena', 'lebanon': 'mena', 'kuwait': 'mena', 'qatar': 'mena',
  'bahrain': 'mena', 'jordan': 'mena', 'algeria': 'mena', 'oman': 'mena',
  'nigeria': 'sub_saharan_africa', 'kenya': 'sub_saharan_africa', 'ghana': 'sub_saharan_africa',
  'ethiopia': 'sub_saharan_africa', 'tanzania': 'sub_saharan_africa',
  'cameroon': 'sub_saharan_africa', 'ivory coast': 'sub_saharan_africa',
};
function getRegionForMarket(marketName) {
  if (!marketName || typeof marketName !== 'string') return 'unknown';
  return MARKET_TO_REGION[marketName.trim().toLowerCase()] || 'unknown';
}

// Canonical → commercial fold (mirrors lib/regions.js getCommercialRegion, incl. overrides)
const CANONICAL_TO_COMMERCIAL = {
  aspac: 'aspac', north_america: 'americas', latam: 'americas',
  europe: 'emec', mena: 'imea', sub_saharan_africa: 'imea',
};
const COMMERCIAL_OVERRIDES = {
  'india': 'imea', 'turkey': 'emec', 'iran': 'emec', 'uzbekistan': 'emec',
  'turkmenistan': 'emec', 'kazakhstan': 'emec', 'kyrgyzstan': 'emec',
  'tajikistan': 'emec', 'afghanistan': 'emec', 'azerbaijan': 'emec',
  'georgia': 'emec', 'armenia': 'emec', 'russia': 'aspac',
};
function getCommercialRegion(canonicalKey, country = null) {
  if (country) {
    const n = country.toLowerCase().trim();
    if (COMMERCIAL_OVERRIDES[n]) return COMMERCIAL_OVERRIDES[n];
  }
  return CANONICAL_TO_COMMERCIAL[canonicalKey] || null;
}

// ── Country-column integrity guard (Phase 4) ──
// Some GNPD exports leak a product description into the Market/Country column.
// A real country value is short and matches the region map; a description is long
// and/or sentence-like. This rejects description-shaped values so they never get
// stored as the country (which is what produced the "Type B" unknown-region records).
function sanitizeCountry(raw) {
  const value = String(raw || '').trim();
  if (!value) return '';
  // Known country → always accept
  if (MARKET_TO_REGION[value.toLowerCase()]) return value;
  // Description heuristics: too long, multi-word sentence, or contains punctuation
  // that never appears in a country name.
  const looksLikeDescription =
    value.length > 40 ||
    value.split(/\s+/).length > 5 ||
    /[.;:!?]|\bde\b|\bproduct\b|\bcontains\b/i.test(value);
  if (looksLikeDescription) return '';
  return value;
}

const LLM_SYSTEM_PROMPT = `You are validating whether a GNPD product launch is genuine evidence of a market trend, or whether the keyword overlap is incidental.

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

async function validateCandidateLink(anthropic, product, trend, matchedKeywords) {
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
Name: ${trend.name || ''}
Market signal: ${trend.market_signal || ''}
Description: ${(trend.description || '').slice(0, 400)}
Category: ${trend.category || ''}

KEYWORD OVERLAP
Matched: ${matchedKeywords.join(', ')}

Is this product genuine evidence of this trend? Respond with JSON only.`;

    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 400,
      system: LLM_SYSTEM_PROMPT,
      messages: [{ role: 'user', content: userPrompt }]
    });

    const text = response.content[0]?.text?.trim() || '';
    const jsonText = text.replace(/^```(?:json)?\n?/i, '').replace(/\n?```$/i, '').trim();
    const parsed = JSON.parse(jsonText);
    return { verdict: parsed.verdict, confidence_score: parsed.confidence_score, reasoning: parsed.reasoning };
  } catch (e) {
    return { verdict: 'ERROR', confidence_score: 0, reasoning: `LLM validation failed: ${e.message?.slice(0, 100)}` };
  }
}

async function linkToTrends(anthropic, trendIndex, trendDetails, megaTrendMap, product) {
  const { ingredients = '', claims = [], product_name = '', product_description = '' } = product;
  const textToSearch = [product_name, product_description, ingredients,
    Array.isArray(claims) ? claims.join(' ') : (claims || '')
  ].join(' ').toLowerCase();

  const links = [];
  const rejectedCandidates = [];
  const linkedMegaTrendIds = [];
  const now = new Date().toISOString();

  for (const trend of trendIndex) {
    const matchedKeywords = trend.keywords.filter(kw => kw.length > 3 && textToSearch.includes(kw));
    if (matchedKeywords.length < 2) continue; // pre-filter: must have ≥2 keyword matches

    // LLM validation gate
    const trendDetail = trendDetails[trend.id] || {};
    const validation = await validateCandidateLink(anthropic, product, { ...trend, ...trendDetail }, matchedKeywords);

    if (validation.verdict === 'NOT_SUPPORT') {
      rejectedCandidates.push({
        trend_id: trend.id,
        trend_name: trend.name,
        matched_keywords: matchedKeywords,
        llm_verdict: validation.verdict,
        llm_reasoning: validation.reasoning,
        llm_score: validation.confidence_score,
        rejected_at: now
      });
      continue;
    }

    let confidence, reviewStatus, score;
    if (validation.verdict === 'ERROR') {
      confidence = 'low'; reviewStatus = 'pending'; score = 0;
    } else if (validation.verdict === 'SUPPORTS' && validation.confidence_score >= 70) {
      confidence = 'high'; reviewStatus = 'auto_applied'; score = validation.confidence_score;
    } else {
      // SUPPORTS <70 or PARTIAL
      confidence = 'medium'; reviewStatus = 'pending'; score = validation.confidence_score;
    }

    links.push({
      trend_id: trend.id, trend_name: trend.name, trend_type: 'global',
      confidence, confidence_score: score, matched_keywords: matchedKeywords,
      reasoning: validation.reasoning,
      review_status: reviewStatus, linked_at: now
    });

    if (trend.mega_trend && megaTrendMap[trend.mega_trend]) {
      const mtId = megaTrendMap[trend.mega_trend];
      if (!linkedMegaTrendIds.includes(mtId)) linkedMegaTrendIds.push(mtId);
    }
  }

  const linkedTrendIds = links.filter(l => l.review_status === 'auto_applied').map(l => l.trend_id);
  const supportLabel = links.length === 0 ? 'NOT_SUPPORT'
    : links.some(l => l.confidence === 'high') ? 'SUPPORTS' : 'PARTIAL';
  return { links, linkedTrendIds, linkedMegaTrendIds, supportLabel, rejectedCandidates };
}

const MONTH_NAMES = {
  jan: '01', january: '01', feb: '02', february: '02', mar: '03', march: '03',
  apr: '04', april: '04', may: '05', jun: '06', june: '06', jul: '07', july: '07',
  aug: '08', august: '08', sep: '09', sept: '09', september: '09', oct: '10', october: '10',
  nov: '11', november: '11', dec: '12', december: '12',
};

// Robust GNPD date parser. Handles (in addition to Excel serials, handled by caller):
//   YYYY-MM-DD | MMM YYYY | MMMM YYYY | MM/YYYY | DD/MM/YYYY | MM/DD/YYYY
// Month-only formats set day = 01. Returns ISO 'YYYY-MM-DD' or null (never throws).
function parseGNPDDate(input) {
  if (input === null || input === undefined) return null;
  const s = String(input).trim();
  if (!s) return null;

  // YYYY-MM-DD (already supported) — keep, validate
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) {
    const d = new Date(`${m[1]}-${m[2]}-${m[3]}T00:00:00Z`);
    if (!isNaN(d.getTime())) return `${m[1]}-${m[2]}-${m[3]}`;
  }

  // "MMM YYYY" / "MMMM YYYY" (e.g. "Jan 2024", "January 2024") → day 01
  m = s.match(/^([A-Za-z]+)\s+(\d{4})$/);
  if (m) {
    const mm = MONTH_NAMES[m[1].toLowerCase()];
    if (mm) return `${m[2]}-${mm}-01`;
  }

  // "MM/YYYY" (e.g. "06/2026") → day 01
  m = s.match(/^(\d{1,2})\/(\d{4})$/);
  if (m) {
    const mm = String(m[1]).padStart(2, '0');
    if (+mm >= 1 && +mm <= 12) return `${m[2]}-${mm}-01`;
  }

  // "DD/MM/YYYY" or "MM/DD/YYYY" — disambiguate: if first part > 12 it must be the day.
  m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (m) {
    let a = +m[1], b = +m[2];
    const year = m[3];
    let day, month;
    if (a > 12 && b <= 12) { day = a; month = b; }       // DD/MM/YYYY
    else if (b > 12 && a <= 12) { month = a; day = b; }  // MM/DD/YYYY
    else { day = a; month = b; }                          // ambiguous → assume DD/MM/YYYY
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    }
  }

  return null;
}

// Extract product name (and company) from HTML-format "Company\n - \n Brand\n - \n Product" cell
function extractProductName(raw) {
  if (!raw) return '';
  const parts = String(raw).split(/\n\s*-\s*\n/);
  // Last part is the actual product name
  return parts[parts.length - 1].trim();
}

function extractCompany(raw) {
  if (!raw) return '';
  const parts = String(raw).split(/\n\s*-\s*\n/);
  return parts.length >= 3 ? parts[0].trim() : '';
}

// Parse Mintel GNPD HTML export (dl/dt/dd format, one div per product)
function parseGNPDHtml(html) {
  const rows = [];
  // Each product is wrapped in a <div style="border:..."> containing a <dl>
  const divBlocks = html.split(/<div style="border:/i).slice(1);

  for (const block of divBlocks) {
    // Extract record ID from href
    const hrefMatch = block.match(/href="[^"]*\/recordpage\/(\d+)\//i);
    if (!hrefMatch) continue;
    const recordId = hrefMatch[1];

    // Extract the href URL itself
    const urlMatch = block.match(/href="(http[^"]+\/recordpage\/\d+\/)"/i);
    const recordUrl = urlMatch ? urlMatch[1] : `https://www.gnpd.com/sinatra/recordpage/${recordId}/`;

    // Extract all <dt>/<dd> pairs
    const dtMatches = [...block.matchAll(/<dt>([\s\S]*?)<\/dt>/gi)];
    const ddMatches = [...block.matchAll(/<dd>([\s\S]*?)<\/dd>/gi)];

    const clean = (s) => s
      .replace(/<[^>]+>/g, '')
      .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
      .replace(/&nbsp;/g, ' ').replace(/&#\d+;/g, '').replace(/&[a-z]+;/g, '')
      .replace(/\s+/g, ' ').trim();

    // First <dt> is the product compound name (Company - Brand - ProductName)
    const productCompound = dtMatches.length > 0 ? clean(dtMatches[0][1]) : '';

    const fields = {};
    // Remaining dt/dd pairs are key-value
    for (let i = 1; i < dtMatches.length; i++) {
      const key = clean(dtMatches[i][1]);
      // Find matching dd - dd index = i (first dd is blank &nbsp; after product title)
      const dd = ddMatches[i + 1]; // +1 offset because first dd is the blank separator
      fields[key] = dd ? clean(dd[1]) : '';
    }

    // Parse date: "Apr 2026" or "<monthname ...>Apr</monthname> 2026"
    const rawDate = fields['Date Published'] || '';
    const cleanDate = rawDate.replace(/<[^>]+>/g, '').trim();

    rows.push({
      'Record ID': recordId,
      'Product': productCompound,
      'Brand': fields['Brand'] || '',
      'Market': fields['Market'] || '',
      'Category': fields['Category'] || '',
      'Sub-Category': fields['Sub-Category'] || '',
      'Date Published': cleanDate,
      'Launch Type': fields['Launch Type'] || '',
      'Product Description': fields['Product Description'] || '',
      'Record Hyperlink': recordUrl,
      'Flavours': fields['Flavours'] || '',
      'Positioning Claims': fields['Positioning Claims'] || '',
      'Format Type': fields['Format Type'] || '',
      'Storage': fields['Storage'] || '',
      'Package Type': fields['Package Type'] || '',
      'Ingredients (On pack)': fields['Ingredients (On pack)'] || '',
    });
  }
  return rows;
}

async function parseRows(fileBuffer, fileUrl) {
  const isHtml = /\.html?($|\?)/i.test(fileUrl);
  if (isHtml) {
    const text = new TextDecoder().decode(fileBuffer);
    const rows = parseGNPDHtml(text);
    return { rows, isHtml: true };
  } else {
    const wb = XLSX.read(new Uint8Array(fileBuffer), { type: 'array', cellDates: true });
    const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: null });
    return { rows, isHtml: false };
  }
}

async function processOneSource(base44, anthropic, sourceId, batchSize = 50) {
  const source = await base44.asServiceRole.entities.Source.get(sourceId);

  // ── Guard clauses (fires on every Source.update; must skip non-GNPD work) ──
  if (!source) return { skipped: true, reason: 'no source' };
  // Only process GNPD sources
  if (source.source_type !== 'gnpd') {
    return { skipped: true, reason: 'not gnpd source', source_type: source.source_type };
  }
  // Only process when in an eligible pipeline stage. This path fully ingests and
  // marks the source gnpd_ready, so eligible stages are the pre-ingest ones.
  const eligibleStages = ['uploaded', 'gnpd_ready'];
  if (source.pipeline_stage && !eligibleStages.includes(source.pipeline_stage)) {
    return { skipped: true, reason: 'not eligible stage', pipeline_stage: source.pipeline_stage };
  }

  // Load column mapping from GNPDColumnMapping entity
  const mappingRecords = await base44.asServiceRole.entities.GNPDColumnMapping.filter({ source_id: sourceId });
  const colMap = mappingRecords.length > 0 ? (mappingRecords[0].mappings || {}) : (source.gnpd_column_mapping || {});

  // Prefer the clean, pre-parsed rows stored on the source at upload time.
  // Re-fetching the raw XLSX is unreliable: some GNPD exports carry banner rows
  // above the real header (e.g. "Search details"), which makes sheet_to_json
  // mis-detect the header and yields __EMPTY columns → every row skipped, 0 created.
  // source.gnpd_data already holds the correctly-headed rows.
  let rows;
  let isHtml = false;
  if (Array.isArray(source.gnpd_data) && source.gnpd_data.length > 0) {
    rows = source.gnpd_data;
  } else {
    if (!source.file_url) throw new Error('Source has no file_url and no stored gnpd_data');
    isHtml = /\.html?($|\?)/i.test(source.file_url);
    let fetchUrl = source.file_url;
    try {
      const signed = await base44.asServiceRole.integrations.Core.CreateFileSignedUrl({ file_uri: source.file_url, expires_in: 300 });
      if (signed?.signed_url) fetchUrl = signed.signed_url;
    } catch (_) { /* public file — use original URL */ }
    const fileResponse = await fetch(fetchUrl);
    if (!fileResponse.ok) throw new Error(`Failed to fetch file: ${fileResponse.status}`);
    const fileBuffer = await fileResponse.arrayBuffer();
    const parsed = await parseRows(fileBuffer, source.file_url);
    rows = parsed.rows;
    isHtml = parsed.isHtml;
  }
  if (rows.length === 0) throw new Error('No rows parsed from source');

  // Deduplicate
  const existing = await base44.asServiceRole.entities.GNPDProduct.filter({ source_id: sourceId }, null, 10000);
  const existingIds = new Set(existing.map(r => String(r.gnpd_record_id)));

  // Load trends
  const [globalTrends, megaTrends] = await Promise.all([
    base44.asServiceRole.entities.GlobalTrend.filter({ is_active: true }),
    base44.asServiceRole.entities.MegaTrend.filter({ is_active: true })
  ]);
  const trendIndex = globalTrends.map(t => ({
    id: t.id, name: t.trend_name,
    keywords: (t.trend_keywords || []).map(k => k.toLowerCase()),
    mega_trend: t.mega_trend
  }));
  // Build detail map for LLM prompts
  const trendDetails = {};
  globalTrends.forEach(t => {
    trendDetails[t.id] = {
      market_signal: t.market_signal || '',
      description: t.description || '',
      category: t.category || ''
    };
  });
  const megaTrendMap = {};
  megaTrends.forEach(mt => { megaTrendMap[mt.mega_trend_name] = mt.id; });

  const get = (row, field) => {
    const col = colMap[field];
    return (col && row[col] !== undefined) ? row[col] : null;
  };

  // For HTML exports, columns are named differently
  const getRecordId   = (row) => get(row, 'record_id')   || row['Record ID']   || null;
  const getProductRaw = (row) => get(row, 'product_name') || row['Product']     || null;
  const getBrand      = (row) => get(row, 'brand')        || row['Brand']       || '';
  const getMarket     = (row) => get(row, 'market')       || row['Market']      || '';
  const getCategory   = (row) => get(row, 'category')     || row['Category']    || '';
  const getSubCat     = (row) => get(row, 'sub_category') || row['Sub-Category']|| '';
  const getLaunchType = (row) => get(row, 'launch_type')  || row['Launch Type'] || '';
  const getDescription= (row) => get(row, 'product_description') || row['Product Description'] || '';
  const getHyperlink  = (row) => get(row, 'record_hyperlink') || row['Record Hyperlink'] || row['Record hyperlink'] || null;
  const getFlavours   = (row) => get(row, 'flavours')     || row['Flavours']    || '';
  const getFormatType = (row) => get(row, 'format_type')  || row['Format Type'] || '';
  const getStorage    = (row) => get(row, 'storage')      || row['Storage']     || '';
  const getPackageType= (row) => get(row, 'package_type') || row['Package Type']|| '';

  // Returns { date: ISO|null, rawUnparsed: string|null }. Never throws.
  const getDatePublished = (row) => {
    const raw = get(row, 'date_published') || row['Date Published'];
    if (raw === null || raw === undefined || raw === '') return { date: null, rawUnparsed: null };
    // Excel serial number
    if (typeof raw === 'number') {
      const d = new Date((raw - 25569) * 86400 * 1000);
      if (!isNaN(d.getTime())) return { date: d.toISOString().split('T')[0], rawUnparsed: null };
    }
    // String formats: YYYY-MM-DD, MMM/MMMM YYYY, MM/YYYY, DD/MM/YYYY, MM/DD/YYYY
    const parsed = parseGNPDDate(raw);
    if (parsed) return { date: parsed, rawUnparsed: null };
    // Last resort: native Date for any other ISO-ish string
    const d = new Date(String(raw));
    if (!isNaN(d.getTime())) return { date: d.toISOString().split('T')[0], rawUnparsed: null };
    // Parsing failed — surface the raw value, do not throw
    return { date: null, rawUnparsed: String(raw) };
  };

  // Fallback columns for ingredients and claims
  const getIngredients = (row) => {
    return get(row, 'ingredients') || row['Ingredients (On pack)'] || row['Ingredients'] || '';
  };
  const getClaims = (row) => {
    return get(row, 'claims') || row['Positioning Claims'] || row['Claims'] || '';
  };

  const toCreate = [];
  let skipped = 0, errors = 0;
  const coverageSet = new Set(); // Phase 8 — commercial regions this GNPD export covers

  for (const row of rows) {
    try {
      const recordId = String(getRecordId(row) || '').trim();
      if (!recordId || recordId === 'null') { skipped++; continue; }
      if (existingIds.has(recordId)) { skipped++; continue; }

      // HTML: product cell = "Company\n - \n Brand\n - \n Product name"
      const productRaw  = getProductRaw(row);
      const productName = isHtml ? extractProductName(productRaw) : String(productRaw || '').trim();
      const company     = isHtml ? extractCompany(productRaw) : String(get(row, 'company') || row['Company'] || '');
      if (!productName) { skipped++; continue; }

      const ingredients = String(getIngredients(row) || '');
      const ingredientsLower = ingredients.toLowerCase();
      const foundEmulsifiers = EMULSIFIER_TERMS.filter(term => ingredientsLower.includes(term));
      const hasEmulsifier = foundEmulsifiers.length > 0;

      const rawClaims = getClaims(row) || '';
      const claims = typeof rawClaims === 'string'
        ? rawClaims.split(',').map(c => c.trim()).filter(Boolean) : [];

      const rawFlavours = getFlavours(row) || '';
      const flavours = typeof rawFlavours === 'string'
        ? rawFlavours.split(',').map(f => f.trim()).filter(Boolean) : [];

      const country    = sanitizeCountry(getMarket(row));
      const regionCode = COUNTRY_REGION[country] || source.region_code || 'Global';
      const region     = getRegionForMarket(country);
      const commercialKey = getCommercialRegion(region, country);
      if (commercialKey) coverageSet.add(commercialKey);
      const { date: launchDate, rawUnparsed: unparsedDate } = getDatePublished(row);

      const recordHyperlink = getHyperlink(row);
      const mintelUrl = (recordHyperlink && typeof recordHyperlink === 'string')
        ? recordHyperlink.trim()
        : `https://www.gnpd.com/sinatra/recordpage/${recordId}/`;

      const description = String(getDescription(row) || '');
      const productForLinking = {
        product_name: productName,
        brand: String(getBrand(row) || ''),
        company,
        country,
        category: source.category || String(getCategory(row) || ''),
        sub_category: String(getSubCat(row) || ''),
        product_description: description,
        claims,
        flavours,
        ingredients
      };
      const { links, linkedTrendIds, linkedMegaTrendIds, supportLabel, rejectedCandidates } =
        await linkToTrends(anthropic, trendIndex, trendDetails, megaTrendMap, productForLinking);

      const hasPalsgaardRelevance = hasEmulsifier || linkedTrendIds.length > 0;

      toCreate.push({
        gnpd_record_id: recordId,
        product_name: productName,
        brand: String(getBrand(row) || ''),
        company,
        ultimate_company: String(get(row, 'ultimate_company') || ''),
        country, region_code: regionCode, region,
        category: source.category || String(getCategory(row) || ''),
        sub_category: String(getSubCat(row) || ''),
        launch_date: launchDate,
        launch_type: String(getLaunchType(row) || ''),
        product_description: description,
        ingredients: ingredients || null,
        claims, flavours,
        format_type: String(getFormatType(row) || ''),
        storage: String(getStorage(row) || ''),
        package_type: String(getPackageType(row) || ''),
        has_emulsifier: hasEmulsifier,
        emulsifier_keywords: foundEmulsifiers,
        has_palsgaard_relevance: hasPalsgaardRelevance,
        palsgaard_relevance_reason: hasEmulsifier
          ? `Contains: ${foundEmulsifiers.slice(0, 3).join(', ')}`
          : hasPalsgaardRelevance ? 'Trend-linked product' : null,
        trend_links: links,
        rejected_link_candidates: rejectedCandidates,
        linked_trend_ids: linkedTrendIds,
        linked_mega_trend_ids: linkedMegaTrendIds,
        support_label: supportLabel,
        processing_status: links.some(l => l.review_status === 'pending') ? 'trend_linking_pending' : 'trend_linked',
        ...(unparsedDate ? { processing_error: `Unparsable launch_date: "${unparsedDate}"` } : {}),
        source_id: sourceId,
        mintel_record_url: mintelUrl,
        image_url: null
      });
      existingIds.add(recordId);
    } catch (e) {
      errors++;
      console.error('Row error:', e.message);
    }
  }

  let created = 0;
  for (let i = 0; i < toCreate.length; i += batchSize) {
    await base44.asServiceRole.entities.GNPDProduct.bulkCreate(toCreate.slice(i, i + batchSize));
    created += Math.min(batchSize, toCreate.length - i);
  }

  // Fully ingested — mark gnpd_ready (template validation was the gate on this path).
  // Phase 8 — record commercial regions covered (merge with any previously recorded).
  const mergedCoverage = [...new Set([...(source.coverage_regions || []), ...coverageSet])];
  await base44.asServiceRole.entities.Source.update(sourceId, {
    pipeline_stage: 'gnpd_ready',
    review_status: 'approved',
    ...(mergedCoverage.length ? { coverage_regions: mergedCoverage } : {}),
  });

  return {
    source_id: sourceId, source_title: source.title,
    rows_parsed: rows.length, created, skipped, errors,
    trend_links_applied: toCreate.reduce((acc, p) => acc + p.trend_links.filter(l => l.review_status === 'auto_applied').length, 0),
    trend_links_pending: toCreate.reduce((acc, p) => acc + p.trend_links.filter(l => l.review_status === 'pending').length, 0),
    products_with_emulsifier: toCreate.filter(p => p.has_emulsifier).length,
    products_with_palsgaard_relevance: toCreate.filter(p => p.has_palsgaard_relevance).length
  };
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json();
    let { sourceIds, batchSize = 50 } = body;

    // Entity automation payload (Source update: gnpd_mapping_status → complete)
    let isAutomation = false;
    if ((!sourceIds || sourceIds.length === 0) && body.event && body.data?.id) {
      sourceIds = [body.data.id];
      isAutomation = true;
    }

    let user = null;
    try { user = await base44.auth.me(); } catch (_) { /* automation context */ }
    if (!user && !isAutomation) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    if (!Array.isArray(sourceIds) || sourceIds.length === 0) {
      return Response.json({ error: 'sourceIds must be a non-empty array' }, { status: 400 });
    }

    const anthropic = new Anthropic({ apiKey: Deno.env.get('ANTHROPIC_API_KEY') });

    const results = [];
    for (const sourceId of sourceIds) {
      try {
        const result = await processOneSource(base44, anthropic, sourceId, batchSize);
        results.push({ sourceId, status: result?.skipped ? 'skipped' : 'ok', ...result });
      } catch (e) {
        console.error(`Error processing ${sourceId}:`, e.message);
        results.push({ sourceId, status: 'error', error: e.message });
      }
    }

    return Response.json({ results, total_sources: sourceIds.length });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});