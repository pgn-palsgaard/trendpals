// Turns a saved Report's slide array into the markdown Gamma generates from.
// One "---" separated block per slide, so Gamma keeps a 1:1 slide mapping.
export function buildDeckMarkdown(report) {
  const parts = [];

  parts.push(
    `# ${report.title}\n## ${report.category || ''} market intelligence | ${report.region || ''}\n*Prepared by Palsgaard*`
  );

  for (const slide of report.slides || []) {
    let s = `## ${slide.title || slide.slide_name || 'Slide'}\n`;
    if (slide.subtitle) s += `### ${slide.subtitle}\n\n`;
    if (slide.market_signal) s += `${slide.market_signal}\n\n`;

    if ((slide.supporting_data || []).length > 0) {
      s += `**Supporting data**\n\n`;
      for (const d of slide.supporting_data) {
        s += `- ${d.stat || d}${d.source ? ` *(${d.source})*` : ''}\n`;
      }
      s += `\n`;
    }

    if ((slide.customer_pains || []).length > 0) {
      s += `**What this creates for manufacturers**\n\n`;
      for (const p of slide.customer_pains) s += `- ${p.pain || p}\n`;
      s += `\n`;
    }

    if ((slide.gnpd_examples || []).length > 0) {
      s += `**Market evidence (Mintel GNPD)**\n\n`;
      for (const g of slide.gnpd_examples) s += `- ${g}\n`;
      s += `\n`;
    }

    if ((slide.image_placements || []).length > 0) {
      for (const url of slide.image_placements) {
        if (typeof url === 'string' && url.startsWith('http')) s += `![product](${url})\n`;
      }
      s += `\n`;
    }

    if ((slide.conversation_openers || []).length > 0) {
      s += `**Conversation openers**\n\n`;
      for (const q of slide.conversation_openers) s += `- ${q}\n`;
      s += `\n`;
    }

    if (slide.evidence_footer) s += `*Sources: ${slide.evidence_footer}*\n`;

    parts.push(s.trim());
  }

  return parts.join('\n\n---\n\n');
}