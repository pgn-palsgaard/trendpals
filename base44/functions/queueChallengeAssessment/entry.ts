import { createClientFromRequest } from 'npm:@base44/sdk@0.8.54';

export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    if (user.role !== 'admin') return Response.json({ error: 'Forbidden' }, { status: 403 });
    const b = await req.json();
    const api = base44.asServiceRole;
    let query = {}, key = 'all';
    if (b.trend_id) { query = { global_trend_id: String(b.trend_id) }; key = `trend:${b.trend_id}`; }
    else if (b.challenge_id) { query = { id: String(b.challenge_id) }; key = `challenge:${b.challenge_id}`; }
    else if (b.assignment_id || b.web_signal_id) {
      const kind = b.assignment_id ? 'ReviewAssignment' : 'WebSignal';
      const page = await api.entities[kind].filter({ id: String(b.assignment_id || b.web_signal_id) }, { limit: 1 });
      const r = page.items[0];
      if (!r) return Response.json({ skipped: true, reason: 'Record no longer exists' });
      query = b.assignment_id ? { id: r.challenge_id } : { global_trend_id: r.linked_trend_id };
      if (!Object.values(query)[0]) return Response.json({ skipped: true, reason: 'No linked challenge or trend' });
      key = `${b.assignment_id ? 'challenge' : 'trend'}:${Object.values(query)[0]}`;
    } else if (b.source_id) {
      const sp = await api.entities.Source.filter({ id: String(b.source_id) }, { limit: 1 });
      const s = sp.items[0];
      const tp = await api.entities.GlobalTrend.filter({ $or: [{ 'sources.source_id': String(b.source_id) }, { source_references: String(b.source_id) }] }, { limit: 200 });
      const conditions = tp.items.length ? [{ global_trend_id: { $in: tp.items.map(t => t.id) } }] : [];
      if (s?.source_type === 'knowledge') {
        const cats = [...new Set([s.category, ...(s.category_relevance || [])].filter(Boolean))];
        if (cats.length) conditions.push({ category: { $in: cats } });
      }
      if (!conditions.length) return Response.json({ skipped: true, reason: 'No affected challenges' });
      query = { $or: conditions }; key = `source:${b.source_id}`;
    }
    const existing = await api.entities.ChallengeAssessmentJob.filter({ scope_key: key, status: { $in: ['queued','running'] } }, { sort: 'created_date', limit: 1 });
    if (existing.items.length) {
      const job = existing.items[0];
      if (job.status === 'running' || job.cursor) await api.entities.ChallengeAssessmentJob.update(job.id, { rerun_requested: true });
      return Response.json({ job_id: job.id, existing: true, total: job.total });
    }
    const total = await api.entities.IndustryChallenge.count(query);
    const job = await api.entities.ChallengeAssessmentJob.create({ scope_key: key, query, reason: String(b.reason || 'evidence_changed').slice(0,100), status: total ? 'queued' : 'completed', total, processed: 0, evaluated: 0, unchanged: 0, cursor: '', requested_by: user.email, started_at: new Date().toISOString() });
    return Response.json({ job_id: job.id, total, status: job.status });
  } catch (error) { return Response.json({ error: error.message }, { status: 500 }); }
}