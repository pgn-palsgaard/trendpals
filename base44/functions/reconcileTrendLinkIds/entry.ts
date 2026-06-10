import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

// One-time reconciliation: recompute linked_trend_ids (and processing_status for GNPDProduct)
// from trend_links for ALL GNPDProduct and ExpertExample records.
// Fixes review decisions made before the ReviewQueueTab propagation fix.

function computeUpdate(record, isProduct) {
  const links = record.trend_links || [];
  if (links.length === 0) return null;

  const appliedIds = [...new Set(links
    .filter(l => l.review_status === 'auto_applied' || l.review_status === 'approved')
    .map(l => l.trend_id)
    .filter(Boolean))];

  const update = {};
  const current = record.linked_trend_ids || [];
  const same = current.length === appliedIds.length && appliedIds.every(id => current.includes(id));
  if (!same) update.linked_trend_ids = appliedIds;

  if (isProduct) {
    const desired = links.some(l => l.review_status === 'pending') ? 'trend_linking_pending' : 'trend_linked';
    if (record.processing_status !== desired) update.processing_status = desired;
  }

  return Object.keys(update).length > 0 ? update : null;
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (user?.role !== 'admin') {
      return Response.json({ error: 'Forbidden: Admin access required' }, { status: 403 });
    }

    const PAGE = 500;
    const results = {};

    for (const [entityName, isProduct] of [['GNPDProduct', true], ['ExpertExample', false]]) {
      let skip = 0, scanned = 0, changed = 0, errors = 0;
      const changedSamples = [];

      while (true) {
        const page = await base44.asServiceRole.entities[entityName].list('-created_date', PAGE, skip);
        if (!page || page.length === 0) break;

        for (const r of page) {
          scanned++;
          const update = computeUpdate(r, isProduct);
          if (update) {
            try {
              await base44.asServiceRole.entities[entityName].update(r.id, update);
              changed++;
              if (changedSamples.length < 10) {
                changedSamples.push({ id: r.id, name: r.product_name, fields: Object.keys(update) });
              }
            } catch (e) {
              errors++;
              console.error(`[reconcile] ${entityName} ${r.id} update failed: ${e.message}`);
            }
          }
        }

        if (page.length < PAGE) break;
        skip += PAGE;
      }

      results[entityName] = { scanned, changed, errors, samples: changedSamples };
    }

    return Response.json({ success: true, ...results });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});