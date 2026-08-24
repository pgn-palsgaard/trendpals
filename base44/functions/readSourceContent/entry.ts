import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';
import { readSourceText } from '../../shared/extractText.ts';

Deno.serve(async (req) => {
  let base44 = null;
  let sourceId = null;
  try {
    base44 = createClientFromRequest(req);

    // Callers are either a logged-in user (manual re-trigger from the UI) or the
    // source_processor agent / an automation, which carry no user session. The
    // hard 401 broke every automated run: the agent's only way to read a file is
    // this function, so an unauthenticated context must be allowed through — the
    // work below is service-role and read-only on one named source.


    const { source_id } = await req.json();
    if (!source_id) {
      return Response.json({ ok: false, error: 'source_id is required' }, { status: 400 });
    }
    sourceId = source_id;

    const sources = await base44.asServiceRole.entities.Source.filter({ id: source_id });
    const source = sources?.[0];
    if (!source) {
      return Response.json({ ok: false, error: 'Source not found' });
    }

    const result = await readSourceText(base44.asServiceRole, source);
    if (!result.ok) return Response.json({ ok: false, error: result.error });

    return Response.json({
      ok: true,
      content: result.content,
      mime_type: result.mime_type,
      char_count: result.char_count,
    });

  } catch (error) {
    if (base44 && sourceId) {
      try {
        await base44.asServiceRole.entities.Source.update(sourceId, { failure_reason: error.message });
      } catch (_) { /* best effort */ }
    }
    return Response.json({ ok: false, error: error.message });
  }
});