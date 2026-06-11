import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

function normalizeTitle(t) {
  return (t || '')
    .toLowerCase()
    .replace(/\.(pdf|docx?|pptx?|xlsx?|csv|html?|txt|md)$/i, '')
    .replace(/\s*\(\d+\)\s*$/g, '')
    .replace(/[_\-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * One-time dedup report on existing Sources.
 * Groups by file_hash and normalized title. FLAGS only (tag 'duplicate_suspect') — never deletes.
 * Admin only. Pass { apply_tags: true } to tag the suspects; default is report-only.
 */
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (user?.role !== 'admin') {
      return Response.json({ error: 'Forbidden: Admin access required' }, { status: 403 });
    }

    const { apply_tags = false } = await req.json().catch(() => ({}));

    // Load all sources (paginated)
    const all = [];
    const PAGE = 500;
    let skip = 0;
    while (true) {
      const page = await base44.asServiceRole.entities.Source.list('-created_date', PAGE, skip);
      all.push(...page);
      if (page.length < PAGE) break;
      skip += PAGE;
    }

    const byHash = new Map();
    const byTitle = new Map();
    for (const s of all) {
      if (s.file_hash) {
        if (!byHash.has(s.file_hash)) byHash.set(s.file_hash, []);
        byHash.get(s.file_hash).push(s);
      }
      const nt = normalizeTitle(s.title);
      if (nt) {
        if (!byTitle.has(nt)) byTitle.set(nt, []);
        byTitle.get(nt).push(s);
      }
    }

    const groups = [];
    const flaggedIds = new Set();
    const addGroup = (key, type, members) => {
      if (members.length < 2) return;
      groups.push({
        match_type: type,
        key,
        members: members.map(s => ({
          id: s.id,
          title: s.title,
          source_type: s.source_type,
          pipeline_stage: s.pipeline_stage,
          review_status: s.review_status,
          excerpts: (s.excerpts || []).length,
          created_date: s.created_date,
        })),
      });
      // Flag all but the oldest (keep the original unflagged)
      const sorted = [...members].sort((a, b) => new Date(a.created_date) - new Date(b.created_date));
      sorted.slice(1).forEach(s => flaggedIds.add(s.id));
    };

    for (const [h, members] of byHash) addGroup(h, 'file_hash', members);
    for (const [t, members] of byTitle) {
      // Skip groups already fully covered by a hash group
      addGroup(t, 'title', members);
    }

    let tagged = 0;
    if (apply_tags) {
      for (const id of flaggedIds) {
        const s = all.find(x => x.id === id);
        if (s && !(s.tags || []).includes('duplicate_suspect')) {
          await base44.asServiceRole.entities.Source.update(id, {
            tags: [...(s.tags || []), 'duplicate_suspect'],
          });
          tagged++;
        }
      }
    }

    return Response.json({
      total_sources: all.length,
      duplicate_groups: groups.length,
      suspects: flaggedIds.size,
      tagged,
      groups,
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});