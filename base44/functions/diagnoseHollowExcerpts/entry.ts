// TEMPORARY diagnostic — read-only, no writes. Delete after investigation.
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

const isReal = (e) => {
  const f = (v) => typeof v === 'string' && v.trim().length > 0;
  return f(e.market_signal) || f(e.source_quote) || f(e.customer_pain) || f(e.palsgaard_angle);
};

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    let user = null;
    try { user = await base44.auth.me(); } catch (_) {}
    if (user && user.role !== 'admin') {
      return Response.json({ error: 'Forbidden' }, { status: 403 });
    }

    let inspectId = null;
    try { inspectId = (await req.clone().json())?.inspect; } catch (_) {}
    if (inspectId) {
      const s = await base44.asServiceRole.entities.Source.get(inspectId);
      return Response.json({
        id: s.id, title: s.title, source_type: s.source_type,
        created_date: s.created_date, updated_date: s.updated_date,
        pipeline_stage: s.pipeline_stage, review_status: s.review_status,
        failure_reason: s.failure_reason, processing_error: s.processing_error,
        processing_completed_at: s.processing_completed_at,
        rag_excerpt_count: s.rag_excerpt_count, ai_summary: (s.ai_summary || '').slice(0, 200),
        excerpt_count: s.excerpts?.length,
        excerpt_samples: (s.excerpts || []).slice(0, 3),
        excerpt_id_patterns: [...new Set((s.excerpts || []).map(e => String(e.id).replace(/\d+/g, '#')))],
      });
    }

    // Paginate all sources
    const all = [];
    let skip = 0;
    while (true) {
      const batch = await base44.asServiceRole.entities.Source.list('-created_date', 100, skip);
      all.push(...batch);
      if (batch.length < 100) break;
      skip += 100;
    }

    const withExcerpts = all.filter(s => Array.isArray(s.excerpts) && s.excerpts.length > 0);
    const report = { total_sources: all.length, sources_with_excerpts: withExcerpts.length, real: [], hollow: [], mixed: [] };

    for (const s of withExcerpts) {
      const realCount = s.excerpts.filter(isReal).length;
      const idPattern = String(s.excerpts[0]?.id || '').startsWith('excerpt_') ? 'legacy_skeleton'
        : /_exc_\d+/.test(String(s.excerpts[0]?.id || '')) ? 'queue_v2'
        : 'other';
      const entry = {
        id_pattern: idPattern,
        id: s.id,
        title: (s.title || '').slice(0, 60),
        source_type: s.source_type,
        created_date: s.created_date,
        updated_date: s.updated_date,
        excerpt_count: s.excerpts.length,
        real_excerpts: realCount,
        review_status: s.review_status ?? null,
        pipeline_stage: s.pipeline_stage ?? null,
        has_file: !!(s.file_url || s.url),
      };
      if (realCount === 0) report.hollow.push(entry);
      else if (realCount === s.excerpts.length) report.real.push(entry);
      else report.mixed.push(entry);
    }

    const tally = (arr, fn) => arr.reduce((a, x) => { const k = fn(x); a[k] = (a[k] || 0) + 1; return a; }, {});
    report.summary = {
      real: report.real.length, hollow: report.hollow.length, mixed: report.mixed.length,
      hollow_by_type: tally(report.hollow, h => h.source_type),
      hollow_by_month: tally(report.hollow, h => String(h.created_date).slice(0, 7)),
      hollow_by_pattern: tally(report.hollow, h => h.id_pattern),
      real_by_pattern: tally(report.real, h => h.id_pattern),
      mixed_by_pattern: tally(report.mixed, h => h.id_pattern),
      real_by_month: tally(report.real, h => String(h.created_date).slice(0, 7)),
      hollow_without_file: report.hollow.filter(h => !h.has_file).length,
    };

    // Null status fields across all sources
    report.null_review_status = all.filter(s => s.review_status == null).map(s => ({ id: s.id, title: (s.title || '').slice(0, 50), pipeline_stage: s.pipeline_stage ?? null, created_date: s.created_date }));
    report.null_pipeline_stage_count = all.filter(s => s.pipeline_stage == null).length;

    // Blast radius
    const hollowIds = new Set(report.hollow.map(h => h.id));
    const earliestHollow = report.hollow.map(h => h.created_date).sort()[0] || null;

    const examples = [];
    skip = 0;
    while (true) {
      const batch = await base44.asServiceRole.entities.ExpertExample.list(null, 100, skip);
      examples.push(...batch);
      if (batch.length < 100) break;
      skip += 100;
    }
    report.expert_examples_from_hollow = examples.filter(e => hollowIds.has(e.source_id)).map(e => ({ id: e.id, source_id: e.source_id, product_name: e.product_name }));

    const reports = await base44.asServiceRole.entities.Report.list('-created_date', 200);
    report.reports_since_earliest_hollow = earliestHollow
      ? reports.filter(r => r.created_date >= earliestHollow).map(r => ({ id: r.id, title: r.title, created_date: r.created_date, status: r.status }))
      : [];
    report.earliest_hollow = earliestHollow;

    let compact = false, part = 1;
    try { const b = await req.json(); compact = b?.compact === true; part = b?.part || 1; } catch (_) {}
    if (compact) {
      report.real_count = report.real.length;
      report.mixed_count = report.mixed.length;
      delete report.real;
      report.hollow = report.hollow.map(h => [h.id, h.title.slice(0, 30), h.source_type, h.created_date?.slice(0, 10), h.updated_date?.slice(0, 16), h.excerpt_count, h.has_file ? 1 : 0]);
      report.mixed = report.mixed.map(h => [h.id, h.title.slice(0, 30), h.source_type, h.created_date?.slice(0, 10), h.excerpt_count, h.real_excerpts]);
      report.null_review_status = report.null_review_status.map(s => [s.id, s.title.slice(0, 30), s.pipeline_stage]);
      report.expert_examples_from_hollow = { count: report.expert_examples_from_hollow.length, by_source: Object.entries(report.expert_examples_from_hollow.reduce((a, e) => { a[e.source_id] = (a[e.source_id] || 0) + 1; return a; }, {})) };
    }
    if (compact && part === 2) {
      report.hollow_count = report.hollow.length;
      report.hollow_ids = report.hollow.map(h => h[0]);
      delete report.hollow;
      delete report.mixed;

    }
    return Response.json(report);
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});