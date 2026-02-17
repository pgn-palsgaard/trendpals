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

    // Run validation checks
    const validationErrors = [];
    const validationWarnings = [];

    // Hard blocks
    if (!report.slides || report.slides.length === 0) {
      validationErrors.push('No slides in report');
    }

    if (!report.evidence_pack || report.evidence_pack.length < 5) {
      validationErrors.push('Evidence pack must contain at least 5 bullets');
    }

    if (!report.product_shortlist || report.product_shortlist.length < 12) {
      validationErrors.push('Product shortlist must contain at least 12 products');
    }

    // Check all slides have evidence footers
    report.slides?.forEach((slide, idx) => {
      if (!slide.evidence_footer || slide.evidence_footer.trim() === '') {
        validationErrors.push(`Slide ${idx + 1} is missing evidence footer`);
      }
    });

    // Soft warnings
    if (report.freshness === 'outdated') {
      validationWarnings.push({
        type: 'freshness',
        message: 'Report contains outdated sources (>2 years old). Consider refreshing data.'
      });
    }

    if (report.freshness === 'use_with_caution') {
      validationWarnings.push({
        type: 'freshness',
        message: 'Some sources are aging (>1 year old). Verify data is still relevant.'
      });
    }

    // Check GNPD product density
    const gnpdProductCount = report.product_shortlist?.length || 0;
    if (gnpdProductCount < 15) {
      validationWarnings.push({
        type: 'gnpd_density',
        message: 'Low GNPD product density. Consider adding more product examples.'
      });
    }

    // Check image availability
    const productsWithImages = report.product_shortlist?.filter(p => p.has_image).length || 0;
    if (productsWithImages < 8) {
      validationWarnings.push({
        type: 'images',
        message: 'Many products lack images. Visual proof will be limited.'
      });
    }

    // If there are hard validation errors, block publishing
    if (validationErrors.length > 0) {
      return Response.json({
        success: false,
        blocked: true,
        errors: validationErrors,
        warnings: validationWarnings
      }, { status: 400 });
    }

    // Update report status to published
    await base44.entities.Report.update(report_id, {
      status: 'published',
      warnings: validationWarnings
    });

    // Update project state
    await base44.entities.Project.update(report.project_id, {
      state: 'published'
    });

    return Response.json({ 
      success: true,
      warnings: validationWarnings
    });
  } catch (error) {
    console.error('Publish report error:', error);
    return Response.json({ 
      error: error.message || 'Failed to publish report',
      details: error.stack
    }, { status: 500 });
  }
});