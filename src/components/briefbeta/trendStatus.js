// Build B — computed render-states.
//
// evidence_status, record counts and the signal annotation are DATA, not prose.
// They are derived here from the frozen evidence snapshot, persisted on the
// report, and stamped by the renderers (SlideCanvas + BUILD_DECK_PY). The
// architect no longer writes them, exactly as it no longer writes citations (A)
// or the cross-region provenance line (C).

// { <trend_id>: { evidence_status, record_count, read_across_status, read_across_count } }
export function buildTrendStatus(evidence) {
  const map = {};
  for (const t of evidence?.trends || []) {
    if (!t.trend_id) continue;
    map[t.trend_id] = {
      evidence_status: t.evidence_status || 'full',
      record_count: Number(t.record_count ?? (t.products || []).length ?? 0),
      read_across_status: t.read_across_status || 'none',
      read_across_count: (t.read_across_products || []).length,
    };
  }
  return map;
}

export function signalAnnotation(status) {
  if (!status || status.evidence_status !== 'signal_only') return '';
  const n = Number(status.record_count || 0);
  return `Signal — ${n} regional launch${n === 1 ? '' : 'es'} on record`;
}

// The one place that decides whether a slide carries the annotation. A
// cross-region slide already carries C's provenance label and gets no second
// stamp; dividers and the methodology appendix carry none.
export function annotationForSlide(slide, trendStatus) {
  if (!slide || slide.slide_type === 'section_header' || slide.slide_type === 'methodology') return '';
  if (String(slide.evidence_class || '') === 'read_across') return '';
  return signalAnnotation((trendStatus || {})[String(slide.trend_id || '')]);
}