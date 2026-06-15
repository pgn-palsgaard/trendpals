/**
 * CL-1 — Taxonomy Migration Verification
 * Aggregates ALL records server-side (no truncation at 500).
 * Returns count objects only — never raw records.
 * Admin-only.
 */

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

const CANONICAL_KEYS = ['bakery','condiments','chocolate_confectionery','dairy','ice_cream','meat','oils_fats','plant_based','rutf_rusf','out_of_scope','needs_human_review'];

// Legacy values that should NO LONGER appear in any entity's category field
const LEGACY_VALUES = ['Bakery','Confectionery','Dairy','Ice Cream','Meat','Lipid','Feed','Fine Food','PCI','Polymer','Tech','Other Food Applications','Spreads','Dressings','Other'];

async function paginateAll(entityObj, filter = {}, sort = '-created_date') {
  const results = [];
  const pageSize = 500;
  let skip = 0;
  while (true) {
    const page = await entityObj.filter(filter, sort, pageSize, skip);
    results.push(...page);
    if (page.length < pageSize) break;
    skip += pageSize;
  }
  return results;
}

function buildDistribution(records, fieldFn) {
  const dist = {};
  for (const r of records) {
    const val = fieldFn(r);
    const key = val === null || val === undefined ? '__null__' : String(val);
    dist[key] = (dist[key] || 0) + 1;
  }
  return dist;
}

function checkLegacy(records, fieldFn) {
  const legacySet = new Set(LEGACY_VALUES);
  const ids = [];
  for (const r of records) {
    const val = fieldFn(r);
    if (val && legacySet.has(val)) ids.push(r.id);
  }
  return ids;
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (user?.role !== 'admin') return Response.json({ error: 'Forbidden' }, { status: 403 });

    const svc = base44.asServiceRole;

    // Paginate all four entities
    const [sources, globalTrends, expertExamples, projects, gnpdProducts] = await Promise.all([
      paginateAll(svc.entities.Source),
      paginateAll(svc.entities.GlobalTrend),
      paginateAll(svc.entities.ExpertExample),
      paginateAll(svc.entities.Project),
      paginateAll(svc.entities.GNPDProduct),
    ]);

    // ── Source ────────────────────────────────────────────────────────────
    const sourceCategoryDist = buildDistribution(sources, r => r.category);
    const sourceWithCategory = sources.filter(r => r.category && CANONICAL_KEYS.includes(r.category));
    const sourceAiProposedPopulated = sourceWithCategory.filter(r => r.category_ai_proposed).length;
    const sourceAiProposedNull = sourceWithCategory.filter(r => !r.category_ai_proposed).length;
    const sourceLegacyIds = checkLegacy(sources, r => r.category);

    // ── GlobalTrend ───────────────────────────────────────────────────────
    const gtCategoryDist = buildDistribution(globalTrends, r => r.category);
    const gtWithCategory = globalTrends.filter(r => r.category && CANONICAL_KEYS.includes(r.category));
    const gtAiProposedPopulated = gtWithCategory.filter(r => r.category_ai_proposed).length;
    const gtAiProposedNull = gtWithCategory.filter(r => !r.category_ai_proposed).length;
    const gtLegacyIds = checkLegacy(globalTrends, r => r.category);

    // ── ExpertExample ─────────────────────────────────────────────────────
    const eeCategoryDist = buildDistribution(expertExamples, r => r.category);
    const eeWithCategory = expertExamples.filter(r => r.category && CANONICAL_KEYS.includes(r.category));
    const eeAiProposedPopulated = eeWithCategory.filter(r => r.category_ai_proposed).length;
    const eeAiProposedNull = eeWithCategory.filter(r => !r.category_ai_proposed).length;
    const eeLegacyIds = checkLegacy(expertExamples, r => r.category);

    // ── Project ───────────────────────────────────────────────────────────
    const projCategoryDist = buildDistribution(projects, r => r.category);
    const projWithCategory = projects.filter(r => r.category && CANONICAL_KEYS.includes(r.category));
    const projAiProposedPopulated = projWithCategory.filter(r => r.category_ai_proposed).length;
    const projAiProposedNull = projWithCategory.filter(r => !r.category_ai_proposed).length;
    const projLegacyIds = checkLegacy(projects, r => r.category);

    // ── GNPDProduct ───────────────────────────────────────────────────────
    const gnpdPalsgaardDist = buildDistribution(gnpdProducts, r => r.palsgaard_category);
    const gnpdRawCategoryDist = buildDistribution(gnpdProducts, r => r.category);

    // Re-run resolver logic inline (can't import from lib/)
    function normalizeTopLevel(raw) {
      if (!raw) return null;
      const s = raw.trim().toLowerCase();
      if (s === 'confectionery' || s === 'chocolate confectionery' || s === 'chocolate & confectionery') return 'chocolate_confectionery_top';
      return s;
    }
    const MAPPING = {
      'baby food': { '*': 'out_of_scope' },
      'bakery': { '*': 'bakery' },
      'breakfast cereals': { '*': 'out_of_scope' },
      'chocolate_confectionery_top': { '*': 'chocolate_confectionery' },
      'dairy': {
        'margarine & other blends': 'oils_fats', 'shortening & lard': 'oils_fats',
        'plant based drinks (dairy alternatives)': 'plant_based',
        'plant based spoonable yogurts (dairy alternatives)': 'plant_based',
        '*': 'needs_human_review',
        'butter': 'dairy', 'cream': 'dairy', 'creamers': 'dairy',
        'fresh cheese & cream cheese': 'dairy', 'liquid dairy other': 'dairy',
        'curd & quark': 'dairy', 'hard cheese & semi-hard cheese': 'dairy',
        'soft cheese & semi-soft cheese': 'dairy', 'soft cheese desserts': 'dairy',
        'processed cheese': 'dairy', 'evaporated milk': 'dairy', 'flavoured milk': 'dairy',
        'sweetened condensed milk': 'dairy', 'white milk': 'dairy',
        'drinking yogurt & liquid cultured milk': 'dairy', 'spoonable yogurt': 'dairy',
      },
      'desserts & ice cream': {
        'dairy based ice cream & frozen yogurt': 'ice_cream',
        'plant based ice cream & frozen yogurt (dairy alternatives)': 'plant_based',
        'water based ice lollies, pops & sorbets': 'ice_cream',
        'frozen desserts': 'ice_cream', 'dessert toppings': 'dairy',
        'chilled desserts': 'dairy', 'shelf-stable desserts': 'dairy',
        '*': 'needs_human_review',
      },
      'fruit & vegetables': { '*': 'out_of_scope' },
      'meals & meal centers': { '*': 'out_of_scope' },
      'processed fish, meat & egg products': {
        'processed/cured meat': 'meat', 'fresh meat': 'meat', 'canned/ambient meat': 'meat',
        'chilled/smoked meat products': 'meat', 'dried/cured meat': 'meat', 'poultry': 'meat',
        'processed fish': 'out_of_scope', 'canned/ambient fish': 'out_of_scope',
        'chilled/fresh fish': 'out_of_scope', 'smoked fish': 'out_of_scope',
        'egg products': 'out_of_scope', '*': 'needs_human_review',
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
    function resolveCategory(cat, sub) {
      if (!cat) return 'needs_human_review';
      const topNorm = normalizeTopLevel(cat);
      const topMap = MAPPING[topNorm];
      if (!topMap) return 'needs_human_review';
      if (sub) {
        const subNorm = sub.trim().toLowerCase();
        if (topMap[subNorm] !== undefined) return topMap[subNorm];
      }
      return topMap['*'] ?? 'needs_human_review';
    }

    // Check drift: how many stored palsgaard_category values match re-resolution today
    let gnpdDriftMatch = 0, gnpdDriftMismatch = 0, gnpdDriftMismatchExamples = [];
    for (const p of gnpdProducts) {
      if (!p.palsgaard_category) continue;
      const reResolved = resolveCategory(p.category, p.sub_category);
      if (reResolved === p.palsgaard_category) {
        gnpdDriftMatch++;
      } else {
        gnpdDriftMismatch++;
        if (gnpdDriftMismatchExamples.length < 5) {
          gnpdDriftMismatchExamples.push({
            id: p.id, stored: p.palsgaard_category, would_resolve_to: reResolved,
            category: p.category, sub_category: p.sub_category
          });
        }
      }
    }

    // ── Acceptance criteria checks ────────────────────────────────────────
    const zeroLegacy = sourceLegacyIds.length + gtLegacyIds.length + eeLegacyIds.length + projLegacyIds.length === 0;

    // For category_ai_proposed: requirement is every MIGRATED record has it.
    // "Migrated" = record existed before Phase 3 (category was changed by migration).
    // Heuristic: if category is set AND category_ai_proposed is null, it MIGHT be
    // a new post-migration record (no prior value to preserve). We report counts
    // and leave the judgment to Peter.

    const report = {
      generated_at: new Date().toISOString(),
      acceptance_criteria: {
        zero_legacy_values_in_all_entities: zeroLegacy,
        details: {
          source_legacy_count: sourceLegacyIds.length,
          globaltrend_legacy_count: gtLegacyIds.length,
          expertexample_legacy_count: eeLegacyIds.length,
          project_legacy_count: projLegacyIds.length,
        }
      },
      source: {
        total: sources.length,
        category_distribution: sourceCategoryDist,
        of_canonical_records: {
          count: sourceWithCategory.length,
          category_ai_proposed_populated: sourceAiProposedPopulated,
          category_ai_proposed_null: sourceAiProposedNull,
        },
        legacy_ids: sourceLegacyIds,
      },
      global_trend: {
        total: globalTrends.length,
        category_distribution: gtCategoryDist,
        of_canonical_records: {
          count: gtWithCategory.length,
          category_ai_proposed_populated: gtAiProposedPopulated,
          category_ai_proposed_null: gtAiProposedNull,
        },
        legacy_ids: gtLegacyIds,
      },
      expert_example: {
        total: expertExamples.length,
        category_distribution: eeCategoryDist,
        of_canonical_records: {
          count: eeWithCategory.length,
          category_ai_proposed_populated: eeAiProposedPopulated,
          category_ai_proposed_null: eeAiProposedNull,
        },
        legacy_ids: eeLegacyIds,
      },
      project: {
        total: projects.length,
        category_distribution: projCategoryDist,
        of_canonical_records: {
          count: projWithCategory.length,
          category_ai_proposed_populated: projAiProposedPopulated,
          category_ai_proposed_null: projAiProposedNull,
        },
        legacy_ids: projLegacyIds,
      },
      gnpd_product: {
        total: gnpdProducts.length,
        palsgaard_category_distribution: gnpdPalsgaardDist,
        raw_mintel_category_distribution: gnpdRawCategoryDist,
        drift_check: {
          records_with_palsgaard_category: gnpdDriftMatch + gnpdDriftMismatch,
          match_current_resolver: gnpdDriftMatch,
          mismatch_current_resolver: gnpdDriftMismatch,
          mismatch_examples: gnpdDriftMismatchExamples,
        }
      }
    };

    return Response.json(report);

  } catch (error) {
    console.error('[verifyTaxonomyMigration] Fatal:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});