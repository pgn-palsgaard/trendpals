import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

/**
 * One-off admin recovery (intake regressions, 2026-06-11):
 * 1. Re-runs classifySource on sources that have classification=null (legacy hardcoded
 *    source_type path) created on/after the given date.
 * 2. Re-runs autoExtractMetadata on legacy sources with pipeline_stage=extracted but
 *    metadata_extraction missing/null so they can pass the verify gate.
 * Time-bounded; call again if `remaining` > 0.
 */
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    let user = null;
    try { user = await base44.auth.me(); } catch (_) { /* automation context */ }
    if (user && user.role !== 'admin') {
      return Response.json({ error: 'Forbidden: Admin access required' }, { status: 403 });
    }

    const body = await req.json().catch(() => ({}));
    const sinceDate = body.since || '2026-06-11';
    const TIME_BUDGET_MS = 150000;
    const start = Date.now();

    const results = { reclassified: [], metadata_backfilled: [], errors: [], remaining: 0 };

    // ── Part 1: re-classify sources with null classification ──────────────────
    const recent = await base44.asServiceRole.entities.Source.list('-created_date', 100);
    const reclassTargets = recent.filter(s =>
      !s.classification &&
      s.source_type !== 'gnpd' &&
      String(s.created_date).slice(0, 10) >= sinceDate
    );

    // ── Part 2: extracted-stage sources with missing metadata extraction ──────
    // Scoped to the two named legacy sources (override with body.backfill_ids)
    const backfillIds = body.backfill_ids || ['69971a6bd3c46dcf3e4db028', '69971a52c54099e0f2a7b2db'];
    const extracted = await base44.asServiceRole.entities.Source.filter({ pipeline_stage: 'extracted' }, '-created_date', 500);
    const backfillTargets = extracted.filter(s => !s.metadata_extraction && backfillIds.includes(s.id));

    console.log(`[fixIntakeRegressions] ${reclassTargets.length} to reclassify, ${backfillTargets.length} to backfill`);

    for (const s of reclassTargets) {
      if (Date.now() - start > TIME_BUDGET_MS) { results.remaining++; continue; }
      try {
        const res = await base44.asServiceRole.functions.invoke('classifySource', { source_id: s.id });
        const c = res.data?.classification;
        results.reclassified.push({
          id: s.id, title: s.title,
          old_source_type: s.source_type,
          proposed: c?.proposed_source_type, confidence: c?.confidence,
          applied: res.data?.applied,
        });
      } catch (e) {
        results.errors.push({ id: s.id, title: s.title, error: e.message });
      }
    }

    for (const s of backfillTargets) {
      if (Date.now() - start > TIME_BUDGET_MS) { results.remaining++; continue; }
      try {
        const res = await base44.asServiceRole.functions.invoke('autoExtractMetadata', { source_id: s.id });
        results.metadata_backfilled.push({ id: s.id, title: s.title, status: res.data?.extraction_status || res.data?.reason || 'done' });
      } catch (e) {
        results.errors.push({ id: s.id, title: s.title, error: e.message });
      }
    }

    return Response.json(results);
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});