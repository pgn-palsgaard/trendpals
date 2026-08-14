// Builds the methodology appendix slide appended to every beta report, so the
// requester can see the gap between what they asked for and what the data can
// actually evidence.

const SUBREGION_LABELS = {
  europe: 'European markets',
  turkey: 'Turkey',
  cis: 'CIS countries',
  aspac: 'ASPAC markets',
  americas: 'Americas markets',
  imea: 'IMEA markets',
  named_countries: 'Individually named countries',
};

const NARROW_FORMAT_NOTES = {
  'Cakes, Pastries & Sweet Goods': 'Evidence is drawn from the GNPD bucket "Cakes, Pastries & Sweet Goods", which also contains pastry and viennoiserie. The data cannot distinguish cake from pastry.',
  'Sweet Biscuits/Cookies': 'Evidence is drawn from "Sweet Biscuits/Cookies" — biscuits and cookies are one bucket in the data.',
  'Bread & Bread Products': 'Evidence is drawn from "Bread & Bread Products", which spans loaf, rolls and flatbread without separation.',
};

export function buildMethodologySlide({ gate, contract, exclusions, validatorFlags }) {
  if (!gate) return null;

  const lines = [];
  lines.push(`Brief as received — region: "${gate.region_text || '—'}" | formats: ${(gate.sub_categories || []).join(', ') || 'all'} | audience: ${contract?.audience || '—'} | read-across: ${contract?.read_across || 'strict_region'} | intended use: ${contract?.intended_use || '—'}`);
  lines.push(`Resolved country allow-list (${(gate.country_allow_list || []).length} markets): ${(gate.country_allow_list || []).join(', ') || 'global scope'}`);
  lines.push(`Eligible GNPD pool — after region gate: ${gate.after_region_gate} | after format gate: ${gate.after_category_gate}`);

  const subCounts = Object.entries(gate.per_subregion_counts || {});
  if (subCounts.length) {
    lines.push(`Records by sub-region: ${subCounts.map(([k, v]) => `${SUBREGION_LABELS[k] || k}: ${v}`).join(' | ')}`);
    const zero = subCounts.filter(([, v]) => v === 0).map(([k]) => SUBREGION_LABELS[k] || k);
    if (zero.length) lines.push(`${zero.join(' and ')} contributed 0 records — the evidence in this report is drawn from the remaining markets only.`);
  }

  const excl = gate.excluded_by_reason || {};
  lines.push(`Records excluded — outside the region allow-list: ${excl.out_of_region || 0} | outside the selected formats: ${excl.out_of_category || 0}. Excluded records were never shown to the report generator.`);

  if ((gate.downgraded_trends || []).length) {
    lines.push(`Downgraded to "Signal — not yet evidenced at regional level": ${gate.downgraded_trends.map(t => `${t.trend_name} (${t.record_count} record${t.record_count === 1 ? '' : 's'})`).join('; ')}`);
  }
  if ((gate.dropped_trends || []).length) {
    lines.push(`Trends dropped for zero regional evidence: ${gate.dropped_trends.map(t => t.trend_name).join('; ')}`);
  }

  for (const sub of gate.sub_categories || []) {
    if (NARROW_FORMAT_NOTES[sub]) lines.push(`Granularity note — ${NARROW_FORMAT_NOTES[sub]}`);
  }

  if ((validatorFlags || []).length) {
    lines.push(`Flagged for human review: ${validatorFlags.slice(0, 6).map(f => `${f.rule} — ${f.why}`).join(' | ')}`);
  }

  const sampleExclusions = (exclusions || []).slice(0, 8)
    .map(e => `${e.gnpd_record_id} (${e.country}, ${e.sub_category}) — ${e.reason}`);

  return {
    slide_name: 'Methodology',
    slide_type: 'methodology',
    title: 'How this report was evidenced',
    subtitle: 'Brief constraints applied as hard filters before any analysis was written',
    market_signal: lines.join('\n'),
    gnpd_examples: sampleExclusions.length ? [`Examples of excluded records: ${sampleExclusions.join(' | ')}`] : [],
  };
}