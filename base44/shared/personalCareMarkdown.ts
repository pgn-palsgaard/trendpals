// One overview card per slide; each heading/paragraph pair is a trend column.
export function personalCareMarkdown(report) {
  return [`# ${report.title}\n\nPersonal Care | ${report.region_display_label || report.region || ''}`, ...(report.slides || []).map(s => {
    const lines = [s.preheader || '', `## ${s.title || s.slide_name}`, s.subtitle || '', s.market_signal || ''];
    (s.items || []).forEach((item, i) => {
      const source = s.supporting_data?.[i];
      lines.push(`### ${item.title}`, item.text);
      if (source) lines.push(`*Source: ${source.source || ''} | ${source.geography || ''}*`, `> ${source.stat || ''}`);
    });
    if (s.evidence_footer && !s.items?.length) lines.push(`*${s.evidence_footer}*`);
    return lines.filter(Boolean).join('\n\n');
  })].join('\n\n---\n\n');
}