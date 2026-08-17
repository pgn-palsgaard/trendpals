// Polls the Anthropic Message Batch created by startClaudePptxExport and, once
// it has finished, stores the generated .pptx on the Report.
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';
import { API, anthropicHeaders, storeGeneratedPptx } from '../../shared/claudePptx.ts';

// Anthropic's batch queue can hold a request far longer than the skill itself
// takes to run, so the give-up window has to be generous — 40 minutes was killing
// runs that were still legitimately queued.
const STALE_MINUTES = 180;

function minutesSince(iso) {
  if (!iso) return 0;
  return (Date.now() - new Date(iso).getTime()) / 60000;
}

async function fail(base44, reportId, message) {
  await base44.asServiceRole.entities.Report.update(reportId, {
    claude_export_status: 'failed',
    claude_export_error: String(message).slice(0, 500),
  });
  return Response.json({ status: 'failed', error: String(message) });
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

    if (report.claude_export_status === 'ready') {
      return Response.json({ status: 'ready', pptx_url: report.claude_pptx_url });
    }
    if (report.claude_export_status === 'failed') {
      return Response.json({ status: 'failed', error: report.claude_export_error });
    }

    const waited = minutesSince(report.claude_export_started_at);

    if (!report.claude_batch_id) {
      if (waited > 5) return await fail(base44, report_id, 'The export never reached Anthropic. Please try again.');
      return Response.json({ status: 'generating', stage: 'preparing' });
    }

    if (waited > STALE_MINUTES) {
      return await fail(base44, report_id, `The skill run did not finish within ${STALE_MINUTES} minutes.`);
    }

    const bRes = await fetch(`${API}/v1/messages/batches/${report.claude_batch_id}`, {
      headers: anthropicHeaders(),
    });
    const batch = await bRes.json().catch(() => ({}));
    if (!bRes.ok) return await fail(base44, report_id, batch?.error?.message || `Anthropic returned ${bRes.status}`);

    if (batch.processing_status !== 'ended') {
      return Response.json({ status: 'generating', stage: 'building' });
    }

    if (!batch.results_url) {
      return await fail(base44, report_id, 'The skill run ended without results.');
    }

    const rRes = await fetch(batch.results_url, { headers: anthropicHeaders() });
    const text = await rRes.text();
    const line = text.split('\n').map(l => l.trim()).filter(Boolean)[0];
    if (!line) return await fail(base44, report_id, 'The skill run returned no result.');

    const entry = JSON.parse(line);
    const result = entry?.result;
    if (result?.type !== 'succeeded') {
      const msg = result?.error?.error?.message || result?.error?.message || `Skill run ${result?.type || 'failed'}`;
      return await fail(base44, report_id, msg);
    }

    const fileUrl = await storeGeneratedPptx(base44, result.message, report.claude_uploaded_file_ids || []);

    await base44.asServiceRole.entities.Report.update(report_id, {
      claude_pptx_url: fileUrl,
      claude_export_status: 'ready',
      claude_export_error: null,
    });

    return Response.json({ status: 'ready', pptx_url: fileUrl });
  } catch (error) {
    // A poll must never 500 silently — that left the UI spinning forever while the
    // real reason (file fetch / storage failure) stayed invisible. Log it and report
    // it as a transient stage so the next poll can still succeed.
    console.error('checkClaudePptxExport failed:', error?.stack || error?.message || error);
    return Response.json({ status: 'generating', stage: 'retrying', last_error: String(error?.message || error) });
  }
}