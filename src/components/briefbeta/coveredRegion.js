// Phase 2 — region labels for titles, pre-headers and section headers are
// derived from the sub-regions that actually rendered >= 1 product, never from
// the brief's requested scope. This is not silent relabelling: the requested-
// vs-covered gap is stated once, in full, on the methodology slide.

const HEADER_LABELS = {
  europe: 'Europe',
  turkey: 'Turkey',
  cis: 'CIS countries',
  aspac: 'ASPAC',
  americas: 'Americas',
  imea: 'IMEA',
  named_countries: 'Selected markets',
};

// Sub-regions whose products actually reached the evidence set.
export function coveredSubregions(gate) {
  if (!gate) return [];
  const diag = gate.subregion_diagnosis || [];
  if (diag.length) return diag.filter(d => d.rendered > 0).map(d => d.subregion);
  return Object.entries(gate.rendered_per_subregion || {})
    .filter(([, n]) => n > 0)
    .map(([k]) => k);
}

// Header label for the report — e.g. 'Europe' when Turkey and CIS rendered 0.
export function coveredRegionLabel(gate) {
  if (!gate) return '';
  if (gate.region_scope === 'global') return 'Global';
  const covered = coveredSubregions(gate);
  if (covered.length === 0) return '';
  return covered.map(k => HEADER_LABELS[k] || k).join(', ');
}