import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

const STOPWORDS = new Set(['the', 'and', 'in', 'of', 'with', 'for', 'a', 'to', 'on', 'as', 'trends', 'trend', 'innovation', 'market']);

function tokens(str) {
  return new Set(
    String(str || '').toLowerCase().split(/[^a-z0-9]+/).filter(t => t.length > 2 && !STOPWORDS.has(t))
  );
}

function overlap(a, b) {
  let n = 0;
  for (const t of a) if (b.has(t)) n++;
  return n;
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (user?.role !== 'admin') {
      return Response.json({ error: 'Forbidden: Admin access required' }, { status: 403 });
    }

    const [trends, candidates, projects] = await Promise.all([
      base44.asServiceRole.entities.GlobalTrend.filter({ is_active: true }, null, 500),
      base44.asServiceRole.entities.TrendCandidate.filter({}, null, 1000),
      base44.asServiceRole.entities.Project.filter({}, null, 500),
    ]);

    const projCat = {};
    projects.forEach(p => { projCat[p.id] = (p.category || '').toLowerCase(); });

    const trendData = trends.map(gt => ({
      id: gt.id,
      name: gt.trend_name,
      category: (gt.category || '').toLowerCase(),
      nameTokens: tokens(gt.trend_name),
      kwTokens: tokens((gt.trend_keywords || []).join(' ')),
    }));

    let mapped = 0, unmapped = 0, alreadyMapped = 0;
    const unmappedList = [];

    for (const tc of candidates) {
      if (tc.global_trend_id) { alreadyMapped++; continue; }

      const tcName = tokens(tc.trend_name);
      const tcKw = tokens([
        ...(tc.signals_dictionary?.keywords || []),
        ...(tc.whats_changing || []),
      ].join(' '));
      const tcCategory = projCat[tc.project_id] || '';

      let best = null, bestScore = 0;
      for (const gt of trendData) {
        const nameOverlap = overlap(gt.nameTokens, tcName);
        const kwOverlap = overlap(gt.kwTokens, new Set([...tcName, ...tcKw]));
        const catMatch = tcCategory && gt.category && tcCategory === gt.category;

        // Conservative confidence rule — flag rather than guess
        const confident =
          (nameOverlap >= 2 && catMatch) ||
          (nameOverlap >= 1 && kwOverlap >= 2 && catMatch) ||
          nameOverlap >= 3;
        if (!confident) continue;

        const score = nameOverlap * 3 + kwOverlap + (catMatch ? 2 : 0);
        if (score > bestScore) { bestScore = score; best = gt; }
      }

      if (best) {
        await base44.asServiceRole.entities.TrendCandidate.update(tc.id, {
          global_trend_id: best.id,
          migration_status: 'mapped',
        });
        mapped++;
      } else {
        await base44.asServiceRole.entities.TrendCandidate.update(tc.id, {
          migration_status: 'unmapped',
        });
        unmapped++;
        unmappedList.push({ id: tc.id, trend_name: tc.trend_name, project_id: tc.project_id });
      }
    }

    return Response.json({ mapped, unmapped, already_mapped: alreadyMapped, unmapped_for_review: unmappedList });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});