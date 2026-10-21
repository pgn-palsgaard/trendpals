import { createClientFromRequest } from 'npm:@base44/sdk@0.8.54';

export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    if (user.role !== 'admin') return Response.json({ error: 'Forbidden' }, { status: 403 });
    const { assessment_id, note } = await req.json();
    if (!assessment_id || typeof assessment_id !== 'string') return Response.json({ error: 'assessment_id required' }, { status: 400 });
    const page = await base44.asServiceRole.entities.ChallengeAssessment.filter({ id: assessment_id }, { limit: 1 });
    if (!page.items.length) return Response.json({ error: 'Assessment not found' }, { status: 404 });
    if (page.items[0].review_state === 'reviewed') return Response.json({ ok: true, already_reviewed: true });
    await base44.asServiceRole.entities.ChallengeAssessment.update(assessment_id, { review_state: 'reviewed', reviewed_by: user.email, reviewed_at: new Date().toISOString(), review_note: String(note || '').slice(0,2000) });
    return Response.json({ ok: true, note: 'Advisory assessment reviewed; challenge approval and field validation unchanged.' });
  } catch (error) { return Response.json({ error: error.message }, { status: 500 }); }
}