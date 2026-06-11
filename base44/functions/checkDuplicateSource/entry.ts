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
 * Matches: (a) identical file_hash, (b) normalized title match.
 * Returns { duplicates: [{id, title, pipeline_stage, review_status, source_type, created_date, match_type}] }
 */
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    if (!(await base44.auth.isAuthenticated())) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { file_hash, title } = await req.json();
    const matches = new Map();

    if (file_hash) {
      const byHash = await base44.asServiceRole.entities.Source.filter({ file_hash }, '-created_date', 10);
      for (const s of byHash) matches.set(s.id, { source: s, match_type: 'file_hash' });
    }

    if (title) {
      const normTarget = normalizeTitle(title);
      if (normTarget) {
        // Paginate through titles to compare normalized forms
        const PAGE = 500;
        let skip = 0;
        while (skip < 5000) {
          const page = await base44.asServiceRole.entities.Source.list('-created_date', PAGE, skip);
          if (!page.length) break;
          for (const s of page) {
            if (matches.has(s.id)) continue;
            if (normalizeTitle(s.title) === normTarget || normalizeTitle(s.relative_path) === normTarget) {
              matches.set(s.id, { source: s, match_type: 'title' });
            }
          }
          if (page.length < PAGE) break;
          skip += PAGE;
        }
      }
    }

    const duplicates = [...matches.values()].map(({ source: s, match_type }) => ({
      id: s.id,
      title: s.title,
      source_type: s.source_type,
      pipeline_stage: s.pipeline_stage,
      review_status: s.review_status,
      created_date: s.created_date,
      match_type,
    }));

    return Response.json({ duplicates });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});