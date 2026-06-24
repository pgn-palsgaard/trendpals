/**
 * Palsgaard Canonical Solution Taxonomy
 *
 * Single source of truth for all category references across the app.
 * 9 canonical solution keys + out_of_scope + needs_human_review.
 *
 * Backend functions CANNOT import this file directly (platform constraint:
 * no shared imports between function files). Inline the resolver and constants
 * where needed in backend functions.
 */

// ── Canonical solution keys ────────────────────────────────────────────────

export const CANONICAL_KEYS = [
  'bakery',
  'condiments',
  'chocolate_confectionery',
  'dairy',
  'ice_cream',
  'meat',
  'oils_fats',
  'plant_based',
  'rutf_rusf',
];

/** Keys valid in entity enum fields (solutions + control values) */
export const VALID_CATEGORY_VALUES = [
  ...CANONICAL_KEYS,
  'out_of_scope',
  'needs_human_review',
];

// ── Display labels (canonical key → human-readable label) ─────────────────

export const DISPLAY_LABELS = {
  bakery:                  'Bakery',
  condiments:              'Condiments',
  chocolate_confectionery: 'Confectionery',
  dairy:                   'Dairy',
  ice_cream:               'Ice Cream',
  meat:                    'Processed meat',
  oils_fats:               'Oils & Fats',
  plant_based:             'Plant-based products',
  rutf_rusf:               'RUTF and RUSF',
  out_of_scope:            'Out of scope',
  needs_human_review:      'Needs review',
};

/** Returns display label for a canonical key, or the raw key if unknown */
export function getDisplayLabel(key) {
  return DISPLAY_LABELS[key] || key || '—';
}

/** Array of {value, label} objects for Select/dropdown components */
export const SOLUTION_OPTIONS = CANONICAL_KEYS.map(k => ({
  value: k,
  label: DISPLAY_LABELS[k],
}));

// ── Mintel top-level normalization ─────────────────────────────────────────
// Handles inconsistent stored forms (e.g. "Confectionery" vs "Chocolate Confectionery")

function normalizeTopLevel(raw) {
  if (!raw) return null;
  const s = raw.trim().toLowerCase();
  // Chocolate / Confectionery variants
  if (s === 'confectionery' || s === 'chocolate confectionery' || s === 'chocolate & confectionery') {
    return 'chocolate_confectionery_top';
  }
  return s;
}

// ── Two-level mapping table ────────────────────────────────────────────────
// Structure: normalizedTopLevel → { subCategory (lowercase) → palsgaard_slug }
// '*' = wildcard fallback for any sub-category not explicitly listed

const MAPPING = {
  // ── Baby Food ──────────────────────────────────────────────────────────
  'baby food': { '*': 'out_of_scope' },

  // ── Bakery ────────────────────────────────────────────────────────────
  'bakery': { '*': 'bakery' },

  // ── Breakfast Cereals ─────────────────────────────────────────────────
  'breakfast cereals': { '*': 'out_of_scope' },

  // ── Chocolate Confectionery (both stored forms) ───────────────────────
  'chocolate_confectionery_top': { '*': 'chocolate_confectionery' },

  // ── Dairy ─────────────────────────────────────────────────────────────
  'dairy': {
    'margarine & other blends':                    'oils_fats',
    'shortening & lard':                           'oils_fats',
    'plant based drinks (dairy alternatives)':     'plant_based',
    'plant based spoonable yogurts (dairy alternatives)': 'plant_based',
    // Wildcard: must be needs_human_review (not dairy) because future
    // plant-based sub-categories could slip through silently
    '*': 'needs_human_review',
    // Well-known safe sub-categories explicitly listed:
    'butter':                       'dairy',
    'cream':                        'dairy',
    'creamers':                     'dairy',
    'fresh cheese & cream cheese':  'dairy',
    'liquid dairy other':           'dairy',
    'curd & quark':                 'dairy',
    'hard cheese & semi-hard cheese': 'dairy',
    'soft cheese & semi-soft cheese': 'dairy',
    'soft cheese desserts':         'dairy',
    'processed cheese':             'dairy',
    'evaporated milk':              'dairy',
    'flavoured milk':               'dairy',
    'sweetened condensed milk':     'dairy',
    'white milk':                   'dairy',
    'drinking yogurt & liquid cultured milk': 'dairy',
    'spoonable yogurt':             'dairy',
  },

  // ── Desserts & Ice Cream ──────────────────────────────────────────────
  'desserts & ice cream': {
    'dairy based ice cream & frozen yogurt':               'ice_cream',
    'plant based ice cream & frozen yogurt (dairy alternatives)': 'plant_based',
    'water based ice lollies, pops & sorbets':             'ice_cream',
    'frozen desserts':                                     'ice_cream',
    'dessert toppings':                                    'dairy',
    'chilled desserts':                                    'dairy',
    'shelf-stable desserts':                               'dairy',
    '*': 'needs_human_review',
  },

  // ── Fruit & Vegetables ────────────────────────────────────────────────
  'fruit & vegetables': { '*': 'out_of_scope' },

  // ── Meals & Meal Centers ──────────────────────────────────────────────
  'meals & meal centers': { '*': 'out_of_scope' },

  // ── Processed Fish, Meat & Egg Products ──────────────────────────────
  'processed fish, meat & egg products': {
    'processed/cured meat':               'meat',
    'fresh meat':                         'meat',
    'canned/ambient meat':                'meat',
    'chilled/smoked meat products':       'meat',
    'dried/cured meat':                   'meat',
    'poultry':                            'meat',
    'processed fish':                     'out_of_scope',
    'canned/ambient fish':                'out_of_scope',
    'chilled/fresh fish':                 'out_of_scope',
    'smoked fish':                        'out_of_scope',
    'egg products':                       'out_of_scope',
    'other processed fish, meat & egg products': 'needs_human_review',
    '*': 'needs_human_review',
  },

  // ── Sauces & Seasonings ───────────────────────────────────────────────
  'sauces & seasonings': {
    'oils': 'oils_fats',
    '*': 'condiments',
  },

  // ── Savoury Spreads ───────────────────────────────────────────────────
  // Decision (Peter, 2026-06-15): dips, hummus, pâtés, sandwich spreads are
  // emulsifier/stabiliser applications within Palsgaard's "Condiments" solution.
  'savoury spreads': { '*': 'condiments' },

  // ── Side Dishes ───────────────────────────────────────────────────────
  'side dishes': { '*': 'out_of_scope' },

  // ── Snacks ────────────────────────────────────────────────────────────
  // ⚠️ Known coverage gap: active Mondelez/Mars Kellanova account work.
  // No Palsgaard solution exists yet. Flagged for future expansion.
  'snacks': { '*': 'out_of_scope' },

  // ── Soup ──────────────────────────────────────────────────────────────
  'soup': { '*': 'out_of_scope' },

  // ── Sugar & Gum Confectionery ─────────────────────────────────────────
  'sugar & gum confectionery': { '*': 'chocolate_confectionery' },

  // ── Sweet Spreads (Peter's locked decision) ───────────────────────────
  'sweet spreads': { '*': 'chocolate_confectionery' },

  // ── Sweeteners & Sugar ────────────────────────────────────────────────
  'sweeteners & sugar': { '*': 'out_of_scope' },
};

// ── Resolver function ──────────────────────────────────────────────────────

/**
 * Resolves a Mintel category + sub-category to a Palsgaard canonical key.
 *
 * @param {string|null} category    - Mintel top-level category (raw, any casing)
 * @param {string|null} sub_category - Mintel sub-category (raw, any casing)
 * @returns {string} - Canonical key, 'out_of_scope', or 'needs_human_review'
 */
export function resolvePalsgaardCategory(category, sub_category) {
  if (!category) return 'needs_human_review';

  const topNorm = normalizeTopLevel(category);
  const topMap = MAPPING[topNorm];

  if (!topMap) {
    // Unknown top-level category — needs human review
    return 'needs_human_review';
  }

  if (sub_category) {
    const subNorm = sub_category.trim().toLowerCase();
    if (topMap[subNorm] !== undefined) {
      return topMap[subNorm];
    }
  }

  // Fall back to wildcard
  return topMap['*'] ?? 'needs_human_review';
}

// ── Legacy → canonical migration map ──────────────────────────────────────
// Used for migrating existing entity records from old enum values to canonical keys.

export const LEGACY_TO_CANONICAL = {
  // Source.category (12-value legacy)
  'Bakery':                   'bakery',
  'Confectionery':            'chocolate_confectionery',
  'Dairy':                    'dairy',
  'Ice Cream':                'ice_cream',
  'Meat':                     'meat',
  'Lipid':                    'oils_fats',
  'Feed':                     'out_of_scope',
  'Fine Food':                'needs_human_review',
  'PCI':                      'out_of_scope',
  'Polymer':                  'out_of_scope',
  'Tech':                     'out_of_scope',
  'Other Food Applications':  null,  // null = cross-category; set category=null, populate category_relevance

  // GlobalTrend.category / ExpertExample.category (7-value legacy)
  'Spreads':                  'condiments',   // Updated 2026-06-15: Savoury Spreads → condiments decision
  'Dressings':                'condiments',
  'Other':                    'needs_human_review',
};

/**
 * Migrates a legacy category value to canonical key.
 * Returns { canonical, isCrossCategory } where:
 *   canonical = the canonical key, or null if cross-category
 *   isCrossCategory = true when the source is cross-category (set category=null)
 */
export function migrateLegacyCategory(legacyValue) {
  if (!legacyValue) return { canonical: null, isCrossCategory: false };

  if (legacyValue in LEGACY_TO_CANONICAL) {
    const mapped = LEGACY_TO_CANONICAL[legacyValue];
    if (mapped === null) {
      return { canonical: null, isCrossCategory: true };
    }
    return { canonical: mapped, isCrossCategory: false };
  }

  // Already a canonical key?
  if (VALID_CATEGORY_VALUES.includes(legacyValue)) {
    return { canonical: legacyValue, isCrossCategory: false };
  }

  return { canonical: 'needs_human_review', isCrossCategory: false };
}

// ── Brief free-text normalization map ─────────────────────────────────────
// Used by convertBriefToProject to normalize AI-extracted brief categories.

export const BRIEF_CATEGORY_NORMALIZATION = {
  'confectionery':              'chocolate_confectionery',
  'chocolate':                  'chocolate_confectionery',
  'chocolate confectionery':    'chocolate_confectionery',
  'chocolate & confectionery':  'chocolate_confectionery',
  'bakery':                     'bakery',
  'cake':                       'bakery',
  'cake gels':                  'bakery',
  'baking':                     'bakery',
  'dairy':                      'dairy',
  'ice cream':                  'ice_cream',
  'ice-cream':                  'ice_cream',
  'meat':                       'meat',
  'processed meat':             'meat',
  'oils':                       'oils_fats',
  'oils & fats':                'oils_fats',
  'fats':                       'oils_fats',
  'plant based':                'plant_based',
  'plant-based':                'plant_based',
  'plant based products':       'plant_based',
  'rutf':                       'rutf_rusf',
  'rusf':                       'rutf_rusf',
  'rutf and rusf':              'rutf_rusf',
  'condiments':                 'condiments',
  'savoury spreads':            'condiments',
  'dips':                       'condiments',
  'spreads':                    'condiments',
};

/**
 * Normalizes a free-text brief category string to a canonical key.
 * @param {string} raw
 * @returns {string} canonical key or 'needs_human_review'
 */
export function normalizeBriefCategory(raw) {
  if (!raw) return 'needs_human_review';
  const normalized = BRIEF_CATEGORY_NORMALIZATION[raw.trim().toLowerCase()];
  return normalized || 'needs_human_review';
}