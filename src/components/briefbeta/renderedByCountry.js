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

// A candidate only becomes a country if it IS one. The parenthesised/trailing
// slot carries all sorts of things — multi-market strings ("UK/France"),
// positioning tags ("Seasonal, Cobranded"), editorial qualifiers ("USA,
// reference benchmark"), curation notes ("analyst-curated") — and no blocklist
// can anticipate them. Whitelisting against the region taxonomy inverts the
// default: anything not a known market is admitted as _unresolved rather than
// invented as coverage.
//
// COUNTRY_GROUPS is the frontend mirror of base44/shared/regionTaxonomy.ts
// (frontend must not import backend modules). Both copies change together.
import { COUNTRY_GROUPS } from './regionScope';

const KNOWN_COUNTRIES = new Map(
  Object.values(COUNTRY_GROUPS).flat().map(c => [c.toLowerCase(), c])
);

// Returns the canonical spelling from the taxonomy, or null when the candidate is
// not a known market. Canonicalising here means the audit trail cannot hold two
// spellings of the same country.
//
// The trailing '*' the architect uses as a footnote marker ("USA*") is stripped
// before lookup — same normalisation exportPreflight applies. Without it a real
// out-of-scope market resolves to _unresolved, which reads as "unparseable" and
// lets the export pre-flight pass a deck that is in fact leaking.
function resolveKnownCountry(candidate) {
  const cleaned = String(candidate || '').trim().replace(/\*+$/, '').trim();
  return KNOWN_COUNTRIES.get(cleaned.toLowerCase()) || null;
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
    const known = resolveKnownCountry(inner);
    if (known) return known;
  }

  // Trailing after an em/en dash or hyphen: "… — Mexico".
  const trailing = text.match(/[—–-]\s*([^—–\-,()]+?)\s*$/);
  if (trailing) {
    const known = resolveKnownCountry(trailing[1]);
    if (known) return known;
  }

  return null;
}

// Build C — per-DATAPOINT accounting, split by evidence class.
//
// The regional-containment check must not see cross-region reference examples: they
// are out-of-region BY DESIGN. But it must still see every regional example, so the
// split is decided per (slide, example) pair from the FROZEN bindings — not from the
// slide's own claim about itself, and never from the country string.
//
// Fail-closed: an example whose record id does not resolve to a read_across binding
// counts as REGIONAL. A missing marker can therefore only make the check stricter,
// never looser.
export function computeRenderedSplit(slides, bindings) {
  const map = bindings && typeof bindings === 'object' ? bindings : {};
  const regional = {};
  const readAcross = {};
  let regionalUnresolved = 0;
  let regionalTotal = 0;

  for (const slide of Array.isArray(slides) ? slides : []) {
    if (!isEvidenceSlide(slide)) continue;
    for (const example of Array.isArray(slide?.gnpd_examples) ? slide.gnpd_examples : []) {
      const text = String(example || '').trim();
      if (!text) continue;
      const idMatch = text.match(/^\s*([A-Za-z0-9._-]{4,})\s*\|/);
      const binding = idMatch ? (map[idMatch[1]] || map[`[SRC:${idMatch[1]}]`]) : null;
      const country = extractCountry(text);
      if (binding && binding.read_across === true) {
        const key = country || '_unresolved';
        readAcross[key] = (readAcross[key] || 0) + 1;
        continue;
      }
      regionalTotal++;
      if (country) regional[country] = (regional[country] || 0) + 1;
      else regionalUnresolved++;
    }
  }

  if (regionalUnresolved > 0) regional._unresolved = regionalUnresolved;
  if (regionalTotal > 0 && Object.keys(regional).length === 0) regional._unresolved = regionalTotal;
  return { regional, read_across: readAcross };
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