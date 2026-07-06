import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';
import * as XLSX from 'npm:xlsx@0.18.5';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { file_url } = await req.json();
    if (!file_url) return Response.json({ error: 'file_url is required' }, { status: 400 });

    // Download and parse the xlsx
    const fileRes = await fetch(file_url);
    if (!fileRes.ok) return Response.json({ error: 'Could not download file' }, { status: 400 });
    const buffer = await fileRes.arrayBuffer();
    const workbook = XLSX.read(new Uint8Array(buffer), { type: 'array' });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: null });

    // Find the header row (contains 'Record ID' and 'All Image Links')
    let headerRowIdx = -1;
    for (let i = 0; i < Math.min(rows.length, 20); i++) {
      const row = rows[i].map(c => String(c ?? '').trim().toLowerCase());
      if (row.includes('record id') && row.some(c => c.includes('image link'))) {
        headerRowIdx = i;
        break;
      }
    }
    if (headerRowIdx === -1) {
      return Response.json({ error: 'Could not find header row with "Record ID" and "All Image Links" columns' }, { status: 400 });
    }

    const header = rows[headerRowIdx].map(c => String(c ?? '').trim().toLowerCase());
    const recordIdCol = header.indexOf('record id');
    const imageCol = header.findIndex(c => c.includes('image link'));

    // Build map: record_id -> first image url
    const imageMap = new Map();
    for (let i = headerRowIdx + 1; i < rows.length; i++) {
      const recordId = String(rows[i][recordIdCol] ?? '').trim();
      const linksRaw = String(rows[i][imageCol] ?? '').trim();
      if (!recordId || !linksRaw) continue;
      // Links separated by newlines or whitespace
      const firstLink = linksRaw.split(/\s+/).find(l => l.startsWith('http'));
      if (firstLink) imageMap.set(recordId, firstLink);
    }

    // Update matching GNPDProduct records in batches
    const recordIds = [...imageMap.keys()];
    let matched = 0;
    let updated = 0;
    const BATCH = 100;
    for (let i = 0; i < recordIds.length; i += BATCH) {
      const batchIds = recordIds.slice(i, i + BATCH);
      const products = await base44.asServiceRole.entities.GNPDProduct.filter(
        { gnpd_record_id: { $in: batchIds } }, null, BATCH * 2
      );
      matched += products.length;
      const updates = products
        .filter(p => imageMap.get(p.gnpd_record_id) && p.image_url !== imageMap.get(p.gnpd_record_id))
        .map(p => ({ id: p.id, image_url: imageMap.get(p.gnpd_record_id) }));
      if (updates.length > 0) {
        await base44.asServiceRole.entities.GNPDProduct.bulkUpdate(updates);
        updated += updates.length;
      }
    }

    return Response.json({
      success: true,
      rows_in_file: recordIds.length,
      products_matched: matched,
      products_updated: updated,
      not_found_in_db: recordIds.length - matched
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});