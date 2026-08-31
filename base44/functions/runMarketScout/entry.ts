// Orchestrates one deep web sweep for a category, cross-checks the findings
// against the live trend library, and persists them (nothing auto-approved).
// Callable from the market_scout agent, the Market Scout page, and the weekly
// scheduled automation.
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';
import { runDeepSweep, classifyFindings, persistFindings, SCOUT_CATEGORIES, SCOUT_REGIONS } from '../../shared/marketScout.ts';

const TIME_BUDGET_MS = 240000;
// A nested call (weekly wrapper → runMarketScout) must finish well inside the
// platform's kill window, otherwise the parent dies and the child is left hanging
// in 'running'. Callers can therefore hand in a smaller budget.
const MIN_TIME_BUDGET_MS = 60000;

export default async function (req) {
  const started = Date.now();
  let runId = '';
  let base44;
  try {
    base44 = createClientFromRequest(req);

    // Scheduled runs arrive without a user; interactive runs must be admin.
    let user = null;
    try { user = await base44.auth.me(); } catch { user = null; }
    if (user && user.role !== 'admin') {
      return Response.json({ error: 'Forbidden' }, { status: 403 });
    }

    const body = await req.json().catch(() => ({}));
    const category = SCOUT_CATEGORIES.includes(body.category) ? body.category : null;
    if (!category) {
      return Response.json({ error: `category must be one of: ${SCOUT_CATEGORIES.join(', ')}` }, { status: 400 });
    }
    const question = String(body.question || '').slice(0, 600);
    const window = String(body.window || 'the last 3 months').slice(0, 80);
    const regions = Array.isArray(body.regions) && body.regions.length > 0
      ? body.regions.filter(r => SCOUT_REGIONS.includes(r))
      : SCOUT_REGIONS;

    // Audit trail — web-sourced runs are marked so they never look like Mintel/GNPD runs.
    const run = await base44.asServiceRole.entities.ProcessingRun.create({
      source_id: 'web_market_scout',
      source_title: `Market Scout sweep — ${category}${question ? `: ${question}` : ''}`.slice(0, 200),
      source_type_snapshot: 'web_scout',
      triggered_by: user ? 'manual_button' : 'schedule',
      triggered_by_user: user?.email || '',
      status: 'running',
      started_at: new Date().toISOString(),
      agent_model: 'gemini_3_flash + claude_sonnet_4_6',
      agent_version: 'market_scout_v1',
    });
    runId = run.id;

    const requestedBudget = Number(body.time_budget_ms);
    const budget = (!isNaN(requestedBudget) && requestedBudget > 0)
      ? Math.min(TIME_BUDGET_MS, Math.max(MIN_TIME_BUDGET_MS, requestedBudget))
      : TIME_BUDGET_MS;

    const sweep = await runDeepSweep(base44, {
      category,
      question,
      window,
      regions,
      deadline: started + budget,
    });

    const trends = await base44.asServiceRole.entities.GlobalTrend.filter(
      { category, is_active: true }, '-updated_date', 25
    );

    const classified = await classifyFindings(base44, { findings: sweep.findings, trends, category });
    const summary = await persistFindings(base44, { classified, category, runId });

    await base44.asServiceRole.entities.ProcessingRun.update(runId, {
      status: 'completed',
      completed_at: new Date().toISOString(),
      duration_seconds: Math.round((Date.now() - started) / 1000),
      excerpts_extracted: summary.stored,
      new_trend_proposals: summary.trend_proposals,
      medium_confidence_links: summary.trend_citations,
      low_confidence_rejects: summary.noise,
    });

    return Response.json({
      success: true,
      run_id: runId,
      category,
      window,
      queries_run: sweep.queries,
      gap_note: sweep.gap_note,
      summary,
      findings: classified
        .filter(f => f.disposition !== 'noise')
        .slice(0, 25)
        .map(f => ({
          title: f.title,
          url: f.url,
          publisher: f.publisher,
          published_date: f.published_date,
          region: f.region,
          source_kind: f.source_kind,
          market_signal: f.market_signal,
          relevance_score: f.relevance_score,
          disposition: f.disposition,
          linked_trend_name: f.linked_trend_name,
          proposed_trend_name: f.proposed_trend_name,
        })),
    });
  } catch (error) {
    if (runId && base44) {
      try {
        await base44.asServiceRole.entities.ProcessingRun.update(runId, {
          status: 'failed',
          fatal_error: error.message,
          completed_at: new Date().toISOString(),
        });
      } catch { /* ignore */ }
    }
    return Response.json({ error: error.message }, { status: 500 });
  }
}