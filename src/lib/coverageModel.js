// ─────────────────────────────────────────────────────────────────────────────
// TrendPals — Coverage-aware regional evidence model
//
// Distinguishes "no signal" from "not searched". For a single trend, it combines:
//   - a COVERAGE map (did we even look in this region for this category?)
//   - a SIGNAL map (what did we find there?)
// into a per-region ASSESSMENT (label + badge + caveat).
//
// Commercial regions only (aspac, americas, emec, imea). Import region helpers
// from '@/lib/regions' — never hardcode region lists.
// ─────────────────────────────────────────────────────────────────────────────

import { COMMERCIAL_REGIONS, getCommercialRegion, normalizeEditorialRegion } from '@/lib/regions';

const COMMERCIAL_KEYS = COMMERCIAL_REGIONS.map(r => r.key); // ['aspac','americas','emec','imea']

// ── Thresholds ──────────────────────────────────────────────────────────────
// Adjust thresholds — current values assume partial uploads.
const THRESHOLDS = {
  GNPD_STRONG: 10,   // gnpdLaunches >= this → strong-tier signal
  GNPD_EMERGING: 3,  // gnpdLaunches >= this → emerging-tier signal
  COVERAGE_GOOD: 2,  // >= this many covering sources → 'good' coverage
};

// Tier ordering for sorting (higher = stronger).
const TIER_RANK = {
  strong: 8, promising: 7, emerging: 6, early: 5,
  weak: 4, some: 3, not_observed: 2, no_data: 1,
};

// ── Helpers ───────────────────────────────────────────────────────────────--

// Is a source relevant to this trend's category?
function sourceMatchesCategory(source, trendCategory) {
  if (!trendCategory) return true;
  if (source.category === trendCategory) return true;
  if (Array.isArray(source.category_relevance) && source.category_relevance.includes(trendCategory)) return true;
  // mintel / market_intel with matching category_relevance already covered above;
  // fall through to false otherwise.
  return false;
}

// ── STEP 1 — Coverage map ────────────────────────────────────────────────────
// A region is "covered" if a category-relevant Source lists it in coverage_regions[].
// GNPD sources count toward coverage even with zero products linked to THIS trend —
// a GNPD search in a region means "we looked there for this category."
// Returns { aspac: 'good'|'thin'|'none', americas: ..., emec: ..., imea: ... }
export function computeCoverageMap(allSources = [], trendCategory) {
  const counts = { aspac: 0, americas: 0, emec: 0, imea: 0 };
  const names = { aspac: [], americas: [], emec: [], imea: [] };

  for (const s of allSources) {
    if (!sourceMatchesCategory(s, trendCategory)) continue;
    const cov = Array.isArray(s.coverage_regions) ? s.coverage_regions : [];
    for (const r of cov) {
      if (counts[r] === undefined) continue;
      counts[r] += 1;
      if (names[r].length < 10) names[r].push(s.title || s.id);
    }
  }

  const map = {};
  for (const key of COMMERCIAL_KEYS) {
    const n = counts[key];
    map[key] = {
      level: n >= THRESHOLDS.COVERAGE_GOOD ? 'good' : n === 1 ? 'thin' : 'none',
      sourceCount: n,
      sourceNames: names[key],
    };
  }
  return map;
}

// ── STEP 2 — Signal map ──────────────────────────────────────────────────────
// Raw per-region signal counts (no strength labels).
// Returns { aspac: { gnpdLaunches, sourceExcerpts, smeSignals }, ... }
export function computeSignalMap(gnpdProducts = [], sources = [], reviewAssignments = []) {
  const empty = () => ({
    gnpdLaunches: 0,
    sourceExcerpts: 0,
    smeSignals: { count: 0, verdicts: [], consensus: null },
  });
  const map = { aspac: empty(), americas: empty(), emec: empty(), imea: empty() };

  // GNPD launches per commercial region
  for (const p of gnpdProducts) {
    const cr = getCommercialRegion(p.region, p.country);
    if (cr && map[cr]) map[cr].gnpdLaunches += 1;
  }

  // Source excerpts — each excerpt's canonical regions[] folded to commercial
  for (const s of sources) {
    const excerpts = Array.isArray(s.excerpts) ? s.excerpts : [];
    for (const ex of excerpts) {
      const regions = Array.isArray(ex.regions) ? ex.regions : [];
      const commercial = new Set();
      for (const canon of regions) {
        const cr = getCommercialRegion(canon, null);
        if (cr && map[cr]) commercial.add(cr);
      }
      for (const cr of commercial) map[cr].sourceExcerpts += 1;
    }
  }

  // SME signals per region (trend_signal from responded assignments)
  for (const a of reviewAssignments) {
    const cr = a.reviewer_region ? getCommercialRegion(a.reviewer_region, null) : null;
    if (!cr || !map[cr]) continue;
    if (!a.trend_signal) continue;
    map[cr].smeSignals.count += 1;
    map[cr].smeSignals.verdicts.push(a.trend_signal);
  }
  // Consensus = most common verdict
  for (const key of COMMERCIAL_KEYS) {
    const v = map[key].smeSignals.verdicts;
    if (v.length) {
      const tally = {};
      v.forEach(x => { tally[x] = (tally[x] || 0) + 1; });
      map[key].smeSignals.consensus = Object.entries(tally).sort((a, b) => b[1] - a[1])[0][0];
    }
  }
  return map;
}

// Map an editorial manifestation list to commercial regions, keyed by region.
function buildEditorialMap(regionalManifestations = []) {
  const out = {};
  for (const m of regionalManifestations) {
    const cr = normalizeEditorialRegion(m.region);
    if (cr && cr !== 'global' && !out[cr]) out[cr] = m; // first wins
  }
  return out;
}

// ── STEP 3 — Combine signal × coverage into assessment ───────────────────────
// Applies the matrix. Returns sorted array of region assessments.
export function computeRegionalAssessment({
  gnpdProducts = [],
  sources = [],
  reviewAssignments = [],
  allSources = [],
  trendCategory,
  regionalManifestations = [],
} = {}) {
  const coverageMap = computeCoverageMap(allSources, trendCategory);
  const signalMap = computeSignalMap(gnpdProducts, sources, reviewAssignments);
  const editorialMap = buildEditorialMap(regionalManifestations);

  const results = COMMERCIAL_KEYS.map(region => {
    const cov = coverageMap[region];
    const sig = signalMap[region];
    const coverage = cov.level; // 'good' | 'thin' | 'none'

    const gnpd = sig.gnpdLaunches;
    const sme = sig.smeSignals.consensus; // 'strong' | 'emerging' | 'not_seeing_it' | null
    const anySignal = gnpd > 0 || sig.sourceExcerpts > 0 || sig.smeSignals.count > 0;

    // Signal tier independent of coverage
    let signalTier;
    if (gnpd >= THRESHOLDS.GNPD_STRONG || sme === 'strong') signalTier = 'strong';
    else if (gnpd >= THRESHOLDS.GNPD_EMERGING || sme === 'emerging') signalTier = 'emerging';
    else if (anySignal) signalTier = 'weak';
    else signalTier = 'none';

    let label, displayLabel, badgeColor, badgeVariant;

    if (signalTier === 'strong') {
      if (coverage === 'good') { label = 'strong';    displayLabel = 'Strong evidence';            badgeColor = 'green'; badgeVariant = 'solid'; }
      else                     { label = 'promising'; displayLabel = 'Promising — limited data';   badgeColor = 'amber'; badgeVariant = 'solid'; }
    } else if (signalTier === 'emerging') {
      if (coverage === 'good') { label = 'emerging';  displayLabel = 'Emerging';                    badgeColor = 'amber'; badgeVariant = 'solid'; }
      else                     { label = 'early';     displayLabel = 'Early signal — limited data'; badgeColor = 'amber'; badgeVariant = 'muted'; }
    } else if (signalTier === 'weak') {
      if (coverage === 'good') { label = 'weak';      displayLabel = 'Weak signal';                 badgeColor = 'gray';  badgeVariant = 'solid'; }
      else                     { label = 'some';      displayLabel = 'Some signal — limited data';  badgeColor = 'gray';  badgeVariant = 'muted'; }
    } else {
      // no signal
      if (coverage === 'good')      { label = 'not_observed'; displayLabel = 'Not observed';                 badgeColor = 'gray'; badgeVariant = 'muted'; }
      else if (coverage === 'thin') { label = 'not_observed'; displayLabel = 'Not observed — limited data';  badgeColor = 'gray'; badgeVariant = 'muted'; }
      else                          { label = 'no_data';      displayLabel = 'No data yet';                   badgeColor = 'none'; badgeVariant = 'none'; }
    }

    // Caveat for thin coverage
    let caveat = null;
    if (coverage === 'thin') {
      caveat = `Limited data — ${cov.sourceCount} source covers this region and category`;
    }

    return {
      region,
      label,
      displayLabel,
      badgeColor,
      badgeVariant,
      coverage,
      coverageSourceCount: cov.sourceCount,
      coverageSourceNames: cov.sourceNames,
      gnpdLaunches: gnpd,
      sourceExcerpts: sig.sourceExcerpts,
      smeSignals: sig.smeSignals,
      editorialSignal: editorialMap[region] || null,
      caveat,
    };
  });

  // Sort: tier rank desc, then gnpdLaunches desc
  results.sort((a, b) => {
    const ra = TIER_RANK[a.label] || 0;
    const rb = TIER_RANK[b.label] || 0;
    if (rb !== ra) return rb - ra;
    return b.gnpdLaunches - a.gnpdLaunches;
  });

  return results;
}