// Turns the deterministic evidence payload from getArchitectEvidence into the
// grounded context block the architect must build from, and reads the chosen
// GNPD record ids back out of the finished deck.

// Fresh open-web signals found by Market Scout. Supplementary only — they may
// sharpen the framing and recency of a slide, but never replace Mintel/GNPD
// evidence and never become product examples.
function buildWebSignalBlock(evidence) {
  const signals = (evidence?.web_signals || [])
    .filter(s => s.is_competitor_content !== true)
    .slice(0, 12);
  if (signals.length === 0) return '';

  const lines = signals.map(s =>
    `  - ${s.title}${s.publisher ? ` (${s.publisher}` : ''}${s.published_date ? `, ${s.published_date})` : s.publisher ? ')' : ''} [${s.region}]${s.scope_label ? ` ${s.scope_label}` : ''}${s.linked_trend_name ? ` → supports: ${s.linked_trend_name}` : ''} — ${String(s.market_signal || '').slice(0, 220)}`
  );

  return [
    '### SUPPLEMENTARY: FRESH WEB SIGNALS (Market Scout)',
    'Recent open-web items, unverified and pending human review. You MAY use them to make the framing more current, and you MUST attribute them to the named publisher when you do. You may NEVER treat them as GNPD product examples, and you may never present them as Mintel data. Any item carrying a "(Note: source region could not be determined …)" label may NOT be presented as evidence about the brief region — if you use it, you must reproduce that label inline.',
    lines.join('\n'),
  ].join('\n');
}

export function buildEvidenceContext(evidence) {
  const trends = evidence?.trends || [];
  if (trends.length === 0) return null;

  const webBlock = buildWebSignalBlock(evidence);

  const trendBlocks = trends.map(t => {
    const lines = [`### [${t.category}] TREND: ${t.trend_name}`];
    lines.push(t.evidence_status === 'signal_only'
      ? `EVIDENCE STATUS: SIGNAL ONLY — ${t.record_count} eligible regional launch${t.record_count === 1 ? '' : 'es'} on record. This trend belongs in the "Signal — not yet evidenced at regional level" section and its slide must state the record count.`
      : `EVIDENCE STATUS: FULL — ${t.record_count} eligible regional launches on record.`);
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

  return webBlock ? `${trendBlocks}\n\n${webBlock}` : trendBlocks;
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