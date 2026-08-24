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

    // This aggregation reads EVERY GNPDProduct record. At 28k+ records that is far
    // too expensive to run per page load — doing so exhausted the app's entity read
    // traffic budget. The counts are therefore served from a cache and only
    // recomputed when explicitly forced or when the cached snapshot is stale.
    const CACHE_TTL_MINUTES = 30;
    const filterKey = `${catFilter}|${regionFilter || ''}`;
    const force = body.force === true;

    let cacheRow = null;
    try {
      const rows = await base44.asServiceRole.entities.GNPDStatsCache.filter({ filter_key: filterKey }, '-computed_at', 1);
      cacheRow = rows?.[0] || null;
    } catch (_) { /* cache miss is never fatal */ }

    if (!force && cacheRow?.stats && cacheRow.computed_at) {
      const ageMinutes = (Date.now() - new Date(cacheRow.computed_at).getTime()) / 60000;
      if (ageMinutes < CACHE_TTL_MINUTES) {
        return Response.json({ ...cacheRow.stats, cached: true, computed_at: cacheRow.computed_at });
      }
    }

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

    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

    // Fetch one page with a single retry on 429 rate-limit
    async function fetchPage(currentSkip) {
      for (let attempt = 0; attempt < 4; attempt++) {
        try {
          return await base44.asServiceRole.entities.GNPDProduct.list('-created_date', PAGE, currentSkip);
        } catch (err) {
          const is429 = err?.status === 429 || String(err?.message || '').includes('429') || String(err?.message || '').toLowerCase().includes('rate limit');
          if (is429 && attempt < 3) { await sleep(1500 * (attempt + 1)); continue; }
          throw err;
        }
      }
    }

    let scanned = 0;
    while (true) {
      const page = await fetchPage(skip);
      if (!page || page.length === 0) break;
      scanned += page.length;

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
      await sleep(250); // gentle pacing to stay under the platform rate limit
    }

    const stats = { total, with_image, with_emulsifier, trend_linked, pending_review, by_category, by_region, by_source };
    const computedAt = new Date().toISOString();

    // Persist the snapshot so the next page load costs one read instead of 28k.
    try {
      if (cacheRow) {
        await base44.asServiceRole.entities.GNPDStatsCache.update(cacheRow.id, { stats, computed_at: computedAt, records_scanned: scanned });
      } else {
        await base44.asServiceRole.entities.GNPDStatsCache.create({ filter_key: filterKey, stats, computed_at: computedAt, records_scanned: scanned });
      }
    } catch (_) { /* a failed cache write must not fail the request */ }

    return Response.json({ ...stats, cached: false, computed_at: computedAt });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});