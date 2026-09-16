import { resolveAllowList } from './regionTaxonomy.ts';

// Read approved BSA research, not the Food taxonomy or GNPD launch exports.
export async function personalCareEvidence(base44, body, recencyMonths) {
  const excluded = Array.isArray(body.excluded_countries) ? body.excluded_countries : [];
  const resolved = resolveAllowList(body.region_text, excluded);
  if (resolved.scope !== 'global' && !resolved.countries.length) return { error: 'region_unresolved', message: 'Please specify known regions, countries, or Global.' };
  const sources = [];
  for (let skip = 0; ; skip += 50) {
    const page = await base44.entities.Source.filter({ main_group: 'BSA', review_status: 'approved', source_type: { $in: ['mintel', 'market_intel'] }, visibility: { $in: [null, 'org_shared'] }, is_archived: { $ne: true } }, 'id', 50, skip);
    sources.push(...page);
    if (page.length < 50) break;
    if (sources.length >= 500) throw new Error('Too many BSA reports to read in one request; narrow the source library.');
  }
  const now = new Date(), cutoff = new Date();
  cutoff.setMonth(cutoff.getMonth() - recencyMonths);
  const allowed = new Set(resolved.countries.map(c => c.toLowerCase()));
  const denied = new Set(excluded.map(c => String(c).toLowerCase()));
  const aliases = { north_america: 'North America', latam: 'Latin America', europe: 'Europe', aspac: 'ASPAC', sub_saharan_africa: 'Africa', mena: 'MENA' };
  const trends = [], excerpts = [];
  for (const s of sources) {
    if (s.usage_permission === 'forbidden' || s.allowed_use === 'forbidden' || /\bGNPD\b|monitoring new product/i.test(s.title || '')) continue;
    const date = s.date_published || s.date;
    if (!date || !Number.isFinite(Date.parse(date)) || new Date(date) < cutoff || new Date(date) > now) continue;
    const citations = [];
    (s.excerpts || []).forEach((e, i) => {
      if (e.promotion_status !== 'promoted' || !e.source_quote?.trim()) return;
      const text = String(e.source_quote).trim();
      // Older extracts carry Food category labels even on beauty reports. Do not rewrite them.
      if (!/beauty|personal care|skin|cosmetic|hair|fragrance|make.?up|sun.?care|body care/i.test(`${s.title} ${text}`)) return;
      if (/\b(food|drink|beverage|bakery|dairy|ice cream)\b/i.test(text) && !/beauty|skin|cosmetic|hair/i.test(text)) return;
      const regions = (e.regions || []).map(r => aliases[r] || r);
      const geography = regions.join(', ') || (s.region_code === 'Global' ? 'Global report context' : s.region_code || 'Geography not specified');
      const countries = resolveAllowList(regions.join(', ') || s.region_code || '').countries;
      if (countries.some(c => denied.has(c.toLowerCase()))) return;
      const regional = regions.length > 0 || (s.region_code && s.region_code !== 'Global');
      const regionalAllowed = regional && countries.length > 0 && countries.every(c => allowed.has(c.toLowerCase()));
      if (regional && resolved.scope !== 'global' && !regionalAllowed) return;
      const citation = { id: `EXCERPT:${s.id}:${i}`, source_id: s.id, title: `${s.title}${date ? ` (${date})` : ''}${e.page_ref ? `, p. ${e.page_ref}` : ''}`, publisher: s.publisher || '', key_finding: text, quote: text, geography, scope: regional ? 'regional' : s.region_code === 'Global' ? 'global' : 'unscoped', regional_allowed: regionalAllowed };
      citations.push(citation); excerpts.push(citation);
    });
    if (citations.length) trends.push({ trend_name: s.title, category: 'personal_care', sources: [{ id: s.id, title: s.title, publisher: s.publisher || '', date_published: date }], inline_citations: citations, products: [] });
  }
  return { success: excerpts.length > 0, mode: 'personal_care_trends', trends, source_excerpts: excerpts, source_ids: trends.flatMap(t => t.sources.map(s => s.id)), products: [], read_across_products: [], web_signals: [], gate: { mode: 'personal_care_trends', main_group: 'BSA', region_text: body.region_text, region_scope: resolved.scope, country_allow_list: resolved.countries, excluded_countries: excluded, recency_months: recencyMonths, source_count: trends.length, excerpt_count: excerpts.length, regional_excerpt_count: excerpts.filter(e => e.regional_allowed).length, resolution_log: resolved.resolution_log }, ...(excerpts.length ? {} : { error: 'no_personal_care_sources', message: 'No eligible Personal Care trend-report excerpts were found. This mode needs approved BSA market-intelligence reports with dated, promoted, quoted excerpts; GNPD exports and Food sources are not used.' }) };
}