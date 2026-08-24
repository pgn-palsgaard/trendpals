// Build C — the read-across (cross-region) tier.
//
// Two things live here and NOWHERE else:
//   1. The canonical divider strings for the third deck tier. Defined once so the
//      prompt and the evidence context cannot drift apart (they already have on the
//      SIGNAL tier — do not add a third inconsistency).
//   2. The render-owned provenance label. The architect sets `evidence_class` only;
//      this function writes the visible honesty line, exactly as the citation
//      resolver — not the architect — writes a citation string.
//
// The wording deliberately avoids "adjacent" and "read-across from": those are
// ADJ-1 rejections. The validator also exempts the provenance_label field, so a
// later re-wording cannot trip the validator on the renderer's own output.

export const CROSS_REGION_DIVIDER_TITLE = 'Cross-region reference';
export const CROSS_REGION_DIVIDER_SUBTITLE = 'Launches from other markets';

// Build B (BM-3) — the SIGNAL tier divider, defined ONCE. The prompt and the
// evidence context had drifted to two different strings, one of them 44 chars and
// therefore over the 38-char divider budget. Both now import this.
export const SIGNAL_DIVIDER_TITLE = 'Signal — not yet regionally evidenced';

// One line, deterministic. `regionLabel` is the report's display label (what the
// evidence actually covers), never a query value.
export function provenanceLabel(regionLabel) {
  const where = String(regionLabel || '').trim();
  return where
    ? `Cross-region reference — no ${where} launches on record for this trend; examples are from other markets.`
    : 'Cross-region reference — no launches on record in the brief region for this trend; examples are from other markets.';
}

export function isReadAcrossSlide(slide) {
  return String(slide?.evidence_class || '') === 'read_across';
}

// "<RECORD_ID> | Product — Brand (Country): why" → RECORD_ID.
export function recordIdFromExample(example) {
  const m = String(example || '').match(/^\s*([A-Za-z0-9._-]{4,})\s*\|/);
  return m ? m[1] : null;
}

// Stamps provenance_label on read_across slides and clears it everywhere else, so
// a class change can never leave a stale label behind.
export function stampProvenance(slides, regionLabel) {
  const label = provenanceLabel(regionLabel);
  return (slides || []).map(s =>
    isReadAcrossSlide(s) ? { ...s, provenance_label: label } : (s?.provenance_label ? { ...s, provenance_label: '' } : s)
  );
}