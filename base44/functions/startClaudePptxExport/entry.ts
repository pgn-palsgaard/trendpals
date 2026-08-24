// Builds a Palsgaard-branded PPTX for a saved report — synchronously.
//
// Architecture (Step 2): the deterministic build_deck.py script + data.json are
// sent to a single synchronous streaming /v1/messages call. Claude only RUNS the
// script; it does not author python-pptx code. The whole job fits inside the
// platform's request ceiling, so there is no batch, no waitUntil, no background
// work — the HTTP response returns after the deck is built (or after it fails).
//
// checkClaudePptxExport is now a pure read of the Report fields this function
// writes (status / stage / stage_detail), used by the UI to show live progress.
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';
import {
  API,
  anthropicHeaders,
  uploadPackshotImages,
  buildDataJson,
  runSkillStream,
  storeGeneratedPptx,
} from '../../shared/claudePptx.ts';
import { runExportPreflight, recordPreflightFailure } from '../../shared/exportPreflight.ts';

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

    const Reports = base44.asServiceRole.entities.Report;

    await Reports.update(report_id, {
      preflight_failed: false,
      preflight_error: null,
      claude_export_status: 'generating',
      claude_export_stage: 'uploading_images',
      claude_export_stage_detail: 'Starting',
      claude_export_error: null,
      claude_pptx_url: null,
      claude_export_started_at: new Date().toISOString(),
      claude_export_finished_at: null,
      claude_export_message_id: null,
      claude_export_usage: null,
    });

    // Everything from here on is the synchronous export itself. Any failure marks
    // the report failed and returns 500 — there is no background path to recover.
    let uploads: Array<{ file_id: string; filename: string; product: string; record_id: string | null }> = [];
    try {
      uploads = await uploadPackshotImages(base44, report);

      await Reports.update(report_id, {
        claude_export_stage: 'building',
        claude_export_stage_detail: 'Sending to Claude',
      });

      // Build B — DEBOUNCED progress writes. The stream fires this callback on every
      // non-empty text delta (hundreds per export). Writing per delta created
      // hundreds of concurrent unawaited DB writes and killed the function with
      // exceededMemory. Now: keep the latest string in memory, write at most once
      // every 4 seconds, await each write, and never overlap two.
      const FLUSH_MS = 4000;
      let pendingDetail: string | null = null;
      let lastFlush = 0;
      let flushing = false;

      const flushDetail = async () => {
        if (pendingDetail === null || flushing) return;
        flushing = true;
        const detail = pendingDetail;
        pendingDetail = null;
        lastFlush = Date.now();
        try {
          await Reports.update(report_id, { claude_export_stage_detail: detail.slice(0, 200) });
        } catch { /* progress text is cosmetic — never fail an export on it */ }
        flushing = false;
      };

      const onStageDetail = (detail: string) => {
        pendingDetail = String(detail);
        if (!flushing && Date.now() - lastFlush >= FLUSH_MS) void flushDetail();
      };

      const { message, usage } = await runSkillStream(
        uploads,
        buildDataJson(report, uploads),
        onStageDetail,
      );

      // The last detail is never lost: one final awaited flush after the stream.
      await flushDetail();

      await Reports.update(report_id, {
        claude_export_message_id: (message as Record<string, unknown>)?.id ?? null,
        claude_export_usage: usage ?? null,
      });

      const fileUrl = await storeGeneratedPptx(
        base44,
        message as Record<string, unknown>,
        uploads.map(u => u.file_id),
      );

      await Reports.update(report_id, {
        claude_pptx_url: fileUrl,
        claude_export_status: 'ready',
        claude_export_stage: 'done',
        claude_export_stage_detail: 'Your deck is ready',
        claude_export_finished_at: new Date().toISOString(),
      });

      // Clean up pack shots from Anthropic Files. Failures ignored — the files
      // expire server-side anyway; a leftover file must never fail a built deck.
      for (const u of uploads) {
        fetch(`${API}/v1/files/${u.file_id}`, { method: 'DELETE', headers: anthropicHeaders() }).catch(() => {});
      }

      return Response.json({ started: true, slide_count: report.slides.length });
    } catch (error) {
      await Reports.update(report_id, {
        claude_export_status: 'failed',
        claude_export_error: String(error?.message || error).slice(0, 500),
        claude_export_stage: null,
        claude_export_finished_at: new Date().toISOString(),
      }).catch(() => {});
      for (const u of uploads) {
        fetch(`${API}/v1/files/${u.file_id}`, { method: 'DELETE', headers: anthropicHeaders() }).catch(() => {});
      }
      return Response.json({ error: String(error?.message || error) }, { status: 500 });
    }
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}