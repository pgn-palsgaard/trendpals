import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';
import JSZip from 'npm:jszip@3.10.1';
import { recordIdFromFilename, isImageName } from '../../shared/packshotIds.ts';

// Matches uploaded pack shot images to GNPD products by Record ID in the filename
// and stores the image on GNPDProduct.image_url.
// Payload: { files: [{ name, file_url }] } and/or { zip_url }.
export default async function (req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const items = Array.isArray(body.files) ? body.files.filter(f => f && f.file_url && f.name) : [];

    // Expand a zip archive into individual uploaded images.
    if (body.zip_url) {
      const res = await fetch(body.zip_url);
      if (!res.ok) throw new Error('Could not download the zip file');
      const zip = await JSZip.loadAsync(await res.arrayBuffer());
      const entries = Object.values(zip.files).filter(
        (e) => !e.dir && isImageName(e.name) && !e.name.split('/').pop().startsWith('.')
      );
      for (const entry of entries.slice(0, 200)) {
        const bytes = await entry.async('uint8array');
        const fileName = entry.name.split('/').pop();
        const up = await base44.asServiceRole.integrations.Core.UploadFile({
          file: new File([bytes], fileName),
        });
        if (up?.file_url) items.push({ name: fileName, file_url: up.file_url });
      }
    }

    const results = [];
    const updates = [];

    for (const item of items) {
      const recordId = recordIdFromFilename(item.name);
      if (!recordId) {
        results.push({ name: item.name, status: 'skipped', reason: 'No Record ID in filename' });
        continue;
      }
      const hits = await base44.asServiceRole.entities.GNPDProduct.filter(
        { gnpd_record_id: recordId }, null, 5
      );
      if (!hits || hits.length === 0) {
        results.push({ name: item.name, record_id: recordId, status: 'not_found' });
        continue;
      }
      for (const h of hits) updates.push({ id: h.id, image_url: item.file_url });
      results.push({ name: item.name, record_id: recordId, status: 'updated', products: hits.length });
    }

    if (updates.length > 0) {
      for (let i = 0; i < updates.length; i += 200) {
        await base44.asServiceRole.entities.GNPDProduct.bulkUpdate(updates.slice(i, i + 200));
      }
    }

    return Response.json({
      matched: results.filter(r => r.status === 'updated').length,
      updated: updates.length,
      not_found: results.filter(r => r.status === 'not_found').length,
      skipped: results.filter(r => r.status === 'skipped').length,
      results,
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}