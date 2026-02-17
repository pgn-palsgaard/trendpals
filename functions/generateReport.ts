import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { project_id } = await req.json();

    // Get project, sources, and selected trends
    const projects = await base44.entities.Project.filter({ id: project_id });
    const project = projects[0];
    const sources = await base44.entities.Source.filter({ project_id });
    const trendCandidates = await base44.entities.TrendCandidate.filter({ project_id });
    const selectedTrends = trendCandidates.filter(t => t.is_selected);

    if (!project) {
      return Response.json({ error: 'Project not found' }, { status: 404 });
    }

    if (selectedTrends.length < 3 || selectedTrends.length > 5) {
      return Response.json({ 
        error: 'Must select 3-5 trends for report generation' 
      }, { status: 400 });
    }

    // Compile evidence context
    let evidenceContext = `Project: ${project.name}
Category: ${project.category}
Region: ${project.region}
Objective: ${project.objective}
Audience: ${project.audience}

Selected Trends:
${selectedTrends.map((t, i) => `${i+1}. ${t.trend_name}
   What's changing: ${t.whats_changing?.join('; ')}
   Why now: ${t.why_now?.join('; ')}
   Evidence: ${t.evidence_anchors?.mintel_excerpts?.length || 0} excerpts, ${t.evidence_anchors?.gnpd_products?.length || 0} products
`).join('\n')}

Available Evidence:
`;

    sources.forEach(source => {
      if (source.excerpts) {
        evidenceContext += `\n${source.title}:\n`;
        source.excerpts.forEach(excerpt => {
          evidenceContext += `- ${excerpt.text.substring(0, 200)}\n`;
        });
      }
    });

    // Collect all GNPD products with images
    const allGnpdProducts = [];
    const imageMap = {};
    sources.forEach(source => {
      if (source.gnpd_data) {
        source.gnpd_data.forEach(product => {
          allGnpdProducts.push(product);
          // Map product IDs to images for easy lookup
          if (product.has_image && product.image_url) {
            imageMap[product.record_id || product.id] = product.image_url;
          }
        });
      }
    });

    // Generate report pack using AI
    const response = await base44.integrations.Core.InvokeLLM({
      prompt: `Generate a professional trend report for ${project.category} in ${project.region}.

${evidenceContext}

Create a complete report pack with:

1. SLIDES (5-10 slides total):
   - Opening slide with report title
   - One slide per selected trend (${selectedTrends.length} trends)
   - Each slide must include:
     * Title + subtitle (Category | Region | Time window)
     * 3-6 concise bullets on the trend
     * "So what for manufacturers?" section (2-3 bullets)
     * "Where Palsgaard supports" section (capabilities only, NO product names)
     * Evidence footer (cite sources)
     * Image placement slots (hero + supporting products)

2. EVIDENCE PACK (5-10 bullets):
   - Key evidence bullets that support the deck
   - Each with source citation and confidence level

3. PRODUCT SHORTLIST (12-20 GNPD launches):
   - Select diverse, relevant products that exemplify the trends
   - Prioritize products with images
   - Include: brand, product name, market, launch date, key claims
   - Tag each product with which trend(s) it supports

4. IMAGE PLACEMENT MAP:
   - For each slide, specify which products to use as hero/supporting images

CRITICAL RULES:
- Use ONLY evidence from provided sources
- NO invented statistics or product names
- Palsgaard mentions: capabilities ONLY, no product grades
- Every claim must be traceable to source material
- Flag any weak evidence areas as warnings

Return structured JSON.`,
      response_json_schema: {
        type: "object",
        properties: {
          title: { type: "string" },
          slides: {
            type: "array",
            items: {
              type: "object",
              properties: {
                slide_number: { type: "number" },
                slide_name: { type: "string" },
                title: { type: "string" },
                subtitle: { type: "string" },
                bullets: { type: "array", items: { type: "string" } },
                so_what: { type: "array", items: { type: "string" } },
                where_palsgaard_supports: { type: "array", items: { type: "string" } },
                evidence_footer: { type: "string" },
                image_placements: { type: "array", items: { type: "string" } }
              }
            }
          },
          evidence_pack: {
            type: "array",
            items: {
              type: "object",
              properties: {
                bullet: { type: "string" },
                source_type: { type: "string" },
                confidence: { type: "string" }
              }
            }
          },
          product_shortlist: {
            type: "array",
            items: {
              type: "object",
              properties: {
                brand: { type: "string" },
                product_name: { type: "string" },
                market: { type: "string" },
                launch_date: { type: "string" },
                claims: { type: "array", items: { type: "string" } },
                supporting_trends: { type: "array", items: { type: "string" } },
                has_image: { type: "boolean" }
              }
            }
          },
          image_map: { type: "object" },
          warnings: {
            type: "array",
            items: {
              type: "object",
              properties: {
                type: { type: "string" },
                message: { type: "string" }
              }
            }
          }
        }
      }
    });

    // Determine freshness
    const oldestSourceDate = sources
      .filter(s => s.date)
      .map(s => new Date(s.date))
      .sort((a, b) => a - b)[0];
    
    let freshness = 'fresh';
    if (oldestSourceDate) {
      const ageMonths = (Date.now() - oldestSourceDate.getTime()) / (1000 * 60 * 60 * 24 * 30);
      if (ageMonths > 24) freshness = 'outdated';
      else if (ageMonths > 12) freshness = 'use_with_caution';
    }

    // Create report entity
    const report = await base44.entities.Report.create({
      project_id,
      title: response.title || `${project.category} Trends - ${project.region}`,
      category: project.category,
      region: project.region,
      slides: response.slides || [],
      evidence_pack: response.evidence_pack || [],
      product_shortlist: response.product_shortlist || [],
      image_map: response.image_map || {},
      selected_trends: selectedTrends.map(t => t.trend_name),
      warnings: response.warnings || [],
      freshness,
      status: 'draft',
      version: 1
    });

    return Response.json({ 
      success: true, 
      report_id: report.id,
      slides_count: report.slides.length,
      warnings: report.warnings.length
    });
  } catch (error) {
    console.error('Generate report error:', error);
    return Response.json({ 
      error: error.message || 'Failed to generate report',
      details: error.stack
    }, { status: 500 });
  }
});