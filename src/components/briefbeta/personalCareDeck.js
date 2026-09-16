import { collectCitations } from '@/components/briefbeta/citationMap';
import { citationKey } from '@/components/briefbeta/citationKey';

export const personalCareContract = c => ({ ...c, main_group: 'BSA', report_mode: 'personal_care_trends', categories: ['personal_care'], sub_categories: [], read_across: 'strict_region' });

export function preparePersonalCareDeck(slides, evidence) {
  const citations = new Map(collectCitations(evidence).trends.flatMap(t => t.inline_citations).map(c => [citationKey(`[SRC:${c.id}]`), c]));
  if (!citations.size) throw new Error('No quoted Personal Care report evidence is available.');
  if (!slides.length || !slides.some(s => s.slide_name === 'Global trend overview' || s.evidence_scope === 'global')) throw new Error('A global/context trend overview is required.');
  if (evidence.gate.region_scope !== 'global' && !slides.some(s => s.slide_name === 'Regional trend overview' || s.evidence_scope === 'regional')) throw new Error('The regional overview must show local evidence or an explicit evidence gap.');
  const isRegional = s => s.evidence_scope === 'regional' || s.slide_name === 'Regional trend overview';
  return [...slides].sort((a, b) => Number(isRegional(a)) - Number(isRegional(b))).map((s, i) => {
    if (s.slide_type !== 'trend_overview') throw new Error('Personal Care uses trend overview slides only.');
    const regional = s.evidence_scope === 'regional' || s.slide_name === 'Regional trend overview';
    if (regional && evidence.gate.region_scope === 'global') throw new Error('A worldwide brief does not need a separate regional overview.');
    const items = s.items || [], data = s.supporting_data || [];
    if (items.length > 3 || (!regional && !items.length)) throw new Error('Use one to three trend columns per overview.');
    if (items.length !== data.length) throw new Error('Each trend column needs its own source reference.');
    const sources = data.map(d => {
      const hit = citations.get(citationKey(d.source_id));
      if (!hit || (regional && !hit.regional_allowed)) throw new Error('A trend cites missing evidence or a source outside the requested regional scope.');
      return { source_id: `[SRC:${hit.id}]`, stat: hit.quote, geography: hit.geography, source: `${hit.title}${hit.publisher ? ` (${hit.publisher})` : ''}` };
    });
    if (/palsgaard|\bgnpd\b/i.test(JSON.stringify(items))) throw new Error('Remove Palsgaard and GNPD content from this trends-only report.');
    if (items.some(item => !String(item.title || '').trim() || !String(item.text || '').trim() || item.title.length > 65 || item.text.length > 500)) throw new Error('Each trend needs a title (up to 65 characters) and a summary (up to 500 characters).');
    return { slide_number: i + 1, category: 'personal_care', slide_type: 'trend_overview', slide_name: regional ? 'Regional trend overview' : 'Global trend overview', preheader: regional ? 'PERSONAL CARE | REGIONAL TRENDS' : 'PERSONAL CARE | GLOBAL TRENDS', title: s.title || (regional ? 'Regional trend overview' : 'Global trend overview'), subtitle: 'AI synthesis of uploaded research — not official Mintel trend labels', items: items.map(item => ({ title: item.title, text: item.text })), supporting_data: sources, market_signal: regional && !items.length ? `No regional evidence is cited for ${evidence.gate.region_text} in this overview. Global context is not presented as regional proof.` : '', evidence_footer: [...new Set(sources.map(d => d.source))].join('; ') || 'Regional evidence gap — no supporting source cited' };
  });
}

export function personalCareMethodology(gate) {
  return { slide_type: 'methodology', slide_name: 'Methodology', title: 'How this trend overview was evidenced', market_signal: `Direct synthesis from ${gate.source_count} approved BSA research reports and ${gate.excerpt_count} promoted, quoted excerpts. No trends were added to the trend library.\nPublication window: last ${gate.recency_months} months. Undated and future-dated reports excluded.\nRequested geography: ${gate.region_text}. Global context is kept distinct from explicitly regional source material; gaps remain visible.\nGNPD launch exports, Food sources and Palsgaard capability documents were not used. Trend headings are AI synthesis, not official Mintel trend labels.` };
}