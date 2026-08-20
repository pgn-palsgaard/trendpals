// TrendPals — backend region taxonomy for evidence scoping.
//
// Country strings are spelled EXACTLY as they appear in GNPDProduct.country
// (verified against live data). All data is inlined — no imports from src/ or
// lib/. The frontend (src/components/briefbeta/regionScope.js) maintains its
// own copy of the same data BY DESIGN: backend functions cannot import from
// src/, and the frontend must not import backend modules. If a country group
// changes here, change it there too.
//
// The americas split is the point of this module: "South America" / "Latin
// America" / "LATAM" resolve to LATAM only — never to the full americas group.
// USA and Canada enter a scope only via "North America", bare "Americas", a
// named country, or global scope.

export const LATAM_COUNTRIES = [
  'Mexico', 'Brazil', 'Argentina', 'Colombia', 'Chile', 'Peru', 'Ecuador',
  'Puerto Rico', 'Venezuela', 'Guatemala', 'Panama', 'Costa Rica',
];

export const NORTH_AMERICA_COUNTRIES = ['USA', 'Canada'];

export const AMERICAS_COUNTRIES = [...NORTH_AMERICA_COUNTRIES, ...LATAM_COUNTRIES];

export const EUROPE_COUNTRIES = [
  'UK', 'Germany', 'France', 'Italy', 'Spain', 'Poland', 'Netherlands', 'Belgium',
  'Denmark', 'Sweden', 'Norway', 'Finland', 'Ireland', 'Portugal', 'Austria',
  'Switzerland', 'Greece', 'Czech Republic', 'Slovakia', 'Hungary', 'Romania',
  'Bulgaria', 'Croatia', 'Slovenia', 'Serbia', 'Estonia', 'Latvia', 'Lithuania',
  'Iceland', 'Luxembourg', 'Malta', 'Cyprus', 'Bosnia and Herzegovina',
  'North Macedonia', 'Albania', 'Montenegro',
];

export const ASPAC_COUNTRIES = [
  'China', 'Japan', 'India', 'Indonesia', 'South Korea', 'Australia', 'Thailand',
  'Vietnam', 'Malaysia', 'Philippines', 'Singapore', 'Taiwan, China',
  'Hong Kong, China', 'New Zealand', 'Sri Lanka', 'Bangladesh', 'Myanmar',
  'Cambodia', 'Laos', 'Pakistan',
];

export const IMEA_COUNTRIES = [
  'UAE', 'Saudi Arabia', 'Kuwait', 'Qatar', 'Oman', 'Jordan', 'Lebanon', 'Israel',
  'Egypt', 'Morocco', 'Algeria', 'Tunisia', 'South Africa',
];

export const CIS_COUNTRIES = [
  'Russia', 'Ukraine', 'Belarus', 'Kazakhstan', 'Uzbekistan', 'Azerbaijan',
  'Armenia', 'Georgia', 'Kyrgyzstan', 'Tajikistan', 'Turkmenistan', 'Moldova',
];

export const TURKEY_COUNTRIES = ['Turkey', 'Türkiye'];

const GROUPS: Record<string, string[]> = {
  latam: LATAM_COUNTRIES,
  north_america: NORTH_AMERICA_COUNTRIES,
  americas: AMERICAS_COUNTRIES,
  europe: EUROPE_COUNTRIES,
  aspac: ASPAC_COUNTRIES,
  imea: IMEA_COUNTRIES,
  cis: CIS_COUNTRIES,
  turkey: TURKEY_COUNTRIES,
};

// Term rules, tested in this exact order. Sub-continent terms come BEFORE the
// generic group term, and the bare americas/america rule is suppressed when a
// more specific americas rule already fired — so "South America" can never
// widen to the full americas group. Rules are otherwise cumulative: a brief
// naming several regions ("Europe, Turkey, CIS") resolves to all of them.
const TERM_RULES: Array<{
  match: RegExp;
  groups: string[];
  label: string;
  suppressedBy?: string[];
}> = [
  { match: /\b(south[ -]?america|latin[ -]?america|central[ -]?america|latam)\b/i, groups: ['latam'], label: 'south america / latin america / central america / latam → LATAM' },
  { match: /\bnorth[ -]?america\b/i, groups: ['north_america'], label: 'north america → NORTH_AMERICA' },
  { match: /\b(americas|america)\b/i, groups: ['americas'], label: 'americas (bare) → AMERICAS', suppressedBy: ['latam', 'north_america'] },
  { match: /\bemec\b/i, groups: ['europe', 'turkey', 'cis'], label: 'emec → EUROPE + TURKEY + CIS' },
  { match: /\b(europe|european|eu|emea)\b/i, groups: ['europe'], label: 'europe / european / eu / emea → EUROPE' },
  { match: /\b(aspac|apac|asia[ -]?pacific)\b/i, groups: ['aspac'], label: 'aspac / apac / asia pacific → ASPAC' },
  { match: /\b(imea|middle east|africa|mena)\b/i, groups: ['imea'], label: 'imea / middle east / africa / mena → IMEA' },
  { match: /\b(cis|commonwealth of independent states)\b/i, groups: ['cis'], label: 'cis → CIS' },
  { match: /\b(turkey|türkiye|turkiye)\b/i, groups: ['turkey'], label: 'turkey / türkiye → TURKEY' },
];

const ALL_COUNTRIES = [...new Set(Object.values(GROUPS).flat())];

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Resolves free brief text plus an explicit exclusion list into a country
// allow-list. Country matching normalises to lowercase; output keeps the
// original GNPD casing. excludedCountries is subtracted LAST — fail-closed,
// it always wins over anything the text resolution added.
export function resolveAllowList(regionText: string, excludedCountries: string[] = []): {
  countries: string[];
  scope: 'global' | 'regional';
  resolution_log: string[];
  // Extra (beyond the core contract): which group each country came from —
  // preserves the gate's per-subregion diagnostics downstream.
  subregions: Record<string, string[]>;
} {
  const raw = String(regionText || '').trim();
  const log: string[] = [];
  const excludedLc = new Set(
    (excludedCountries || []).map(c => String(c).trim().toLowerCase()).filter(Boolean)
  );

  const subtract = (list: string[]) => list.filter(c => !excludedLc.has(c.toLowerCase()));
  const logExclusions = (before: string[]) => {
    const removed = before.filter(c => excludedLc.has(c.toLowerCase()));
    if (removed.length) log.push(`excluded: ${removed.join(', ')}`);
    const notPresent = (excludedCountries || []).filter(
      e => !before.some(c => c.toLowerCase() === String(e).trim().toLowerCase())
    );
    if (notPresent.length) log.push(`excluded (not in resolved list): ${notPresent.join(', ')}`);
  };

  // 1 — global scope short-circuits everything except the exclusion subtraction.
  if (/\bglobal(ly)?\b|\bworldwide\b|\ball regions\b/i.test(raw)) {
    log.push(`matched: global scope (${ALL_COUNTRIES.length} countries)`);
    logExclusions(ALL_COUNTRIES);
    return { countries: subtract(ALL_COUNTRIES), scope: 'global', resolution_log: log, subregions: {} };
  }

  // 2 — group terms, in order, with suppression for the bare americas rule.
  const matchedGroups: string[] = [];
  for (const rule of TERM_RULES) {
    if (!rule.match.test(raw)) continue;
    if (rule.suppressedBy && rule.suppressedBy.some(g => matchedGroups.includes(g))) continue;
    for (const g of rule.groups) {
      if (!matchedGroups.includes(g)) {
        matchedGroups.push(g);
        log.push(`matched: ${rule.label} (${GROUPS[g].length} countries)`);
      }
    }
  }

  const subregions: Record<string, string[]> = {};
  const resolved: string[] = [];
  const resolvedLc = new Set<string>();
  for (const g of matchedGroups) {
    subregions[g] = subtract(GROUPS[g]);
    for (const c of GROUPS[g]) {
      if (!resolvedLc.has(c.toLowerCase())) { resolvedLc.add(c.toLowerCase()); resolved.push(c); }
    }
  }

  // 3 — named-country expansion, matched case-insensitively against the raw text.
  const named: string[] = [];
  for (const c of ALL_COUNTRIES) {
    if (resolvedLc.has(c.toLowerCase())) continue;
    if (new RegExp(`\\b${escapeRe(c)}\\b`, 'i').test(raw)) {
      resolvedLc.add(c.toLowerCase());
      resolved.push(c);
      named.push(c);
      log.push(`named country added: ${c}`);
    }
  }
  if (named.length) subregions.named_countries = subtract(named);

  // 4 — exclusions subtracted LAST, after all resolution.
  logExclusions(resolved);
  return { countries: subtract(resolved), scope: 'regional', resolution_log: log, subregions };
}