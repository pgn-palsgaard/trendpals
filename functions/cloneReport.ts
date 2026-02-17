import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { report_id } = await req.json();

    // Get the original report
    const reports = await base44.entities.Report.filter({ id: report_id });
    const report = reports[0];

    if (!report) {
      return Response.json({ error: 'Report not found' }, { status: 404 });
    }

    // Get the original project
    const projects = await base44.entities.Project.filter({ id: report.project_id });
    const originalProject = projects[0];

    if (!originalProject) {
      return Response.json({ error: 'Original project not found' }, { status: 404 });
    }

    // Create a new project (clone)
    const newProject = await base44.entities.Project.create({
      name: `${originalProject.name} (Clone)`,
      category: originalProject.category,
      region: originalProject.region,
      trend_time_window: originalProject.trend_time_window,
      launch_time_window: originalProject.launch_time_window,
      audience: originalProject.audience,
      objective: originalProject.objective,
      meeting_context: originalProject.meeting_context,
      customer_priorities: originalProject.customer_priorities,
      state: 'draft',
      data_sufficiency_score: 0,
      warnings: [{
        type: 'cloned',
        message: `Cloned from report: ${report.title}. Original data may be outdated.`
      }]
    });

    // Clone the report with updated references
    const clonedReport = await base44.entities.Report.create({
      project_id: newProject.id,
      title: `${report.title} (Clone)`,
      category: report.category,
      region: report.region,
      slides: report.slides,
      evidence_pack: report.evidence_pack,
      product_shortlist: report.product_shortlist,
      image_map: report.image_map,
      selected_trends: report.selected_trends,
      version: 1,
      status: 'draft',
      freshness: 'use_with_caution',
      warnings: [
        ...(report.warnings || []),
        {
          type: 'cloned',
          message: 'This is a cloned report. Verify all data is still current before publishing.'
        }
      ]
    });

    return Response.json({ 
      success: true,
      project_id: newProject.id,
      report_id: clonedReport.id
    });
  } catch (error) {
    console.error('Clone report error:', error);
    return Response.json({ 
      error: error.message || 'Failed to clone report',
      details: error.stack
    }, { status: 500 });
  }
});