import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

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

     // Include excerpts per source - cap to avoid timeout
     sources.forEach(source => {
       if (source.excerpts && source.excerpts.length > 0) {
         evidenceContext += `\n[SOURCE: ${source.title} | Publisher: ${source.publisher || 'Unknown'} | Date: ${source.date_published || source.date || 'Unknown'}]\n`;
         const seenTexts = new Set();
         source.excerpts.slice(0, 10).forEach(excerpt => {
           const text = excerpt.text.substring(0, 400);
           if (!seenTexts.has(text)) {
             evidenceContext += `  • [p.${excerpt.page_ref || '?'}] ${text}\n`;
             seenTexts.add(text);
           }
         });
       }
       if (source.gnpd_data && source.gnpd_data.length > 0) {
         evidenceContext += `\n[GNPD DATA: ${source.title} | ${source.gnpd_row_count || source.gnpd_data.length} products]\n`;
         source.gnpd_data.slice(0, 20).forEach(p => {
           evidenceContext += `  • ${p.product_name || p['Product Name'] || ''} | ${p.brand || p['Brand'] || ''} | ${p.market || p['Market'] || ''} | ${p.date_published || p['Date Published'] || ''} | Claims: ${(p.claims || p['Claims'] || '').substring(0, 150)}\n`;
         });
       }
     });
     // Hard cap total context to ~80k chars to avoid LLM timeout
     if (evidenceContext.length > 80000) {
       evidenceContext = evidenceContext.substring(0, 80000) + '\n[...evidence truncated for length]';
     }

     // Add RAG-retrieved knowledge — retrieve top excerpts per trend and inject as grounded context
     const allTrendKeywords = selectedTrends.flatMap(t => t.signals_dictionary?.keywords || []);
     let ragContext = '';
     for (const trend of selectedTrends) {
       const trendKeywords = [
         ...(trend.signals_dictionary?.keywords || []),
         ...(trend.signals_dictionary?.must_have_signals || []),
         ...(trend.signals_dictionary?.claim_cues || []),
       ];
       try {
         const ragResult = await base44.functions.invoke('retrieveRelevantKnowledge', {
           trend_name: trend.trend_name,
           trend_keywords: trendKeywords.length > 0 ? trendKeywords : allTrendKeywords.slice(0, 20),
           category: project.category
         });
         const excerpts = ragResult?.data?.excerpts || [];
         if (excerpts.length > 0) {
           ragContext += `\n\n## VERIFIED PALSGAARD CAPABILITIES FOR TREND: "${trend.trend_name}"\n`;
           ragContext += `Use ONLY the following verified claims. Cite the specific product and source. Do NOT use generic phrases.\n`;
           excerpts.forEach(ex => {
             const product = ex.product_name ? `${ex.product_name}${ex.product_code ? ` (${ex.product_code})` : ''}` : 'Palsgaard';
             ragContext += `- ${product}: ${ex.text}`;
             if (ex.quantitative_data) ragContext += ` [${ex.quantitative_data}]`;
             ragContext += ` | Source: ${ex._source_title}\n`;
           });
         }
         // Add web content if available
         if (ragResult?.data?.web_content) {
           ragContext += `\n[Palsgaard.com context for ${project.category}]:\n${ragResult.data.web_content.substring(0, 1500)}\n`;
         }
       } catch (e) {
         console.warn(`RAG retrieval failed for trend "${trend.trend_name}":`, e.message);
       }
     }

     if (ragContext) {
       evidenceContext += `\n\n=== PALSGAARD KNOWLEDGE BASE (VERIFIED CLAIMS) ===\n${ragContext}`;
     } else if (knowledgeSources.length > 0) {
       // Fallback to old summary-based approach if RAG returned nothing
       evidenceContext += `\n\n=== PALSGAARD CAPABILITY KNOWLEDGE SOURCES ===\n`;
       knowledgeSources.forEach(ks => {
         evidenceContext += `\n[${ks.knowledge_subtype || ks.source_type}] ${ks.title}\n`;
         if (ks.ai_summary) evidenceContext += `Summary: ${ks.ai_summary}\n`;
         if (ks.excerpts && ks.excerpts.length > 0) {
           ks.excerpts.slice(0, 5).forEach(excerpt => {
             evidenceContext += `  • ${excerpt.text.substring(0, 300)}\n`;
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
       prompt: `Generate a professional B2B market trend report for ${project.category} in ${region} for Palsgaard (food ingredients company).

    AUDIENCE: ${project.audience || 'Industrial food manufacturers'}
    OBJECTIVE: ${project.objective}

    EVIDENCE:
    ${evidenceContext}

    CREATE:
    1. SLIDES (${selectedTrends.length + 2} slides):
    - Slide 1: Overview/landscape (3-4 key meta-observations)
    - Slides 2-${selectedTrends.length + 1}: One per trend — title, subtitle, 5 evidence-backed bullets, 2-3 "so what for manufacturers" bullets, 2-3 "where Palsgaard supports" (capabilities only, no product grades), evidence footer
    - Last slide: "What This Means" synthesis slide

    2. EVIDENCE PACK: 6-8 strongest data points with source + confidence

    3. PRODUCT SHORTLIST: 10-15 GNPD launches exemplifying the trends (brand, product, market, date, claims, which trend)

    4. WARNINGS: flag any weak evidence areas

    Rules: Only use evidence from sources above. No invented stats. For "where_palsgaard_supports" bullets, you MUST cite specific Palsgaard products by name (e.g. "Palsgaard® ArtisanIce 158"). Never write generic capability statements like "Palsgaard's emulsifier expertise can help". If no relevant knowledge is found for a trend, write "Contact Palsgaard application team for formulation support in this specific application." Do not invent claims. Be specific with brand names and dates.

    Return JSON.`,
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

    // Determine freshness — use date_published if available, otherwise upload date
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