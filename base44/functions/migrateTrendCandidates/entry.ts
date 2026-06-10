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

    const [trends, inactiveTrends, candidates, projects] = await Promise.all([
      base44.asServiceRole.entities.GlobalTrend.filter({ is_active: true }, null, 500),
      base44.asServiceRole.entities.GlobalTrend.filter({ is_active: false }, null, 500),
      base44.asServiceRole.entities.TrendCandidate.filter({}, null, 1000),
      base44.asServiceRole.entities.Project.filter({}, null, 500),
    ]);

    const projCat = {};
    const projCatRaw = {};
    projects.forEach(p => {
      projCat[p.id] = (p.category || '').toLowerCase();
      projCatRaw[p.id] = p.category || '';
    });

    const GT_CATEGORIES = ['Ice Cream', 'Dairy', 'Confectionery', 'Bakery', 'Spreads', 'Dressings'];
    const pendingByName = {};
    inactiveTrends.forEach(gt => { pendingByName[gt.trend_name.toLowerCase().trim()] = gt.id; });

    const trendData = trends.map(gt => ({
      id: gt.id,
      name: gt.trend_name,
      category: (gt.category || '').toLowerCase(),
      nameTokens: tokens(gt.trend_name),
      kwTokens: tokens((gt.trend_keywords || []).join(' ')),
    }));

    let mapped = 0, unmapped = 0, alreadyMapped = 0, proposalsCreated = 0;
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
        // Never silently drop: create (or reuse) a pending GlobalTrend proposal for review
        const nameKey = (tc.trend_name || '').toLowerCase().trim();
        let proposalId = pendingByName[nameKey];
        if (!proposalId) {
          const rawCat = projCatRaw[tc.project_id] || '';
          const proposal = await base44.asServiceRole.entities.GlobalTrend.create({
            trend_name: tc.trend_name,
            category: GT_CATEGORIES.includes(rawCat) ? rawCat : 'Other',
            mega_trend: 'Experiences',
            driver_key: 'experiences',
            is_active: false,
            confidence: tc.confidence || 'medium',
            market_signal: tc.market_signal || '',
            whats_changing: tc.whats_changing || [],
            trend_keywords: tc.signals_dictionary?.keywords || [],
            why_now: 'Proposed automatically from project trend migration — no matching Trend Library trend found. Pending review and enrichment before activation.',
            sources: [],
          });
          proposalId = proposal.id;
          pendingByName[nameKey] = proposalId;
          proposalsCreated++;
        }
        await base44.asServiceRole.entities.TrendCandidate.update(tc.id, {
          global_trend_id: proposalId,
          migration_status: 'unmapped',
        });
        unmapped++;
        unmappedList.push({ id: tc.id, trend_name: tc.trend_name, project_id: tc.project_id, proposal_trend_id: proposalId });
      }
    }

    return Response.json({ mapped, unmapped, proposals_created: proposalsCreated, already_mapped: alreadyMapped, unmapped_for_review: unmappedList });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});