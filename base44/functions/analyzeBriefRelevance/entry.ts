import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

// Inlined brief category normalization (no shared imports allowed in functions)
const BRIEF_CATEGORY_NORMALIZATION = {
  'confectionery': 'chocolate_confectionery',
  'chocolate': 'chocolate_confectionery',
  'chocolate confectionery': 'chocolate_confectionery',
  'chocolate & confectionery': 'chocolate_confectionery',
  'bakery': 'bakery',
  'cake': 'bakery',
  'cake gels': 'bakery',
  'baking': 'bakery',
  'dairy': 'dairy',
  'ice cream': 'ice_cream',
  'ice-cream': 'ice_cream',
  'meat': 'meat',
  'processed meat': 'meat',
  'oils': 'oils_fats',
  'oils & fats': 'oils_fats',
  'fats': 'oils_fats',
  'plant based': 'plant_based',
  'plant-based': 'plant_based',
  'plant based products': 'plant_based',
  'rutf': 'rutf_rusf',
  'rusf': 'rutf_rusf',
  'rutf and rusf': 'rutf_rusf',
  'condiments': 'condiments',
  'savoury spreads': 'condiments',
  'dips': 'condiments',
  'spreads': 'condiments',
};

function normalizeBriefCategory(raw) {
  if (!raw) return 'needs_human_review';
  const normalized = BRIEF_CATEGORY_NORMALIZATION[raw.trim().toLowerCase()];
  return normalized || 'needs_human_review';
}

// Tokenize free text into a lowercase word set for keyword overlap scoring
function tokenize(text) {
  if (!text) return [];
  return String(text)
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length > 3);
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { category, objective, purpose, topics } = await req.json();

    const canonicalCategory = normalizeBriefCategory(category);

    // Pull active trends — prefer category match, fall back to all active if category unresolved
    let trends = [];
    if (canonicalCategory && canonicalCategory !== 'needs_human_review') {
      trends = await base44.entities.GlobalTrend.filter({ category: canonicalCategory, is_active: true });
    }
    if (trends.length === 0) {
      trends = await base44.entities.GlobalTrend.filter({ is_active: true });
    }

    if (trends.length === 0) {
      return Response.json({ success: true, trends: [], category: canonicalCategory });
    }

    // Build a keyword bag from the brief's objective/purpose/topics for relevance scoring
    const briefTokens = new Set([
      ...tokenize(objective),
      ...tokenize(purpose),
      ...tokenize(topics),
    ]);

    const scored = trends.map(t => {
      let score = 0;
      const reasons = [];

      // Category match is the strongest signal
      if (t.category === canonicalCategory) {
        score += 5;
      }

      // Keyword overlap between brief and trend keywords / signal / name
      const trendTokens = new Set([
        ...tokenize(t.trend_name),
        ...tokenize(t.market_signal),
        ...(Array.isArray(t.trend_keywords) ? t.trend_keywords.flatMap(tokenize) : []),
      ]);
      const overlap = [...briefTokens].filter(tok => trendTokens.has(tok));
      score += overlap.length * 2;
      if (overlap.length > 0) reasons.push(`Matches your focus on ${overlap.slice(0, 3).join(', ')}`);

      // Confidence as a light tiebreaker
      if (t.confidence === 'high') score += 1;

      return {
        id: t.id,
        trend_name: t.trend_name,
        category: t.category,
        market_signal: t.market_signal || t.description || '',
        confidence: t.confidence || null,
        score,
        reason: reasons[0] || (t.category === canonicalCategory ? 'Core trend for this category' : 'Related market trend'),
      };
    });

    // Rank, then take top 6
    scored.sort((a, b) => b.score - a.score);
    const top = scored.slice(0, 6);

    // Pre-select the top 2 as sensible defaults
    const result = top.map((t, idx) => ({ ...t, preselected: idx < 2 }));

    return Response.json({ success: true, trends: result, category: canonicalCategory });
  } catch (error) {
    return Response.json({ error: error.message || 'Failed to analyze brief relevance' }, { status: 500 });
  }
});