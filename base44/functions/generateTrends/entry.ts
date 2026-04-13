import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const payload = await req.json();
    const project_id = payload.project_id || payload.event?.entity_id;
    
    if (!project_id) {
      return Response.json({ error: 'Error in field project_id: Field required' }, { status: 400 });
    }

    const projects = await base44.entities.Project.filter({ id: project_id });
    const project = projects[0];
    const sources = await base44.entities.Source.filter({ project_id });

    // Fetch org-shared knowledge sources (Palsgaard capabilities)
    const knowledgeSources = await base44.entities.Source.filter({ source_type: 'knowledge', visibility: 'org_shared' });

    if (!project) {
      return Response.json({ error: 'Project not found' }, { status: 404 });
    }

    const region = project.region_code || project.region || 'Global';

    // Build a rich project brief to anchor trend generation
    const projectBrief = `
=== PROJECT BRIEF ===
Project Name: ${project.name}
Category: ${project.category}
Region: ${region}
Customer: ${project.customer_name || 'Not specified'}
Audience: ${project.audience || 'Industrial manufacturers'}
Meeting Context: ${project.meeting_context ? project.meeting_context.replace(/_/g, ' ') : 'Not specified'}
Trend Time Window: ${project.trend_time_window || 'last 24 months'}

Objective / What this deck must achieve:
${project.objective}

Specific Focus Areas (prioritise these in trend selection):
${project.specific_focus || 'None specified — cover the broadest relevant trends for this category/region'}

Topics / Areas to AVOID:
${project.topics_to_avoid || 'None specified'}

Customer Priorities (what matters most to this customer):
${project.customer_priorities?.length > 0 ? project.customer_priorities.join(', ') : 'None specified'}
=== END PROJECT BRIEF ===
`;

    // Compile evidence from all sources
    let evidenceText = projectBrief;

    // Collect GNPD products with images
    const gnpdProducts = [];
    sources.forEach(source => {
      evidenceText += `\n=== ${source.source_type.toUpperCase()}: ${source.title} ===\n`;
      if (source.excerpts) {
        source.excerpts.forEach(excerpt => {
          evidenceText += `${excerpt.text}\n`;
        });
      }
      if (source.gnpd_data) {
        evidenceText += `GNPD Products: ${source.gnpd_data.length} launches available (${source.gnpd_data.filter(p => p.has_image).length} with images)\n`;
        source.gnpd_data.slice(0, 5).forEach(product => {
          evidenceText += `- ${product.Brand || ''} ${product['Product name'] || product.Product || ''} ${product.has_image ? '📷' : ''}\n`;
        });
        gnpdProducts.push(...source.gnpd_data);
      }
    });

    // Build knowledge source context for Palsgaard capabilities
    let knowledgeContext = '';
    if (knowledgeSources.length > 0) {
      knowledgeContext = `\n\n=== PALSGAARD CAPABILITY KNOWLEDGE SOURCES ===\n(Use these to populate "where_palsgaard_supports" — capabilities only, no product grades)\n`;
      knowledgeSources.forEach(ks => {
        knowledgeContext += `\n[${ks.knowledge_subtype || 'knowledge'}] ${ks.title}`;
        if (ks.ai_summary) knowledgeContext += `: ${ks.ai_summary}`;
        knowledgeContext += '\n';
        if (ks.excerpts) {
          ks.excerpts.slice(0, 3).forEach(e => {
            knowledgeContext += `  • ${e.text.substring(0, 180)}...\n`;
          });
        }
      });
    }

    // Generate trend candidates using AI
    const response = await base44.integrations.Core.InvokeLLM({
      prompt: `You are a Senior B2B Commercial Insights Analyst identifying consumer and market trends for industrial food ingredient manufacturers.

Your task: Identify 5-7 trend candidates from the evidence below that are DIRECTLY RELEVANT to the project brief. The trends you generate must be scoped tightly to the project's stated objective, category, region, customer, and any specific focus areas. Do NOT generate generic category trends — every trend must feel purposeful for THIS specific project.

${evidenceText}
${knowledgeContext}

INSTRUCTIONS:
1. Read the PROJECT BRIEF first. Let the objective, specific focus, and customer priorities guide which trends you surface.
2. If "Specific Focus Areas" are listed, every trend MUST relate to at least one of them.
3. If "Topics to Avoid" are listed, do not generate trends in those areas.
4. Prioritise the stated trend time window: ${project.trend_time_window || 'last 24 months'}.
5. Every trend must be grounded in the evidence provided — cite specific excerpts and match real GNPD products.
6. For GNPD products: prioritize those with images (has_image: true), include brand, product_name, market, and ingredients.
7. For "where_palsgaard_supports": use ONLY information from the PALSGAARD CAPABILITY KNOWLEDGE SOURCES. If nothing relevant exists, leave the array empty.
8. Do NOT invent statistics or claims. If evidence is weak, mark confidence as "low".

CRITICAL: The project objective is "${project.objective}". All 5-7 trends must serve this objective. A reviewer reading these trends should immediately understand why each one matters for this specific project.

Return JSON with this exact structure.`,
      response_json_schema: {
        type: "object",
        properties: {
          trends: {
            type: "array",
            items: {
              type: "object",
              properties: {
                trend_name: { type: "string" },
                whats_changing: { type: "array", items: { type: "string" } },
                why_now: { type: "array", items: { type: "string" } },
                evidence_anchors: {
                  type: "object",
                  properties: {
                    mintel_excerpts: { type: "array", items: { type: "string" } },
                    gnpd_products: {
                      type: "array",
                      items: {
                        type: "object",
                        properties: {
                          brand: { type: "string" },
                          product_name: { type: "string" },
                          market: { type: "string" },
                          has_image: { type: "boolean" },
                          ingredients: { type: "string" }
                        }
                      }
                    }
                  }
                },
                confidence: { type: "string", enum: ["high", "medium", "low"] },
                what_could_be_wrong: { type: "string" }
              }
            }
          }
        }
      }
    });

    // Delete existing trend candidates
    const existingTrends = await base44.entities.TrendCandidate.filter({ project_id });
    for (const trend of existingTrends) {
      await base44.entities.TrendCandidate.delete(trend.id);
    }

    // Create new trend candidates
    const createdTrends = [];
    for (const trend of response.trends) {
      const created = await base44.entities.TrendCandidate.create({
        project_id,
        ...trend,
        is_selected: false,
        is_excluded: false
      });
      createdTrends.push(created);
    }

    return Response.json({ success: true, trends: createdTrends });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});