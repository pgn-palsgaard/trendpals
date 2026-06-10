import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

/**
 * One-time recovery: pre-intake Market Intelligence sources stuck in Queue with
 * metadata_extraction=null. Runs the same extraction step that sourceIntake's
 * automation performs (autoExtractMetadata), landing them in the normal
 * verify → approve → process flow. Idempotent — skips sources that already
 * have metadata_extraction.
 */
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (user?.role !== 'admin') {
      return Response.json({ error: 'Forbidden: Admin access required' }, { status: 403 });
    }

    const candidates = await base44.asServiceRole.entities.Source.filter(
      { pipeline_stage: { $in: ['uploaded', 'extracted'] }, source_type: { $in: ['mintel', 'market_intel', 'url', 'knowledge'] } },
      '-created_date',
      500
    );

    const targets = candidates.filter(s => !s.metadata_extraction);
    const results = { total: targets.length, extracted: 0, failed: 0, skipped: 0, details: [] };
    const deadline = Date.now() + 4 * 60 * 1000;

    for (const source of targets) {
      if (Date.now() > deadline) {
        results.details.push({ note: 'Time budget reached — call again to continue' });
        break;
      }
      try {
        const res = await base44.functions.invoke('autoExtractMetadata', { source_id: source.id });
        const data = res.data || {};
        if (data.success) {
          results.extracted++;
          results.details.push({ id: source.id, title: source.title, status: data.extraction_status });
        } else if (data.skipped) {
          results.skipped++;
          results.details.push({ id: source.id, title: source.title, status: 'skipped', reason: data.reason });
        } else {
          results.failed++;
          results.details.push({ id: source.id, title: source.title, status: 'failed', error: data.error });
        }
      } catch (e) {
        results.failed++;
        results.details.push({ id: source.id, title: source.title, status: 'failed', error: e.message });
      }
    }

    return Response.json(results);
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});