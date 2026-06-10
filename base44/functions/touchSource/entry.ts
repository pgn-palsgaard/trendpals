import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (user?.role !== 'admin') {
      return Response.json({ error: 'Forbidden' }, { status: 403 });
    }
    const { source_id } = await req.json();
    if (!source_id) return Response.json({ error: 'source_id required' }, { status: 400 });

    // Simulate the production pipeline: service-role SDK update flipping pipeline_stage
    await base44.asServiceRole.entities.Source.update(source_id, { pipeline_stage: 'extracting' });
    await new Promise(r => setTimeout(r, 1000));
    await base44.asServiceRole.entities.Source.update(source_id, { pipeline_stage: 'extracted' });

    return Response.json({ success: true, source_id });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});