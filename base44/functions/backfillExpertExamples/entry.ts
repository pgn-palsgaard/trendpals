import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

const TIME_BUDGET_MS = 4 * 60 * 1000; // 4-minute soft cap

Deno.serve(async (req) => {
  const base44 = createClientFromRequest(req);
  let job = null;

  try {
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    if (user.role !== 'admin') return Response.json({ error: 'Admin access required' }, { status: 403 });

    const invocationStart = Date.now();

    const allMintelSources = await base44.asServiceRole.entities.Source.filter(
      { source_type: 'mintel', pipeline_stage: 'extracted' }, 'created_date', 200
    );

    const existingExamples = await base44.asServiceRole.entities.ExpertExample.list('-extracted_at', 5000);
    const sourcesWithExamples = new Set(existingExamples.map(e => e.source_id));
    const pendingSources = allMintelSources.filter(s => !sourcesWithExamples.has(s.id));

    // ── Find or create ProcessingJob ─────────────────────────────────────────
    const existingJobs = await base44.asServiceRole.entities.ProcessingJob.filter(
      { job_type: 'backfill_expert_examples' }, '-created_date', 5
    );
    const activeJob = existingJobs.find(j =>
      (j.status === 'running' || j.status === 'paused_timeout' || j.status === 'failed')
      && j.current_cursor
    );

    let resumeCursor = null;

    if (activeJob) {
      resumeCursor = activeJob.current_cursor || null;
      await base44.asServiceRole.entities.ProcessingJob.update(activeJob.id, {
        status: 'running',
        last_progress_at: new Date().toISOString(),
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
    let examplesCreated  = existingSummary.examples_created || 0;
    let sourcesProcessed = existingSummary.sources_processed || 0;
    let errors           = existingSummary.errors || 0;
    let processedItems   = job.processed_items || 0;
    let lastCursor       = resumeCursor;
    let timedOut         = false;
    const errorDetails   = [];

    let startIdx = 0;
    if (resumeCursor) {
      const idx = pendingSources.findIndex(s => s.id === resumeCursor);
      startIdx = idx >= 0 ? idx + 1 : 0;
    }
    const sourcesToProcess = pendingSources.slice(startIdx);
    console.log(`[backfill] Sources to process this invocation: ${sourcesToProcess.length}`);

    // ── Main loop wrapped in try/finally ─────────────────────────────────────
    try {
      for (const source of sourcesToProcess) {
        if (Date.now() - invocationStart > TIME_BUDGET_MS) {
          timedOut = true;
          break;
        }

        console.log(`[backfill] Processing source: ${source.id} — ${source.title}`);

        try {
          // Fire the "Extract Expert Examples on Mintel extraction" entity automation
          // by flipping pipeline_stage. Direct function-to-function invoke is blocked
          // on the platform domain, so the automation handles the actual extraction.
          await base44.asServiceRole.entities.Source.update(source.id, { pipeline_stage: 'extracting' });
          await base44.asServiceRole.entities.Source.update(source.id, { pipeline_stage: 'extracted' });
          sourcesProcessed++;
          console.log(`[backfill] Source ${source.id}: extraction triggered via automation`);
        } catch (e) {
          errors++;
          const detail = e.response?.data ? JSON.stringify(e.response.data).slice(0, 300) : '';
          errorDetails.push({ source_id: source.id, message: e.message, detail, status: e.response?.status });
          console.warn(`[backfill] Source ${source.id} failed: ${e.message} ${detail}`);
        }

        lastCursor = source.id;
        processedItems++;

        // Persist after each source
        await base44.asServiceRole.entities.ProcessingJob.update(job.id, {
          processed_items: processedItems,
          current_cursor: lastCursor,
          last_progress_at: new Date().toISOString(),
          summary: { examples_created: examplesCreated, sources_processed: sourcesProcessed, errors },
        });

        // Check again after persist
        if (Date.now() - invocationStart > TIME_BUDGET_MS) {
          timedOut = true;
          break;
        }
      }
    } finally {
      // ALWAYS write final status
      const isDone = !timedOut && startIdx + sourcesToProcess.length >= pendingSources.length;
      const finalStatus = timedOut ? 'paused_timeout' : (isDone ? 'completed' : 'paused_timeout');
      try {
        await base44.asServiceRole.entities.ProcessingJob.update(job.id, {
          status: finalStatus,
          processed_items: processedItems,
          current_cursor: timedOut ? lastCursor : null,
          last_progress_at: new Date().toISOString(),
          summary: { examples_created: examplesCreated, sources_processed: sourcesProcessed, errors },
        });
        console.log(`[backfill] Done — status=${finalStatus}, sources=${sourcesProcessed}, examples=${examplesCreated}`);
      } catch (persistErr) {
        console.error('[backfill] Failed to persist final status:', persistErr.message);
      }
    }

    return Response.json({
      job_id: job.id,
      status: timedOut ? 'paused_timeout' : 'completed',
      sources_processed: sourcesProcessed,
      examples_created: examplesCreated,
      errors,
      error_details: errorDetails,
      total_pending: pendingSources.length,
    });

  } catch (error) {
    console.error('[backfill] Fatal:', error.message);
    if (job?.id) {
      try {
        await base44.asServiceRole.entities.ProcessingJob.update(job.id, {
          status: 'failed',
          last_error: error.message,
          last_progress_at: new Date().toISOString(),
        });
      } catch (e) { /* ignore */ }
    }
    return Response.json({ error: error.message }, { status: 500 });
  }
});