import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

const TIME_BUDGET_MS = 4 * 60 * 1000; // 4-minute soft cap

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    if (user.role !== 'admin') return Response.json({ error: 'Admin access required' }, { status: 403 });

    const invocationStart = Date.now();

    // ── Find all Mintel sources that are extracted ────────────────────────────
    const allMintelSources = await base44.asServiceRole.entities.Source.filter(
      { source_type: 'mintel', pipeline_stage: 'extracted' }, 'created_date', 200
    );

    // Find which sources already have ExpertExamples
    const existingExamples = await base44.asServiceRole.entities.ExpertExample.list('-extracted_at', 500);
    const sourcesWithExamples = new Set(existingExamples.map(e => e.source_id));

    const pendingSources = allMintelSources.filter(s => !sourcesWithExamples.has(s.id));

    // ── Find or create ProcessingJob ─────────────────────────────────────────
    const existingJobs = await base44.asServiceRole.entities.ProcessingJob.filter(
      { job_type: 'backfill_expert_examples' }, '-created_date', 5
    );
    const activeJob = existingJobs.find(j => j.status === 'running' || j.status === 'paused_timeout');

    let job;
    let resumeCursor = null;

    if (activeJob) {
      resumeCursor = activeJob.current_cursor || null;
      await base44.asServiceRole.entities.ProcessingJob.update(activeJob.id, {
        status: 'running',
        last_progress_at: new Date().toISOString(),
        // Refresh total in case new sources were added
        total_items: pendingSources.length + (activeJob.processed_items || 0),
      });
      job = { ...activeJob, status: 'running' };
      console.log(`[backfill] Resuming job ${activeJob.id} from cursor ${resumeCursor}`);
    } else {
      const newJob = await base44.asServiceRole.entities.ProcessingJob.create({
        job_type: 'backfill_expert_examples',
        status: 'running',
        started_at: new Date().toISOString(),
        last_progress_at: new Date().toISOString(),
        total_items: pendingSources.length,
        processed_items: 0,
        current_cursor: null,
        summary: { examples_created: 0, sources_processed: 0, errors: 0 },
        triggered_by: user.email || user.id,
      });
      job = newJob;
      console.log(`[backfill] Created new job ${job.id}, total pending sources: ${pendingSources.length}`);
    }

    const existingSummary = job.summary || {};
    let examplesCreated   = existingSummary.examples_created || 0;
    let sourcesProcessed  = existingSummary.sources_processed || 0;
    let errors            = existingSummary.errors || 0;
    let processedItems    = job.processed_items || 0;
    let lastCursor        = resumeCursor;
    let timedOut          = false;

    // Determine start position via cursor
    let startIdx = 0;
    if (resumeCursor) {
      const idx = pendingSources.findIndex(s => s.id === resumeCursor);
      // Resume AFTER the last successfully processed source
      startIdx = idx >= 0 ? idx + 1 : 0;
    }

    const sourcesToProcess = pendingSources.slice(startIdx);
    console.log(`[backfill] Sources to process this invocation: ${sourcesToProcess.length}`);

    for (const source of sourcesToProcess) {
      // Time check before each source (extraction is heavy)
      if (Date.now() - invocationStart > TIME_BUDGET_MS) {
        timedOut = true;
        break;
      }

      console.log(`[backfill] Processing source: ${source.id} — ${source.title}`);

      try {
        const result = await base44.asServiceRole.functions.invoke('extractExpertExamples', {
          source_id: source.id,
        });
        const created = result?.examples_created ?? 0;
        examplesCreated += created;
        sourcesProcessed++;
        console.log(`[backfill] Source ${source.id}: ${created} examples created`);
      } catch (e) {
        errors++;
        console.warn(`[backfill] Source ${source.id} failed: ${e.message}`);
      }

      lastCursor = source.id;
      processedItems++;

      // Persist progress after each source
      await base44.asServiceRole.entities.ProcessingJob.update(job.id, {
        processed_items: processedItems,
        current_cursor: lastCursor,
        last_progress_at: new Date().toISOString(),
        summary: { examples_created: examplesCreated, sources_processed: sourcesProcessed, errors },
      });
    }

    // If we got through all sources, mark completed
    const isDone = !timedOut && startIdx + sourcesToProcess.length >= pendingSources.length;
    const finalStatus = timedOut ? 'paused_timeout' : (isDone ? 'completed' : 'paused_timeout');

    await base44.asServiceRole.entities.ProcessingJob.update(job.id, {
      status: finalStatus,
      processed_items: processedItems,
      current_cursor: timedOut ? lastCursor : null,
      last_progress_at: new Date().toISOString(),
      summary: { examples_created: examplesCreated, sources_processed: sourcesProcessed, errors },
    });

    console.log(`[backfill] Done — status=${finalStatus}, sources=${sourcesProcessed}, examples=${examplesCreated}`);

    return Response.json({
      job_id: job.id,
      status: finalStatus,
      sources_processed: sourcesProcessed,
      examples_created: examplesCreated,
      errors,
      total_pending: pendingSources.length,
    });

  } catch (error) {
    console.error('[backfill] Fatal:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});