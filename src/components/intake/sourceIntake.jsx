import { base44 } from '@/api/base44Client';

/**
 * Canonical source intake — the ONLY way files/URLs enter the system.
 * The user never picks source_type — the system classifies automatically:
 *   upload → dedup check → Source created (pipeline_stage=uploaded, classification=classifying)
 *   → classifySource (LLM): confidence >= 85 auto-applies + routes; < 85 → needs_classification (human decides).
 * Spreadsheets are tested against the locked GNPD Mintel template FIRST — match routes to the
 * GNPD pipeline, non-match is rejected with a specific error.
 */

export class DuplicateSourceError extends Error {
  constructor(duplicates) {
    super(`Duplicate of existing source: "${duplicates[0]?.title}" (${duplicates[0]?.review_status || 'pending'})`);
    this.name = 'DuplicateSourceError';
    this.duplicates = duplicates;
  }
}

export async function computeFileHash(file) {
  const buffer = await file.arrayBuffer();
  const digest = await crypto.subtle.digest('SHA-256', buffer);
  return [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, '0')).join('');
}

export async function checkDuplicate({ fileHash, title }) {
  // Non-blocking: duplicate detection is a convenience check, never a gate that can
  // break uploads. If the check itself errors out, we let the upload proceed.
  try {
    const res = await base44.functions.invoke('checkDuplicateSource', { file_hash: fileHash, title });
    return res.data?.duplicates || [];
  } catch (e) {
    console.warn('Duplicate check unavailable — continuing upload', e);
    return [];
  }
}

export async function linkSourceToProject(projectId, sourceId) {
  const project = await base44.entities.Project.get(projectId);
  const ids = project.selected_source_ids || [];
  if (!ids.includes(sourceId)) {
    await base44.entities.Project.update(projectId, { selected_source_ids: [...ids, sourceId] });
  }
}

const SPREADSHEET_EXTS = ['xls', 'xlsx'];

export async function intakeFile({ file, projectId = null, title = null, allowDuplicate = false }) {
  // Fix 4 — duplicate detection BEFORE creating a Source
  const fileHash = await computeFileHash(file);
  if (!allowDuplicate) {
    const duplicates = await checkDuplicate({ fileHash, title: title || file.name });
    if (duplicates.length > 0) throw new DuplicateSourceError(duplicates);
  }

  const { file_url } = await base44.integrations.Core.UploadFile({ file });
  const ext = file.name.toLowerCase().split('.').pop();

  // Special case: spreadsheets are tested against the locked GNPD Mintel template FIRST.
  // Match → GNPD pipeline. Non-match → rejected with a specific error, never classified as something else.
  if (SPREADSHEET_EXTS.includes(ext)) {
    const source = await base44.entities.Source.create({
      source_type: 'gnpd',
      title: title || file.name,
      file_url,
      file_size: file.size,
      file_hash: fileHash,
      gnpd_mapping_status: 'detecting',
      visibility: 'org_shared',
    });
    // Heavy validation/parsing (fetch file → parse xlsx → write rows) can exceed the
    // request timeout on large exports (15MB+), causing a 502. Run it in the background:
    // the Source is created in 'detecting' state, the UploadsTab polls it, and the function
    // flips it to 'complete' or 'failed' when done. The user gets an instant response.
    base44.functions.invoke('validateAndIngestGNPD', { source_id: source.id }).catch(() => {});
    if (projectId) await linkSourceToProject(projectId, source.id);
    return { sourceId: source.id, gnpd: true, background: true };
  }

  // All other files: created untyped, classified automatically by LLM
  const source = await base44.entities.Source.create({
    source_type: 'other', // placeholder until classification applies the real type
    title: title || file.name,
    file_url,
    file_size: file.size,
    file_hash: fileHash,
    visibility: 'org_shared',
    pipeline_stage: 'uploaded',
    review_status: 'pending',
    date: new Date().toISOString().split('T')[0],
    classification: { status: 'classifying' },
    // Guardrail: a Source must never sit in Queue with metadata_extraction=null
    metadata_extraction: { status: 'pending', verified: false },
  });

  // Fire classification (it routes into the correct flow on completion; sets failed state on error)
  base44.functions.invoke('classifySource', { source_id: source.id }).catch(() => {});

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
    classification: { status: 'classifying' },
    metadata_extraction: { status: 'pending', verified: false },
    ...extraFields,
  });
  base44.functions.invoke('classifySource', { source_id: source.id }).catch(() => {});
  if (projectId) await linkSourceToProject(projectId, source.id);
  return { sourceId: source.id };
}