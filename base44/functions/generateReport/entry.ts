import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

// ── Step 1: fetch & filter relevant knowledge excerpts ─────────────────────
async function getExcerptsForProject(base44, project) {
  const allKnowledge = await base44.entities.Source.filter({
    source_type: 'knowledge',
    visibility: 'org_shared'
  });

  // Also pull project-linked knowledge sources
  const links = await base44.entities.ProjectKnowledgeLink.filter({ project_id: project.id });
  const orgSharedIds = new Set(allKnowledge.map(s => s.id));
  for (const link of links) {
    if (!orgSharedIds.has(link.source_id)) {
      try {
        const ks = await base44.entities.Source.get(link.source_id);
        if (ks) allKnowledge.push(ks);
      } catch (e) {}
    }
  }

  // Flatten excerpts, filter by category relevance
  const category = project.category || '';
  const allExcerpts = [];
  for (const ks of allKnowledge) {
    if (!ks.excerpts || ks.excerpts.length === 0) continue;
    for (const ex of ks.excerpts) {
      const relevantCategories = ex.category_relevance || [];
      const isRelevant =
        relevantCategories.length === 0 ||
        relevantCategories.some(c => c.toLowerCase() === category.toLowerCase()) ||
        relevantCategories.some(c => c.toLowerCase() === 'general');
      if (isRelevant) {
        allExcerpts.push({ ...ex, _source_title: ks.title });
      }
    }
  }

  // Group by capability_area, take top 3 per area (high confidence first)
  const byArea = {};
  for (const ex of allExcerpts) {
    const area = ex.capability_area || 'general';
    if (!byArea[area]) byArea[area] = [];
    byArea[area].push(ex);
  }
  const confidenceOrder = { high: 0, medium: 1, low: 2 };
  const selected = [];
  for (const area of Object.keys(byArea)) {
    const sorted = byArea[area].sort(
      (a, b) => (confidenceOrder[a.confidence] ?? 2) - (confidenceOrder[b.confidence] ?? 2)
    );
    selected.push(...sorted.slice(0, 3));
  }
  return selected;
}

// ── Step 2: system prompt ──────────────────────────────────────────────────
const SYSTEM_PROMPT = `You are building a trend intelligence report for food industry professionals. This is a conversation starter, not a sales pitch.

The report follows a strict three-layer structure for every trend slide:
1. MARKET SIGNAL — What is happening externally. Observable facts, consumer shifts, regulatory pressure, market data. Written from outside-in. Never mention Palsgaard.
2. CUSTOMER PAINS — 2-3 specific challenges this creates for food manufacturers. What makes this hard? What pressures them?
3. PALSGAARD ANGLE — For each pain: how deep technical expertise in emulsification and stabilisation can help. NO product names. NO dosage figures. Write as industry expertise, not as a company pitch. Use "Deep expertise in X enables..." or "Technical know-how in Y allows manufacturers to..." — never "Palsgaard's..." as subject.

Additional rules:
- conversation_openers: 2 open questions that invite the customer to reflect on their own situation. Questions should end in the customer's world, not Palsgaard's. E.g. "How are you currently managing the transition to palm-free formulations?" not "Would you like to hear about our palm-free solutions?"
- supporting_data: Use only statistics from the provided Mintel excerpts. Always include source and geography. Never invent statistics.
- gnpd_examples: Use only real product names from the provided GNPD data. Never invent products.
- If a customer pain can be addressed without emulsification expertise, still include it — showing broad industry knowledge builds credibility.
- Never use "Palsgaard" as a subject anywhere in the output.`;

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { project_id } = await req.json();
    const project = await base44.entities.Project.get(project_id);

    if (!project) {
      return Response.json({ error: 'Project not found' }, { status: 404 });
    }

    const region = project.region_code || project.region || 'Global';

    // Fetch evidence sources linked to project
    let sources = [];
    if (project.selected_source_ids && project.selected_source_ids.length > 0) {
      for (const sourceId of project.selected_source_ids) {
        try {
          const source = await base44.entities.Source.get(sourceId);
          if (source) sources.push(source);
        } catch (e) {
          console.warn(`Source ${sourceId} not found`);
        }
      }
    } else {
      sources = await base44.entities.Source.filter({ project_id });
    }

    // Fetch trends
    const trendCandidates = await base44.entities.TrendCandidate.filter({ project_id });
    const selectedTrends = trendCandidates.filter(t => t.is_selected);

    if (selectedTrends.length < 3 || selectedTrends.length > 5) {
      return Response.json({
        error: 'Must select 3-5 trends for report generation'
      }, { status: 400 });
    }

    const hasSources = sources.some(s => s.excerpts?.length > 0 || s.gnpd_data?.length > 0);
    if (!hasSources) {
      return Response.json({
        error: 'No processed sources available. Please upload and process sources first.'
      }, { status: 400 });
    }

    // ── Step 1: build knowledge context ───────────────────────────────────
    const relevantExcerpts = await getExcerptsForProject(base44, project);

    // ── Step 3: build user prompt ──────────────────────────────────────────

    // Mintel excerpts for supporting_data (sources with source_type = 'mintel')
    const mintelExcerpts = [];
    sources.forEach(source => {
      if (source.source_type === 'mintel' && source.excerpts?.length > 0) {
        source.excerpts.slice(0, 8).forEach(ex => {
          mintelExcerpts.push({
            market_signal: ex.market_signal || ex.text || '',
            source_quote: ex.source_quote || '',
            source_title: source.title,
            geography: source.region_code || region
          });
        });
      }
    });

    // GNPD products (top 8 matched)
    const gnpdProducts = [];
    sources.forEach(source => {
      if (source.gnpd_data && source.gnpd_data.length > 0) {
        source.gnpd_data.slice(0, 8).forEach(p => {
          gnpdProducts.push({
            product_name: p.product_name || p['Product Name'] || '',
            brand: p.brand || p['Brand'] || '',
            country: p.market || p['Market'] || '',
            launch_date: p.date_published || p['Date Published'] || '',
            claims: (p.claims || p['Claims'] || '').substring(0, 150)
          });
        });
      }
    });

    const trendsBlock = selectedTrends.map((t, i) => `
${i + 1}. ${t.trend_name}
Market Signal: ${t.market_signal || ''}
What's Changing: ${(t.whats_changing || []).join('; ')}
Why Now: ${(t.why_now || []).join('; ')}
${t.customer_pains?.length > 0 ? `Customer Pains: ${t.customer_pains.map(p => p.pain).join('; ')}` : ''}
`).join('\n');

    const knowledgeBlock = relevantExcerpts.length > 0
      ? relevantExcerpts.map(ex => `- [${ex.capability_area || 'general'}] Market Signal: ${ex.market_signal || ''} | Pain: ${ex.customer_pain || ''} | Angle: ${ex.palsgaard_angle || ''} | Quote: "${ex.source_quote || ''}" (${ex._source_title})`).join('\n')
      : '(No relevant knowledge excerpts found — use general emulsification and stabilisation expertise)';

    const gnpdBlock = gnpdProducts.length > 0
      ? gnpdProducts.map(p => `- ${p.product_name} | ${p.brand} | ${p.country} | ${p.launch_date} | ${p.claims}`).join('\n')
      : '(No GNPD product data available)';

    const userPrompt = `PROJECT:
Category: ${project.category}
Region: ${region}
Objective: ${project.objective}
Audience: ${project.audience || 'Industrial food manufacturers'}

SELECTED TRENDS:
${trendsBlock}

PALSGAARD KNOWLEDGE BASE (use these to inform palsgaard_angle — do not copy verbatim):
${knowledgeBlock}

GNPD PRODUCT EXAMPLES (use real product names only):
${gnpdBlock}

Generate ${selectedTrends.length + 2} slides following the structure below. Return a JSON object with a "slides" array and an "evidence_pack" array and a "product_shortlist" array.

Slide structure:
- Slide 1: Category landscape overview (no trend name required)
- Slides 2 to ${selectedTrends.length + 1}: One per selected trend
- Last slide: "What This Means" synthesis

Each slide must match this exact schema — no extra keys:
{
  "slide_number": number,
  "slide_name": "string",
  "title": "max 6 words, no Palsgaard",
  "subtitle": "market context, no Palsgaard",
  "market_signal": "2 sentences max, external facts only, no Palsgaard",
  "customer_pains": [
    {
      "pain": "specific challenge for food manufacturers",
      "palsgaard_angle": "expertise framing using 'Deep expertise in...' or 'Technical know-how in...' — no product names, no dosages",
      "palsgaard_can_help": true,
      "expert_only": false
    }
  ],
  "conversation_openers": ["open question ending in customer's world", "open question"],
  "supporting_data": [
    { "stat": "exact stat from Mintel", "source": "source title", "geography": "region" }
  ],
  "gnpd_examples": ["product name — brand, country, year"]
}

evidence_pack items: { "signal": "string", "capability_area": "string", "source_type": "string", "confidence": "string" }
product_shortlist items: { "product_name": "string", "brand": "string", "market": "string", "launch_date": "string", "claims": ["string"], "supporting_trends": ["string"] }`;

    // ── Call Claude via InvokeLLM ─────────────────────────────────────────
    const response = await base44.integrations.Core.InvokeLLM({
      model: 'claude_sonnet_4_6',
      prompt: userPrompt,
      response_json_schema: {
        type: 'object',
        properties: {
          slides: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                slide_number: { type: 'number' },
                slide_name: { type: 'string' },
                title: { type: 'string' },
                subtitle: { type: 'string' },
                market_signal: { type: 'string' },
                customer_pains: {
                  type: 'array',
                  items: {
                    type: 'object',
                    properties: {
                      pain: { type: 'string' },
                      palsgaard_angle: { type: 'string' },
                      palsgaard_can_help: { type: 'boolean' },
                      expert_only: { type: 'boolean' }
                    }
                  }
                },
                conversation_openers: { type: 'array', items: { type: 'string' } },
                supporting_data: {
                  type: 'array',
                  items: {
                    type: 'object',
                    properties: {
                      stat: { type: 'string' },
                      source: { type: 'string' },
                      geography: { type: 'string' }
                    }
                  }
                },
                gnpd_examples: { type: 'array', items: { type: 'string' } }
              }
            }
          },
          evidence_pack: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                signal: { type: 'string' },
                capability_area: { type: 'string' },
                source_type: { type: 'string' },
                confidence: { type: 'string' }
              }
            }
          },
          product_shortlist: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                product_name: { type: 'string' },
                brand: { type: 'string' },
                market: { type: 'string' },
                launch_date: { type: 'string' },
                claims: { type: 'array', items: { type: 'string' } },
                supporting_trends: { type: 'array', items: { type: 'string' } }
              }
            }
          }
        }
      }
    });

    // ── Determine freshness ────────────────────────────────────────────────
    const oldestSourceDate = sources
      .filter(s => s.date_published || s.date)
      .map(s => new Date(s.date_published || s.date))
      .sort((a, b) => a - b)[0];

    let freshness = 'fresh';
    if (oldestSourceDate) {
      const ageMonths = (Date.now() - oldestSourceDate.getTime()) / (1000 * 60 * 60 * 24 * 30);
      if (ageMonths > 24) freshness = 'outdated';
      else if (ageMonths > 12) freshness = 'use_with_caution';
    }

    // ── Step 4: save directly using new schema ─────────────────────────────
    const existingReports = await base44.entities.Report.filter({ project_id });
    const nextVersion = existingReports.length > 0
      ? Math.max(...existingReports.map(r => r.version || 1)) + 1
      : 1;

    const report = await base44.entities.Report.create({
      project_id,
      title: `${project.category} Trends — ${region}`,
      category: project.category,
      region,
      slides: response.slides || [],
      evidence_pack: response.evidence_pack || [],
      product_shortlist: response.product_shortlist || [],
      image_map: {},
      selected_trends: selectedTrends.map(t => t.trend_name),
      warnings: [],
      freshness,
      status: 'draft',
      version: nextVersion
    });

    return Response.json({
      success: true,
      report_id: report.id,
      version: nextVersion,
      slides_count: report.slides.length
    });

  } catch (error) {
    console.error('Generate report error:', error);
    return Response.json({
      error: error.message || 'Failed to generate report',
      details: error.stack
    }, { status: 500 });
  }
});