import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { project_id } = await req.json();

    // Get project and sources
    const projects = await base44.entities.Project.filter({ id: project_id });
    const project = projects[0];
    const sources = await base44.entities.Source.filter({ project_id });

    if (!project) {
      return Response.json({ error: 'Project not found' }, { status: 404 });
    }

    // Compile evidence from all sources
    let evidenceText = `Project Context:
Category: ${project.category}
Region: ${project.region}
Time Windows: Trends ${project.trend_time_window}, Launches ${project.launch_time_window}
Customer Priorities: ${project.customer_priorities?.join(', ') || 'None specified'}

`;

    sources.forEach(source => {
      evidenceText += `\n=== ${source.source_type.toUpperCase()}: ${source.title} ===\n`;
      if (source.excerpts) {
        source.excerpts.forEach(excerpt => {
          evidenceText += `${excerpt.text}\n`;
        });
      }
      if (source.gnpd_data) {
        evidenceText += `GNPD Products: ${source.gnpd_data.length} launches available\n`;
        source.gnpd_data.slice(0, 5).forEach(product => {
          evidenceText += `- ${product.Brand || ''} ${product['Product name'] || product.Product || ''}\n`;
        });
      }
    });

    // Generate trend candidates using AI
    const response = await base44.integrations.Core.InvokeLLM({
      prompt: `You are analyzing trend data for ${project.category} in ${project.region}.

${evidenceText}

Generate exactly 5-7 trend candidates. For each trend:
1. Give it a compelling name (max 5 words)
2. Explain what's changing (2-4 concise bullets)
3. Explain why now (1-2 bullets)
4. Link to evidence (cite specific excerpts or GNPD examples)
5. Assess confidence based on evidence strength
6. Provide a self-critique: what could be wrong about this trend?

CRITICAL RULES:
- Use ONLY evidence from the provided sources
- Do NOT invent statistics or claims
- If evidence is weak, mark confidence as "low"
- Be honest about limitations

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
                    gnpd_product_ids: { type: "array", items: { type: "string" } }
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