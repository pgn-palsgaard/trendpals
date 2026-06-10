import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';
import * as XLSX from 'npm:xlsx@0.18.5';

const EMULSIFIER_TERMS = [
  'lecithin', 'mono and diglycerides', 'monoglycerides', 'diglycerides',
  'mono- and di-glycerides', 'e471', 'e472', 'e473', 'e474', 'e475', 'e476', 'e477', 'e481', 'e482',
  'pgpr', 'ammonium phosphatide', 'sorbitan', 'polysorbate', 'ssl',
  'csl', 'datem', 'acetylated', 'diacetyl', 'propylene glycol',
  'carrageenan', 'locust bean', 'guar gum', 'xanthan', 'gelatin',
  'pectin', 'agar', 'carob', 'tara gum', 'konjac', 'cellulose',
  'maltodextrin', 'modified starch', 'hydroxypropyl', 'emulsifier', 'stabiliser', 'stabilizer'
];

function buildIngredients(row) {
  let ing = String(row['Ingredients (On pack)'] || '').trim();
  if (!ing) {
    const parts = [];
    for (let n = 1; n <= 40; n++) {
      const v = row[`Ingredient ${n}`];
      if (v && String(v).trim()) parts.push(String(v).trim());
    }
    const rem = row['Remaining Ingredients'];
    if (rem && String(rem).trim()) parts.push(String(rem).trim());
    ing = parts.join(', ');
  }
  return ing;
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (user?.role !== 'admin') {
      return Response.json({ error: 'Forbidden: Admin access required' }, { status: 403 });
    }

    const TIME_BUDGET_MS = 200000;
    const start = Date.now();
    const outOfBudget = () => Date.now() - start > TIME_BUDGET_MS;

    const gnpdSources = await base44.asServiceRole.entities.Source.filter({ source_type: 'gnpd' }, '-created_date', 100);

    const globalTrends = await base44.asServiceRole.entities.GlobalTrend.filter({ is_active: true });
    const trendIndex = globalTrends.map(t => ({
      id: t.id,
      name: t.trend_name,
      keywords: (t.trend_keywords || []).map(k => k.toLowerCase()),
    }));

    let productsUpdated = 0, emulsifierFlagged = 0, linksAdded = 0;
    const perSource = [];
    let timedOut = false;

    for (const source of gnpdSources) {
      if (outOfBudget()) { timedOut = true; break; }
      if (!source.file_url) continue;

      // Fetch and parse the source spreadsheet
      let rows = [];
      try {
        let fetchUrl = source.file_url;
        try {
          const signed = await base44.asServiceRole.integrations.Core.CreateFileSignedUrl({ file_uri: source.file_url, expires_in: 300 });
          if (signed?.signed_url) fetchUrl = signed.signed_url;
        } catch (_) { /* public file */ }
        const res = await fetch(fetchUrl, { signal: AbortSignal.timeout(60_000) });
        if (!res.ok) throw new Error(`Fetch failed: ${res.status}`);
        const buf = await res.arrayBuffer();
        const wb = XLSX.read(new Uint8Array(buf), { type: 'array', cellDates: true });
        const sheetName = wb.SheetNames.find(n => n.toLowerCase() === 'products from gnpd') || wb.SheetNames[0];
        rows = XLSX.utils.sheet_to_json(wb.Sheets[sheetName], { defval: null });
      } catch (e) {
        perSource.push({ source_id: source.id, title: source.title, error: e.message });
        continue;
      }

      const colMap = source.gnpd_column_mapping || {};
      const recIdCol = colMap.record_id || 'Record ID';
      const byRecordId = {};
      for (const row of rows) {
        const rid = String(row[recIdCol] ?? '').trim();
        if (!rid) continue;
        byRecordId[rid] = buildIngredients(row);
      }

      // Page through this source's products and update those missing ingredients
      let skip = 0, sourceUpdated = 0;
      while (true) {
        if (outOfBudget()) { timedOut = true; break; }
        const products = await base44.asServiceRole.entities.GNPDProduct.filter({ source_id: source.id }, null, 200, skip);
        if (products.length === 0) break;

        for (const p of products) {
          if (outOfBudget()) { timedOut = true; break; }
          if (p.ingredients) continue; // already backfilled — resume-safe
          const ing = byRecordId[String(p.gnpd_record_id)];
          if (!ing) continue;

          const lower = ing.toLowerCase();
          const found = EMULSIFIER_TERMS.filter(t => lower.includes(t));

          // Re-run trend linking with the full text incl. ingredients (same gating as parseGNPDToDatabase)
          const text = [p.product_name, p.product_description, ing, (p.claims || []).join(' ')].join(' ').toLowerCase();
          const existingIds = new Set((p.trend_links || []).map(l => l.trend_id));
          const newLinks = [];
          for (const t of trendIndex) {
            if (existingIds.has(t.id)) continue;
            const matched = t.keywords.filter(kw => kw.length > 3 && text.includes(kw));
            if (matched.length === 0) continue;
            const score = Math.min(100, matched.length * 25);
            let confidence, reviewStatus;
            if (score >= 70) { confidence = 'high'; reviewStatus = 'auto_applied'; }
            else if (score >= 40) { confidence = 'medium'; reviewStatus = 'pending'; }
            else { confidence = 'low'; reviewStatus = 'pending'; }
            if (confidence === 'low' && matched.length < 2) continue;
            newLinks.push({
              trend_id: t.id,
              trend_name: t.name,
              trend_type: 'global',
              confidence,
              confidence_score: score,
              matched_keywords: matched,
              reasoning: `Backfill: matched ${matched.length} keyword(s): ${matched.join(', ')}`,
              review_status: reviewStatus,
              linked_at: new Date().toISOString(),
            });
          }

          const updates = {
            ingredients: ing,
            has_emulsifier: found.length > 0,
            emulsifier_keywords: found,
          };
          if (found.length > 0) {
            updates.has_palsgaard_relevance = true;
            updates.palsgaard_relevance_reason = `Contains: ${found.slice(0, 3).join(', ')}`;
            emulsifierFlagged++;
          }
          if (newLinks.length > 0) {
            updates.trend_links = [...(p.trend_links || []), ...newLinks];
            const autoIds = newLinks.filter(l => l.review_status === 'auto_applied').map(l => l.trend_id);
            if (autoIds.length > 0) {
              updates.linked_trend_ids = [...new Set([...(p.linked_trend_ids || []), ...autoIds])];
            }
            linksAdded += newLinks.length;
          }

          await base44.asServiceRole.entities.GNPDProduct.update(p.id, updates);
          productsUpdated++;
          sourceUpdated++;
        }

        if (products.length < 200 || timedOut) break;
        skip += 200;
      }

      perSource.push({ source_id: source.id, title: source.title, rows: rows.length, products_updated: sourceUpdated });
    }

    return Response.json({
      products_updated: productsUpdated,
      emulsifier_flagged: emulsifierFlagged,
      links_added: linksAdded,
      sources: perSource,
      timed_out: timedOut,
      message: timedOut ? 'Time budget reached — invoke again to continue (resume-safe)' : 'Backfill complete',
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});