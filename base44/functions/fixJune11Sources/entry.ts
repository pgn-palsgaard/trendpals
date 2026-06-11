import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (user?.role !== 'admin') {
      return Response.json({ error: 'Forbidden: Admin access required' }, { status: 403 });
    }

    const { mode = 'list', source_id, skip = 0 } = await req.json().catch(() => ({}));
    const svc = base44.asServiceRole;

    if (mode === 'inspect') {
      const s = await svc.entities.Source.get(source_id);
      return Response.json({
        title: s.title, subtitle: s.subtitle, author: s.author, publisher: s.publisher,
        notes: s.notes, tags: s.tags, file_url: s.file_url,
        extracted: s.metadata_extraction?.extracted_data || null,
        excerpt_quotes: (s.excerpts || []).slice(0, 3).map(e => e.source_quote),
      });
    }

    if (mode === 'read') {
      // Read content sample of a source to verify publisher
      const res = await base44.functions.invoke('readSourceContent', { source_id, max_chars: 4000 });
      return Response.json({ sample: (res.data?.content || '').slice(0, 4000) });
    }

    // list: all sources created on 2026-06-11
    const all = await svc.entities.Source.list('-created_date', 200);
    const june11 = all.filter(s => (s.created_date || '').toString().startsWith('2026-06-11'));
    return Response.json({
      count: june11.length,
      sources: june11.slice(skip).map(s => ({
        id: s.id,
        title: s.title,
        source_type: s.source_type,
        publisher: s.publisher,
        author: s.author,
        pipeline_stage: s.pipeline_stage,
        review_status: s.review_status,
        excerpts: (s.excerpts || []).length,
        verified: s.metadata_extraction?.verified,
        confidence: s.classification?.confidence,
        ai_summary_snippet: (s.ai_summary || '').slice(0, 200),
      })),
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});