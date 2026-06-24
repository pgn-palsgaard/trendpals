import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { project_id, selected_trend_ids } = await req.json();

    if (!project_id || !selected_trend_ids || selected_trend_ids.length === 0) {
      return Response.json({ error: 'Missing project_id or selected_trend_ids' }, { status: 400 });
    }

    const [project] = await base44.entities.Project.filter({ id: project_id });
    if (!project) {
      return Response.json({ error: 'Project not found' }, { status: 404 });
    }

    const trendCandidates = await base44.entities.TrendCandidate.filter({
      project_id,
      is_selected: true
    });

    // Determine which sources belong to this project.
    const sourceIds = (project.selected_source_ids && project.selected_source_ids.length > 0)
      ? project.selected_source_ids
      : (await base44.entities.Source.filter({ project_id })).map(s => s.id);

    // Pull the REAL GNPD products for those sources from the database.
    // GNPDProduct is the single source of truth for product name / brand / company.
    let gnpdProducts = [];
    for (const sid of sourceIds) {
      const rows = await base44.asServiceRole.entities.GNPDProduct.filter({ source_id: sid }, '-launch_date', 1000);
      gnpdProducts = gnpdProducts.concat(rows);
    }

    // De-duplicate by Mintel record id, and build a lookup map keyed by gnpd_record_id.
    const productByRecordId = {};
    for (const p of gnpdProducts) {
      if (p.gnpd_record_id && !productByRecordId[p.gnpd_record_id]) {
        productByRecordId[p.gnpd_record_id] = p;
      }
    }
    const candidateProducts = Object.values(productByRecordId);

    if (candidateProducts.length === 0) {
      return Response.json({
        error: 'No GNPD products are linked to this project. Add a GNPD source with parsed products first.'
      }, { status: 400 });
    }

    const trendsContext = trendCandidates.map(t => ({
      name: t.trend_name,
      whats_changing: t.whats_changing,
      why_now: t.why_now
    }));

    // Give the LLM ONLY the real record ids + real metadata. It must choose from this list.
    const productCatalog = candidateProducts.slice(0, 200).map(p =>
      `- Record ID: ${p.gnpd_record_id} | ${p.product_name}${p.brand ? ` | Brand: ${p.brand}` : ''}${p.company ? ` | Company: ${p.company}` : ''}${p.country ? ` | ${p.country}` : ''}${Array.isArray(p.claims) && p.claims.length ? ` | Claims: ${p.claims.slice(0, 6).join(', ')}` : ''}`
    ).join('\n');

    const prompt = `You are selecting which real products best illustrate a set of consumer trends.

PROJECT CONTEXT:
Category: ${project.category}
Region: ${project.region}
Objective: ${project.objective}

SELECTED TRENDS:
${trendsContext.map((t, i) => `
${i + 1}. ${t.name}
   What's Changing: ${t.whats_changing?.join('; ') || 'N/A'}
   Why Now: ${t.why_now?.join('; ') || 'N/A'}
`).join('\n')}

AVAILABLE PRODUCTS (these are the ONLY products you may choose from — each is a real Mintel GNPD record):
${productCatalog}

TASK:
Pick the 8-15 products from the list above that best support the selected trends.

STRICT RULES:
- You may ONLY return Record IDs that appear EXACTLY in the AVAILABLE PRODUCTS list above.
- Do NOT invent products, names, brands, companies, or Record IDs.
- Do NOT return a Record ID that is not in the list.
- For each chosen product, list which selected trend name(s) it supports and a brief reason.

Return JSON: { "selections": [ { "product_id": "<exact Record ID from the list>", "supporting_trends": ["trend name"], "reason": "why it fits" } ] }`;

    const aiResponse = await base44.integrations.Core.InvokeLLM({
      prompt,
      response_json_schema: {
        type: "object",
        properties: {
          selections: {
            type: "array",
            items: {
              type: "object",
              properties: {
                product_id: { type: "string" },
                supporting_trends: { type: "array", items: { type: "string" } },
                reason: { type: "string" }
              },
              required: ["product_id", "supporting_trends"]
            }
          }
        },
        required: ["selections"]
      }
    });

    const selections = aiResponse.selections || [];

    // Hydrate each selection from the REAL GNPDProduct record. Discard any hallucinated id.
    const validSelections = [];
    const discardedIds = [];
    for (const sel of selections) {
      const product = productByRecordId[String(sel.product_id).trim()];
      if (!product) {
        discardedIds.push(sel.product_id);
        continue;
      }
      validSelections.push({ sel, product });
    }

    // Clear existing requests for this project.
    const existingRequests = await base44.entities.ProductImageRequest.filter({ project_id });
    for (const request of existingRequests) {
      await base44.entities.ProductImageRequest.delete(request.id);
    }

    // Create new requests using ONLY the authoritative product metadata.
    const createdRequests = [];
    for (const { sel, product } of validSelections) {
      const request = await base44.entities.ProductImageRequest.create({
        project_id,
        product_id: product.gnpd_record_id,
        product_name: product.product_name,
        company: product.company || '',
        brand: product.brand || '',
        supporting_trends: sel.supporting_trends || [],
        source: 'excel_file',
        status: 'pending'
      });
      createdRequests.push({ ...request, reason: sel.reason });
    }

    return Response.json({
      success: true,
      products: createdRequests,
      count: createdRequests.length,
      discarded_invalid_ids: discardedIds
    });

  } catch (error) {
    console.error('Error identifying products:', error);
    return Response.json({
      error: error.message || 'Failed to identify products'
    }, { status: 500 });
  }
});