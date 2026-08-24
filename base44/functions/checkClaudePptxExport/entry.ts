// Pure read of the Claude-skill export state on a Report.
//
// The export itself is now a synchronous call inside startClaudePptxExport —
// this function NEVER calls Anthropic and NEVER mutates the report. It exists
// so the UI can poll live progress (stage / stage_detail) while the synchronous
// build runs, and detect a build stuck by an infrastructure timeout.
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';

export default async function (req) {
  const base44 = createClientFromRequest(req);
  const user = await base44.auth.me();
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const { report_id } = await req.json();
  if (!report_id) return Response.json({ error: 'report_id is required' }, { status: 400 });

  const report = await base44.asServiceRole.entities.Report.get(report_id);
  if (!report) return Response.json({ error: 'Report not found' }, { status: 404 });

  const startedAt = report.claude_export_started_at
    ? new Date(report.claude_export_started_at).getTime()
    : null;

  // Build B — stale-state recovery. A platform kill (exceededMemory, timeout,
  // crash) terminates the export process, so NO catch block inside it ever runs
  // and the report stays 'generating' forever. Only an outside observer can clean
  // that up, and this poll is the observer. It detects the SYMPTOM (stuck too
  // long), so it works regardless of cause. Typical export: 28-31s; platform
  // ceiling: 293s — nothing still running after 5 minutes is going to finish.
  const STALE_MS = 5 * 60 * 1000;
  if (report.claude_export_status === 'generating' && startedAt && Date.now() - startedAt > STALE_MS) {
    const error = 'The export timed out — please try again.';
    await base44.asServiceRole.entities.Report.update(report_id, {
      claude_export_status: 'failed',
      claude_export_error: error,
      claude_export_stage: null,
      claude_export_finished_at: new Date().toISOString(),
    });
    return Response.json({
      status: 'failed',
      stage: null,
      stage_detail: report.claude_export_stage_detail ?? null,
      pptx_url: null,
      error,
      stale_recovered: true,
      elapsed_seconds: Math.round((Date.now() - startedAt) / 1000),
    });
  }

  return Response.json({
    status: report.claude_export_status ?? 'idle',
    stage: report.claude_export_stage ?? null,
    stage_detail: report.claude_export_stage_detail ?? null,
    pptx_url: report.claude_pptx_url ?? null,
    error: report.claude_export_error ?? null,
    elapsed_seconds: startedAt ? Math.max(0, Math.round((Date.now() - startedAt) / 1000)) : 0,
  });
}