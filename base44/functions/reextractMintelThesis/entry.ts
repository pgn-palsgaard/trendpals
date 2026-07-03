import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

// Batch runner: re-extracts Mintel sources through extractExpertExamples so the newly-added
// section_thesis field gets populated. Processes a small number of sources per call (each
// extraction takes ~2-3 min) and returns the remaining queue so it can be called repeatedly.
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json().catch(() => ({}));
    const isWorker = body.worker === true;

    if (!isWorker) {
      const user = await base44.auth.me();
      if (!user || user.role !== 'admin') {
        return Response.json({ error: 'Admin only' }, { status: 403 });
      }
    }

    const batchSize = Math.min(body.batch_size || 1, 3);

    // Build the queue: Mintel sources in a re-extractable stage that don't yet have a stored thesis.
    const all = await base44.asServiceRole.entities.Source.filter({ source_type: 'mintel' }, '-created_date', 500);
    const queue = [];
    for (const s of all) {
      const hasFile = !!(s.file_url || s.url);
      if (!hasFile || s.pipeline_stage !== 'extracted') continue;
      const lower = (s.title || '').toLowerCase();
      if (lower.endsWith('.pptx') || lower.endsWith('.ppt')) continue; // not parseable PDFs
      // Skip if already re-extracted (has thesis on any example)
      const ex = await base44.asServiceRole.entities.ExpertExample.filter({ source_id: s.id }, '-created_date', 3);
      const alreadyDone = ex.some(x => x.section_thesis);
      if (alreadyDone) continue;
      queue.push({ id: s.id, title: s.title });
    }

    // Dispatch ONE source per call as fire-and-forget (each extraction takes ~2-3 min, far longer
    // than any single request budget). A scheduled automation calls this repeatedly; each run picks
    // the next not-yet-done source off the queue and returns immediately. The queue naturally shrinks
    // as each dispatched extraction stores its thesis, so the same source won't be picked twice on
    // the next run (which happens well after the ~3 min extraction completes).
    const item = queue[0];
    if (!item) {
      return Response.json({ success: true, dispatched: 0, remaining: 0, total_in_queue: 0, done: true });
    }

    base44.functions.invoke('extractExpertExamples', { source_id: item.id, worker: true })
      .catch(e => console.warn(`[reextractMintelThesis] dispatch failed for ${item.id}: ${e.message}`));

    return Response.json({
      success: true,
      dispatched: 1,
      dispatched_source: { id: item.id, title: item.title },
      remaining: Math.max(0, queue.length - 1),
      total_in_queue: queue.length,
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});