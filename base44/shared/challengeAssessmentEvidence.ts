export const pick = (o, keys) => Object.fromEntries(keys.map(k => [k, o?.[k] ?? null]));
const text = v => String(v || '').slice(0, 1800);
const supplier = /\b(palsgaard|iff|kerry|dsm[- ]?firmenich|corbion|cargill|adm|aak|ingredion|givaudan|symrise|basf|bunge|roquette|ashland|puratos|zeelandia|beneo|novonesis|glanbia|cp kelco|tate\s*(?:&|and)\s*lyle|sensient|itac[- ]professional)\b/i;
const usable = s => s.review_status === 'approved' && !s.is_archived && s.usage_permission !== 'forbidden' && s.allowed_use !== 'forbidden' && !s.extraction_quality_flag && (!s.expires_at || new Date(s.expires_at).getTime() > Date.now());
const sourceRole = s => {
  if (!usable(s) || s.visibility === 'project_only') return null;
  if (s.source_type === 'knowledge') return s.allowed_use === 'capability_proof_only' ? 'capability' : null;
  if (supplier.test(`${s.publisher || ''} ${s.url || ''}`)) return null;
  return s.allowed_use === 'evidence' && s.usage_permission === 'evidence' ? 'market' : null;
};
export async function loadAssessmentContexts(api, challenges) {
  const isId = value => typeof value === 'string' && /^[a-f0-9]{24}$/i.test(value);
  const ids = [...new Set(challenges.map(c => c.global_trend_id).filter(isId))];
  const categories = [...new Set(challenges.map(c => c.category).filter(Boolean))];
  const [tp, pp, rp, wp, kp] = await Promise.all([
    api.entities.GlobalTrend.filter({ id: { $in: ids } }, { limit: 100 }),
    api.entities.IndustryChallenge.filter({ category: { $in: categories } }, { sort: 'id', limit: 250 }),
    api.entities.ReviewAssignment.filter({ challenge_id: { $in: challenges.map(c => c.id) }, status: 'responded' }, { sort: '-responded_at', limit: 150 }),
    api.entities.WebSignal.filter({ linked_trend_id: { $in: ids }, review_status: 'approved', is_competitor_content: { $ne: true }, source_kind: { $nin: ['competitor','supplier_news'] } }, { sort: '-discovered_at', limit: 60 }),
    api.entities.Source.filter({ source_type: 'knowledge', review_status: 'approved', allowed_use: 'capability_proof_only', $or: [{ category: { $in: categories } }, { category_relevance: { $in: categories } }] }, { sort: '-date_published', limit: 30 })
  ]);
  const trends = tp.items;
  const sourceIds = [...new Set(trends.flatMap(t => [...(t.source_references || []), ...(t.sources || []).map(s => s.source_id)]).filter(isId))];
  const sp = sourceIds.length ? await api.entities.Source.filter({ id: { $in: sourceIds } }, { limit: 150 }) : { items: [], has_more: false };
  const sourceMap = new Map([...sp.items, ...kp.items].map(s => [s.id, s]));
  return challenges.map(c => {
    const t = trends.find(t => t.id === c.global_trend_id);
    const refs = [], excluded = [];
    const addSource = s => {
      if (!s) return;
      const role = sourceRole(s);
      if (!role) { excluded.push(s.id); return; }
      const excerpts = (s.excerpts || []).map((e, i) => ({ ...e, index: i })).filter(e => e.promotion_status === 'promoted' && (!(e.category_relevance || []).length || e.category_relevance.includes(c.category))).slice(0, 8);
      for (const e of excerpts) {
        const body = e.source_quote || (role === 'capability' ? e.palsgaard_angle || e.market_signal : '');
        if (!body) continue;
        refs.push({ ref: `SRC:${s.id}:${e.index}`, role, title: s.title, publisher: s.publisher || '', url: s.url || '', date: s.date_published || s.date || '', region: (e.regions || []).join(', ') || s.region_code || 'unknown', page: e.page_ref || '', text: text(body) });
      }
    };
    const linkedIds = [...new Set([...(t?.source_references || []), ...(t?.sources || []).map(s => s.source_id)].filter(Boolean))];
    for (const id of linkedIds) { if (sourceMap.has(id)) addSource(sourceMap.get(id)); else excluded.push(`missing:${id}`); }
    for (const s of kp.items.filter(s => s.category === c.category || (s.category_relevance || []).includes(c.category))) if (!linkedIds.includes(s.id)) addSource(s);
    (t?.sources || []).forEach((s, i) => {
      if (s.source_id || !['approved','manual_curated'].includes(s.review_status) || s.source_type === 'internal_palsgaard' || supplier.test(`${s.publisher || ''} ${s.url || ''}`) || !s.quote) return;
      refs.push({ ref: `TREND:${t.id}:${i}`, role: 'market', title: s.title || '', publisher: s.publisher || '', url: s.url || '', date: s.date || '', region: 'unknown', text: text(s.quote) });
    });
    for (const w of wp.items.filter(w => w.linked_trend_id === c.global_trend_id && !supplier.test(`${w.publisher || ''} ${w.url || ''}`))) if (w.key_quote) refs.push({ ref: `WEB:${w.id}`, role: 'supplementary', title: w.title, publisher: w.publisher || '', url: w.url || '', date: w.published_date || '', region: w.region || 'unknown', text: text(w.key_quote) });
    for (const r of rp.items.filter(r => r.challenge_id === c.id)) refs.push({ ref: `SME:${r.id}`, role: 'field', title: 'Expert field response', publisher: 'Internal field review', url: '', date: r.responded_at || '', region: r.reviewer_region || 'unknown', text: text(JSON.stringify(pick(r, ['verdict','comment','trend_signal','suggested_capability_fit']))) });
    return { challenge: pick(c, ['id','name','description','global_trend_id','category','region_code','supporting_note','capability_hypothesis','capability_fit','validation_status','validated_date','review_status']), trend: t ? pick(t, ['id','trend_name','description','category','market_signal','whats_changing','why_now','regional_manifestations','is_active']) : null, evidence: refs, peers: pp.items.filter(p => p.category === c.category && p.id !== c.id).map(p => pick(p, ['id','name','description','global_trend_id'])), manifest: { linked_source_ids: linkedIds, excluded_source_ids: excluded, market_refs: refs.filter(r => r.role === 'market').length, capability_refs: refs.filter(r => r.role === 'capability').length, supplementary_refs: refs.filter(r => r.role === 'supplementary').length, field_refs: refs.filter(r => r.role === 'field').length, retrieval_truncated: [tp,pp,rp,wp,kp,sp].some(p => p.has_more), research_scope: 'Stored approved evidence and exact source quotes only; no live web research', week: Math.floor(Date.now() / 604800000) } };
  });
}