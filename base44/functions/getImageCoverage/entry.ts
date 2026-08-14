import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';
import { productNameFromExample } from '../../shared/productNames.ts';

const PAGE = 500;

export default async function (req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { report_id } = await req.json().catch(() => ({}));

    // ── Mode A: preflight for one report — which referenced products have pack shots
    if (report_id) {
      const report = await base44.asServiceRole.entities.Report.get(report_id);
      if (!report) return Response.json({ error: 'Report not found' }, { status: 404 });

      const names = [...new Set(
        (report.slides || [])
          .flatMap(s => s.gnpd_examples || [])
          .map(productNameFromExample)
          .filter(n => n.length >= 4)
      )].slice(0, 40);

      const missing = [];
      const missingRecordIds = new Set();
      let matched = 0;
      for (const name of names) {
        const esc = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const hits = await base44.asServiceRole.entities.GNPDProduct.filter(
          { product_name: { $regex: esc, $options: 'i' } }, null, 3
        );
        if (hits.some(h => h.image_url && String(h.image_url).startsWith('http'))) {
          matched++;
        } else {
          missing.push(name);
          for (const h of hits) if (h.gnpd_record_id) missingRecordIds.add(String(h.gnpd_record_id));
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
        total: names.length,
        matched,
        missing,
        missing_record_ids: [...missingRecordIds],
      });
    }

    // ── Mode B: database-wide coverage per Palsgaard category
    const byCategory = {};
    let skip = 0;
    let total = 0;
    let withImage = 0;

    while (true) {
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
      if (page.length < PAGE) break;
      if (skip >= 40000) break;
    }

    return Response.json({ mode: 'database', total, with_image: withImage, by_category: byCategory });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}