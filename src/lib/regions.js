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
  'taiwan, china': 'aspac', 'hong kong, china': 'aspac', 'sri lanka': 'aspac',
  'bangladesh': 'aspac', 'pakistan': 'aspac', 'cambodia': 'aspac',
  'myanmar': 'aspac', 'laos': 'aspac',

  // ── Europe ──
  'uk': 'europe', 'united kingdom': 'europe', 'great britain': 'europe',
  'germany': 'europe', 'france': 'europe', 'italy': 'europe', 'spain': 'europe',
  'netherlands': 'europe', 'belgium': 'europe', 'sweden': 'europe', 'denmark': 'europe',
  'norway': 'europe', 'finland': 'europe', 'poland': 'europe', 'switzerland': 'europe',
  'austria': 'europe', 'ireland': 'europe', 'czech republic': 'europe', 'czechia': 'europe',
  'portugal': 'europe', 'greece': 'europe', 'romania': 'europe', 'hungary': 'europe',
  'russia': 'europe', 'lithuania': 'europe', 'slovenia': 'europe',
  'latvia': 'europe', 'croatia': 'europe',

  // ── North America ──
  'united states': 'north_america', 'us': 'north_america', 'usa': 'north_america',
  'u.s.': 'north_america', 'u.s.a.': 'north_america', 'canada': 'north_america',

  // ── LATAM ──
  'brazil': 'latam', 'mexico': 'latam', 'argentina': 'latam', 'colombia': 'latam',
  'chile': 'latam', 'peru': 'latam', 'ecuador': 'latam',
  'puerto rico': 'latam', 'venezuela': 'latam', 'guatemala': 'latam', 'panama': 'latam',

  // ── MENA ──
  'uae': 'mena', 'united arab emirates': 'mena', 'saudi arabia': 'mena', 'egypt': 'mena',
  'turkey': 'mena', 'israel': 'mena', 'south africa': 'mena', 'morocco': 'mena',
  'tunisia': 'mena', 'lebanon': 'mena', 'kuwait': 'mena', 'qatar': 'mena',
  'bahrain': 'mena', 'jordan': 'mena', 'algeria': 'mena', 'oman': 'mena',

  // ── Sub-Saharan Africa ──
  'nigeria': 'sub_saharan_africa', 'kenya': 'sub_saharan_africa', 'ghana': 'sub_saharan_africa',
  'ethiopia': 'sub_saharan_africa', 'tanzania': 'sub_saharan_africa',
  'cameroon': 'sub_saharan_africa', 'ivory coast': 'sub_saharan_africa',
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

// ─────────────────────────────────────────────────────────────────────────────
// COMMERCIAL REGION LAYER — the 4 Palsgaard sales regions (ASPAC, AMERICAS,
// EMEC, IMEA). This is a presentation/grouping layer on top of the 6 canonical
// regions. Canonical data is the source of truth; these helpers fold the 6
// canonical keys down to the 4 commercial keys, with country-level overrides.
//
// Additive only — nothing above this line was modified.
// ─────────────────────────────────────────────────────────────────────────────

// 1.1 — The 4 commercial (Palsgaard sales) regions
export const COMMERCIAL_REGIONS = [
  { key: 'aspac',    label: 'ASPAC' },
  { key: 'americas', label: 'AMERICAS' },
  { key: 'emec',     label: 'EMEC' },
  { key: 'imea',     label: 'IMEA' },
];

// 1.2 — Default canonical → commercial mapping (fallback when no country name).
export const CANONICAL_TO_COMMERCIAL = {
  aspac:              'aspac',     // Default; India override below
  north_america:      'americas',
  latam:              'americas',
  europe:             'emec',
  mena:               'imea',      // Default; Turkey/Iran/Stan override below
  sub_saharan_africa: 'imea',
};

// 1.3 — Country-level overrides where the default canonical→commercial mapping
// is wrong. Keys are lowercase country names matching MARKET_TO_REGION keys.
const COMMERCIAL_OVERRIDES = {
  // India is canonical 'aspac' but commercial IMEA
  'india':           'imea',

  // Turkey, Iran, Stan countries are canonical 'mena' but commercial EMEC
  'turkey':          'emec',
  'iran':            'emec',
  'uzbekistan':      'emec',
  'turkmenistan':    'emec',
  'kazakhstan':      'emec',
  'kyrgyzstan':      'emec',
  'tajikistan':      'emec',
  'afghanistan':     'emec',
  'azerbaijan':      'emec',
  'georgia':         'emec',
  'armenia':         'emec',

  // Russia excluded from EMEC — map to ASPAC as nearest Palsgaard sales region
  'russia':          'aspac',
};

// 1.4 — Resolve to a commercial region key. Country override first, then the
// default canonical→commercial fallback.
export function getCommercialRegion(canonicalKey, country = null) {
  if (country) {
    const normalized = country.toLowerCase().trim();
    if (COMMERCIAL_OVERRIDES[normalized]) {
      return COMMERCIAL_OVERRIDES[normalized];
    }
  }
  return CANONICAL_TO_COMMERCIAL[canonicalKey] || null;
}

// 1.5 — Commercial region key → display label.
export function getCommercialLabel(commercialKey) {
  const found = COMMERCIAL_REGIONS.find(r => r.key === commercialKey);
  return found ? found.label : commercialKey?.toUpperCase() || 'Unknown';
}

// 1.6 — Map editorial region strings (regional_manifestations[].region) to
// commercial keys. Editorial data uses inconsistent casing and naming.
const EDITORIAL_TO_COMMERCIAL = {
  'aspac':    'aspac',
  'americas': 'americas',
  'emea':     'emec',     // Old editorial name → EMEC
  'emec':     'emec',
  'imea':     'imea',
  'global':   'global',   // Keep as-is, not a sales region
};

export function normalizeEditorialRegion(editorialRegion) {
  if (!editorialRegion) return null;
  const key = editorialRegion.toLowerCase().trim();
  return EDITORIAL_TO_COMMERCIAL[key] || null;
}