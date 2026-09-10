import { presentSlide, narrativeSections, itemText } from '@/components/briefbeta/reportPresentation';
import { buildToplines } from '@/components/briefbeta/slideTopline';
import { annotationForSlide } from '@/components/briefbeta/trendStatus';

const cell = value => String(value ?? '').replace(/\|/g, '\\|').replace(/\r?\n/g, '<br>');
export function buildReportMarkdown(report) {
  const lines = [`# ${report.title || 'Report'}`, '', [report.category, report.region_display_label || report.region].filter(Boolean).join(' · '), ''];
  const toplines = buildToplines(report.slides || []);
  (report.slides || []).forEach((raw, index) => {
    const s = presentSlide(raw, report.evidence_bindings);
    lines.push('---', '', `## ${index + 1}. ${s.title || s.slide_name || 'Slide'}`, '', s.preheader || toplines[index], '');
    const paragraph = text => { if (text) lines.push(String(text), ''); };
    const list = (label, items) => { if (items?.length) { if (label) lines.push(`### ${label}`, ''); items.forEach(item => lines.push(`- ${itemText(item)}`)); lines.push(''); } };
    paragraph(s.subtitle); paragraph(s.provenance_label); paragraph(annotationForSlide(s, report.trend_status));
    paragraph(s.prepared_for && `Prepared for: ${s.prepared_for}`); paragraph(s.market_signal); paragraph(s.hypothesis_tieback);
    narrativeSections.forEach(([key, label]) => list(label || s.bullets_header, s[key]));
    if (s.why_it_may_matter) { lines.push('### Why it may matter', ''); paragraph(s.why_it_may_matter); }
    list('Customer challenges', (s.customer_pains || []).map(p => [p.pain, p.palsgaard_angle].filter(Boolean).join(' — ')));
    if (s.columns?.length) {
      lines.push(`| ${s.columns.map(cell).join(' | ')} |`, `| ${s.columns.map(() => '---').join(' | ')} |`);
      (s.rows || []).forEach(row => lines.push(`| ${s.columns.map((_, i) => cell(row[i])).join(' | ')} |`)); lines.push('');
    }
    paragraph(s.so_what);
    (s.items || []).forEach(item => { lines.push(`### ${item.title || ''}`, ''); paragraph(item.text); });
    list('So what for manufacturers?', s.strategic_implications); list('Where Palsgaard supports', s.palsgaard_support);
    list('Product evidence', (s.gnpd_examples || []).map(example => {
      const id = String(example).match(/^\s*(\d+)\s*\|/)?.[1];
      const product = (report.product_shortlist || []).find(p => id && String(p.gnpd_record_id) === id);
      return product ? `${[product.product_name, product.brand, product.country, product.launch_date].filter(Boolean).join(' · ')} — ${example}` : example;
    }));
    if (s.supporting_data?.length) {
      lines.push('### Supporting evidence', '');
      s.supporting_data.forEach((d, i) => lines.push(`- ${d.stat}${d.geography ? ` (${d.geography})` : ''}${d.source ? `[^s${index + 1}-${i + 1}]` : ''}`));
      lines.push('');
      s.supporting_data.forEach((d, i) => { if (d.source) lines.push(`[^s${index + 1}-${i + 1}]: ${d.source}`); }); lines.push('');
    }
    paragraph(s.evidence_footer && `Sources: ${s.evidence_footer}`);
  });
  return lines.join('\n');
}