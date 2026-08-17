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
    `${preHeader}# ${report.title}\n## ${report.category || ''} market intelligence | ${report.region || ''}\n*Prepared by Palsgaard*`
  );

  for (const slide of report.slides || []) {
    // Category section divider — its own card so exports render a full-bleed break slide.
    if (slide.slide_type === 'section_header') {
      parts.push(`# ${slide.title || slide.slide_name || 'Section'}${slide.subtitle ? `\n## ${slide.subtitle}` : ''}`);
      continue;
    }

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
        if (url) s += `\n  ![${productNameFromExample(g)}](${url})\n\n`;
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