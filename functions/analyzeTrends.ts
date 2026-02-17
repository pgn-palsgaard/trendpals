import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { project_id, selected_trends } = await req.json();

    if (!project_id || !selected_trends || selected_trends.length === 0) {
      return Response.json({ 
        error: 'project_id and selected_trends are required' 
      }, { status: 400 });
    }

    // Fetch full trend details
    const trendCandidates = await base44.entities.TrendCandidate.filter({ 
      project_id,
      is_selected: true 
    });

    if (trendCandidates.length === 0) {
      return Response.json({ 
        error: 'No selected trends found' 
      }, { status: 400 });
    }

    // Fetch project context
    const project = await base44.entities.Project.get(project_id);

    // Build trend analysis prompt
    const trendsDescription = trendCandidates.map((t, i) => `
Trend ${i + 1}: ${t.trend_name}
What's Changing:
${t.whats_changing?.map(b => `- ${b}`).join('\n') || 'N/A'}

Why Now:
${t.why_now?.map(b => `- ${b}`).join('\n') || 'N/A'}

Confidence: ${t.confidence}
`).join('\n---\n');

    const analysisPrompt = `You are a trend analysis expert. Analyze these ${trendCandidates.length} selected consumer trends for the ${project.category} category in the ${project.region} region.

Project Context:
- Objective: ${project.objective}
- Target Audience: ${project.audience}
- Customer Priorities: ${project.customer_priorities?.join(', ') || 'Not specified'}

SELECTED TRENDS:
${trendsDescription}

Provide a comprehensive analysis in JSON format with these sections:

1. "overarching_themes": Array of 3-5 major themes that connect these trends (e.g., sustainability, premiumization, convenience)
2. "connections": Array of 3-4 insights about how these trends relate to and reinforce each other
3. "key_insights": Array of 5-7 strategic insights for the ${project.category} industry based on these trends
4. "product_opportunities": Array of 5-8 specific new product ideas or market opportunities, each with:
   - "idea": Product/market concept name
   - "description": 2-3 sentence description
   - "connected_trends": Which trends support this opportunity (by name)
   - "market_potential": One of "high", "medium", "emerging"
5. "risk_factors": Array of 2-3 potential risks or challenges to monitor

Format response as valid JSON only, no markdown or extra text.`;

    const analysis = await base44.integrations.Core.InvokeLLM({
      prompt: analysisPrompt,
      add_context_from_internet: false,
      response_json_schema: {
        type: "object",
        properties: {
          overarching_themes: {
            type: "array",
            items: { type: "string" }
          },
          connections: {
            type: "array",
            items: { type: "string" }
          },
          key_insights: {
            type: "array",
            items: { type: "string" }
          },
          product_opportunities: {
            type: "array",
            items: {
              type: "object",
              properties: {
                idea: { type: "string" },
                description: { type: "string" },
                connected_trends: {
                  type: "array",
                  items: { type: "string" }
                },
                market_potential: { type: "string" }
              }
            }
          },
          risk_factors: {
            type: "array",
            items: { type: "string" }
          }
        }
      }
    });

    return Response.json({ 
      success: true,
      analysis
    });
  } catch (error) {
    console.error('Trend analysis error:', error);
    return Response.json({ 
      error: error.message || 'Failed to analyze trends',
      details: error.stack
    }, { status: 500 });
  }
});