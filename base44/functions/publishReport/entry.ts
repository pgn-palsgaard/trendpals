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
    const report = await base44.entities.Report.get(report_id);

    if (!report) {
      return Response.json({ error: 'Report not found' }, { status: 404 });
    }

    // Run validation checks
    const validationErrors = [];
    const validationWarnings = [];

    // Hard blocks — only truly critical checks
    if (!report.slides || report.slides.length === 0) {
      validationErrors.push('No slides in report. Generate a report first.');
    }

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

    if (!report.evidence_pack || report.evidence_pack.length < 3) {
      validationWarnings.push({
        type: 'evidence',
        message: 'Few evidence bullets. Consider enriching the evidence pack.'
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
      published: true,
      report_title: report.title,
      warnings: validationWarnings,
      warnings_count: validationWarnings.length
    });
  } catch (error) {
    console.error('Publish report error:', error);
    return Response.json({ 
      error: error.message || 'Failed to publish report',
      details: error.stack
    }, { status: 500 });
  }
});