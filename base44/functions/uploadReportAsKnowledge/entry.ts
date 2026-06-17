import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

/**
 * CL-60: Upload a final report file and ingest it as a knowledge Source.
 * Steps:
 *   1. Upload file bytes → get file_url
 *   2. Create Source record (source_type='knowledge', source_report_id, source_project_id)
 *   3. Append entry to Report.final_uploads[]
 *   4. Invoke classifySource → triggers autoExtractMetadata automatically on high-confidence result
 *
 * Payload: { report_id, file_url, file_name, file_type, notes? }
 * (File upload to storage happens client-side via UploadFile before calling this function)
 */
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { report_id, file_url, file_name, file_type, notes } = await req.json();
    if (!report_id || !file_url || !file_name) {
      return Response.json({ error: 'report_id, file_url, and file_name are required' }, { status: 400 });
    }

    // Fetch the report to get project context
    const report = await base44.asServiceRole.entities.Report.get(report_id);
    if (!report) return Response.json({ error: `Report not found: ${report_id}` }, { status: 404 });

    const uploadedAt = new Date().toISOString();
    const sourceTitle = `${report.title || 'Report'} — uploaded ${uploadedAt.slice(0, 10)}`;

    // 1. Create a Source record as knowledge type
    const source = await base44.asServiceRole.entities.Source.create({
      source_type: 'knowledge',
      title: sourceTitle,
      file_url,
      pipeline_stage: 'uploaded',
      review_status: 'pending',
      visibility: 'org_shared',
      allowed_use: 'capability_proof_only',
      knowledge_subtype: 'other',
      owner_org: 'Palsgaard',
      project_id: report.project_id || null,
      source_report_id: report_id,
      source_project_id: report.project_id || null,
      notes: notes || null,
      tags: ['re-uploaded-report'],
      metadata_extraction: { status: 'pending', last_attempted: uploadedAt },
    });

    // 2. Append to Report.final_uploads (non-destructive — preserves existing entries)
    const existingUploads = Array.isArray(report.final_uploads) ? report.final_uploads : [];
    const newEntry = {
      url: file_url,
      file_type: file_type || 'other',
      uploaded_at: uploadedAt,
      uploaded_by: user.email || null,
      source_id: source.id,
      notes: notes || null,
    };
    await base44.asServiceRole.entities.Report.update(report_id, {
      final_uploads: [...existingUploads, newEntry],
    });

    // 3. Invoke classifySource — on >=85% confidence it will auto-apply source_type
    //    and chain into autoExtractMetadata which extracts excerpts.
    //    Fire-and-forget: we return immediately; extraction happens async.
    base44.asServiceRole.functions.invoke('classifySource', { source_id: source.id }).catch(async (err) => {
      console.warn(`[uploadReportAsKnowledge] classifySource invoke failed (${err.message}) — retrying via HTTP`);
      const fnUrl = `https://base44.app/api/apps/${Deno.env.get('BASE44_APP_ID')}/functions/classifySource`;
      const headers = { 'Content-Type': 'application/json' };
      for (const h of ['authorization', 'api_key', 'x-api-key', 'cookie']) {
        const v = req.headers.get(h);
        if (v) headers[h] = v;
      }
      await fetch(fnUrl, { method: 'POST', headers, body: JSON.stringify({ source_id: source.id }) });
    });

    return Response.json({
      ok: true,
      source_id: source.id,
      report_id,
      uploaded_at: uploadedAt,
      message: 'Source record created and classification pipeline triggered',
    });

  } catch (error) {
    console.error('[uploadReportAsKnowledge]', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});