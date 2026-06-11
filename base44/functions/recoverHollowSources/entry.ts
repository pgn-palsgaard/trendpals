import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

// Self-contained, idempotent, batch-resumable hollow-source recovery helper.
// modes:
//   list   { source_types?: [] }            -> report hollow sources + eligibility
//   reset  { source_types: [] }             -> clear hollow excerpts, stage=metadata_extracted
//   verify { source_types: [] }             -> post-extraction check; hollow-after-extract -> failed
const TIME_BUDGET_MS = 50000;

const isHollowExcerpt = (e) =>
  !e.market_signal && !e.customer_pain && !e.palsgaard_angle && !e.source_quote;
const isHollow = (s) =>
  Array.isArray(s.excerpts) && s.excerpts.length > 0 && s.excerpts.every(isHollowExcerpt);

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (user?.role !== 'admin') return Response.json({ error: 'Forbidden' }, { status: 403 });

    const start = Date.now();
    const { mode = 'list', source_types = [] } = await req.json().catch(() => ({}));
    const svc = base44.asServiceRole.entities.Source;

    // Page through all sources (bounded dataset ~150)
    const all = [];
    let skip = 0;
    while (true) {
      const page = await svc.list('-created_date', 100, skip);
      all.push(...page);
      if (page.length < 100) break;
      skip += 100;
    }
    const inScope = all.filter(s =>
      (!source_types.length || source_types.includes(s.source_type)) && !s.is_archived);

    if (mode === 'list') {
      const hollow = inScope.filter(isHollow).map(s => ({
        id: s.id, title: (s.title || '').slice(0, 70), source_type: s.source_type,
        pipeline_stage: s.pipeline_stage, review_status: s.review_status,
        metadata_verified: s.metadata_extraction?.verified === true,
        hollow_excerpts: s.excerpts.length, has_file: !!(s.file_url || s.url)
      }));
      return Response.json({ mode, hollow_count: hollow.length, hollow });
    }

    if (mode === 'reset') {
      const targets = inScope.filter(isHollow); // idempotent: only still-hollow records
      const results = [];
      for (const s of targets) {
        if (Date.now() - start > TIME_BUDGET_MS) {
          return Response.json({ mode, partial: true, results, remaining: targets.length - results.length });
        }
        await svc.update(s.id, { excerpts: [], pipeline_stage: 'metadata_extracted', rag_excerpt_count: 0 });
        results.push({ id: s.id, title: (s.title || '').slice(0, 70), before_hollow: s.excerpts.length, review_status: s.review_status });
      }
      return Response.json({ mode, reset_count: results.length, results });
    }

    if (mode === 'verify') {
      const results = [];
      for (const s of inScope) {
        if (!['extracted', 'metadata_extracted', 'extracting', 'failed'].includes(s.pipeline_stage)) continue;
        const exCount = (s.excerpts || []).length;
        let verdict;
        if (s.pipeline_stage === 'extracted') {
          if (exCount > 0 && !isHollow(s)) verdict = 'real';
          else {
            verdict = 'hollow_after_extract -> failed';
            await svc.update(s.id, { pipeline_stage: 'failed', failure_reason: 'recovery_verify: excerpts hollow or empty after re-extraction' });
          }
        } else {
          verdict = `not_done (${s.pipeline_stage})`;
        }
        results.push({ id: s.id, title: (s.title || '').slice(0, 70), source_type: s.source_type, review_status: s.review_status, stage: s.pipeline_stage, excerpts: exCount, verdict });
        if (Date.now() - start > TIME_BUDGET_MS) break;
      }
      return Response.json({ mode, results });
    }

    return Response.json({ error: 'unknown mode' }, { status: 400 });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});