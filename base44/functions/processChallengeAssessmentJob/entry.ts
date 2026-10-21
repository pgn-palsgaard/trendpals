import { createClientFromRequest } from 'npm:@base44/sdk@0.8.54';
import { loadAssessmentContexts } from '../../shared/challengeAssessmentEvidence.ts';
import { assessmentHash, evaluateContexts } from '../../shared/evaluateChallengeAssessments.ts';

export default async function(req) {
  let api, job, token;
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    if (user.role !== 'admin') return Response.json({ error: 'Forbidden' }, { status: 403 });
    api = base44.asServiceRole;
    const b = await req.json();
    const now = new Date().toISOString();
    await api.entities.ChallengeAssessmentJob.updateMany({ status: 'running', lease_until: { $lt: now } }, { $set: { status: 'queued', lease_token: '' } });
    const jp = await api.entities.ChallengeAssessmentJob.filter({ ...(b.job_id ? { id: String(b.job_id) } : {}), status: 'queued' }, { sort: 'created_date', limit: 1 });
    job = jp.items[0];
    if (!job) return Response.json({ idle: true, reason: 'No queued job (or another worker owns it)' });
    token = crypto.randomUUID();
    await api.entities.ChallengeAssessmentJob.updateMany({ id: job.id, status: 'queued' }, { $set: { status: 'running', lease_token: token, lease_until: new Date(Date.now() + 240000).toISOString() } });
    const claimed = await api.entities.ChallengeAssessmentJob.filter({ id: job.id, lease_token: token, status: 'running' }, { limit: 1 });
    if (!claimed.items.length) return Response.json({ busy: true });
    job = claimed.items[0];
    const limit = Math.min(8, Math.max(1, Number(b.batch_size) || 6));
    const page = await api.entities.IndustryChallenge.filter(job.query || {}, { sort: 'id', limit, ...(job.cursor ? { cursor: job.cursor } : {}) });
    let saved = 0, skipped = 0;
    if (page.items.length) {
      const contexts = await loadAssessmentContexts(api, page.items);
      const previous = await api.entities.ChallengeAssessment.filter({ challenge_id: { $in: page.items.map(c => c.id) }, is_latest: true }, { sort: '-evaluated_at', limit: 100 });
      const pending = [];
      for (const context of contexts) {
        const hash = await assessmentHash(context);
        if (previous.items.some(a => a.challenge_id === context.challenge.id && a.input_hash === hash)) skipped++;
        else pending.push({ context, hash });
      }
      const records = [];
      // One judgment per challenge avoids silently omitted results; independent judgments run three at a time.
      for (let i = 0; i < pending.length; i += 3) {
        const group = await Promise.all(pending.slice(i, i + 3).map(p => evaluateContexts(api, [p], job.id)));
        records.push(...group.flat());
      }
      // Save new history FIRST. If interrupted, retry sees the saved hash and does not pay to evaluate it again.
      if (records.length) {
        await api.entities.ChallengeAssessment.bulkCreate(records);
        const old = previous.items.filter(a => records.some(r => r.challenge_id === a.challenge_id));
        if (old.length) await api.entities.ChallengeAssessment.bulkUpdate(old.map(a => ({ id: a.id, is_latest: false })));
        saved = records.length;
      }
    }
    const current = (await api.entities.ChallengeAssessmentJob.filter({ id: job.id, lease_token: token }, { limit: 1 })).items[0];
    if (!current) throw new Error('Worker lease lost');
    const restart = !page.has_more && current.rerun_requested;
    const result = { status: page.has_more || restart ? 'queued' : 'completed', cursor: page.has_more ? page.next_cursor : '', processed: restart ? 0 : (job.processed || 0) + page.items.length, evaluated: (job.evaluated || 0) + saved, unchanged: (job.unchanged || 0) + skipped, lease_token: '', lease_until: now, last_error: '', ...(restart ? { rerun_requested: false } : {}), ...(!page.has_more && !restart ? { finished_at: new Date().toISOString() } : {}) };
    await api.entities.ChallengeAssessmentJob.update(job.id, result);
    return Response.json({ job_id: job.id, ...result, total: job.total, batch_evaluated: saved, batch_unchanged: skipped });
  } catch (error) {
    if (api && job && token) await api.entities.ChallengeAssessmentJob.updateMany({ id: job.id, lease_token: token }, { $set: { status: 'failed', last_error: String(error.message).slice(0,1000), lease_token: '' } });
    return Response.json({ error: error.message, job_id: job?.id }, { status: 500 });
  }
}