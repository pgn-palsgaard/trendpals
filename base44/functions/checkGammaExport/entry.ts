import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';
import { secrets } from 'base44:runtime';

export default async function (req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { report_id } = await req.json();
    if (!report_id) return Response.json({ error: 'report_id is required' }, { status: 400 });

    const report = await base44.asServiceRole.entities.Report.get(report_id);
    if (!report) return Response.json({ error: 'Report not found' }, { status: 404 });

    if (report.gamma_export_status === 'ready') {
      return Response.json({
        status: 'ready',
        gamma_url: report.gamma_url,
        pptx_url: report.gamma_pptx_url,
      });
    }
    if (!report.gamma_generation_id) {
      return Response.json({ status: report.gamma_export_status || 'idle' });
    }

    const res = await fetch(
      `https://public-api.gamma.app/v1.0/generations/${report.gamma_generation_id}`,
      { headers: { 'X-API-KEY': secrets.get('GAMMA_API_KEY') } }
    );
    const data = await res.json().catch(() => ({}));

    if (!res.ok) {
      return Response.json({ status: 'generating', note: `Gamma returned ${res.status}` });
    }

    if (data.status === 'completed') {
      await base44.asServiceRole.entities.Report.update(report_id, {
        gamma_export_status: 'ready',
        gamma_url: data.gammaUrl || null,
        gamma_pptx_url: data.exportUrl || null,
        gamma_export_error: null,
      });
      return Response.json({
        status: 'ready',
        gamma_url: data.gammaUrl || null,
        pptx_url: data.exportUrl || null,
        credits: data.credits || null,
      });
    }

    if (data.status === 'failed') {
      const message = data.error?.message || 'Gamma generation failed';
      await base44.asServiceRole.entities.Report.update(report_id, {
        gamma_export_status: 'failed',
        gamma_export_error: String(message).slice(0, 500),
      });
      return Response.json({ status: 'failed', error: message });
    }

    return Response.json({ status: 'generating' });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}