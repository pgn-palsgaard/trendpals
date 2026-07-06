import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { report_id } = await req.json();

    // Get the report
    const reports = await base44.asServiceRole.entities.Report.filter({ id: report_id });
    const report = reports[0];
    
    if (!report) {
      return Response.json({ error: 'Report not found' }, { status: 404 });
    }

    // Get product images for this project
    const productImages = await base44.asServiceRole.entities.ProductImageRequest.filter({ 
      project_id: report.project_id,
      status: 'uploaded'
    });

    // Get project for additional context
    const project = await base44.asServiceRole.entities.Project.get(report.project_id);
    
    const subcategoriesMap = {
      'Ice Cream': 'Dairy based ice cream & frozen yogurt; Plant-based ice cream & frozen yogurt; Water-based lollies/pops/sorbets; Frozen desserts',
      'Bakery': 'Bread; Cakes & pastries; Cookies & biscuits; Other baked goods',
      'Confectionery': 'Chocolate; Sugar confectionery; Gum & mints'
    };
    const subcategories = subcategoriesMap[project.category] || project.category;

    // Build the prompt (same as before — used as context for Claude)
    let prompt = `Create a comprehensive, visually rich B2B commercial insights PowerPoint presentation for Palsgaard, a food ingredients company.

AUDIENCE: ${project.audience || 'Industrial manufacturers: R&D, Operations, Quality, Procurement, Commercial Leadership'}
OBJECTIVE: ${project.objective}
CUSTOMER PRIORITIES: ${project.customer_priorities?.join(', ') || 'Innovation, cost efficiency, clean label'}
MEETING CONTEXT: ${project.meeting_context || 'Commercial discussion'}
CATEGORY: ${report.category} | Sub-categories: ${subcategories}
REGION: ${report.region}
TRENDS COVERED: ${report.selected_trends?.join(' | ') || 'Multiple trends'}

DESIGN PRINCIPLES:
- Professional, data-dense slides with clear hierarchy
- Each slide should have a clear "so what" message
- Use tables, bullet lists, and callout boxes to organize information
- Evidence-led: cite data sources inline
- Calm, authoritative tone — no marketing hype
- Regional specificity for ${report.region}
- Palsgaard sections reference CAPABILITIES only, never product grades

---

# ${report.title}
## ${report.category} Market Intelligence | ${report.region}
*Prepared by Palsgaard | ${new Date().toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })}*

**Audience:** ${project.audience || 'Industrial Manufacturers'}
**Objective:** ${project.objective}
**Trends covered:** ${report.selected_trends?.length || 0} key market trends

---

`;

    // Add slides
    if (report.slides && report.slides.length > 0) {
      for (const slide of report.slides) {
        prompt += `## ${slide.title}\n`;
        if (slide.subtitle) {
          prompt += `### ${slide.subtitle}\n\n`;
        }

        if (slide.bullets && slide.bullets.length > 0) {
          prompt += `**Key Market Signals**\n\n`;
          slide.bullets.forEach(bullet => {
            prompt += `- ${bullet}\n`;
          });
          prompt += `\n`;
        }

        // Add product images
        let slideProducts = [];
        if (slide.product_examples && slide.product_examples.length > 0) {
          slideProducts = slide.product_examples;
        } else if (slide.image_placements && slide.image_placements.length > 0) {
          slideProducts = slide.image_placements
            .map(productId => productImages.find(p => p.product_id === productId))
            .filter(p => p && p.image_url);
        }

        if (slideProducts.length > 0) {
          prompt += `**Product Examples from Market**\n\n`;
          slideProducts.forEach(product => {
            if (product.image_url) {
              prompt += `![${product.brand || product.company || ''} - ${product.product_name}](${product.image_url})\n`;
              prompt += `**${product.brand || product.company || 'Product'}** — ${product.product_name}`;
              if (product.market) prompt += ` | Market: ${product.market}`;
              if (product.launch_date) prompt += ` | Launched: ${product.launch_date}`;
              prompt += `\n`;
              if (product.relevance) prompt += `*${product.relevance}*\n`;
              prompt += `\n`;
            }
          });
        }

        if (report.product_shortlist && report.product_shortlist.length > 0) {
          const slideTitle = slide.title || '';
          const relatedProducts = report.product_shortlist.filter(p => 
            p.supporting_trends && p.supporting_trends.some(t => 
              slideTitle.toLowerCase().includes(t.toLowerCase().substring(0, 20))
            )
          ).slice(0, 4);
          
          if (relatedProducts.length > 0 && slideProducts.length === 0) {
            prompt += `**Relevant Product Launches**\n\n`;
            relatedProducts.forEach(p => {
              if (p.image_url) {
                prompt += `![${p.brand || ''} - ${p.product_name}](${p.image_url})\n`;
              }
              prompt += `**${p.brand || '-'}** — ${p.product_name || '-'} | ${p.market || '-'} | ${p.launch_date || '-'} | ${(p.claims || []).slice(0,3).join(', ') || '-'}\n\n`;
            });
            prompt += `\n`;
          }
        }
        
        if (slide.so_what && slide.so_what.length > 0) {
          prompt += `**So What for Manufacturers?**\n\n`;
          slide.so_what.forEach(item => {
            prompt += `→ ${item}\n`;
          });
          prompt += `\n`;
        }
        
        if (slide.where_palsgaard_supports && slide.where_palsgaard_supports.length > 0) {
          prompt += `**Where Palsgaard Supports**\n\n`;
          slide.where_palsgaard_supports.forEach(item => {
            prompt += `✓ ${item}\n`;
          });
          prompt += `\n`;
        }
        
        if (slide.evidence_footer) {
          prompt += `*Sources: ${slide.evidence_footer}*\n\n`;
        }
        
        prompt += `---\n\n`;
      }
    }

    if (report.evidence_pack && report.evidence_pack.length > 0) {
      prompt += `## Evidence & Data Foundation\n\n`;
      prompt += `*Supporting data underpinning this report*\n\n`;
      report.evidence_pack.forEach(evidence => {
        const confidence = evidence.confidence ? ` *(${evidence.confidence} confidence)*` : '';
        prompt += `- ${evidence.bullet}${confidence}\n`;
      });
      prompt += `\n---\n\n`;
    }

    if (report.product_shortlist && report.product_shortlist.length > 0) {
      prompt += `## Product Launch Overview — ${report.region}\n\n`;
      prompt += `*Recent launches exemplifying these trends*\n\n`;
      prompt += `| Brand | Product | Market | Launched | Trend |\n`;
      prompt += `|-------|---------|--------|----------|-------|\n`;
      report.product_shortlist.slice(0, 20).forEach(p => {
        prompt += `| ${p.brand || '-'} | ${p.product_name || '-'} | ${p.market || '-'} | ${p.launch_date || '-'} | ${(p.supporting_trends || []).join(', ') || '-'} |\n`;
      });
      const shortlistImages = report.product_shortlist.slice(0, 20).filter(p => p.image_url);
      if (shortlistImages.length > 0) {
        prompt += `\n**Product Images** (small thumbnails — keep multiple per slide)\n\n`;
        shortlistImages.forEach(p => {
          prompt += `![${p.brand || ''} - ${p.product_name}](${p.image_url}) *${p.product_name}*\n`;
        });
      }
      prompt += `\n---\n\n`;
    }

    if (report.warnings && report.warnings.length > 0) {
      prompt += `## Data Coverage Notes\n\n`;
      report.warnings.forEach(w => {
        prompt += `⚠ ${w.message || w}\n`;
      });
      prompt += `\n---\n\n`;
    }

    const AI_DISCLAIMER = 'This deck was generated with the assistance of AI and may contain errors or omissions. Review and verify all information before sharing externally or acting on it.';

    // Call Claude via InvokeLLM
    const claudeResponse = await base44.integrations.Core.InvokeLLM({
      model: 'claude_sonnet_4_6',
      prompt: `You are a senior B2B market intelligence specialist at Palsgaard. Based on the following report content, produce a refined, polished, presentation-ready version of this deck in markdown format. Structure it clearly with slides separated by ---. Make the language punchy, insight-driven, and commercially relevant. Do not invent any new facts — only use what is provided. Palsgaard sections must mention capabilities only, no product grades.

IMPORTANT: Preserve ALL image markdown (![alt](url)) exactly as provided — never drop, alter, or invent image URLs. Keep product images as small thumbnails placed next to the product they belong to, so several products with images can share one slide.

Add a final slide (separated by ---) titled "Disclaimer" whose only content is this exact sentence: "${AI_DISCLAIMER}"

${prompt}`,
    });

    // Guarantee the disclaimer is present even if the model omits it.
    const claudeText = typeof claudeResponse === 'string' ? claudeResponse : JSON.stringify(claudeResponse);
    const finalDeck = claudeText.includes('assistance of AI')
      ? claudeText
      : `${claudeText}\n\n---\n\n## Disclaimer\n\n*${AI_DISCLAIMER}*\n`;

    // Store the Claude output as the "gamma_prompt" for audit, and use gamma_url to signal completion
    await base44.asServiceRole.entities.Report.update(report_id, {
      gamma_url: 'claude_generated',
      gamma_pdf_url: null,
      gamma_pptx_url: null,
      gamma_prompt: finalDeck
    });

    return Response.json({ 
      success: true,
      output: finalDeck
    });

  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});