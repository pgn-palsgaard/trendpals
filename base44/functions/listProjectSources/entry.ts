import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

/**
 * listProjectSources
 * 
 * Lists all sources associated with a project (both selected sources and project-linked ones).
 * Used by the AI agent to discover what sources are available before reading their content.
 */
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

    const project = await base44.entities.Project.get(project_id);
    if (!project) {
      return Response.json({ error: 'Project not found' }, { status: 404 });
    }

    let sources = [];

    // Primary: fetch via selected_source_ids
    if (project.selected_source_ids && project.selected_source_ids.length > 0) {
      for (const sourceId of project.selected_source_ids) {
        try {
          const source = await base44.entities.Source.get(sourceId);
          if (source) sources.push(source);
        } catch (e) {
          console.warn(`Source ${sourceId} not found`);
        }
      }
    }

    // Fallback: legacy direct project_id linkage
    if (sources.length === 0) {
      sources = await base44.entities.Source.filter({ project_id });
    }

    // Also get org-shared knowledge sources
    const knowledgeSources = await base44.entities.Source.filter({
      source_type: 'knowledge',
      visibility: 'org_shared'
    });

    // Get project-specific knowledge links
    const knowledgeLinks = await base44.entities.ProjectKnowledgeLink.filter({ project_id });
    const orgSharedIds = new Set(knowledgeSources.map(s => s.id));
    for (const link of knowledgeLinks) {
      if (!orgSharedIds.has(link.source_id)) {
        try {
          const ks = await base44.entities.Source.get(link.source_id);
          if (ks) knowledgeSources.push(ks);
        } catch (e) {}
      }
    }

    const summarize = (s) => ({
      id: s.id,
      title: s.title,
      source_type: s.source_type,
      knowledge_subtype: s.knowledge_subtype,
      publisher: s.publisher,
      date_published: s.date_published || s.date,
      coverage_period: s.coverage_period,
      category: s.category,
      region_code: s.region_code,
      status: s.status,
      has_file: !!s.file_url,
      excerpts_count: s.excerpts?.length || 0,
      gnpd_row_count: s.gnpd_row_count || 0,
      ai_summary: s.ai_summary,
      notes: s.notes,
      tags: s.tags
    });

    return Response.json({
      project_id,
      project_name: project.name,
      project_category: project.category,
      project_region: project.region_code || project.region,
      evidence_sources: sources.map(summarize),
      knowledge_sources: knowledgeSources.map(summarize),
      total_evidence_sources: sources.length,
      total_knowledge_sources: knowledgeSources.length
    });

  } catch (error) {
    console.error('listProjectSources error:', error);
    return Response.json({
      error: error.message || 'Failed to list sources',
      details: error.stack
    }, { status: 500 });
  }
});