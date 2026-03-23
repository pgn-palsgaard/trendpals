import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const payload = await req.json();
    // Support both direct calls (project_id) and entity automation (event.entity_id)
    const project_id = payload.project_id || payload.event?.entity_id;
    
    if (!project_id) {
      return Response.json({ error: 'Error in field project_id: Field required' }, { status: 400 });
    }

    // Get project and sources
    const projects = await base44.entities.Project.filter({ id: project_id });
    const project = projects[0];
    const sources = await base44.entities.Source.filter({ project_id });

    // Fetch org-shared knowledge sources (Palsgaard capabilities)
    const knowledgeSources = await base44.entities.Source.filter({ source_type: 'knowledge', visibility: 'org_shared' });

    if (!project) {
      return Response.json({ error: 'Project not found' }, { status: 404 });
    }

    // Compile evidence from all sources
    let evidenceText = `Project Context:
Category: ${project.category}
Region: ${project.region}
Customer Priorities: ${project.customer_priorities?.join(', ') || 'None specified'}

`;

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
      prompt: `You are analyzing trend data for ${project.category} in ${project.region}.

${evidenceText}
${knowledgeContext}

Generate exactly 5-7 trend candidates. For each trend:
1. Give it a compelling name (max 5 words)
2. Explain what's changing (2-4 concise bullets)
3. Explain why now (1-2 bullets)
4. Link to evidence (cite specific excerpts AND match 3-6 GNPD products that exemplify this trend)
5. For GNPD products: prioritize those with images (has_image: true), include brand, product_name, market, and ingredients if relevant
6. Assess confidence based on evidence strength
7. Provide a self-critique: what could be wrong about this trend?
8. For "where_palsgaard_supports": use ONLY information from the PALSGAARD CAPABILITY KNOWLEDGE SOURCES section above. Ground each bullet in actual Palsgaard capability documentation. If no relevant capability is found, leave the array empty rather than inventing.

CRITICAL RULES:
- Use ONLY evidence from the provided sources
- PRIORITIZE GNPD products that have images (has_image: true)
- Match products that genuinely exemplify the trend
- Include ingredient information when it supports the trend narrative
- Do NOT invent statistics or claims
- If evidence is weak, mark confidence as "low"
- "where_palsgaard_supports" MUST be grounded in the knowledge sources provided

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