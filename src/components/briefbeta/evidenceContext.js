import { coveredRegionLabel } from './coveredRegion';
import { collectCitations } from './citationMap';
import { CROSS_REGION_DIVIDER_TITLE, SIGNAL_DIVIDER_TITLE } from './readAcross';

// Turns the deterministic evidence payload from getArchitectEvidence into the
// grounded context block the architect must build from, and reads the chosen
// GNPD record ids back out of the finished deck.
//
// Every citable item is shown with a copyable id tag — [SRC:…] for sources and
// inline citations, [WEB:…] for web signals — exactly as GNPD products have
// always been shown with their record id. The architect selects an id from a
// closed set; it never writes a citation string. Suppression and id minting live
// in collectCitations() so the shown set and the frozen citation map are the
// same set (see citationMap.js).

function buildWebSignalBlock(webSignals) {
  if (webSignals.length === 0) return '';

  const lines = webSignals.map(s =>
    `  - [WEB:${s.id}] ${s.title}${s.publisher ? ` (${s.publisher}` : ''}${s.published_date ? `, ${s.published_date})` : s.publisher ? ')' : ''} [${s.region}]${s.scope_label ? ` ${s.scope_label}` : ''}${s.linked_trend_name ? ` → supports: ${s.linked_trend_name}` : ''} — ${String(s.market_signal || '').slice(0, 220)}`
  );

  return [
    '### SUPPLEMENTARY: FRESH WEB SIGNALS (Market Scout)',
    'Recent open-web items, unverified and pending human review. You MAY use them to make the framing more current. Cite one only by copying its [WEB:…] tag verbatim into source_id — never write a citation string yourself. You may NEVER treat them as GNPD product examples, and you may never present them as Mintel data. Any item carrying a "(Note: source region could not be determined …)" label may NOT be presented as evidence about the brief region — if you use it, you must reproduce that label inline.',
    lines.join('\n'),
  ].join('\n');
}

// Phase 2 — headers must carry the covered scope, not the requested one.
// The gap itself is stated only on the methodology slide (added by the system).
function buildRegionLabelBlock(evidence) {
  const gate = evidence?.gate;
  if (!gate || gate.region_scope === 'global') return '';
  const covered = coveredRegionLabel(gate);
  if (!covered) return '';
  const diag = gate.subregion_diagnosis || [];
  const hasGap = diag.some(d => d.rendered === 0);
  return [
    '### REGION LABELLING (hard rule)',
    `Rendered product evidence covers: ${covered}.`
      + (hasGap && gate.region_text ? ` The brief requested "${gate.region_text}", but the other sub-regions contributed zero rendered records.` : ''),
    `Every title, subtitle and section header that names a geography must say "${covered}" — never the requested scope when the two differ. Do NOT state the requested-vs-covered gap on content slides; the system states it once, on the methodology slide.`,
  ].join('\n');
}

// The deck's trend set is decided deterministically by retrieval (evidence strength
// ranked, driver cap applied as a ceiling) — never by the architect. Same brief,
// same trends, same count, same order.
function buildSelectionBlock(trends) {
  const selected = trends.filter(t => t.deck_selected !== false);
  if (selected.length === 0) return '';
  const list = selected.map((t, i) => `  ${i + 1}. ${t.trend_name} (trend_id: ${t.trend_id})`);
  return [
    '### TREND SELECTION (system-owned — you do not choose)',
    `Build a trend slide (plus its paired implications slide) for EXACTLY these ${selected.length} trends, in this order:`,
    list.join('\n'),
    'You may not add a trend, skip a trend, reorder them, merge two into one slide, or change how many there are. Any other trend shown below is context only and gets no slide.',
  ].join('\n');
}

export function buildEvidenceContext(evidence) {
  const { trends, webSignals } = collectCitations(evidence);
  if (trends.length === 0) return null;

  const selectionBlock = buildSelectionBlock(trends);
  const regionBlock = buildRegionLabelBlock(evidence);
  const webBlock = buildWebSignalBlock(webSignals);

  const trendBlocks = trends.map(t => {
    const lines = [`### [${t.category}] TREND: ${t.trend_name}`];
    lines.push(`TREND ID (copy into every slide built on this trend): ${t.trend_id}`);
    // Build B (narrative) — the driver is the deck's grouping axis. Trends arrive
    // pre-sorted by driver; the label is shown so the architect can group and
    // name the sections without inventing a taxonomy.
    lines.push(`PRIMARY DRIVER: ${t.mega_trend || 'Uncategorised'}`);
    // Build B — the status is shown so the architect knows which TIER the trend
    // belongs to (placement stays architect-owned). The record count is NOT its
    // to write: the renderer stamps that annotation from the frozen trend status.
    lines.push(t.evidence_status === 'signal_only'
      ? `EVIDENCE STATUS: SIGNAL ONLY — this trend belongs in the "${SIGNAL_DIVIDER_TITLE}" section. Never state the launch count in the slide text; the system stamps it.`
      : 'EVIDENCE STATUS: FULL.');
    if (t.market_signal) lines.push(`Signal: ${t.market_signal.slice(0, 300)}`);

    const cites = [
      ...t.sources.map(s => {
        const finding = (s.key_findings || [])[0];
        return `  - [SRC:${s.id}] ${s.title}${s.publisher ? ` (${s.publisher}` : ''}${s.date_published ? `, ${s.date_published})` : s.publisher ? ')' : ''}${finding ? ` — ${finding.slice(0, 220)}` : ''}`;
      }),
      ...t.inline_citations.map(c =>
        `  - [SRC:${c.id}] ${c.title}${c.publisher ? ` (${c.publisher})` : ''}${c.key_finding ? ` — ${c.key_finding.slice(0, 220)}` : ''}`
      ),
    ];
    lines.push(cites.length
      ? `Sources you may cite — cite one ONLY by copying its [SRC:…] tag verbatim into source_id, and never write a citation string yourself:\n${cites.join('\n')}`
      : 'Sources you may cite: none on record — do not invent any.');

    const prods = (t.products || []).map(p =>
      `  - ${p.gnpd_record_id} | ${p.product_name}${p.brand ? ` — ${p.brand}` : ''}${p.country ? ` (${p.country})` : ''}${p.launch_date ? `, ${p.launch_date}` : ''}${p.claims?.length ? ` | Claims: ${p.claims.join(', ')}` : ''}`
    );
    lines.push(prods.length ? `GNPD products that support this trend (the ONLY products allowed on its slides):\n${prods.join('\n')}` : 'GNPD products: none found — do not put product examples on this trend\'s slides.');

    // Build C — cross-region reference tier, shown as its OWN block after the
    // regional one. Never inside the regional product list: the reader (and the
    // architect) must always know which evidence class they are looking at.
    if (t.read_across_status === 'full' && (t.read_across_products || []).length > 0) {
      const ra = t.read_across_products.map(p =>
        `  - ${p.gnpd_record_id} | ${p.product_name}${p.brand ? ` — ${p.brand}` : ''}${p.country ? ` (${p.country})` : ''}${p.launch_date ? `, ${p.launch_date}` : ''}${p.claims?.length ? ` | Claims: ${p.claims.join(', ')}` : ''}`
      );
      lines.push([
        `CROSS-REGION REFERENCE for this trend (NOT ${coveredRegionLabel(evidence?.gate) || 'brief-region'} evidence). A slide using these MUST set evidence_class: "read_across" and may carry NO regional examples. Each is a real launch from another market:`,
        ra.join('\n'),
      ].join('\n'));
    }

    return lines.join('\n');
  }).join('\n\n');

  const hasReadAcross = trends.some(t => t.read_across_status === 'full' && (t.read_across_products || []).length > 0);
  const readAcrossRules = hasReadAcross ? [
    '### CROSS-REGION REFERENCE (hard rules)',
    `A slide is EITHER regional OR cross-region — never both. Cross-region products may appear ONLY on a slide with "evidence_class": "read_across", and such a slide may carry NO regional examples; a regional slide may carry no cross-region products. Cross-region slides belong in their own section at the end of the category, under a divider titled exactly "${CROSS_REGION_DIVIDER_TITLE}".`,
    'Do NOT write a cross-region, read-across or provenance sentence anywhere in the slide text: the system stamps that label itself. Set the flag and write the observation.',
  ].join('\n') : '';

  return [selectionBlock, regionBlock, trendBlocks, readAcrossRules, webBlock].filter(Boolean).join('\n\n');
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