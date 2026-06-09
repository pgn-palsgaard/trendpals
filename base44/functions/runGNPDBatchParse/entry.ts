import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';
import * as XLSX from 'npm:xlsx@0.18.5';

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

function linkToTrends(trendIndex, megaTrendMap, ingredients, claims, productName, description) {
  const textToSearch = [productName, description, ingredients,
    Array.isArray(claims) ? claims.join(' ') : (claims || '')
  ].join(' ').toLowerCase();

  const links = [];
  const linkedMegaTrendIds = [];

  for (const trend of trendIndex) {
    const matchedKeywords = trend.keywords.filter(kw => kw.length > 3 && textToSearch.includes(kw));
    if (matchedKeywords.length === 0) continue;
    const score = Math.min(100, matchedKeywords.length * 25);
    let confidence, reviewStatus;
    if (score >= 70) { confidence = 'high'; reviewStatus = 'auto_applied'; }
    else if (score >= 40) { confidence = 'medium'; reviewStatus = 'pending'; }
    else { confidence = 'low'; reviewStatus = 'pending'; }
    if (confidence === 'low' && matchedKeywords.length < 2) continue;

    links.push({
      trend_id: trend.id, trend_name: trend.name, trend_type: 'global',
      confidence, confidence_score: score, matched_keywords: matchedKeywords,
      reasoning: `Matched ${matchedKeywords.length} keyword(s): ${matchedKeywords.join(', ')}`,
      review_status: reviewStatus, linked_at: new Date().toISOString()
    });
    if (trend.mega_trend && megaTrendMap[trend.mega_trend]) {
      const mtId = megaTrendMap[trend.mega_trend];
      if (!linkedMegaTrendIds.includes(mtId)) linkedMegaTrendIds.push(mtId);
    }
  }

  const linkedTrendIds = links.filter(l => l.review_status === 'auto_applied').map(l => l.trend_id);
  const supportLabel = links.length === 0 ? 'NOT_SUPPORT'
    : links.some(l => l.confidence === 'high') ? 'SUPPORTS' : 'PARTIAL';
  return { links, linkedTrendIds, linkedMegaTrendIds, supportLabel };
}

// Parse "Apr 2026" or "April 2026" style dates to ISO
function parseMonthYearDate(str) {
  if (!str) return null;
  const s = String(str).trim();
  // Already ISO or numeric
  const d = new Date(s);
  if (!isNaN(d.getTime()) && s.includes('-')) return s.split('T')[0];
  // "Apr 2026" or "April 2026"
  const m = s.match(/^([A-Za-z]+)\s+(\d{4})$/);
  if (m) {
    const parsed = new Date(`${m[1]} 1, ${m[2]}`);
    if (!isNaN(parsed.getTime())) return parsed.toISOString().split('T')[0];
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

async function processOneSource(base44, sourceId, batchSize = 50) {
  const source = await base44.asServiceRole.entities.Source.get(sourceId);
  if (!source) throw new Error(`Source not found: ${sourceId}`);
  if (source.source_type !== 'gnpd') throw new Error('Source is not GNPD type');
  if (!source.file_url) throw new Error('Source has no file_url');

  // Load column mapping from GNPDColumnMapping entity
  const mappingRecords = await base44.asServiceRole.entities.GNPDColumnMapping.filter({ source_id: sourceId });
  const colMap = mappingRecords.length > 0 ? (mappingRecords[0].mappings || {}) : (source.gnpd_column_mapping || {});

  // Fetch and parse file (XLSX or HTML)
  const fileResponse = await fetch(source.file_url);
  if (!fileResponse.ok) throw new Error(`Failed to fetch file: ${fileResponse.status}`);
  const fileBuffer = await fileResponse.arrayBuffer();
  const { rows, isHtml } = await parseRows(fileBuffer, source.file_url);
  if (rows.length === 0) throw new Error('No rows parsed from file');

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

  const getDatePublished = (row) => {
    const raw = get(row, 'date_published') || row['Date Published'];
    if (!raw) return null;
    // HTML format: "Apr 2026"
    const monthYear = parseMonthYearDate(String(raw));
    if (monthYear) return monthYear;
    // Excel serial number
    if (typeof raw === 'number') {
      const d = new Date((raw - 25569) * 86400 * 1000);
      if (!isNaN(d.getTime())) return d.toISOString().split('T')[0];
    }
    // ISO / other parseable
    const d = new Date(raw);
    if (!isNaN(d.getTime())) return d.toISOString().split('T')[0];
    return null;
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

      const country    = String(getMarket(row) || '');
      const regionCode = COUNTRY_REGION[country] || source.region_code || 'Global';
      const launchDate = getDatePublished(row);

      const recordHyperlink = getHyperlink(row);
      const mintelUrl = (recordHyperlink && typeof recordHyperlink === 'string')
        ? recordHyperlink.trim()
        : `https://www.gnpd.com/sinatra/recordpage/${recordId}/`;

      const description = String(getDescription(row) || '');
      const { links, linkedTrendIds, linkedMegaTrendIds, supportLabel } =
        linkToTrends(trendIndex, megaTrendMap, ingredients, claims, productName, description);

      const hasPalsgaardRelevance = hasEmulsifier || linkedTrendIds.length > 0;

      toCreate.push({
        gnpd_record_id: recordId,
        product_name: productName,
        brand: String(getBrand(row) || ''),
        company,
        ultimate_company: String(get(row, 'ultimate_company') || ''),
        country, region_code: regionCode,
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
        linked_trend_ids: linkedTrendIds,
        linked_mega_trend_ids: linkedMegaTrendIds,
        support_label: supportLabel,
        processing_status: links.some(l => l.review_status === 'pending') ? 'trend_linking_pending' : 'trend_linked',
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

  await base44.asServiceRole.entities.Source.update(sourceId, { pipeline_stage: 'extracted' });

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
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { sourceIds, batchSize = 50 } = await req.json();
    if (!Array.isArray(sourceIds) || sourceIds.length === 0) {
      return Response.json({ error: 'sourceIds must be a non-empty array' }, { status: 400 });
    }

    const results = [];
    for (const sourceId of sourceIds) {
      try {
        const result = await processOneSource(base44, sourceId, batchSize);
        results.push({ sourceId, status: 'ok', ...result });
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