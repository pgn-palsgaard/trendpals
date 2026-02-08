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

    // Get Gamma credentials
    const GAMMA_API_KEY = Deno.env.get('GAMMA_API_KEY');
    const GAMMA_TEMPLATE_ID = Deno.env.get('GAMMA_TEMPLATE_ID');
    
    if (!GAMMA_API_KEY || !GAMMA_TEMPLATE_ID) {
      return Response.json({ error: 'Gamma API credentials not configured' }, { status: 500 });
    }

    // Build the prompt for Gamma
    let prompt = `# ${report.title}\n\n`;
    prompt += `**Category:** ${report.category} | **Region:** ${report.region}\n\n`;
    
    if (report.selected_trends && report.selected_trends.length > 0) {
      prompt += `**Key Trends:** ${report.selected_trends.join(', ')}\n\n`;
    }
    
    prompt += `---\n\n`;

    // Add slides
    if (report.slides && report.slides.length > 0) {
      for (const slide of report.slides) {
        prompt += `## Slide ${slide.slide_number}: ${slide.title}\n\n`;
        
        if (slide.subtitle) {
          prompt += `**${slide.subtitle}**\n\n`;
        }
        
        if (slide.bullets && slide.bullets.length > 0) {
          prompt += `### Key Points\n`;
          slide.bullets.forEach(bullet => {
            prompt += `- ${bullet}\n`;
          });
          prompt += `\n`;
        }
        
        // Add product images if available
        if (slide.product_examples && slide.product_examples.length > 0) {
          prompt += `### Product Examples\n`;
          slide.product_examples.forEach(product => {
            if (product.image_url) {
              prompt += `![${product.brand} - ${product.product_name}](${product.image_url})\n`;
              prompt += `**${product.brand} - ${product.product_name}** (${product.market})\n`;
              if (product.relevance) {
                prompt += `*${product.relevance}*\n`;
              }
              prompt += `\n`;
            }
          });
        }
        
        if (slide.so_what && slide.so_what.length > 0) {
          prompt += `### So What for Manufacturers?\n`;
          slide.so_what.forEach(item => {
            prompt += `→ ${item}\n`;
          });
          prompt += `\n`;
        }
        
        if (slide.where_palsgaard_supports && slide.where_palsgaard_supports.length > 0) {
          prompt += `### Where Palsgaard Supports\n`;
          slide.where_palsgaard_supports.forEach(item => {
            prompt += `✓ ${item}\n`;
          });
          prompt += `\n`;
        }
        
        if (slide.evidence_footer) {
          prompt += `*Evidence: ${slide.evidence_footer}*\n\n`;
        }
        
        prompt += `---\n\n`;
      }
    }

    // Add evidence pack
    if (report.evidence_pack && report.evidence_pack.length > 0) {
      prompt += `## Evidence Pack\n\n`;
      report.evidence_pack.forEach(evidence => {
        prompt += `- ${evidence.bullet}\n`;
      });
    }

    // Call Gamma API - Create from template
    const createResponse = await fetch('https://api.gamma.app/api/v1/create-from-template', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${GAMMA_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        gammaId: GAMMA_TEMPLATE_ID,
        text: prompt,
        exportAs: ['pptx', 'pdf']
      })
    });

    if (!createResponse.ok) {
      const errorText = await createResponse.text();
      return Response.json({ 
        error: 'Failed to create Gamma report', 
        details: errorText 
      }, { status: createResponse.status });
    }

    const createResult = await createResponse.json();
    const jobId = createResult.jobId;

    // Poll for completion
    let attempts = 0;
    const maxAttempts = 60; // 5 minutes max (5 seconds * 60)
    let jobStatus = 'pending';
    let gammaUrl = null;
    let pptxUrl = null;
    let pdfUrl = null;

    while (attempts < maxAttempts && jobStatus !== 'completed' && jobStatus !== 'failed') {
      await new Promise(resolve => setTimeout(resolve, 5000)); // Wait 5 seconds
      
      const statusResponse = await fetch(`https://api.gamma.app/api/v1/job-status/${jobId}`, {
        headers: {
          'Authorization': `Bearer ${GAMMA_API_KEY}`
        }
      });
      
      if (statusResponse.ok) {
        const statusResult = await statusResponse.json();
        jobStatus = statusResult.status;
        
        if (jobStatus === 'completed') {
          gammaUrl = statusResult.url;
          pptxUrl = statusResult.exports?.pptx || null;
          pdfUrl = statusResult.exports?.pdf || null;
        }
      }
      
      attempts++;
    }

    if (jobStatus !== 'completed') {
      return Response.json({ 
        error: 'Gamma report generation timed out or failed',
        job_status: jobStatus 
      }, { status: 500 });
    }

    // Update report with Gamma URLs
    await base44.entities.Report.update(report_id, {
      gamma_url: gammaUrl,
      gamma_pptx_url: pptxUrl,
      gamma_pdf_url: pdfUrl,
      gamma_prompt: prompt
    });

    return Response.json({ 
      success: true,
      gamma_url: gammaUrl,
      pptx_url: pptxUrl,
      pdf_url: pdfUrl
    });

  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});