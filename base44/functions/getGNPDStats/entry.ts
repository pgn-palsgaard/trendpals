import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    // Optional filters: { category, region_code } — used by project readiness checks
    let body = {};
    try { body = await req.json(); } catch (_) { /* no payload */ }
    const catFilter = (body.category || '').toLowerCase();
    const regionFilter = body.region_code && body.region_code !== 'Global' ? body.region_code : null;

    // Paginate through ALL GNPDProduct records accumulating counts
    const PAGE = 500;
    let skip = 0;
    let total = 0;
    let with_image = 0;
    let with_emulsifier = 0;
    let trend_linked = 0;
    let pending_review = 0;
    const by_category = {};
    const by_region = {};
    const by_source = {};

    while (true) {
      const page = await base44.asServiceRole.entities.GNPDProduct.list('-created_date', PAGE, skip);
      if (!page || page.length === 0) break;

      for (const p of page) {
        if (catFilter) {
          const pc = (p.category || '').toLowerCase();
          if (!pc || (!pc.includes(catFilter) && !catFilter.includes(pc))) continue;
        }
        if (regionFilter && p.region_code !== regionFilter) continue;

        total++;

        if (p.image_url) with_image++;
        if (p.has_emulsifier) with_emulsifier++;
        if ((p.linked_trend_ids || []).length > 0) trend_linked++;
        if (p.processing_status === 'trend_linking_pending') pending_review++;

        const cat = p.category || 'Unknown';
        by_category[cat] = (by_category[cat] || 0) + 1;

        const reg = p.region_code || 'Global';
        by_region[reg] = (by_region[reg] || 0) + 1;

        if (p.source_id) by_source[p.source_id] = (by_source[p.source_id] || 0) + 1;
      }

      if (page.length < PAGE) break;
      skip += PAGE;
    }

    return Response.json({ total, with_image, with_emulsifier, trend_linked, pending_review, by_category, by_region, by_source });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});