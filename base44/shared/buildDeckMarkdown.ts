// Turns a saved Report's slide array into deck markdown.
// One "---" separated block per slide, so exports keep a 1:1 slide mapping.
// imageMap: { [lowercased product name]: image_url } resolved from GNPDProduct.
export { productNameFromExample, recordIdFromExample } from './productNames.ts';
import { productNameFromExample, recordIdFromExample } from './productNames.ts';

export function buildDeckMarkdown(report, imageMap = {}) {
  const parts = [];

  // BETA marker renders as a pre-header line, never inside the title string —
  // prefixes consume front-page title budget (see skill Content Budgets).
  const preHeader = report.generated_by === 'architect' ? 'BETA — draft for review\n\n' : '';
  parts.push(
    `${preHeader}# ${report.title}\n## ${report.category || ''} market intelligence | ${report.region_display_label || report.region || ''}\n*Prepared by Palsgaard*`
  );

  for (const slide of report.slides || []) {
    // Category section divider — its own card so exports render a full-bleed break slide.
    if (slide.slide_type === 'section_header') {
      parts.push(`# ${slide.title || slide.slide_name || 'Section'}${slide.subtitle ? `\n## ${slide.subtitle}` : ''}`);
      continue;
    }

    // Agenda — the deck overview list between opening and first divider.
    if (slide.slide_type === 'agenda') {
      let a = `## ${slide.title || 'In this report'}\n`;
      if (slide.subtitle) a += `### ${slide.subtitle}\n`;
      a += `\n**In this report**\n\n`;
      for (const item of slide.agenda_items || []) a += `- ${item}\n`;
      parts.push(a.trim());
      continue;
    }

    // Methodology is a real slide, not an appendix: its market_signal holds one
    // statement per line — rendered as bullets so the skill builds a dense list
    // slide instead of compressing a wall of text.
    if (slide.slide_type === 'methodology') {
      let m = `## ${slide.title || 'How this report was evidenced'}\n`;
      if (slide.subtitle) m += `### ${slide.subtitle}\n\n`;
      m += `**Methodology — render every line below, no summarisation**\n\n`;
      for (const line of String(slide.market_signal || '').split('\n').filter(Boolean)) {
        m += `- ${line}\n`;
      }
      for (const g of slide.gnpd_examples || []) m += `- ${g}\n`;
      parts.push(m.trim());
      continue;
    }

    // Overview / synthesis table slide.
    if (slide.slide_type === 'table') {
      let t = `## ${slide.title || 'Overview'}\n`;
      if (slide.preheader) t += `### ${slide.preheader}\n\n`;
      const cols = slide.columns || [];
      if (cols.length > 0) {
        t += `| ${cols.join(' | ')} |\n| ${cols.map(() => '---').join(' | ')} |\n`;
        for (const row of slide.rows || []) t += `| ${(row || []).join(' | ')} |\n`;
        t += `\n`;
      }
      if (slide.so_what) t += `**So what?** ${slide.so_what}\n\n`;
      if (slide.evidence_footer) t += `*Sources: ${slide.evidence_footer}*\n`;
      parts.push(t.trim());
      continue;
    }

    // Strategic imperatives — three numbered columns.
    if (slide.slide_type === 'imperatives') {
      let p = `## ${slide.title || 'Strategic imperatives'}\n`;
      if (slide.preheader) p += `### ${slide.preheader}\n\n`;
      (slide.items || []).forEach((item, i) => {
        p += `**${String(i + 1).padStart(2, '0')} ${item.title || ''}**\n\n${item.text || ''}\n\n`;
      });
      if (slide.evidence_footer) p += `*Sources: ${slide.evidence_footer}*\n`;
      parts.push(p.trim());
      continue;
    }

    // Strategic implications — two boxed lists, no product evidence.
    if (slide.slide_type === 'implications') {
      let im = `## ${slide.title || 'Strategic implications'}\n`;
      if (slide.preheader) im += `### ${slide.preheader}\n\n`;
      if ((slide.strategic_implications || []).length > 0) {
        im += `**So what for manufacturers?**\n\n`;
        for (const line of slide.strategic_implications) im += `- ${line}\n`;
        im += `\n`;
      }
      if ((slide.palsgaard_support || []).length > 0) {
        im += `**Where Palsgaard supports**\n\n`;
        for (const line of slide.palsgaard_support) im += `- ${line}\n`;
        im += `\n`;
      }
      if (slide.evidence_footer) im += `*Sources: ${slide.evidence_footer}*\n`;
      parts.push(im.trim());
      continue;
    }

    let s = `## ${slide.title || slide.slide_name || 'Slide'}\n`;
    if (slide.preheader) s += `### ${slide.preheader}\n\n`;
    else if (slide.subtitle) s += `### ${slide.subtitle}\n\n`;
    if (slide.market_signal) s += `${slide.market_signal}\n\n`;

    if ((slide.bullets || []).length > 0) {
      s += `**${slide.bullets_header || "What's happening"}**\n\n`;
      for (const b of slide.bullets) s += `- ${b}\n`;
      s += `\n`;
    }
    if (slide.hypothesis_tieback) s += `*${slide.hypothesis_tieback}*\n\n`;

    if ((slide.agenda_items || []).length > 0) {
      s += `**In this report**\n\n`;
      for (const item of slide.agenda_items) s += `- ${item}\n`;
      s += `\n`;
    }

    if ((slide.supporting_data || []).length > 0) {
      s += `**Supporting data**\n\n`;
      for (const d of slide.supporting_data) {
        s += `- ${d.stat || d}${d.source ? ` *(${d.source})*` : ''}\n`;
      }
      s += `\n`;
    }

    if (slide.why_it_may_matter) {
      s += `**Why it may matter**\n\n${slide.why_it_may_matter}\n\n`;
    }

    if ((slide.formulation_questions || []).length > 0) {
      s += `**Formulation and application questions it raises**\n\n`;
      for (const q of slide.formulation_questions) s += `- ${q}\n`;
      s += `\n`;
    }

    if ((slide.customer_pains || []).length > 0) {
      s += `**What this creates for manufacturers**\n\n`;
      for (const p of slide.customer_pains) s += `- ${p.pain || p}\n`;
      s += `\n`;
    }

    if ((slide.gnpd_examples || []).length > 0) {
      s += `**Market evidence (Mintel GNPD)**\n\n`;
      for (const g of slide.gnpd_examples) {
        s += `- ${g}\n`;
        // Record ID first — it is the key the resolver is confident about.
        const rid = recordIdFromExample(g);
        const url = (rid && imageMap[rid]) || imageMap[productNameFromExample(g).toLowerCase()];
        // Phase 5 — explicit image-to-slot contract. A http value is an inline
        // image (Gamma). A bare filename is an uploaded pack shot that must be
        // placed in THIS bullet's slot and nowhere else (Claude skill).
        if (url && String(url).startsWith('http')) s += `\n  ![${productNameFromExample(g)}](${url})\n\n`;
        else if (url) s += `  [IMAGE SLOT: ${url}]\n`;
      }
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