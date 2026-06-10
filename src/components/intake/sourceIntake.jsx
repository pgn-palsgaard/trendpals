import { base44 } from '@/api/base44Client';

/**
 * Canonical source intake — the ONLY way files/URLs enter the system.
 * Pipeline: upload → Source (pipeline_stage=uploaded, review_status=pending)
 *   → metadata extraction → human verification + approval gate → auto-excerpt processing.
 * GNPD spreadsheets: validateAndIngestGNPD → automation triggers the parse/ingestion chain.
 * Optionally links the resulting Source to a project.
 */

export async function linkSourceToProject(projectId, sourceId) {
  const project = await base44.entities.Project.get(projectId);
  const ids = project.selected_source_ids || [];
  if (!ids.includes(sourceId)) {
    await base44.entities.Project.update(projectId, { selected_source_ids: [...ids, sourceId] });
  }
}

export async function intakeFile({ file, sourceType, projectId = null, title = null }) {
  const { file_url } = await base44.integrations.Core.UploadFile({ file });
  const ext = file.name.toLowerCase().split('.').pop();

  if (sourceType === 'gnpd') {
    if (ext !== 'xls' && ext !== 'xlsx') {
      throw new Error(`GNPD exports must be .xls or .xlsx (got .${ext}). Use the Mintel Spreadsheet Template export.`);
    }
    const source = await base44.entities.Source.create({
      source_type: 'gnpd',
      title: title || file.name,
      file_url,
      file_size: file.size,
      gnpd_mapping_status: 'detecting',
      visibility: 'org_shared',
    });
    const res = await base44.functions.invoke('validateAndIngestGNPD', { source_id: source.id });
    if (!res.data?.success) {
      throw new Error((res.data?.errors || ['GNPD validation failed']).join(' · '));
    }
    if (projectId) await linkSourceToProject(projectId, source.id);
    return { sourceId: source.id, gnpd: true, rows: res.data.rows };
  }

  const source = await base44.entities.Source.create({
    source_type: sourceType,
    title: title || file.name,
    file_url,
    file_size: file.size,
    visibility: 'org_shared',
    pipeline_stage: 'uploaded',
    review_status: 'pending',
    date: new Date().toISOString().split('T')[0],
    // Guardrail: a Source must never sit in Queue with metadata_extraction=null —
    // the extraction automation overwrites this placeholder with real status.
    metadata_extraction: { status: 'pending', verified: false },
  });
  // Metadata extraction fires automatically via the "Auto Extract Source Metadata" automation (Source create).
  // Verification + approval happens in the source library; approval triggers auto-excerpt processing.
  if (projectId) await linkSourceToProject(projectId, source.id);
  return { sourceId: source.id, gnpd: false };
}

export async function intakeUrl({ url, title = null, projectId = null, extraFields = {} }) {
  const source = await base44.entities.Source.create({
    source_type: 'url',
    title: title || url,
    url,
    visibility: 'org_shared',
    pipeline_stage: 'uploaded',
    review_status: 'pending',
    date: new Date().toISOString().split('T')[0],
    metadata_extraction: { status: 'pending', verified: false },
    ...extraFields,
  });
  if (projectId) await linkSourceToProject(projectId, source.id);
  return { sourceId: source.id };
}