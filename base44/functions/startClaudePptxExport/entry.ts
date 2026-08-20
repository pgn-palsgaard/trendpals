// Kicks off a Palsgaard-branded PPTX build for a saved report using the custom
// "Palsgaard PowerPoint" Agent Skill on the Anthropic API.
//
// The skill run takes several minutes — longer than a single request may live —
// so the work is submitted as an Anthropic Message Batch and its id is stored on
// the Report. checkClaudePptxExport polls the batch and stores the finished file.
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';
import { waitUntil } from 'base44:runtime';
import { API, anthropicHeaders, uploadPackshotImages, buildBatchRequest } from '../../shared/claudePptx.ts';
import { runExportPreflight, recordPreflightFailure } from '../../shared/exportPreflight.ts';

async function submitBatch(base44, report) {
  try {
    const uploads = await uploadPackshotImages(base44, report);

    const res = await fetch(`${API}/v1/messages/batches`, {
      method: 'POST',
      headers: anthropicHeaders({ 'content-type': 'application/json' }),
      body: JSON.stringify({ requests: [buildBatchRequest(report, uploads)] }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data?.id) throw new Error(data?.error?.message || `Anthropic returned ${res.status}`);

    await base44.asServiceRole.entities.Report.update(report.id, {
      claude_batch_id: data.id,
      claude_uploaded_file_ids: uploads.map(u => u.file_id),
    });
  } catch (error) {
    await base44.asServiceRole.entities.Report.update(report.id, {
      claude_export_status: 'failed',
      claude_export_error: String(error?.message || error).slice(0, 500),
    }).catch(() => {});
  }
}

export default async function (req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { report_id } = await req.json();
    if (!report_id) return Response.json({ error: 'report_id is required' }, { status: 400 });

    const report = await base44.asServiceRole.entities.Report.get(report_id);
    if (!report) return Response.json({ error: 'Report not found' }, { status: 404 });
    if (!report.slides || report.slides.length === 0) {
      return Response.json({ error: 'This report has no slides to export' }, { status: 400 });
    }

    // Regional containment pre-flight — runs BEFORE anything is sent to Anthropic.
    const preflight = runExportPreflight(report);
    if (!preflight.ok) {
      await recordPreflightFailure(base44, report_id, preflight);
      return Response.json(preflight.payload, { status: 400 });
    }

    await base44.asServiceRole.entities.Report.update(report_id, {
      preflight_failed: false,
      preflight_error: null,
      claude_export_status: 'generating',
      claude_export_error: null,
      claude_pptx_url: null,
      claude_batch_id: null,
      claude_uploaded_file_ids: [],
      claude_export_started_at: new Date().toISOString(),
    });

    waitUntil(submitBatch(base44, report));

    return Response.json({ started: true, slide_count: report.slides.length });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}