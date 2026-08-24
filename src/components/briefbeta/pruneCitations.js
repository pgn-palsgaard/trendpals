// Build-time citation pruning.
//
// A citation the architect emitted that does not belong on the slide is DROPPED,
// never allowed to hard-block the whole build. Three cases are pruned, all
// decided from the frozen bindings (never from prose):
//   * the id resolves to nothing in the evidence the deck was built from (CITE-1)
//   * the id is bound to a different trend than the slide (XTREND-1)
//   * the id's evidence tier differs from the slide's evidence_class (TIER-1)
//
// Pruning runs BEFORE validation, so those three rules can no longer fire and the
// analyst is never stopped over one bad reference. Everything else (character
// budgets, competitor content, market sizing) is untouched.
import { resolveBinding } from './citationKey';

function slideClassOf(slide) {
  return String(slide?.evidence_class || 'regional') === 'read_across' ? 'read_across' : 'regional';
}

// Returns true when this cited id may stay on this slide.
function idAllowed(id, slide, bindings) {
  const hit = resolveBinding(id, bindings);
  if (!hit) return false;                                   // unresolvable
  if (hit.kind === 'web') return true;                      // web signals are trend-neutral
  const slideTrend = String(slide?.trend_id || '').trim();
  const boundTrend = String(hit.trend_id || '').trim();
  if (slideTrend && boundTrend && boundTrend !== slideTrend) return false;
  if (hit.kind === 'gnpd') {
    const recordClass = hit.read_across === true ? 'read_across' : 'regional';
    if (recordClass !== slideClassOf(slide)) return false;
  }
  return true;
}

function isContentSlide(slide) {
  return slide?.slide_type !== 'section_header' && slide?.slide_type !== 'methodology';
}

// Drops offending citations from a deck. Returns { slides, dropped: [{field, id, why}] }.
export function pruneCitations(slides, bindings) {
  const map = bindings && typeof bindings === 'object' ? bindings : null;
  if (!map || Object.keys(map).length === 0) return { slides: slides || [], dropped: [] };

  const dropped = [];
  const out = (slides || []).map((slide, i) => {
    if (!isContentSlide(slide)) return slide;
    const where = `slide ${slide.slide_number ?? i + 1}`;
    const next = { ...slide };

    if (Array.isArray(slide.supporting_data)) {
      next.supporting_data = slide.supporting_data.filter((d, j) => {
        const id = String(d?.source_id || '').trim();
        if (!id) return true;
        if (idAllowed(id, slide, map)) return true;
        dropped.push({ field: `${where}.supporting_data[${j}]`, id, why: 'citation does not resolve to this slide\u2019s evidence' });
        return false;
      });
    }

    if (Array.isArray(slide.gnpd_examples)) {
      next.gnpd_examples = slide.gnpd_examples.filter((ex, j) => {
        const m = String(ex || '').match(/^\s*([A-Za-z0-9._-]{4,})\s*\|/);
        if (!m) return true;
        if (idAllowed(m[1], slide, map)) return true;
        dropped.push({ field: `${where}.gnpd_examples[${j}]`, id: m[1], why: 'product record does not belong to this slide\u2019s trend or region tier' });
        return false;
      });
    }

    return next;
  });

  return { slides: out, dropped };
}