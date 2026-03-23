import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { project_id } = await req.json();

    if (!project_id) {
      return Response.json({ error: 'project_id is required' }, { status: 400 });
    }

    // Get the project to check its state
    const projects = await base44.entities.Project.filter({ id: project_id });
    const project = projects[0];

    if (!project) {
      return Response.json({ error: 'Project not found' }, { status: 404 });
    }

    // Only allow resets before publishing
    if (project.state === 'published') {
      return Response.json({ error: 'Cannot reset image extraction on a published project' }, { status: 403 });
    }

    // Delete all GNPDImageExtraction records for this project
    const extractions = await base44.entities.GNPDImageExtraction.filter({ project_id });
    for (const extraction of extractions) {
      await base44.entities.GNPDImageExtraction.delete(extraction.id);
    }

    // Reset image data in Source entities
    const sources = await base44.entities.Source.filter({ project_id, source_type: 'gnpd' });
    for (const source of sources) {
      if (source.gnpd_data && Array.isArray(source.gnpd_data)) {
        const updatedGnpdData = source.gnpd_data.map(product => ({
          ...product,
          image_url: null,
          has_image: false
        }));
        await base44.entities.Source.update(source.id, { gnpd_data: updatedGnpdData });
      }
    }

    return Response.json({
      success: true,
      message: 'Image extraction process reset successfully',
      deleted_extractions: extractions.length,
      reset_sources: sources.length
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});