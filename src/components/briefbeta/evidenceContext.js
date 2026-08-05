// Turns the deterministic evidence payload from getArchitectEvidence into the
// grounded context block the architect must build from, and reads the chosen
// GNPD record ids back out of the finished deck.

export function buildEvidenceContext(evidence) {
  const trends = evidence?.trends || [];
  if (trends.length === 0) return null;

  return trends.map(t => {
    const lines = [`### [${t.category}] TREND: ${t.trend_name}`];
    if (t.market_signal) lines.push(`Signal: ${t.market_signal.slice(0, 300)}`);

    const cites = [
      ...(t.sources || []).map(s => {
        const finding = (s.key_findings || [])[0];
        return `  - ${s.title}${s.publisher ? ` (${s.publisher}` : ''}${s.date_published ? `, ${s.date_published})` : s.publisher ? ')' : ''}${finding ? ` — ${finding.slice(0, 220)}` : ''}`;
      }),
      ...(t.inline_citations || []).map(c =>
        `  - ${c.title}${c.publisher ? ` (${c.publisher})` : ''}${c.key_finding ? ` — ${c.key_finding.slice(0, 220)}` : ''}`
      ),
    ];
    lines.push(cites.length ? `Sources you may cite:\n${cites.join('\n')}` : 'Sources you may cite: none on record — do not invent any.');

    const prods = (t.products || []).map(p =>
      `  - ${p.gnpd_record_id} | ${p.product_name}${p.brand ? ` — ${p.brand}` : ''}${p.country ? ` (${p.country})` : ''}${p.launch_date ? `, ${p.launch_date}` : ''}${p.claims?.length ? ` | Claims: ${p.claims.join(', ')}` : ''}`
    );
    lines.push(prods.length ? `GNPD products that support this trend (the ONLY products allowed on its slides):\n${prods.join('\n')}` : 'GNPD products: none found — do not put product examples on this trend\'s slides.');

    return lines.join('\n');
  }).join('\n\n');
}

// Deck entries are written as "<RECORD_ID> | Product — Brand (Country): why".
export function extractRecordIds(slides) {
  const ids = new Set();
  for (const s of slides || []) {
    for (const ex of s.gnpd_examples || []) {
      const m = String(ex).match(/^\s*([A-Za-z0-9._-]{4,})\s*\|/);
      if (m) ids.add(m[1]);
    }
  }
  return [...ids];
}