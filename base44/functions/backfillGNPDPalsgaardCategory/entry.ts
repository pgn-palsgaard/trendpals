/**
 * Phase 3 — GNPDProduct palsgaard_category Backfill
 *
 * Runs the two-level Mintel→Palsgaard resolver over all existing GNPDProduct
 * records and writes palsgaard_category for any record where it is not yet set.
 *
 * Also creates GNPDCategoryBackup records for audit.
 * Idempotent — skips records where palsgaard_category is already set.
 * Admin-only.
 */

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

// ── Inline resolver (cannot import lib/ from functions) ─────────────────────

function normalizeTopLevel(raw) {
  if (!raw) return null;
  const s = raw.trim().toLowerCase();
  if (s === 'confectionery' || s === 'chocolate confectionery' || s === 'chocolate & confectionery') {
    return 'chocolate_confectionery_top';
  }
  return s;
}

const MAPPING = {
  'baby food': { '*': 'out_of_scope' },
  'bakery': { '*': 'bakery' },
  'breakfast cereals': { '*': 'out_of_scope' },
  'chocolate_confectionery_top': { '*': 'chocolate_confectionery' },
  'dairy': {
    'margarine & other blends': 'oils_fats',
    'shortening & lard': 'oils_fats',
    'plant based drinks (dairy alternatives)': 'plant_based',
    'plant based spoonable yogurts (dairy alternatives)': 'plant_based',
    'butter': 'dairy', 'cream': 'dairy', 'creamers': 'dairy',
    'fresh cheese & cream cheese': 'dairy', 'liquid dairy other': 'dairy',
    'curd & quark': 'dairy', 'hard cheese & semi-hard cheese': 'dairy',
    'soft cheese & semi-soft cheese': 'dairy', 'soft cheese desserts': 'dairy',
    'processed cheese': 'dairy', 'evaporated milk': 'dairy',
    'flavoured milk': 'dairy', 'sweetened condensed milk': 'dairy',
    'white milk': 'dairy', 'drinking yogurt & liquid cultured milk': 'dairy',
    'spoonable yogurt': 'dairy',
    '*': 'needs_human_review',
  },
  'desserts & ice cream': {
    'dairy based ice cream & frozen yogurt': 'ice_cream',
    'plant based ice cream & frozen yogurt (dairy alternatives)': 'plant_based',
    'water based ice lollies, pops & sorbets': 'ice_cream',
    'frozen desserts': 'ice_cream',
    'dessert toppings': 'dairy',
    'chilled desserts': 'dairy',
    'shelf-stable desserts': 'dairy',
    '*': 'needs_human_review',
  },
  'fruit & vegetables': { '*': 'out_of_scope' },
  'meals & meal centers': { '*': 'out_of_scope' },
  'processed fish, meat & egg products': {
    'processed/cured meat': 'meat', 'fresh meat': 'meat',
    'canned/ambient meat': 'meat', 'chilled/smoked meat products': 'meat',
    'dried/cured meat': 'meat', 'poultry': 'meat',
    'processed fish': 'out_of_scope', 'canned/ambient fish': 'out_of_scope',
    'chilled/fresh fish': 'out_of_scope', 'smoked fish': 'out_of_scope',
    'egg products': 'out_of_scope',
    'other processed fish, meat & egg products': 'needs_human_review',
    '*': 'needs_human_review',
  },
  'sauces & seasonings': { 'oils': 'oils_fats', '*': 'condiments' },
  'savoury spreads': { '*': 'out_of_scope' },
  'side dishes': { '*': 'out_of_scope' },
  'snacks': { '*': 'out_of_scope' },
  'soup': { '*': 'out_of_scope' },
  'sugar & gum confectionery': { '*': 'chocolate_confectionery' },
  'sweet spreads': { '*': 'chocolate_confectionery' },
  'sweeteners & sugar': { '*': 'out_of_scope' },
};

function resolvePalsgaardCategory(category, sub_category) {
  if (!category) return 'needs_human_review';
  const topNorm = normalizeTopLevel(category);
  const topMap = MAPPING[topNorm];
  if (!topMap) return 'needs_human_review';
  if (sub_category) {
    const subNorm = sub_category.trim().toLowerCase();
    if (topMap[subNorm] !== undefined) return topMap[subNorm];
  }
  return topMap['*'] ?? 'needs_human_review';
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (user?.role !== 'admin') return Response.json({ error: 'Forbidden' }, { status: 403 });

    const svc = base44.asServiceRole;
    const now = new Date().toISOString();

    const summary = {
      total: 0,
      skipped_already_set: 0,
      resolved: 0,
      by_result: {},
      errors: [],
    };

    let skip = 0;
    const batchSize = 100;

    while (true) {
      const batch = await svc.entities.GNPDProduct.list('-created_date', batchSize, skip);
      if (!batch || batch.length === 0) break;

      for (const p of batch) {
        summary.total++;

        // Backup (idempotent)
        try {
          await svc.entities.GNPDCategoryBackup.create({
            gnpd_product_id: p.id,
            product_name: p.product_name || '',
            category_original: p.category || null,
            sub_category_original: p.sub_category || null,
            backed_up_at: now,
          });
        } catch (_) {}

        if (p.palsgaard_category) {
          summary.skipped_already_set++;
          continue;
        }

        const resolved = resolvePalsgaardCategory(p.category, p.sub_category);
        summary.by_result[resolved] = (summary.by_result[resolved] || 0) + 1;

        try {
          await svc.entities.GNPDProduct.update(p.id, { palsgaard_category: resolved });
          summary.resolved++;
        } catch (e) {
          summary.errors.push(`${p.id}: ${e.message}`);
        }
      }

      if (batch.length < batchSize) break;
      skip += batchSize;
      await sleep(200);
    }

    console.log('[backfillGNPDPalsgaardCategory] Done:', JSON.stringify(summary));
    return Response.json({ success: true, summary });

  } catch (error) {
    console.error('[backfillGNPDPalsgaardCategory] Fatal:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});