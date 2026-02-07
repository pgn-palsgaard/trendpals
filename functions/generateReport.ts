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
    const allTrends = await base44.entities.TrendCandidate.filter({ project_id });
    const selectedTrends = allTrends.filter(t => t.is_selected);

    if (!project || selectedTrends.length < 3) {
      return Response.json({ error: 'Need 3-5 selected trends' }, { status: 400 });
    }

    // Compile context
    let context = `Generate a ${5 + selectedTrends.length}-${10} slide trend report for:
Category: ${project.category}
Region: ${project.region}
Audience: ${project.audience}
Objective: ${project.objective}

Selected Trends:
${selectedTrends.map(t => `- ${t.trend_name}: ${t.whats_changing?.join('; ')}`).join('\n')}

SLIDE STRUCTURE:
1. Cover (title, category, region, time windows)
2. Trend Landscape (5-7 themes overview)
3-${2 + selectedTrends.length}. Deep Dives (one per selected trend)
${selectedTrends.length + 3}. Discussion Guide

For each deep dive slide:
- Title: trend name
- Subtitle: category | region | time window
- 3-5 bullets: what's changing + why now
- "So what for manufacturers?" box (2-3 bullets: technical implications)
- "Where Palsgaard supports" box (2-3 capabilities, NO product names)
- Evidence footer (cite sources)

Return slides as structured JSON.`;

    const response = await base44.integrations.Core.InvokeLLM({
      prompt: context,
      response_json_schema: {
        type: "object",
        properties: {
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
                evidence_footer: { type: "string" }
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
          }
        }
      }
    });

    // Calculate overall freshness
    const oldestSource = sources.reduce((oldest, s) => {
      if (!s.date) return oldest;
      return new Date(s.date) < new Date(oldest) ? s.date : oldest;
    }, new Date().toISOString());
    
    const monthsOld = (new Date() - new Date(oldestSource)) / (1000 * 60 * 60 * 24 * 30);
    const freshness = monthsOld <= 12 ? 'fresh' : monthsOld <= 18 ? 'use_with_caution' : 'outdated';

    // Create report
    const report = await base44.entities.Report.create({
      project_id,
      title: `${project.category} Trends - ${project.region} ${new Date().getFullYear()}`,
      category: project.category,
      region: project.region,
      slides: response.slides,
      evidence_pack: response.evidence_pack || [],
      product_shortlist: [],
      image_map: {},
      version: 1,
      status: 'draft',
      freshness,
      selected_trends: selectedTrends.map(t => t.trend_name),
      warnings: []
    });

    await base44.entities.Project.update(project_id, { state: 'publishable' });

    return Response.json({ success: true, report });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});