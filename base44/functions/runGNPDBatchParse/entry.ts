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

async function processOneSource(base44, sourceId, batchSize = 50) {
  const source = await base44.asServiceRole.entities.Source.get(sourceId);
  if (!source) throw new Error(`Source not found: ${sourceId}`);
  if (source.source_type !== 'gnpd') throw new Error('Source is not GNPD type');
  if (!source.file_url) throw new Error('Source has no file_url');

  // Load column mapping from GNPDColumnMapping entity
  const mappingRecords = await base44.asServiceRole.entities.GNPDColumnMapping.filter({ source_id: sourceId });
  const colMap = mappingRecords.length > 0 ? (mappingRecords[0].mappings || {}) : (source.gnpd_column_mapping || {});

  // Fetch and parse XLSX
  const fileResponse = await fetch(source.file_url);
  if (!fileResponse.ok) throw new Error(`Failed to fetch file: ${fileResponse.status}`);
  const fileBuffer = await fileResponse.arrayBuffer();
  const workbook = XLSX.read(new Uint8Array(fileBuffer), { type: 'array', cellDates: true });
  const rows = XLSX.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]], { defval: null });
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
      const recordId = String(get(row, 'record_id') || '').trim();
      if (!recordId || recordId === 'null') { skipped++; continue; }
      if (existingIds.has(recordId)) { skipped++; continue; }

      const productName = String(get(row, 'product_name') || '').trim();
      if (!productName) { skipped++; continue; }

      const ingredients = String(getIngredients(row) || '');
      const ingredientsLower = ingredients.toLowerCase();
      const foundEmulsifiers = EMULSIFIER_TERMS.filter(term => ingredientsLower.includes(term));
      const hasEmulsifier = foundEmulsifiers.length > 0;

      const rawClaims = getClaims(row) || '';
      const claims = typeof rawClaims === 'string'
        ? rawClaims.split(',').map(c => c.trim()).filter(Boolean) : [];

      const rawFlavours = get(row, 'flavours') || '';
      const flavours = typeof rawFlavours === 'string'
        ? rawFlavours.split(',').map(f => f.trim()).filter(Boolean) : [];

      const country = String(get(row, 'market') || '');
      const regionCode = COUNTRY_REGION[country] || source.region_code || 'Global';

      const rawDate = get(row, 'date_published');
      let launchDate = null;
      if (rawDate) {
        const d = new Date(rawDate);
        if (!isNaN(d.getTime())) launchDate = d.toISOString().split('T')[0];
      }

      const recordHyperlink = get(row, 'record_hyperlink');
      const mintelUrl = (recordHyperlink && typeof recordHyperlink === 'string')
        ? recordHyperlink
        : `https://www.gnpd.com/sinatra/recordpage/${recordId}/`;

      const description = String(get(row, 'product_description') || '');
      const { links, linkedTrendIds, linkedMegaTrendIds, supportLabel } =
        linkToTrends(trendIndex, megaTrendMap, ingredients, claims, productName, description);

      const hasPalsgaardRelevance = hasEmulsifier || linkedTrendIds.length > 0;

      toCreate.push({
        gnpd_record_id: recordId,
        product_name: productName,
        brand: String(get(row, 'brand') || ''),
        company: String(get(row, 'company') || ''),
        ultimate_company: String(get(row, 'ultimate_company') || ''),
        country, region_code: regionCode,
        category: source.category || String(get(row, 'category') || ''),
        sub_category: String(get(row, 'sub_category') || ''),
        launch_date: launchDate,
        launch_type: String(get(row, 'launch_type') || ''),
        product_description: description,
        ingredients: ingredients || null,
        claims, flavours,
        format_type: String(get(row, 'format_type') || ''),
        storage: String(get(row, 'storage') || ''),
        package_type: String(get(row, 'package_type') || ''),
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