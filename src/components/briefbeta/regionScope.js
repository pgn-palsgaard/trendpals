// Region resolution for the beta Report Architect.
//
// DUPLICATED BY DESIGN — the same country groups and resolver logic are inlined in
// base44/functions/getArchitectEvidence/entry.ts (backend functions cannot import
// from src/). If you change a country group or a region term here, change it there
// too. Same duplication pattern as EMULSIFIER_TERMS.
//
// Country strings are spelled EXACTLY as they appear in GNPDProduct.country
// (verified against the live data, 76 distinct bakery countries).

export const COUNTRY_GROUPS = {
  europe: [
    'UK', 'Germany', 'France', 'Italy', 'Spain', 'Poland', 'Netherlands', 'Belgium',
    'Denmark', 'Sweden', 'Norway', 'Finland', 'Ireland', 'Portugal', 'Austria',
    'Switzerland', 'Greece', 'Czech Republic', 'Slovakia', 'Hungary', 'Romania',
    'Bulgaria', 'Croatia', 'Slovenia', 'Serbia', 'Estonia', 'Latvia', 'Lithuania',
    'Iceland', 'Luxembourg', 'Malta', 'Cyprus', 'Bosnia and Herzegovina',
    'North Macedonia', 'Albania', 'Montenegro',
  ],
  turkey: ['Turkey'],
  // CIS is present in the taxonomy but carries 0 bakery records in the live data —
  // the gate reports that explicitly instead of absorbing it silently.
  cis: [
    'Russia', 'Ukraine', 'Belarus', 'Kazakhstan', 'Uzbekistan', 'Azerbaijan',
    'Armenia', 'Georgia', 'Kyrgyzstan', 'Tajikistan', 'Turkmenistan', 'Moldova',
  ],
  aspac: [
    'China', 'Japan', 'India', 'Indonesia', 'South Korea', 'Australia', 'Thailand',
    'Vietnam', 'Malaysia', 'Philippines', 'Singapore', 'Taiwan, China',
    'Hong Kong, China', 'New Zealand', 'Sri Lanka', 'Bangladesh', 'Myanmar',
    'Cambodia', 'Laos', 'Pakistan',
  ],
  americas: [
    'USA', 'Canada', 'Mexico', 'Brazil', 'Argentina', 'Chile', 'Colombia', 'Peru',
    'Ecuador', 'Guatemala', 'Costa Rica', 'Venezuela', 'Puerto Rico', 'Panama',
  ],
  imea: [
    'UAE', 'Saudi Arabia', 'Kuwait', 'Qatar', 'Oman', 'Jordan', 'Lebanon', 'Israel',
    'Egypt', 'Morocco', 'Algeria', 'Tunisia', 'South Africa',
  ],
};

// Region terms the requester may use, each expanding to one or more country groups.
const REGION_TERMS = [
  { match: /\b(cis|commonwealth of independent states)\b/i, groups: ['cis'] },
  { match: /\b(turkey|türkiye|turkiye)\b/i, groups: ['turkey'] },
  { match: /\b(europe|european|eu|emea)\b/i, groups: ['europe'] },
  { match: /\bemec\b/i, groups: ['europe', 'turkey', 'cis'] },
  { match: /\b(aspac|apac|asia[- ]?pacific|asia)\b/i, groups: ['aspac'] },
  { match: /\b(americas|america|latam|north america)\b/i, groups: ['americas'] },
  { match: /\b(imea|middle east|africa|mena)\b/i, groups: ['imea'] },
];

export function isGlobalScope(text) {
  return /\bglobal(ly)?\b|\bworldwide\b|\ball regions\b/i.test(String(text || ''));
}

// Resolves free brief text into an explicit country allow-list.
// Never falls back to Global — an unresolvable region returns ok:false so the
// caller can fail loudly (Phase 0.3).
export function resolveRegionScope(text) {
  const raw = String(text || '').trim();
  if (!raw) {
    return { ok: false, error: 'No region was given. Name the markets in scope (e.g. "Europe, Turkey, CIS") or state global scope explicitly.' };
  }

  if (isGlobalScope(raw)) {
    return { ok: true, region_text: raw, scope: 'global', countries: [], subregions: {}, matched_terms: ['global'] };
  }

  const groups = [];
  for (const term of REGION_TERMS) {
    if (term.match.test(raw)) for (const g of term.groups) if (!groups.includes(g)) groups.push(g);
  }

  // Individually named countries, matched against the actual data spellings.
  const allCountries = Object.values(COUNTRY_GROUPS).flat();
  const named = allCountries.filter(c => new RegExp(`\\b${c.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i').test(raw));

  if (groups.length === 0 && named.length === 0) {
    return {
      ok: false,
      error: `The region "${raw}" could not be resolved to known markets. Restate it using region names (Europe, Turkey, CIS, ASPAC, Americas, IMEA), named countries, or state global scope explicitly.`,
    };
  }

  const subregions = {};
  for (const g of groups) subregions[g] = COUNTRY_GROUPS[g];
  const loose = named.filter(c => !groups.some(g => COUNTRY_GROUPS[g].includes(c)));
  if (loose.length) subregions.named_countries = loose;

  const countries = [...new Set(Object.values(subregions).flat())];
  return { ok: true, region_text: raw, scope: 'countries', countries, subregions, matched_terms: [...groups, ...loose] };
}