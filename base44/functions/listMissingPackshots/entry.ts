import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';

const PAGE = 500;
// Kept deliberately small: a full 31k sweep in one request exceeds the gateway
// timeout, so the caller resumes with next_skip instead.
const MAX_PAGES_PER_CALL = 8;

export default async function (req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const category = body.category || null;
    let skip = Number(body.skip) || 0;

    const missing = [];
    let scanned = 0;
    let pages = 0;
    let nextSkip = null;

    while (pages < MAX_PAGES_PER_CALL) {
      const page = category
        ? await base44.asServiceRole.entities.GNPDProduct.filter(
            { palsgaard_category: category }, 'created_date', PAGE, skip
          )
        : await base44.asServiceRole.entities.GNPDProduct.list('created_date', PAGE, skip);

      if (!page || page.length === 0) break;

      for (const p of page) {
        scanned++;
        const hasImage = p.image_url && String(p.image_url).startsWith('http');
        if (!hasImage && p.gnpd_record_id) missing.push(String(p.gnpd_record_id));
      }

      skip += page.length;
      pages++;
      if (page.length < PAGE) break;
      if (pages >= MAX_PAGES_PER_CALL) nextSkip = skip;
    }

    return Response.json({ scanned, missing, next_skip: nextSkip });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}