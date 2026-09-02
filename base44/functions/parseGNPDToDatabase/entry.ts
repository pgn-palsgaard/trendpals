import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';
import * as XLSX from 'npm:xlsx@0.18.5';
import { resolvePalsgaardCategory } from '../../shared/palsgaardCategory.ts';

// CANONICAL EMULSIFIER_TERMS — keep identical to the copy in backfillGNPDIngredients.js
// (backend functions deploy independently, so the list is duplicated by necessity)
const EMULSIFIER_TERMS = [
  'lecithin', 'mono and diglycerides', 'monoglycerides', 'diglycerides',
  'mono- and di-glycerides', 'e471', 'e472', 'e473', 'e474', 'e475', 'e476', 'e477', 'e481', 'e482',
  'pgpr', 'ammonium phosphatide', 'sorbitan', 'polysorbate', 'ssl',
  'csl', 'datem', 'acetylated', 'diacetyl', 'propylene glycol',
  'carrageenan', 'locust bean', 'guar gum', 'xanthan', 'gelatin',
  'pectin', 'agar', 'carob', 'tara gum', 'konjac', 'cellulose',
  'maltodextrin', 'modified starch', 'hydroxypropyl', 'emulsifier', 'stabiliser', 'stabilizer'
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

const MONTH_NAMES = {
  jan: '01', january: '01', feb: '02', february: '02', mar: '03', march: '03',
  apr: '04', april: '04', may: '05', jun: '06', june: '06', jul: '07', july: '07',
  aug: '08', august: '08', sep: '09', sept: '09', september: '09', oct: '10', october: '10',
  nov: '11', november: '11', dec: '12', december: '12',
};

// Robust GNPD date parser. Handles YYYY-MM-DD | MMM YYYY | MMMM YYYY | MM/YYYY |
// DD/MM/YYYY | MM/DD/YYYY. Month-only formats set day = 01. Returns ISO 'YYYY-MM-DD'
// or null (never throws). Excel serials are handled separately by the caller.
function parseGNPDDate(input) {
  if (input === null || input === undefined) return null;
  const s = String(input).trim();
  if (!s) return null;

  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) {
    const d = new Date(`${m[1]}-${m[2]}-${m[3]}T00:00:00Z`);
    if (!isNaN(d.getTime())) return `${m[1]}-${m[2]}-${m[3]}`;
  }
  m = s.match(/^([A-Za-z]+)\s+(\d{4})$/);
  if (m) {
    const mm = MONTH_NAMES[m[1].toLowerCase()];
    if (mm) return `${m[2]}-${mm}-01`;
  }
  m = s.match(/^(\d{1,2})\/(\d{4})$/);
  if (m) {
    const mm = String(m[1]).padStart(2, '0');
    if (+mm >= 1 && +mm <= 12) return `${m[2]}-${mm}-01`;
  }
  m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (m) {
    let a = +m[1], b = +m[2];
    const year = m[3];
    let day, month;
    if (a > 12 && b <= 12) { day = a; month = b; }
    else if (b > 12 && a <= 12) { month = a; day = b; }
    else { day = a; month = b; }
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    }
  }
  return null;
}

function linkToTrends(trendIndex, megaTrendMap, ingredients, claims, productName, description) {
  const textToSearch = [
    productName, description, ingredients,
    Array.isArray(claims) ? claims.join(' ') : (claims || '')
  ].join(' ').toLowerCase();

  const links = [];
  const linkedMegaTrendIds = [];

  for (const trend of trendIndex) {
    const matchedKeywords = trend.keywords.filter(kw => kw.length > 3 && textToSearch.includes(kw));
    if (matchedKeywords.length === 0) continue;

    const score = Math.min(100, matchedKeywords.length * 25);
    // All keyword matches start as 'pending' — auto_applied status is only granted
    // after LLM validation (revalidatePendingTrendLinks / validateTrendLink gate)
    let confidence;
    const reviewStatus = 'pending';
    if (score >= 70) { confidence = 'high'; }
    else if (score >= 40) { confidence = 'medium'; }
    else { confidence = 'low'; }

    if (confidence === 'low' && matchedKeywords.length < 2) continue;

    links.push({
      trend_id: trend.id,
      trend_name: trend.name,
      trend_type: 'global',
      confidence,
      confidence_score: score,
      matched_keywords: matchedKeywords,
      reasoning: `Matched ${matchedKeywords.length} keyword(s): ${matchedKeywords.join(', ')}`,
      review_status: reviewStatus,
      linked_at: new Date().toISOString()
    });

    if (trend.mega_trend && megaTrendMap[trend.mega_trend]) {
      const mtId = megaTrendMap[trend.mega_trend];
      if (!linkedMegaTrendIds.includes(mtId)) linkedMegaTrendIds.push(mtId);
    }
  }

  const linkedTrendIds = links.filter(l => l.review_status === 'auto_applied').map(l => l.trend_id);
  const supportLabel = links.length === 0 ? 'NOT_SUPPORT'
    : links.some(l => l.confidence === 'high') ? 'SUPPORTS'
    : 'PARTIAL';

  return { links, linkedTrendIds, linkedMegaTrendIds, supportLabel };
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { sourceId, batchSize = 50 } = await req.json();

    // 1. Load source
    const source = await base44.asServiceRole.entities.Source.get(sourceId);
    if (!source) return Response.json({ error: `Source not found: ${sourceId}` }, { status: 404 });
    if (source.source_type !== 'gnpd') return Response.json({ error: 'Source is not GNPD type' }, { status: 400 });

    const colMap = source.gnpd_column_mapping || {};
    // Division gate. A BSA (Personal Care) upload never runs the food category
    // resolver — its rows carry the unified 'personal_care' key and are walled off
    // from food views by main_group.
    const mainGroup = source.main_group === 'BSA' ? 'BSA' : 'Food';
    const mappedCols = new Set(Object.values(colMap).filter(Boolean));
    const collectExtraFields = (row) => {
      const out = {};
      for (const [k, v] of Object.entries(row)) {
        if (mappedCols.has(k)) continue;
        if (v === null || v === undefined || v === '') continue;
        out[k] = String(v).slice(0, 500);
      }
      return out;
    };
    const fileUrl = source.file_url;
    if (!fileUrl) return Response.json({ error: 'Source has no file_url' }, { status: 400 });

    // 2. Get a signed URL then fetch the file
    const signedUrlResult = await base44.asServiceRole.integrations.Core.CreateFileSignedUrl({ file_uri: fileUrl, expires_in: 300 });
    const fetchUrl = signedUrlResult?.signed_url || fileUrl;
    const fileResponse = await fetch(fetchUrl);
    if (!fileResponse.ok) return Response.json({ error: `Failed to fetch file: ${fileResponse.status} from ${fetchUrl}` }, { status: 500 });
    const fileBuffer = await fileResponse.arrayBuffer();

    // 3. Parse XLSX
    let rows = [];
    const workbook = XLSX.read(new Uint8Array(fileBuffer), { type: 'array', cellDates: true });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    rows = XLSX.utils.sheet_to_json(sheet, { defval: null });

    if (rows.length === 0) return Response.json({ error: 'No rows parsed from file' }, { status: 400 });

    // 5. Load GlobalTrends + MegaTrends for linking
    const [globalTrends, megaTrends] = await Promise.all([
      base44.asServiceRole.entities.GlobalTrend.filter({ is_active: true }),
      base44.asServiceRole.entities.MegaTrend.filter({ is_active: true })
    ]);

    const trendIndex = globalTrends.map(t => ({
      id: t.id,
      name: t.trend_name,
      keywords: (t.trend_keywords || []).map(k => k.toLowerCase()),
      mega_trend: t.mega_trend
    }));

    const megaTrendMap = {};
    megaTrends.forEach(mt => { megaTrendMap[mt.mega_trend_name] = mt.id; });

    const get = (row, field) => {
      const col = colMap[field];
      return col ? (row[col] ?? null) : null;
    };

    const getImageUrl = (row) => {
      const raw = get(row, 'image_url') || row['Primary Image Link'] || row['Image URL'] || row['Image Hyperlink'] || row['Product Image'] || row['Image'] || null;
      const s = String(raw || '').trim();
      return s.startsWith('http') ? s : null;
    };

    // 4. Global dedup: a GNPD record id already in the database — from ANY previous
    // upload — must never be created again. Look up only ids present in this file.
    const fileRecordIds = [...new Set(rows.map(r => String(get(r, 'record_id') || '').trim()).filter(id => id && id !== 'null'))];
    const existingById = new Map(); // record_id -> { id, image_url }
    for (let i = 0; i < fileRecordIds.length; i += 200) {
      const chunk = fileRecordIds.slice(i, i + 200);
      const hits = await base44.asServiceRole.entities.GNPDProduct.filter(
        { gnpd_record_id: { $in: chunk } }, null, chunk.length * 3
      );
      for (const h of hits) existingById.set(String(h.gnpd_record_id), { id: h.id, image_url: h.image_url });
    }
    const existingIds = new Set(existingById.keys());

    // 6. Build records
    const toCreate = [];
    const imageUpdates = []; // existing records that get an image from this re-uploaded file
    let skipped = 0, errors = 0;

    for (const row of rows) {
      try {
        const recordId = String(get(row, 'record_id') || '').trim();
        if (!recordId || recordId === 'null') { skipped++; continue; }
        if (existingIds.has(recordId)) {
          // Duplicate — never re-create, but backfill the image if the new file has one.
          const ex = existingById.get(recordId);
          const img = getImageUrl(row);
          if (ex && img && !ex.image_url) {
            imageUpdates.push({ id: ex.id, image_url: img });
            ex.image_url = img; // guard against duplicate rows within the same file
          }
          skipped++; continue;
        }

        const productName = String(get(row, 'product_name') || '').trim();
        if (!productName) { skipped++; continue; }

        // Build full ingredient declaration: prefer 'Ingredients (On pack)', else join Ingredient 1..N
        let ingredients = String(get(row, 'ingredients') || row['Ingredients (On pack)'] || '').trim();
        if (!ingredients) {
          const parts = [];
          for (let n = 1; n <= 40; n++) {
            const v = row[`Ingredient ${n}`];
            if (v && String(v).trim()) parts.push(String(v).trim());
          }
          const rem = row['Remaining Ingredients'];
          if (rem && String(rem).trim()) parts.push(String(rem).trim());
          ingredients = parts.join(', ');
        }
        const ingredientsLower = ingredients.toLowerCase();
        const foundEmulsifiers = EMULSIFIER_TERMS.filter(term => ingredientsLower.includes(term));
        const hasEmulsifier = foundEmulsifiers.length > 0;

        const rawClaims = get(row, 'claims') || '';
        const claims = typeof rawClaims === 'string'
          ? rawClaims.split(',').map(c => c.trim()).filter(Boolean) : [];

        const rawFlavours = get(row, 'flavours') || '';
        const flavours = typeof rawFlavours === 'string'
          ? rawFlavours.split(',').map(f => f.trim()).filter(Boolean) : [];

        const country = String(get(row, 'market') || '');
        const regionCode = COUNTRY_REGION[country] || source.region_code || 'Global';

        // ── Resolve Palsgaard canonical category via two-level mapping ────────
        const rawCategory = String(get(row, 'category') || '').trim();
        const rawSubCategory = String(get(row, 'sub_category') || '').trim();
        const palsgaardCategory = mainGroup === 'BSA'
          ? 'personal_care'
          : resolvePalsgaardCategory(rawCategory, rawSubCategory);

        const rawDate = get(row, 'date_published');
        let launchDate = null;
        let unparsedDate = null;
        if (rawDate !== null && rawDate !== undefined && rawDate !== '') {
          if (typeof rawDate === 'number') {
            const d = new Date((rawDate - 25569) * 86400 * 1000);
            if (!isNaN(d.getTime())) launchDate = d.toISOString().split('T')[0];
          } else {
            launchDate = parseGNPDDate(rawDate);
            if (!launchDate) {
              const d = new Date(String(rawDate));
              if (!isNaN(d.getTime())) launchDate = d.toISOString().split('T')[0];
            }
          }
          if (!launchDate) unparsedDate = String(rawDate);
        }

        const recordHyperlink = get(row, 'record_hyperlink') || null;
        const mintelUrl = recordHyperlink && typeof recordHyperlink === 'string'
          ? recordHyperlink
          : `https://www.mintel.com/global-new-products-database/product/${recordId}`;

        const description = String(get(row, 'product_description') || '');
        const { links, linkedTrendIds, linkedMegaTrendIds, supportLabel } =
          linkToTrends(trendIndex, megaTrendMap, String(ingredients), claims, productName, description);

        const hasPalsgaardRelevance = hasEmulsifier || linkedTrendIds.length > 0;

        toCreate.push({
          gnpd_record_id: recordId,
          product_name: productName,
          main_group: mainGroup,
          ...(mainGroup === 'BSA' ? { extra_fields: collectExtraFields(row) } : {}),
          brand: String(get(row, 'brand') || ''),
          company: String(get(row, 'company') || ''),
          ultimate_company: String(get(row, 'ultimate_company') || ''),
          country,
          region_code: regionCode,
          category: String(get(row, 'category') || ''),
          palsgaard_category: palsgaardCategory,
          sub_category: String(get(row, 'sub_category') || ''),
          launch_date: launchDate,
          launch_type: String(get(row, 'launch_type') || ''),
          product_description: description,
          ingredients: ingredients || null,
          claims,
          flavours,
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
          // MEGA-LINK FREEZE (write-side guard). Mega-links are not written by imports
          // while the separate mega-trend rebuild is pending — the existing mega-links
          // carry the same cross-category defect as the global-trend links, so adding
          // more would deepen a set that has to be rebuilt anyway.
          // Same freeze in runGNPDBatchParse/entry.ts — lift both together.
          // EXPIRY CONDITION: restore `linkedMegaTrendIds` here once the mega-trend
          // rebuild has shipped and mega-links pass a category gate of their own.
          linked_mega_trend_ids: [],
          support_label: supportLabel,
          processing_status: links.some(l => l.review_status === 'pending') ? 'trend_linking_pending' : 'trend_linked',
          ...(unparsedDate ? { processing_error: `Unparsable launch_date: "${unparsedDate}"` } : {}),
          source_id: sourceId,
          mintel_record_url: mintelUrl,
          image_url: getImageUrl(row)
        });

        existingIds.add(recordId);
      } catch (e) {
        errors++;
        console.error('Row error:', e.message);
      }
    }

    // 7. Create in batches
    let created = 0;
    for (let i = 0; i < toCreate.length; i += batchSize) {
      const batch = toCreate.slice(i, i + batchSize);
      await base44.asServiceRole.entities.GNPDProduct.bulkCreate(batch);
      created += batch.length;
    }

    // 7b. Backfill images on existing records found as duplicates in this file.
    let imagesBackfilled = 0;
    for (let i = 0; i < imageUpdates.length; i += batchSize) {
      await base44.asServiceRole.entities.GNPDProduct.bulkUpdate(imageUpdates.slice(i, i + batchSize));
      imagesBackfilled += Math.min(batchSize, imageUpdates.length - i);
    }

    // 8. Update source stage
    await base44.asServiceRole.entities.Source.update(sourceId, { pipeline_stage: 'gnpd_ready', review_status: 'approved' });

    // 9. LLM triage of the new pending links — runs the first chunk now (60s budget),
    // the scheduled "Resume trend link triage" automation drains the rest.
    let triage = null;
    if (toCreate.some(p => p.trend_links.some(l => l.review_status === 'pending'))) {
      try {
        const triageRes = await base44.functions.invoke('revalidatePendingTrendLinks', {
          source: 'auto_parse_chain',
          time_budget_ms: 60000
        });
        triage = triageRes.data;
      } catch (e) {
        console.warn('Triage kickoff failed (scheduled resume will pick it up):', e.message);
      }
    }

    return Response.json({
      triage,
      source_id: sourceId,
      source_title: source.title,
      rows_parsed: rows.length,
      created,
      skipped,
      errors,
      images_backfilled: imagesBackfilled,
      trend_links_applied: toCreate.reduce((acc, p) => acc + p.trend_links.filter(l => l.review_status === 'auto_applied').length, 0),
      trend_links_pending: toCreate.reduce((acc, p) => acc + p.trend_links.filter(l => l.review_status === 'pending').length, 0),
      products_with_emulsifier: toCreate.filter(p => p.has_emulsifier).length,
      products_with_palsgaard_relevance: toCreate.filter(p => p.has_palsgaard_relevance).length
    });

  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});