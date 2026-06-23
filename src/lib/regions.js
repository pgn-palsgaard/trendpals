// ─────────────────────────────────────────────────────────────────────────────
// TrendPals — Canonical region layer (single source of truth)
//
// This file defines the 6 canonical TrendPals regions used by the regional data
// layer (reviewer_region, GNPDProduct.region, excerpt regions[]).
//
// NOTE: This is intentionally SEPARATE from the legacy 5-code `region_code`
// taxonomy (ASPAC / AMERICAS / EMEC / IMEA / Global) still present on several
// entities. That legacy field is untouched. No other file should hardcode
// region lists or market-to-region mappings — import from here.
// ─────────────────────────────────────────────────────────────────────────────

// 2.1 — Canonical regions
export const CANONICAL_REGIONS = [
  { key: 'aspac',              label: 'ASPAC',              description: 'Asia Pacific' },
  { key: 'europe',             label: 'Europe',             description: 'Western + Eastern Europe' },
  { key: 'north_america',      label: 'North America',      description: 'USA, Canada' },
  { key: 'latam',              label: 'LATAM',              description: 'Latin America' },
  { key: 'mena',               label: 'MENA',               description: 'Middle East and North Africa' },
  { key: 'sub_saharan_africa', label: 'Sub-Saharan Africa', description: 'Sub-Saharan Africa' },
];

// Set of valid canonical region keys, for write-time validation.
export const CANONICAL_REGION_KEYS = CANONICAL_REGIONS.map(r => r.key);

// 2.2 — Market (country) name → canonical region key.
// Keys are lowercase; include common variations.
export const MARKET_TO_REGION = {
  // ── ASPAC ──
  'japan': 'aspac', 'china': 'aspac', 'south korea': 'aspac', 'korea': 'aspac',
  'indonesia': 'aspac', 'thailand': 'aspac', 'vietnam': 'aspac', 'philippines': 'aspac',
  'malaysia': 'aspac', 'singapore': 'aspac', 'australia': 'aspac', 'new zealand': 'aspac',
  'india': 'aspac', 'taiwan': 'aspac', 'hong kong': 'aspac',

  // ── Europe ──
  'uk': 'europe', 'united kingdom': 'europe', 'great britain': 'europe',
  'germany': 'europe', 'france': 'europe', 'italy': 'europe', 'spain': 'europe',
  'netherlands': 'europe', 'belgium': 'europe', 'sweden': 'europe', 'denmark': 'europe',
  'norway': 'europe', 'finland': 'europe', 'poland': 'europe', 'switzerland': 'europe',
  'austria': 'europe', 'ireland': 'europe', 'czech republic': 'europe', 'czechia': 'europe',
  'portugal': 'europe', 'greece': 'europe', 'romania': 'europe', 'hungary': 'europe',

  // ── North America ──
  'united states': 'north_america', 'us': 'north_america', 'usa': 'north_america',
  'u.s.': 'north_america', 'u.s.a.': 'north_america', 'canada': 'north_america',

  // ── LATAM ──
  'brazil': 'latam', 'mexico': 'latam', 'argentina': 'latam', 'colombia': 'latam',
  'chile': 'latam', 'peru': 'latam', 'ecuador': 'latam',

  // ── MENA ──
  'uae': 'mena', 'united arab emirates': 'mena', 'saudi arabia': 'mena', 'egypt': 'mena',
  'turkey': 'mena', 'israel': 'mena', 'south africa': 'mena', 'morocco': 'mena',
  'tunisia': 'mena', 'lebanon': 'mena', 'kuwait': 'mena', 'qatar': 'mena',
  'bahrain': 'mena', 'jordan': 'mena',

  // ── Sub-Saharan Africa ──
  'nigeria': 'sub_saharan_africa', 'kenya': 'sub_saharan_africa', 'ghana': 'sub_saharan_africa',
  'ethiopia': 'sub_saharan_africa', 'tanzania': 'sub_saharan_africa',
};

// 2.3 — Resolve a market/country name to a canonical region key.
// Normalises input, never throws, returns 'unknown' if not found.
export function getRegionForMarket(marketName) {
  if (!marketName || typeof marketName !== 'string') return 'unknown';
  const key = marketName.trim().toLowerCase();
  return MARKET_TO_REGION[key] || 'unknown';
}

// 2.4 — Resolve a canonical region key to its display label.
// Returns the key as-is if not a known canonical region.
export function getRegionLabel(regionKey) {
  if (!regionKey) return '';
  const found = CANONICAL_REGIONS.find(r => r.key === regionKey);
  return found ? found.label : regionKey;
}

// Validate a region key against the canonical set (used at write time).
export function isCanonicalRegion(regionKey) {
  return CANONICAL_REGION_KEYS.includes(regionKey);
}