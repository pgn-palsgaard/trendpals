import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

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

    // Fetch project, trends, and sources
    const [project] = await base44.entities.Project.filter({ id: project_id });
    const trendCandidates = await base44.entities.TrendCandidate.filter({ 
      project_id,
      is_selected: true 
    });
    const sources = await base44.entities.Source.filter({ project_id });

    if (!project) {
      return Response.json({ error: 'Project not found' }, { status: 404 });
    }

    // Prepare context for AI
    const trendsContext = trendCandidates.map(t => ({
      name: t.trend_name,
      whats_changing: t.whats_changing,
      why_now: t.why_now,
      evidence: t.evidence_anchors
    }));

    // Extract all text from sources (Mintel reports)
    const mintelTexts = sources
      .filter(s => s.source_type === 'mintel')
      .flatMap(s => s.excerpts?.map(e => e.text) || [])
      .join('\n\n');

    // Extract GNPD data from sources
    const gnpdProducts = sources
      .filter(s => s.source_type === 'gnpd')
      .flatMap(s => s.gnpd_data || []);

    // Build prompt for AI to identify products
    const prompt = `You are analyzing product data to identify which products best support selected consumer trends.

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

AVAILABLE PRODUCT DATA:
${gnpdProducts.length > 0 ? `
Excel File Products (${gnpdProducts.length} products):
${gnpdProducts.slice(0, 50).map(p => `- ID: ${p['Record ID'] || p.record_id || p.id}, Name: ${p['Product Name'] || p.product_name || p.name}`).join('\n')}
${gnpdProducts.length > 50 ? `... and ${gnpdProducts.length - 50} more products` : ''}
` : 'No Excel file uploaded yet'}

${mintelTexts ? `
Mintel Report Content (excerpts):
${mintelTexts.substring(0, 5000)}...
` : 'No Mintel reports uploaded yet'}

TASK:
Analyze the available data and identify 8-15 products that best support the selected trends.

PRIORITIZATION:
1. If a product is mentioned or shown in the Mintel reports, PRIORITIZE IT
2. Look for products in the Excel data that align with trend characteristics
3. For each product, specify which trend(s) it supports and why

Return a JSON array of products with this structure:
[
  {
    "product_id": "string (use Record ID from Excel or extract from Mintel)",
    "product_name": "string",
    "supporting_trends": ["trend name 1", "trend name 2"],
    "reason": "brief explanation of why this product supports these trends",
    "source": "mintel_report" | "excel_file" | "both"
  }
]

Focus on products that:
- Clearly exemplify the trend characteristics
- Are relevant to the category and region
- Have strong visual appeal (would make good image examples)
- Are mentioned or featured in Mintel reports (if available)`;

    // Call AI to identify products
    const aiResponse = await base44.integrations.Core.InvokeLLM({
      prompt,
      response_json_schema: {
        type: "object",
        properties: {
          products: {
            type: "array",
            items: {
              type: "object",
              properties: {
                product_id: { type: "string" },
                product_name: { type: "string" },
                supporting_trends: { type: "array", items: { type: "string" } },
                reason: { type: "string" },
                source: { type: "string", enum: ["mintel_report", "excel_file", "both"] }
              },
              required: ["product_id", "product_name", "supporting_trends", "source"]
            }
          }
        },
        required: ["products"]
      }
    });

    const identifiedProducts = aiResponse.products || [];

    // Clear existing product image requests for this project
    const existingRequests = await base44.entities.ProductImageRequest.filter({ project_id });
    for (const request of existingRequests) {
      await base44.entities.ProductImageRequest.delete(request.id);
    }

    // Create new product image requests
    const createdRequests = [];
    for (const product of identifiedProducts) {
      const request = await base44.entities.ProductImageRequest.create({
        project_id,
        product_id: product.product_id,
        product_name: product.product_name,
        supporting_trends: product.supporting_trends,
        source: product.source,
        status: 'pending'
      });
      createdRequests.push({ ...request, reason: product.reason });
    }

    return Response.json({
      success: true,
      products: createdRequests,
      count: createdRequests.length
    });

  } catch (error) {
    console.error('Error identifying products:', error);
    return Response.json({ 
      error: error.message || 'Failed to identify products' 
    }, { status: 500 });
  }
});