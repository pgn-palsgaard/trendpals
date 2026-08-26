// One consistent topline (preheader) for every slide in the deck preview.
// Mirrors the PPTX renderer's rule: a trend slide and its implications slide share
// the same TREND NN | THEME stem, so the deck reads as one document instead of
// alternating between "SLIDE 3" and "TREND 01 | … | STRATEGIC IMPLICATIONS".

function stem(preheader) {
  const parts = String(preheader || '').split('|').map(p => p.trim()).filter(Boolean);
  // Drop the trailing "STRATEGIC IMPLICATIONS" segment, keep TREND NN | THEME.
  return parts.slice(0, 2).join('  |  ');
}

export function buildToplines(slides) {
  const list = Array.isArray(slides) ? slides : [];
  // trend_id → the TREND NN | THEME stem, taken from that trend's implications slide.
  const stems = {};
  for (const s of list) {
    if (s?.slide_type !== 'implications') continue;
    const key = String(s.trend_id || '');
    const value = stem(s.preheader);
    if (key && value && !stems[key]) stems[key] = value;
  }

  return list.map(s => {
    const type = s?.slide_type || 'content';
    if (type === 'implications') {
      const base = stems[String(s.trend_id || '')] || 'Strategic implications';
      return `${base}  |  STRATEGIC IMPLICATIONS`;
    }
    if (type === 'section_header') return 'SECTION';
    if (type === 'methodology') return 'APPENDIX  |  METHODOLOGY';
    if (type === 'briefing_context') return 'ABOUT THIS REPORT';
    const trendStem = stems[String(s?.trend_id || '')];
    if (trendStem) return `${trendStem}  |  MARKET SIGNAL`;
    return 'MARKET INTELLIGENCE';
  });
}