import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

// Admin utility for the full content sweep.
// mode='inventory'  → counts + group lists, read-only
// mode='requeue'    → reset grandfathered extracted/approved/no-excerpt sources
//                     (verified only) back to pipeline_stage='uploaded' for excerpt processing

function hasExcerpts(s) {
  return Array.isArray(s.excerpts) && s.excerpts.length > 0;
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (user?.role !== 'admin') {
      return Response.json({ error: 'Forbidden: Admin access required' }, { status: 403 });
    }

    const body = await req.json().catch(() => ({}));
    const mode = body.mode || 'inventory';

    // Page through all sources
    const sources = [];
    let skip = 0;
    while (true) {
      const batch = await base44.asServiceRole.entities.Source.filter({}, 'created_date', 200, skip);
      sources.push(...batch);
      if (batch.length < 200) break;
      skip += 200;
    }

    const brief = (s) => ({
      id: s.id,
      title: s.title,
      source_type: s.source_type,
      pipeline_stage: s.pipeline_stage,
      review_status: s.review_status,
      verified: s.metadata_extraction?.verified === true
    });

    // Matrix counts
    const matrix = {};
    for (const s of sources) {
      const key = `${s.source_type || 'none'} | ${s.pipeline_stage || 'none'} | ${s.review_status || 'none'}`;
      matrix[key] = (matrix[key] || 0) + 1;
    }

    // Groups
    const groupA = []; // extracted/approved WITH excerpts
    const groupB = []; // extracted/approved WITHOUT excerpts (grandfathered)
    const groupC = []; // uploaded/pending
    const groupD = []; // failed
    const groupE = []; // gnpd sources NOT gnpd_ready
    const groupF = []; // metadata_extraction.verified !== true

    for (const s of sources) {
      if (s.pipeline_stage === 'extracted' && s.review_status === 'approved') {
        (hasExcerpts(s) ? groupA : groupB).push(brief(s));
      }
      if (s.pipeline_stage === 'uploaded' && s.review_status === 'pending') {
        groupC.push(brief(s));
      }
      if (s.pipeline_stage === 'failed') {
        groupD.push({ ...brief(s), failure_reason: s.failure_reason || s.processing_error || 'unknown', retry_count: s.retry_count || 0 });
      }
      if (s.source_type === 'gnpd' && s.pipeline_stage !== 'gnpd_ready') {
        groupE.push(brief(s));
      }
      if (s.metadata_extraction && s.metadata_extraction.verified !== true) {
        const me = s.metadata_extraction;
        groupF.push({
          ...brief(s),
          suggested: {
            title: me.title || me.suggested_title,
            publisher: me.publisher,
            date_published: me.date_published,
            category: me.category,
            region: me.region_code || me.region,
            document_type: me.document_type
          }
        });
      }
    }

    if (mode === 'requeue') {
      // Group B, verified only → back to 'uploaded' (review_status stays approved)
      const requeued = [];
      const blockedUnverified = [];
      for (const s of sources) {
        if (s.pipeline_stage === 'extracted' && s.review_status === 'approved' && !hasExcerpts(s)) {
          if (s.metadata_extraction?.verified === true) {
            await base44.asServiceRole.entities.Source.update(s.id, { pipeline_stage: 'uploaded' });
            requeued.push({ id: s.id, title: s.title, source_type: s.source_type });
          } else {
            blockedUnverified.push({ id: s.id, title: s.title, source_type: s.source_type });
          }
        }
      }
      return Response.json({ mode, requeued_count: requeued.length, requeued, blocked_unverified: blockedUnverified });
    }

    // GNPDProduct stats
    let productTotal = 0, emptyIngredients = 0;
    skip = 0;
    while (true) {
      const batch = await base44.asServiceRole.entities.GNPDProduct.filter({}, 'created_date', 200, skip);
      productTotal += batch.length;
      emptyIngredients += batch.filter(p => !p.ingredients || !String(p.ingredients).trim()).length;
      if (batch.length < 200) break;
      skip += 200;
    }

    if (mode === 'backfill_legacy') {
      // No-stage legacy sources: excerpts → extracted/approved (grandfathered); else → uploaded/pending
      const grandfathered = [], queued = [];
      for (const s of sources) {
        if (s.pipeline_stage || s.source_type === 'gnpd') continue;
        if (hasExcerpts(s)) {
          await base44.asServiceRole.entities.Source.update(s.id, { pipeline_stage: 'extracted', review_status: 'approved' });
          grandfathered.push({ id: s.id, title: s.title, source_type: s.source_type });
        } else {
          await base44.asServiceRole.entities.Source.update(s.id, { pipeline_stage: 'uploaded', review_status: 'pending' });
          queued.push({ id: s.id, title: s.title, source_type: s.source_type });
        }
      }
      return Response.json({ mode, grandfathered_count: grandfathered.length, queued_count: queued.length, grandfathered, queued });
    }

    if (mode === 'fix_gnpd_stuck') {
      // GNPD sources not at gnpd_ready: if products already ingested → gnpd_ready; else flag for parse
      const results = [];
      for (const s of sources) {
        if (s.source_type !== 'gnpd' || s.pipeline_stage === 'gnpd_ready') continue;
        const products = await base44.asServiceRole.entities.GNPDProduct.filter({ source_id: s.id }, null, 1);
        if (products.length > 0) {
          await base44.asServiceRole.entities.Source.update(s.id, { pipeline_stage: 'gnpd_ready', review_status: 'approved' });
          results.push({ id: s.id, title: s.title, action: 'set_gnpd_ready', had_products: true });
        } else {
          results.push({ id: s.id, title: s.title, action: 'needs_parse', had_products: false });
        }
      }
      return Response.json({ mode, results });
    }

    // Optional: return a single section to avoid response truncation
    if (body.section) {
      const sections = {
        b: groupB, c: groupC, d: groupD, e: groupE, f: groupF
      };
      return Response.json({ section: body.section, count: (sections[body.section] || []).length, items: sections[body.section] || [] });
    }

    return Response.json({
      mode,
      total_sources: sources.length,
      matrix,
      group_a_done_count: groupA.length,
      group_b_grandfathered: groupB,
      group_c_never_extracted: groupC,
      group_d_failed: groupD,
      group_e_gnpd_not_ready: groupE,
      group_f_unverified_metadata: groupF,
      gnpd_products: { total: productTotal, empty_ingredients: emptyIngredients }
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});