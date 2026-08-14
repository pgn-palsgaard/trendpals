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
  // Sequential funnel — each step counted on the base entering it, so the numbers balance.
  const excl0 = gate.excluded_by_reason || {};
  lines.push(
    `Evidence funnel — category population: ${gate.population_total}`
    + ` → after region gate: ${gate.after_region_gate} (excluded ${excl0.out_of_region || 0})`
    + ` → after format gate: ${gate.after_category_gate} (excluded ${excl0.out_of_category || 0})`
    + (gate.after_recency_gate !== undefined
      ? ` → after ${gate.recency_months || 30}-month recency window: ${gate.after_recency_gate} (excluded ${excl0.out_of_window || 0})`
      : '')
  );
  lines.push(`Launch window — only products launched within the last ${gate.recency_months || 30} months were considered. The window is fixed and does not widen when the pool is thin.`);
  // What the window ALLOWED vs what the data actually SPANS. A pool covering a
  // single period can show what exists in the market now, but cannot evidence that
  // anything has moved — there is no earlier period to have moved from.
  const dw = gate.data_window;
  if (dw?.earliest_launch && dw?.latest_launch) {
    lines.push(`Actual data window — the product evidence spans ${dw.earliest_launch} to ${dw.latest_launch} (${dw.months_spanned} months), not the full ${gate.recency_months || 30}-month window.`);
    if ((dw.months_spanned || 0) < 12) {
      lines.push(`Temporal caveat — this pool covers a single period. It shows what is on the market within that period; it cannot on its own evidence a shift over time (e.g. "X has become the baseline expectation"). Any such claim in this report rests on the market-intelligence sources, not on the product data.`);
    }
  }
  for (const [label, count] of Object.entries(gate.secondary_counts || {})) {
    lines.push(`Secondary figure (not part of the funnel above) — ${label}: ${count}`);
  }
  for (const t of gate.trend_truncation || []) {
    if (t.omitted > 0) {
      lines.push(`Trend coverage — ${t.active_total} active trends in ${t.category}, ${t.evaluated} assessed, ${t.omitted} omitted: ${t.omitted_names.join('; ')}`);
    } else {
      lines.push(`Trend coverage — all ${t.active_total} active trends in ${t.category} were assessed.`);
    }
  }

  const subCounts = Object.entries(gate.per_subregion_counts || {});
  if (subCounts.length) {
    lines.push(`Records by sub-region: ${subCounts.map(([k, v]) => `${SUBREGION_LABELS[k] || k}: ${v}`).join(' | ')}`);
    const zero = subCounts.filter(([, v]) => v === 0).map(([k]) => SUBREGION_LABELS[k] || k);
    if (zero.length) lines.push(`${zero.join(' and ')} contributed 0 records — the evidence in this report is drawn from the remaining markets only.`);
  }

  const excl = gate.excluded_by_reason || {};
  lines.push(`Records excluded — outside the region allow-list: ${excl.out_of_region || 0} | outside the selected formats: ${excl.out_of_category || 0} | outside the launch window or undated: ${excl.out_of_window || 0}. Excluded records were never shown to the report generator.`);

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