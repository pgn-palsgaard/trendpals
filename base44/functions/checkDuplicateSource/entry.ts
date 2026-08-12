import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

// Strip extension, "(1)"/"(2)" copy suffixes, lowercase, collapse whitespace
export function normalizeTitle(t) {
  return (t || '')
    .toLowerCase()
    .replace(/\.(pdf|docx?|pptx?|xlsx?|csv|html?|txt|md)$/i, '')
    .replace(/\s*\(\d+\)\s*$/g, '')
    .replace(/[_\-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Duplicate detection at upload.
 * Input: { file_hash?, title? }
 * Matches: (a) identical file_hash, (b) title match on a small set of candidates.
 *
 * IMPORTANT: this must stay cheap. A previous version paginated through up to 5000
 * FULL Source records (excerpts + mintel_chunks are inline), which blew the worker's
 * memory limit and made every upload fail. We now only run targeted, indexed lookups.
 */
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    if (!(await base44.auth.isAuthenticated())) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { file_hash, title } = await req.json();
    const matches = new Map();

    const slim = (s) => ({
      id: s.id,
      title: s.title,
      source_type: s.source_type,
      pipeline_stage: s.pipeline_stage,
      review_status: s.review_status,
      created_date: s.created_date,
    });

    if (file_hash) {
      const byHash = await base44.asServiceRole.entities.Source.filter({ file_hash }, '-created_date', 5);
      for (const s of byHash) matches.set(s.id, { source: slim(s), match_type: 'file_hash' });
    }

    if (title) {
      const norm = normalizeTitle(title);
      // Targeted candidate titles instead of scanning the whole table.
      const candidates = new Set([title, title.trim(), norm]);
      const noExt = title.replace(/\.[a-z0-9]+$/i, '');
      if (noExt !== title) candidates.add(noExt);

      for (const candidate of candidates) {
        if (!candidate) continue;
        const found = await base44.asServiceRole.entities.Source.filter({ title: candidate }, '-created_date', 5);
        for (const s of found) {
          if (matches.has(s.id)) continue;
          matches.set(s.id, { source: slim(s), match_type: 'title' });
        }
      }
    }

    const duplicates = [...matches.values()].map(({ source, match_type }) => ({ ...source, match_type }));

    return Response.json({ duplicates });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});