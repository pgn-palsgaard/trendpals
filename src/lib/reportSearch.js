// Builds one flat, lowercased text blob per report so the library can search
// inside the actual slide content — not just titles.
export function reportSearchText(report) {
  const parts = [
    report.title, report.category, report.region, report.executive_summary,
    ...(report.selected_trends || []),
  ];

  for (const s of report.slides || []) {
    parts.push(s.title, s.subtitle, s.slide_name, s.market_signal, s.evidence_footer);
    for (const p of s.customer_pains || []) parts.push(p.pain, p.palsgaard_angle);
    for (const d of s.supporting_data || []) parts.push(d.stat, d.source, d.geography);
    parts.push(...(s.gnpd_examples || []), ...(s.conversation_openers || []));
  }

  for (const e of report.evidence_pack || []) parts.push(e.signal, e.capability_area);
  for (const p of report.product_shortlist || []) parts.push(p.product_name, p.brand, p.company);

  return parts.filter(Boolean).join(' \u00b7 ').toLowerCase();
}

// Returns a short excerpt around the first match, for the result card.
export function matchSnippet(text, query) {
  const i = text.indexOf(query.toLowerCase());
  if (i === -1) return null;
  const start = Math.max(0, i - 60);
  return (start > 0 ? '…' : '') + text.slice(start, i + query.length + 90).trim() + '…';
}

// Any downloadable deck file, regardless of which generator produced it.
export function reportFiles(report) {
  const pptx = report.final_pptx_url || report.claude_pptx_url || report.gamma_pptx_url;
  const pdf = report.final_pdf_url || report.gamma_pdf_url;
  return { pptx, pdf };
}