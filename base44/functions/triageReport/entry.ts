import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

// One-off aggregation: per-trend outcomes of the grounded LLM triage sweep.
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user || user.role !== 'admin') return Response.json({ error: 'Forbidden' }, { status: 403 });

    const { since, fix_status } = await req.json().catch(() => ({}));
    let statusFixed = 0;
    const sinceTs = since ? new Date(since).getTime() : 0;

    const perTrend = {};
    const bump = (name, key) => {
      if (!perTrend[name]) perTrend[name] = { promoted: 0, kept_for_review: 0, auto_rejected: 0 };
      perTrend[name][key]++;
    };

    let totalPendingLinks = 0, totalUnvalidatedPending = 0;
    let skip = 0;
    while (true) {
      const batch = await base44.asServiceRole.entities.GNPDProduct.filter({}, 'created_date', 200, skip);
      if (batch.length === 0) break;

      for (const p of batch) {
        if (fix_status && p.processing_status !== 'trend_linking_pending'
          && (p.trend_links || []).some(l => l.review_status === 'pending' && !l.llm_validated_at)) {
          await base44.asServiceRole.entities.GNPDProduct.update(p.id, { processing_status: 'trend_linking_pending' });
          statusFixed++;
        }
        for (const l of (p.trend_links || [])) {
          if (l.review_status === 'pending') {
            totalPendingLinks++;
            if (!l.llm_validated_at) totalUnvalidatedPending++;
            else if (new Date(l.llm_validated_at).getTime() >= sinceTs) bump(l.trend_name, 'kept_for_review');
          } else if (l.review_status === 'auto_applied' && l.llm_validated_at
            && new Date(l.llm_validated_at).getTime() >= sinceTs) {
            bump(l.trend_name, 'promoted');
          }
        }
        for (const r of (p.rejected_link_candidates || [])) {
          if (r.rejected_at && new Date(r.rejected_at).getTime() >= sinceTs) bump(r.trend_name, 'auto_rejected');
        }
      }

      if (batch.length < 200) break;
      skip += 200;
    }

    return Response.json({ per_trend: perTrend, total_pending_links_now: totalPendingLinks, pending_links_not_yet_llm_validated: totalUnvalidatedPending, status_fixed: statusFixed });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});