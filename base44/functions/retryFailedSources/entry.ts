import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const { sourceIds } = body;

    let targets;
    if (Array.isArray(sourceIds) && sourceIds.length > 0) {
      targets = await Promise.all(
        sourceIds.map(id => base44.entities.Source.get(id).catch(() => null))
      );
      targets = targets.filter(s => s && s.pipeline_stage === 'failed' && s.source_type !== 'gnpd');
    } else {
      const failed = await base44.entities.Source.filter({ pipeline_stage: 'failed' }, '-created_date', 500);
      targets = failed.filter(s => s.source_type !== 'gnpd');
    }

    if (targets.length === 0) {
      return Response.json({ reset: 0, ids: [], message: 'No failed sources found' });
    }

    const now = new Date().toISOString();
    await Promise.all(targets.map(s =>
      base44.entities.Source.update(s.id, {
        pipeline_stage: 'uploaded',
        // Clear stale excerpts + pre-gate flag: processSourceQueue skips any source
        // that already has excerpts, so a reset must wipe them to allow re-extraction.
        excerpts: [],
        rag_excerpt_count: 0,
        pre_gate_evaluated: false,
        pre_gate_reason: null,
        failure_reason: null,
        processing_error: null,
        skip_reason: null,
        last_retry_at: now,
        // retry_count intentionally preserved
      })
    ));

    console.log(`[retryFailedSources] Reset ${targets.length} sources to uploaded`);
    return Response.json({ reset: targets.length, ids: targets.map(s => s.id) });

  } catch (error) {
    console.error('[retryFailedSources] Error:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});