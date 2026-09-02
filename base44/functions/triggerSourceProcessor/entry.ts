import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);

    // Support both direct call and entity automation payload
    const body = await req.json();
    let source_id = body.source_id;
    let triggered_by = body.triggered_by || 'manual_button';

    // Entity automation payload shape: { event, data }
    if (!source_id && body.data?.id) {
      source_id = body.data.id;
      triggered_by = 'auto_upload';
    }

    // Try to get the calling user (may be null in automation context)
    let userEmail = body.triggered_by_user || null;
    try {
      const user = await base44.auth.me();
      if (user?.email) userEmail = user.email;
    } catch (_) {
      // no user session in automation context — that's fine
    }

    if (!source_id) {
      return Response.json({ error: 'source_id is required' }, { status: 400 });
    }

    // Fetch the source record
    const sources = await base44.asServiceRole.entities.Source.filter({ id: source_id });
    const source = sources[0];
    if (!source) {
      return Response.json({ error: 'Source not found' }, { status: 404 });
    }

    // Create ProcessingRun record
    const now = new Date().toISOString();
    const run = await base44.asServiceRole.entities.ProcessingRun.create({
      source_id: source.id,
      source_title: source.title || '',
      source_publisher: source.publisher || '',
      source_type_snapshot: source.source_type || '',
      triggered_by,
      triggered_by_user: userEmail,
      status: 'queued',
      started_at: now,
      excerpts_extracted: 0,
      high_confidence_links: 0,
      medium_confidence_links: 0,
      low_confidence_rejects: 0,
      new_trend_proposals: 0,
      actions: [],
      errors: [],
    });

    // Update run to running
    await base44.asServiceRole.entities.ProcessingRun.update(run.id, {
      status: 'running',
    });

    const startTime = Date.now();

    // Invoke the source_processor agent
    const conversationResp = await base44.asServiceRole.agents.createConversation({
      agent_name: 'source_processor',
      metadata: { name: `Auto-run: ${source.title}`, processing_run_id: run.id },
    });

    const conversation = conversationResp;

    await base44.asServiceRole.agents.addMessage(conversation, {
      role: 'user',
      content: `Process source_id=${source.id} (title: "${source.title || 'untitled'}"). This is an automated run with processing_run_id=${run.id}. Follow the full processing workflow: skip-rules → read → summarize → extract excerpts → match GlobalTrends with confidence scoring → propose new trends if needed → finalize source. Write a confidence_reasoning for each trend link and log all actions back to the ProcessingRun.`,
    });

    // The agent processes asynchronously. It owns completion: step 6 of its
    // instructions writes status 'completed' with the real counts when it finishes.
    // This function only confirms the run is in flight.
    await base44.asServiceRole.entities.ProcessingRun.update(run.id, {
      status: 'running',
    });

    return Response.json({
      ok: true,
      run_id: run.id,
      source_id: source.id,
      source_title: source.title,
      triggered_by,
    });

  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});