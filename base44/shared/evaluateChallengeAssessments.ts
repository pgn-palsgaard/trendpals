import { RUBRIC_VERSION, assessmentSchema, assessmentPrompt } from './challengeAssessmentPrompt.ts';

export async function assessmentHash(context) {
  const bytes = new TextEncoder().encode(JSON.stringify({ version: RUBRIC_VERSION, ...context }));
  return [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))].map(b => b.toString(16).padStart(2,'0')).join('');
}
const short = v => String(v || '').slice(0,1800);
export async function evaluateContexts(api, pending, jobId) {
  if (!pending.length) return [];
  let timer;
  const response = await Promise.race([
    api.integrations.Core.InvokeLLM({ prompt: assessmentPrompt(pending.map(p => p.context)), response_json_schema: assessmentSchema }),
    new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('Assessment exceeded 100 seconds; job can be resumed safely')), 100000); })
  ]).finally(() => clearTimeout(timer));
  const results = response?.assessments;
  if (!Array.isArray(results) || results.length !== pending.length) throw new Error(`Incomplete assessment response (${Array.isArray(results) ? results.length : 'invalid'} of ${pending.length}); no results saved. Retry a smaller batch.`);
  const seen = new Set();
  return pending.map(({ context: c, hash }) => {
    const matches = results.filter(a => a.challenge_id === c.challenge.id);
    if (matches.length !== 1 || seen.has(c.challenge.id)) throw new Error('Mismatched challenge IDs; no results saved');
    seen.add(c.challenge.id);
    const a = matches[0], gaps = (a.gaps || []).map(short);
    const scores = {};
    for (const key of ['trend_fit','customer_perspective','specificity','evidence_strength']) {
      const n = a.scores?.[key];
      if (typeof n !== 'number' || !Number.isFinite(n) || n < 0 || n > 100) throw new Error(`Invalid ${key} score`);
      scores[key] = Math.round(n);
    }
    const evidence = [];
    for (const r of a.evidence_refs || []) {
      const actual = c.evidence.find(e => e.ref === r.ref);
      const quote = String(r.quote || '').trim();
      if (!actual || quote.length < 12 || !actual.text.includes(quote)) { gaps.push('A proposed citation was rejected because its quote was not traceable.'); continue; }
      evidence.push({ ...Object.fromEntries(Object.entries(actual).filter(([k]) => k !== 'text')), quote: quote.slice(0,900), supports: short(r.supports) });
    }
    const market = evidence.filter(e => e.role === 'market');
    const field = evidence.filter(e => e.role === 'field');
    const supplementary = evidence.filter(e => e.role === 'supplementary');
    if (!market.length && !field.length) scores.evidence_strength = Math.min(scores.evidence_strength, supplementary.length ? 50 : 25);
    const publishers = new Set([...market, ...field].map(e => e.publisher));
    if (publishers.size < 2) scores.evidence_strength = Math.min(scores.evidence_strength, 75);
    if (c.manifest.retrieval_truncated) gaps.push('Evidence/peer retrieval was bounded; additional records may exist.');
    if (c.evidence.some(e => !e.date)) gaps.push('Some supplied evidence has no publication date.');
    if (!c.trend) gaps.push('The linked parent trend could not be found.');
    let fit = ['strong','possible','none','unknown'].includes(a.capability_fit_proposal) ? a.capability_fit_proposal : 'unknown';
    if (['strong','possible'].includes(fit) && !evidence.some(e => e.role === 'capability' || e.role === 'field')) { fit = 'unknown'; gaps.push('No cited capability or field evidence supports supplier fit.'); }
    const duplicates = (a.duplicate_candidates || []).map(d => {
      const peer = c.peers.find(p => p.id === d.challenge_id);
      return peer ? { challenge_id: peer.id, name: peer.name, reason: short(d.reason) } : null;
    }).filter(Boolean);
    const recommendation = !c.trend ? 'missing_trend' : scores.trend_fit < 50 ? 'weak_link' : scores.evidence_strength < 60 ? 'needs_evidence' : scores.customer_perspective < 60 || scores.specificity < 60 || duplicates.length ? 'needs_refinement' : 'well_supported';
    return { challenge_id: c.challenge.id, challenge_name: c.challenge.name, global_trend_id: c.challenge.global_trend_id, trend_name: c.trend?.trend_name || 'Missing trend', category: c.challenge.category, input_hash: hash, rubric_version: RUBRIC_VERSION, evaluated_at: new Date().toISOString(), job_id: jobId, is_latest: true, review_state: 'pending', recommendation, scores, summary: short(a.summary), causal_chain: short(a.causal_chain), suggested_description: short(a.suggested_description), capability_fit_proposal: fit, capability_reason: short(a.capability_reason), gaps: [...new Set(gaps)], counter_evidence: (a.counter_evidence || []).map(short), duplicate_candidates: duplicates, evidence_refs: evidence, input_manifest: c.manifest };
  });
}