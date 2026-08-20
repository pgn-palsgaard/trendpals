// Phase 5 — what the deck ACTUALLY rendered, per country.
//
// Counted from the gnpd_examples strings on the saved slides, not from the
// eligibility pool: "eligible in this market" and "shown on a slide" are two
// different facts, and only the second one is what a reader sees. Written on
// every save so a regional-containment breach is auditable after the fact
// instead of having to be re-derived from the deck by hand.
//
// The two shapes the architect emits are:
//   "Product name (Mexico) — brand, 2026-03"   → parenthesised country
//   "Product name, brand — Mexico"             → trailing country after an em dash

// Methodology / disclaimer / export slides describe the report itself; their text
// is not rendered evidence and must never be counted as market coverage.
const NON_EVIDENCE_TYPES = ['methodology', 'briefing_context', 'product_export'];
const NON_EVIDENCE_NAMES = ['methodology', 'ai disclaimer', 'product export ids'];

function isEvidenceSlide(slide) {
  const type = String(slide?.slide_type || '').toLowerCase();
  const name = String(slide?.slide_name || '').toLowerCase();
  if (NON_EVIDENCE_TYPES.includes(type)) return false;
  if (NON_EVIDENCE_NAMES.some(n => name.includes(n))) return false;
  return true;
}

// Noise patterns the parenthesised/trailing slot carries instead of a country:
// multi-market strings ("UK/France", "Pan-European", "EU-wide"), flavour and
// positioning tags ("Seasonal, Cobranded", "Social Media"), and curation notes
// ("analyst-curated", "based development"). These are rejected outright so they
// are counted as _unresolved rather than invented as countries — a wrong country
// name in the audit trail is worse than an admitted miss.
const NOISE_PATTERNS = [
  /\//,
  /\bPan-/i,
  /\bMulti-/i,
  /\bEU-wide\b/i,
  /\bPan\s/i,
  /\bGlobal\b/i,
  /based development/i,
  /analyst-curated/i,
  /\bSeasonal\b/i,
  /\bCobranded\b/i,
  /\bSocial Media\b/i,
];

function isNoise(candidate) {
  return NOISE_PATTERNS.some(p => p.test(candidate));
}

// Pulls the country out of one gnpd_examples string. Returns null when neither
// pattern is present — a miss is reported, never guessed.
export function extractCountry(example) {
  const text = String(example || '').trim();
  if (!text) return null;

  // Parenthesised: take the LAST (...) group, since the product name itself may
  // contain brackets. Rejected when it looks like a date or a record id.
  const parens = text.match(/\(([^()]+)\)/g);
  if (parens && parens.length > 0) {
    const inner = parens[parens.length - 1].slice(1, -1).trim();
    if (inner && !/\d/.test(inner) && inner.length <= 40 && !isNoise(inner)) return inner;
  }

  // Trailing after an em/en dash or hyphen: "… — Mexico".
  const trailing = text.match(/[—–-]\s*([^—–\-,()]+?)\s*$/);
  if (trailing) {
    const candidate = trailing[1].trim();
    if (candidate && !/\d/.test(candidate) && candidate.length <= 40 && !isNoise(candidate)) return candidate;
  }

  return null;
}

// Country → count of rendered gnpd_examples across the deck's evidence slides.
// Never returns {} when examples exist: unparseable strings are counted under
// '_unresolved' so an empty field always means "no examples", never "we lost them".
export function computeRenderedByCountry(slides) {
  const counts = {};
  let unresolved = 0;
  let total = 0;

  for (const slide of Array.isArray(slides) ? slides : []) {
    if (!isEvidenceSlide(slide)) continue;
    for (const example of Array.isArray(slide?.gnpd_examples) ? slide.gnpd_examples : []) {
      if (!String(example || '').trim()) continue;
      total++;
      const country = extractCountry(example);
      if (country) counts[country] = (counts[country] || 0) + 1;
      else unresolved++;
    }
  }

  if (unresolved > 0) counts._unresolved = unresolved;
  if (total > 0 && Object.keys(counts).length === 0) return { _unresolved: total };
  return counts;
}