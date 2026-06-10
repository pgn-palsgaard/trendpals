import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const skip = body.skip || 0;
    const PAGE = 500;

    // Paginate through GNPDProducts server-side and flatten pending links
    const results = [];
    let productSkip = 0;
    let processed = 0;

    while (true) {
      const batch = await base44.asServiceRole.entities.GNPDProduct.filter(
        {}, '-launch_date', 200, productSkip
      );
      if (batch.length === 0) break;

      for (const product of batch) {
        if (!product.trend_links || product.trend_links.length === 0) continue;
        product.trend_links.forEach((link, idx) => {
          if (link.review_status === 'pending') {
            results.push({
              entity_type: 'gnpd_product',
              product_id: product.id,
              product_name: product.product_name,
              brand: product.brand || '',
              country: product.country || '',
              category: product.category || '',
              launch_date: product.launch_date || '',
              link_index: idx,
              trend_id: link.trend_id || '',
              trend_name: link.trend_name || '',
              confidence: link.confidence || '',
              confidence_score: link.confidence_score || 0,
              reasoning: link.reasoning || '',
              matched_keywords: link.matched_keywords || [],
              linked_at: link.linked_at || '',
            });
          }
        });
      }

      processed += batch.length;
      if (batch.length < 200) break;
      productSkip += 200;
    }

    // Also include pending ExpertExample trend links
    let exSkip = 0;
    while (true) {
      const exBatch = await base44.asServiceRole.entities.ExpertExample.filter({}, '-created_date', 200, exSkip);
      if (exBatch.length === 0) break;
      for (const ex of exBatch) {
        if (!ex.trend_links || ex.trend_links.length === 0) continue;
        ex.trend_links.forEach((link, idx) => {
          if (link.review_status === 'pending') {
            results.push({
              entity_type: 'expert_example',
              product_id: ex.id,
              product_name: ex.product_name,
              brand: ex.brand || '',
              country: ex.country || '',
              category: ex.category || '',
              launch_date: '',
              link_index: idx,
              trend_id: link.trend_id || '',
              trend_name: link.trend_name || '',
              confidence: link.confidence || '',
              confidence_score: link.confidence_score || 0,
              reasoning: link.reasoning || '',
              matched_keywords: link.matched_keywords || [],
              linked_at: link.linked_at || '',
            });
          }
        });
      }
      if (exBatch.length < 200) break;
      exSkip += 200;
    }

    // Apply skip/limit for pagination
    const total = results.length;
    const page = results.slice(skip, skip + PAGE);

    return Response.json({ links: page, total, skip, has_more: skip + page.length < total });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});