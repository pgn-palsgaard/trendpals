import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';
import { resolveDeckProducts } from '../../shared/deckImages.ts';

const PAGE = 500;
const MAX_PAGES_PER_CALL = 8;

export default async function (req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const { report_id } = body;

    // ── Mode A: preflight for one report — which referenced products have pack shots
    if (report_id) {
      const report = await base44.asServiceRole.entities.Report.get(report_id);
      if (!report) return Response.json({ error: 'Report not found' }, { status: 404 });

      const resolved = await resolveDeckProducts(base44, report, 40);

      const missing = [];
      const missingRecordIds = new Set();
      let matched = 0;
      for (const r of resolved) {
        if (r.image_url) {
          matched++;
        } else {
          missing.push(r.label || r.record_id || r.example);
          if (r.record_id) missingRecordIds.add(String(r.record_id));
        }
      }

      // Also cover Record IDs carried directly on the report's product shortlist.
      for (const p of (report.product_shortlist || [])) {
        const rid = p?.gnpd_record_id || p?.record_id;
        if (!rid) continue;
        const hits = await base44.asServiceRole.entities.GNPDProduct.filter(
          { gnpd_record_id: String(rid) }, null, 2
        );
        const hasImage = hits.some(h => h.image_url && String(h.image_url).startsWith('http'));
        if (!hasImage) missingRecordIds.add(String(rid));
      }

      return Response.json({
        mode: 'report',
        total: resolved.length,
        matched,
        missing,
        missing_record_ids: [...missingRecordIds],
      });
    }

    // ── Mode B: database-wide coverage per Palsgaard category.
    // Scanned in resumable chunks — a full 31k-record sweep in one request
    // exceeds the gateway timeout and the caller sees a 500.
    const byCategory = {};
    let skip = Number(body.skip) || 0;
    let total = 0;
    let withImage = 0;
    let pages = 0;

    while (pages < MAX_PAGES_PER_CALL) {
      const page = await base44.asServiceRole.entities.GNPDProduct.list('created_date', PAGE, skip);
      if (!page || page.length === 0) break;

      for (const p of page) {
        const cat = p.palsgaard_category || 'uncategorised';
        if (!byCategory[cat]) byCategory[cat] = { total: 0, with_image: 0 };
        byCategory[cat].total++;
        total++;
        if (p.image_url && String(p.image_url).startsWith('http')) {
          byCategory[cat].with_image++;
          withImage++;
        }
      }

      skip += page.length;
      pages++;
      if (page.length < PAGE) {
        return Response.json({ mode: 'database', total, with_image: withImage, by_category: byCategory, next_skip: null });
      }
    }

    return Response.json({ mode: 'database', total, with_image: withImage, by_category: byCategory, next_skip: skip });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}