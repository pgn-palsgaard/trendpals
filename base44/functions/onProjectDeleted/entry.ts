import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

// Entity automation handler — fires when a Project is deleted.
// Resets the originating brief (ReportRequest) so it is no longer shown as linked.
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json();
    const event = body?.event || {};
    const projectId = event.entity_id;
    if (!projectId) {
      return Response.json({ error: 'No project id in event payload' }, { status: 400 });
    }

    // Find any briefs still pointing at the deleted project and unlink them.
    const briefs = await base44.asServiceRole.entities.ReportRequest.filter({ project_id: projectId });
    const updated = [];
    for (const brief of briefs) {
      await base44.asServiceRole.entities.ReportRequest.update(brief.id, {
        project_id: null,
        status: 'unlinked',
      });
      updated.push(brief.id);
    }

    return Response.json({ project_id: projectId, briefs_unlinked: updated.length, brief_ids: updated });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});