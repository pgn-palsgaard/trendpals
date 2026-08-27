// Gamma-specific deck markdown.
//
// Why this exists separately from buildDeckMarkdown.ts:
// Gamma turns every top-level markdown block (paragraph, bold header line,
// separate list) into its OWN visual box on the card, and every image that sits
// alone on its own line into a full-width figure. Feeding it one bold header
// paragraph + one list per section therefore produced a card built from six
// stacked boxes with over-sized pack shots between them.
//
// So for Gamma we emit, per card:
//   - one heading
//   - at most one lead paragraph (the market signal)
//   - ONE single nested bullet list carrying every section  -> one text box
//   - ONE line holding all pack shots side by side          -> one thumbnail row
import { productNameFromExample, recordIdFromExample } from './productNames.ts';

function imageFor(example, imageMap) {
  const rid = recordIdFromExample(example);
  const url = (rid && imageMap[rid]) || imageMap[productNameFromExample(example).toLowerCase()];
  return url && String(url).startsWith('http') ? String(url) : null;
}

// Group of related lines rendered as a labelled branch of the single list.
function group(label, items) {
  const rows = (items || []).map(i => String(i ?? '').trim()).filter(Boolean);
  if (rows.length === 0) return '';
  if (rows.length === 1) return `- **${label}** — ${rows[0]}\n`;
  return `- **${label}**\n` + rows.map(r => `  - ${r}\n`).join('');
}

export function buildGammaMarkdown(report, imageMap = {}) {
  const parts = [];

  const preHeader = report.generated_by === 'architect' ? 'BETA — draft for review\n\n' : '';
  parts.push(
    `${preHeader}# ${report.title}\n## ${report.category || ''} market intelligence | ${report.region_display_label || report.region || ''}\n*Prepared by Palsgaard*`
  );

  for (const slide of report.slides || []) {
    // Section divider — heading only, so Gamma renders a full-bleed break card.
    if (slide.slide_type === 'section_header') {
      parts.push(`# ${slide.title || slide.slide_name || 'Section'}${slide.subtitle ? `\n## ${slide.subtitle}` : ''}`);
      continue;
    }

    // Agenda — the deck overview list, one box, no images.
    if (slide.slide_type === 'agenda') {
      let a = `## ${slide.title || 'In this report'}\n\n`;
      if (slide.subtitle) a += `*${slide.subtitle}*\n\n`;
      a += (slide.agenda_items || []).map(i => `- ${i}`).join('\n');
      parts.push(a.trim());
      continue;
    }

    if (slide.slide_type === 'methodology') {
      const lines = [
        ...String(slide.market_signal || '').split('\n').filter(Boolean),
        ...(slide.gnpd_examples || []),
      ];
      let m = `## ${slide.title || 'How this report was evidenced'}\n\n`;
      m += lines.map(l => `- ${l}`).join('\n');
      parts.push(m.trim());
      continue;
    }

    if (slide.slide_type === 'implications') {
      let s = `## ${slide.title || 'Strategic implications'}\n\n`;
      s += group('So what for manufacturers', slide.strategic_implications);
      s += group('Where Palsgaard supports', slide.palsgaard_support);
      if (slide.evidence_footer) s += `\n*Sources: ${slide.evidence_footer}*`;
      parts.push(s.trim());
      continue;
    }

    let s = `## ${slide.title || slide.slide_name || 'Slide'}\n\n`;
    if (slide.subtitle) s += `*${slide.subtitle}*\n\n`;
    if (slide.market_signal) s += `${String(slide.market_signal).replace(/\n+/g, ' ')}\n\n`;
    if (slide.hypothesis_tieback) s += `*${slide.hypothesis_tieback}*\n\n`;

    // One contiguous list — no blank lines inside, so Gamma keeps it as a single box.
    let list = '';
    list += group('In this report', slide.agenda_items);
    list += group(
      'Supporting data',
      (slide.supporting_data || []).map(d => `${d.stat || d}${d.source ? ` (${d.source})` : ''}`)
    );
    list += group('Why it may matter', slide.why_it_may_matter ? [slide.why_it_may_matter] : []);
    list += group('Formulation and application questions it raises', slide.formulation_questions);
    list += group('What this creates for manufacturers', (slide.customer_pains || []).map(p => p.pain || p));
    list += group('Market evidence (Mintel GNPD)', slide.gnpd_examples);
    list += group('Conversation openers', slide.conversation_openers);
    s += list;

    // All pack shots on ONE line so Gamma lays them out as a small thumbnail row
    // instead of one full-width figure per image.
    const shots = [];
    for (const g of slide.gnpd_examples || []) {
      const url = imageFor(g, imageMap);
      if (url && !shots.some(x => x.url === url)) shots.push({ url, name: productNameFromExample(g) });
    }
    for (const url of slide.image_placements || []) {
      if (typeof url === 'string' && url.startsWith('http') && !shots.some(x => x.url === url)) {
        shots.push({ url, name: 'product' });
      }
    }
    if (shots.length > 0) {
      s += `\n` + shots.slice(0, 4).map(x => `![${x.name}](${x.url})`).join(' ') + `\n`;
    }

    if (slide.evidence_footer) s += `\n*Sources: ${slide.evidence_footer}*`;

    parts.push(s.trim());
  }

  return parts.join('\n\n---\n\n');
}