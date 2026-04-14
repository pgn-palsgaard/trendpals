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
    const project = await base44.entities.Project.get(project_id);
    
    // Default region to "Global" if missing
    const region = project.region_code || project.region || "Global";
    // Get sources linked to this project via selected_source_ids
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
      // Fallback: old projects with direct project_id linkage
      sources = await base44.entities.Source.filter({ project_id });
    }

    // Fetch org-shared Knowledge sources (Palsgaard capability docs)
    const allKnowledgeSources = await base44.entities.Source.filter({ 
      source_type: 'knowledge',
      visibility: 'org_shared'
    });
    // Also fetch project-specific knowledge sources via ProjectKnowledgeLink
    const knowledgeLinks = await base44.entities.ProjectKnowledgeLink.filter({ project_id });
    const linkedKnowledgeIds = new Set(knowledgeLinks.map(l => l.source_id));
    // Project-specific knowledge that isn't already in org_shared
    const orgSharedIds = new Set(allKnowledgeSources.map(s => s.id));
    for (const link of knowledgeLinks) {
      if (!orgSharedIds.has(link.source_id)) {
        try {
          const ks = await base44.entities.Source.get(link.source_id);
          if (ks) allKnowledgeSources.push(ks);
        } catch (e) {}
      }
    }
    const knowledgeSources = allKnowledgeSources;
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

    // Include trend analysis context if available
    let analysisContext = '';
    if (project.include_trend_analysis_in_report && project.trend_analysis) {
      const analysis = project.trend_analysis;
      analysisContext = `

    AI-Generated Trend Analysis Context:
    ${analysis.perspective_customers ? `
    Customer Perspective - What They're Seeking:
    ${analysis.perspective_customers.what_consumers_want?.map(w => `- ${w}`).join('\n')}

    Portfolio Directions to Consider:
    ${analysis.perspective_customers.portfolio_directions?.map(p => `- ${p}`).join('\n')}
    ` : ''}

    ${analysis.perspective_palsgaard ? `
    Palsgaard Value in These Trends:
    ${analysis.perspective_palsgaard.value_propositions?.map(v => `- ${v}`).join('\n')}
    ` : ''}
    `;
    }

    // Compile evidence context - optimized for token limit
     let evidenceContext = `Project: ${project.name}
     Category: ${project.category}
     Region: ${region}
     Objective: ${project.objective}
     Audience: ${project.audience}
     ${analysisContext}

     Selected Trends:
     ${selectedTrends.map((t, i) => `${i+1}. ${t.trend_name}
     What's changing: ${t.whats_changing?.join('; ')}
     Why now: ${t.why_now?.join('; ')}
     Evidence: ${t.evidence_anchors?.mintel_excerpts?.length || 0} excerpts, ${t.evidence_anchors?.gnpd_products?.length || 0} products
     `).join('\n')}

     Available Evidence (Top excerpts per source):
     `;

     // Include more excerpts per source with more text for richer evidence
     sources.forEach(source => {
       if (source.excerpts && source.excerpts.length > 0) {
         evidenceContext += `\n[SOURCE: ${source.title} | Publisher: ${source.publisher || 'Unknown'} | Date: ${source.date_published || source.date || 'Unknown'}]\n`;
         const seenTexts = new Set();
         source.excerpts.slice(0, 15).forEach(excerpt => {
           const text = excerpt.text.substring(0, 500);
           if (!seenTexts.has(text)) {
             evidenceContext += `  • [p.${excerpt.page_ref || '?'}] ${text}\n`;
             seenTexts.add(text);
           }
         });
       }
       if (source.gnpd_data && source.gnpd_data.length > 0) {
         evidenceContext += `\n[GNPD DATA: ${source.title} | ${source.gnpd_row_count || source.gnpd_data.length} products]\n`;
         source.gnpd_data.slice(0, 30).forEach(p => {
           evidenceContext += `  • ${p.product_name || p['Product Name'] || ''} | ${p.brand || p['Brand'] || ''} | ${p.market || p['Market'] || ''} | ${p.date_published || p['Date Published'] || ''} | Claims: ${p.claims || p['Claims'] || ''}\n`;
         });
       }
     });

     // Add knowledge source context (Palsgaard capabilities)
     if (knowledgeSources.length > 0) {
       evidenceContext += `\n\n=== PALSGAARD CAPABILITY KNOWLEDGE SOURCES ===\n`;
       evidenceContext += `(Use these to ground "Where Palsgaard Supports" sections — reference capabilities, NOT product grades or names)\n`;
       knowledgeSources.forEach(ks => {
         evidenceContext += `\n[${ks.knowledge_subtype || ks.source_type}] ${ks.title}`;
         if (ks.notes) evidenceContext += ` — ${ks.notes}`;
         evidenceContext += `\n`;
         if (ks.ai_summary) evidenceContext += `Summary: ${ks.ai_summary}\n`;
         if (ks.excerpts && ks.excerpts.length > 0) {
           const seenTexts = new Set();
           ks.excerpts.slice(0, 8).forEach(excerpt => {
             const text = excerpt.text.substring(0, 400);
             if (!seenTexts.has(text)) {
               evidenceContext += `  • ${text}\n`;
               seenTexts.add(text);
             }
           });
         }
       });
     }

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

    // Abort if no sources have excerpts or products
    const hasSources = sources.some(s => s.excerpts?.length > 0 || s.gnpd_data?.length > 0);
    if (!hasSources) {
      return Response.json({ 
        error: 'No processed sources available. Please upload and process sources first.' 
      }, { status: 400 });
    }

    // Generate report pack using AI
     const response = await base44.integrations.Core.InvokeLLM({
      model: 'claude_sonnet_4_6',
      prompt: `You are a senior market intelligence analyst at Palsgaard, a B2B food ingredients company. Generate a COMPREHENSIVE, evidence-rich professional trend report for ${project.category} in ${region}.

    ${evidenceContext}

    TASK: Create a complete, detailed report pack. This will be presented to industrial food manufacturers (R&D directors, Category Managers, Innovation leads). Every slide must be dense with insight, grounded in the evidence above.

    REQUIREMENTS FOR EACH TREND SLIDE:
    - Title: Specific, insight-driven (not generic)
    - Subtitle: Category | Region | Time window
    - bullets (5-7 bullets MINIMUM per slide):
    * Open with a quantified market signal if available (e.g. "X% of launches in ANZ carry Y claim")
    * Describe what is changing and how fast
    * Include geographic specificity — which markets lead, which follow
    * Name specific brand/product examples from the GNPD data provided
    * Describe the formulation or format implication for manufacturers
    * Connect to broader macro driver (health, sustainability, cost pressure, regulation)
    - so_what (3-4 bullets): Concrete manufacturer action implications — reformulation triggers, NPD opportunities, cost/supply chain considerations
    - where_palsgaard_supports (3-4 bullets): Ground EACH bullet in the PALSGAARD CAPABILITY KNOWLEDGE SOURCES. Cite the specific capability area. NO product names or grades — capabilities only.
    - evidence_footer: Cite specific source documents and GNPD data with dates

    SLIDE STRUCTURE (7-10 slides total):
    1. Title/Overview slide — executive summary of the landscape (3-4 key meta-observations, overall direction of the category in this region)
    2-${selectedTrends.length + 1}. One slide per trend (${selectedTrends.length} slides)
    ${selectedTrends.length + 2}. "What This Means for Your Business" — synthesis slide connecting all trends to manufacturer decision-making
    ${selectedTrends.length + 3 <= 10 ? `${selectedTrends.length + 3}. Optional: Regional Spotlight or Emerging Signals slide` : ''}

    EVIDENCE PACK (8-12 bullets):
    - Most compelling data points from the sources
    - Each must include: the specific claim, source name + date, and confidence (high/medium/low)
    - Prioritize quantified claims and named product/brand examples

    PRODUCT SHORTLIST (15-25 GNPD launches):
    - Select products that BEST exemplify each trend
    - Spread across multiple markets within ${region}
    - Include recent launches (prioritize last 24 months)
    - Each product must clearly state which trend(s) it supports and WHY

    CRITICAL RULES:
    - Use ONLY evidence from the sources provided above
    - NO invented statistics — if a number isn't in the source, don't use it
    - Palsgaard mentions: capabilities and application areas ONLY, no product grades
    - Every bullet on every slide must be traceable to at least one source
    - Flag weak evidence areas as warnings
    - Be specific: use brand names, country names, launch dates from the data
    - Avoid generic statements — every sentence should deliver a concrete insight

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

    // Merge AI-generated image placements with actual image URLs
    const enrichedSlides = (response.slides || []).map(slide => {
      const slideWithImages = { ...slide };
      // Add actual image URLs from extracted GNPD data
      if (slide.image_placements && Array.isArray(slide.image_placements)) {
        slideWithImages.product_examples = slide.image_placements
          .map(productRef => {
            // Find matching product in shortlist
            const product = (response.product_shortlist || [])
              .find(p => p.product_name && productRef.includes(p.product_name));
            if (product && (product.image_url || imageMap[product.product_name])) {
              return {
                brand: product.brand,
                product_name: product.product_name,
                market: product.market,
                launch_date: product.launch_date,
                image_url: product.image_url || imageMap[product.product_name],
                relevance: `Supports: ${product.supporting_trends?.join(', ')}`
              };
            }
            return null;
          })
          .filter(Boolean);
      }
      return slideWithImages;
    });

    // Get existing reports for this project to determine version
    const existingReports = await base44.entities.Report.filter({ project_id });
    const nextVersion = existingReports.length > 0 
      ? Math.max(...existingReports.map(r => r.version || 1)) + 1
      : 1;

    // Create report entity
    const report = await base44.entities.Report.create({
      project_id,
      title: response.title || `${project.category} Trends - ${region}`,
      category: project.category,
      region: region,
      slides: enrichedSlides,
      evidence_pack: response.evidence_pack || [],
      product_shortlist: response.product_shortlist || [],
      image_map: response.image_map || {},
      selected_trends: selectedTrends.map(t => t.trend_name),
      warnings: response.warnings || [],
      freshness,
      status: 'draft',
      version: nextVersion
    });

    return Response.json({ 
      success: true, 
      report_id: report.id,
      version: nextVersion,
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