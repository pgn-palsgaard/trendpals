import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { report_id } = await req.json();

    // Get the report
    const reports = await base44.entities.Report.filter({ id: report_id });
    const report = reports[0];
    
    if (!report) {
      return Response.json({ error: 'Report not found' }, { status: 404 });
    }

    // Get product images for this project
    const productImages = await base44.entities.ProductImageRequest.filter({ 
      project_id: report.project_id,
      status: 'uploaded'
    });

    // Get Gamma credentials
    const GAMMA_API_KEY = Deno.env.get('GAMMA_API_KEY');
    const GAMMA_TEMPLATE_ID = Deno.env.get('GAMMA_TEMPLATE_ID');
    
    if (!GAMMA_API_KEY || !GAMMA_TEMPLATE_ID) {
      return Response.json({ error: 'Gamma API credentials not configured' }, { status: 500 });
    }

    // Get project for additional context
    const project = await base44.entities.Project.get(report.project_id);
    
    // Note: Sources are not directly used in Gamma generation, but available if needed
    // The report already contains the processed slide content
    
    // Determine subcategories from project category
    const subcategoriesMap = {
      'Ice Cream': 'Dairy based ice cream & frozen yogurt; Plant-based ice cream & frozen yogurt; Water-based lollies/pops/sorbets; Frozen desserts',
      'Bakery': 'Bread; Cakes & pastries; Cookies & biscuits; Other baked goods',
      'Confectionery': 'Chocolate; Sugar confectionery; Gum & mints'
    };
    const subcategories = subcategoriesMap[project.category] || project.category;

    // Build comprehensive prompt for Gamma
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

        // Add product images - either from slide.product_examples OR from ProductImageRequest
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

        // Also add product shortlist items for this slide from the report
        if (report.product_shortlist && report.product_shortlist.length > 0) {
          const slideTitle = slide.title || '';
          const relatedProducts = report.product_shortlist.filter(p => 
            p.supporting_trends && p.supporting_trends.some(t => 
              slideTitle.toLowerCase().includes(t.toLowerCase().substring(0, 20))
            )
          ).slice(0, 4);
          
          if (relatedProducts.length > 0 && slideProducts.length === 0) {
            prompt += `**Relevant Product Launches**\n\n`;
            prompt += `| Brand | Product | Market | Launched | Key Claims |\n`;
            prompt += `|-------|---------|--------|----------|------------|\n`;
            relatedProducts.forEach(p => {
              prompt += `| ${p.brand || '-'} | ${p.product_name || '-'} | ${p.market || '-'} | ${p.launch_date || '-'} | ${(p.claims || []).slice(0,3).join(', ') || '-'} |\n`;
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

    // Add evidence pack as a dedicated slide
    if (report.evidence_pack && report.evidence_pack.length > 0) {
      prompt += `## Evidence & Data Foundation\n\n`;
      prompt += `*Supporting data underpinning this report*\n\n`;
      report.evidence_pack.forEach(evidence => {
        const confidence = evidence.confidence ? ` *(${evidence.confidence} confidence)*` : '';
        prompt += `- ${evidence.bullet}${confidence}\n`;
      });
      prompt += `\n---\n\n`;
    }

    // Add product shortlist as a summary slide
    if (report.product_shortlist && report.product_shortlist.length > 0) {
      prompt += `## Product Launch Overview — ${report.region}\n\n`;
      prompt += `*Recent launches exemplifying these trends*\n\n`;
      prompt += `| Brand | Product | Market | Launched | Trend |\n`;
      prompt += `|-------|---------|--------|----------|-------|\n`;
      report.product_shortlist.slice(0, 20).forEach(p => {
        prompt += `| ${p.brand || '-'} | ${p.product_name || '-'} | ${p.market || '-'} | ${p.launch_date || '-'} | ${(p.supporting_trends || []).join(', ') || '-'} |\n`;
      });
      prompt += `\n---\n\n`;
    }

    // Add warnings if any
    if (report.warnings && report.warnings.length > 0) {
      prompt += `## Data Coverage Notes\n\n`;
      report.warnings.forEach(w => {
        prompt += `⚠ ${w.message || w}\n`;
      });
      prompt += `\n---\n\n`;
    }

    // Call Gamma API - Create from template
    const createResponse = await fetch('https://public-api.gamma.app/v1.0/generations/from-template', {
      method: 'POST',
      headers: {
        'X-API-KEY': GAMMA_API_KEY,
        'Content-Type': 'application/json',
        'accept': 'application/json'
      },
      body: JSON.stringify({
        gammaId: GAMMA_TEMPLATE_ID,
        prompt: prompt,
        exportAs: 'pptx'
      })
    });

    if (!createResponse.ok) {
      const errorText = await createResponse.text();
      return Response.json({ 
        error: 'Failed to create Gamma report', 
        details: errorText,
        status_code: createResponse.status
      }, { status: createResponse.status });
    }

    const createResult = await createResponse.json();
    const generationId = createResult.generationId;

    // Poll for completion
    let attempts = 0;
    const maxAttempts = 120; // 10 minutes max (5 seconds * 120)
    let generationStatus = 'pending';
    let gammaUrl = null;
    let pptxUrl = null;

    while (attempts < maxAttempts && generationStatus !== 'completed' && generationStatus !== 'failed') {
      await new Promise(resolve => setTimeout(resolve, 5000)); // Wait 5 seconds
      
      const statusResponse = await fetch(`https://public-api.gamma.app/v1.0/generations/${generationId}`, {
        headers: {
          'X-API-KEY': GAMMA_API_KEY,
          'accept': 'application/json'
        }
      });
      
      if (statusResponse.ok) {
        const statusResult = await statusResponse.json();
        generationStatus = statusResult.status;
        
        if (generationStatus === 'completed') {
          gammaUrl = statusResult.webUrl;
          pptxUrl = statusResult.pptxUrl || null;
        }
      }
      
      attempts++;
    }

    if (generationStatus !== 'completed') {
      return Response.json({ 
        error: 'Gamma report generation timed out or failed',
        generation_status: generationStatus,
        generation_id: generationId
      }, { status: 500 });
    }

    // Update report with Gamma URLs
    await base44.entities.Report.update(report_id, {
      gamma_url: gammaUrl,
      gamma_pptx_url: pptxUrl,
      gamma_pdf_url: null,
      gamma_prompt: prompt
    });

    return Response.json({ 
      success: true,
      gamma_url: gammaUrl,
      pptx_url: pptxUrl,
      pdf_url: null
    });

  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});