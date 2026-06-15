/**
 * CL-2 — Synthetic Category Resolver Test
 * Runs resolvePalsgaardCategory against known test cases and asserts expected output.
 * Admin-only. No database reads.
 */

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

// ── Inlined resolver (cannot import from lib/) ─────────────────────────────
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
    '*': 'needs_human_review',
    'butter': 'dairy', 'cream': 'dairy', 'creamers': 'dairy',
    'fresh cheese & cream cheese': 'dairy', 'liquid dairy other': 'dairy',
    'curd & quark': 'dairy', 'hard cheese & semi-hard cheese': 'dairy',
    'soft cheese & semi-soft cheese': 'dairy', 'soft cheese desserts': 'dairy',
    'processed cheese': 'dairy', 'evaporated milk': 'dairy', 'flavoured milk': 'dairy',
    'sweetened condensed milk': 'dairy', 'white milk': 'dairy',
    'drinking yogurt & liquid cultured milk': 'dairy', 'spoonable yogurt': 'dairy',
    'whole milk': 'dairy',
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
    'processed/cured meat': 'meat', 'fresh meat': 'meat', 'canned/ambient meat': 'meat',
    'chilled/smoked meat products': 'meat', 'dried/cured meat': 'meat', 'poultry': 'meat',
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

// ── Test cases from CL-2 specification ─────────────────────────────────────
const TEST_CASES = [
  { category: 'Dairy',                  sub_category: 'Plant Based Drinks (Dairy Alternatives)',        expected: 'plant_based' },
  { category: 'Dairy',                  sub_category: 'Plant Based Spoonable Yogurts (Dairy Alternatives)', expected: 'plant_based' },
  { category: 'Dairy',                  sub_category: 'Whole Milk',                                     expected: 'dairy' },
  { category: 'Dairy',                  sub_category: 'Some unknown subcategory',                       expected: 'needs_human_review' },
  { category: 'Desserts & Ice Cream',   sub_category: 'Plant Based Ice Cream & Frozen Yogurt (Dairy Alternatives)', expected: 'plant_based' },
  { category: 'Desserts & Ice Cream',   sub_category: 'Dairy Based Ice Cream & Frozen Yogurt',          expected: 'ice_cream' },
  { category: 'Desserts & Ice Cream',   sub_category: 'Chilled Desserts',                               expected: 'dairy' },
  { category: 'Sweet Spreads',          sub_category: 'Chocolate Spreads',                              expected: 'chocolate_confectionery' },
  { category: 'Sweet Spreads',          sub_category: 'Honey',                                          expected: 'chocolate_confectionery' },
  { category: 'Sauces & Seasonings',    sub_category: 'Oils',                                           expected: 'oils_fats' },
  { category: 'Sauces & Seasonings',    sub_category: 'Mayonnaise',                                     expected: 'condiments' },
  { category: 'Snacks',                 sub_category: 'Salty Snacks',                                   expected: 'out_of_scope' },
  { category: 'Confectionery',          sub_category: 'Chocolate Tablets',                              expected: 'chocolate_confectionery' },  // normalization test
  { category: 'Chocolate & Confectionery', sub_category: 'Chocolate Tablets',                          expected: 'chocolate_confectionery' },  // display-label form
  { category: null,                     sub_category: null,                                              expected: 'needs_human_review' },
];

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (user?.role !== 'admin') return Response.json({ error: 'Forbidden' }, { status: 403 });

    const results = TEST_CASES.map((tc, i) => {
      const actual = resolvePalsgaardCategory(tc.category, tc.sub_category);
      const pass = actual === tc.expected;
      return {
        test_number: i + 1,
        category: tc.category,
        sub_category: tc.sub_category,
        expected: tc.expected,
        actual,
        pass,
      };
    });

    const passed = results.filter(r => r.pass).length;
    const failed = results.filter(r => !r.pass).length;
    const failures = results.filter(r => !r.pass);

    return Response.json({
      summary: { total: results.length, passed, failed },
      all_passed: failed === 0,
      failures,
      results,
    });

  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});