import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

// READ-ONLY function. Persists nothing.
// Aggregates a CommunicationTheme into a report: theme header + a per-trend
// report (same shape as generateTrendReport) for every APPROVED linked trend.

// DUPLICATED from lib/regions.js — keep in sync (backend cannot import frontend path).
const CANONICAL_TO_COMMERCIAL = {
  aspac: 'aspac', north_america: 'americas', latam: 'americas',
  europe: 'emec', mena: 'imea', sub_saharan_africa: 'imea',
};
const COMMERCIAL_OVERRIDES = {
  'india': 'imea', 'turkey': 'emec', 'iran': 'emec', 'uzbekistan': 'emec',
  'turkmenistan': 'emec', 'kazakhstan': 'emec', 'kyrgyzstan': 'emec',
  'tajikistan': 'emec', 'afghanistan': 'emec', 'azerbaijan': 'emec',
  'georgia': 'emec', 'armenia': 'emec', 'russia': 'aspac',
};
function getCommercialRegion(canonicalKey, country = null) {
  if (country) {
    const normalized = country.toLowerCase().trim();
    if (COMMERCIAL_OVERRIDES[normalized]) return COMMERCIAL_OVERRIDES[normalized];
  }
  return CANONICAL_TO_COMMERCIAL[canonicalKey] || null;
}

// Build a single trend's report sections (mirrors generateTrendReport).
async function buildTrendReport(base44, trend, regionFilter) {
  const global_trend_id = trend.id;

  const allChallenges = await base44.asServiceRole.entities.IndustryChallenge.filter({ global_trend_id });
  const approvedChallenges = allChallenges.filter(c => c.is_active === true && c.review_status === 'approved');
  const candidateChallenges = allChallenges.filter(c => c.is_active === false);

  const allRecipes = await base44.asServiceRole.entities.Recipe.filter({ is_active: true, review_status: 'approved' });
  const recipesForChallenge = {};
  for (const recipe of allRecipes) {
    for (const cid of (recipe.challenge_ids || [])) {
      if (!recipesForChallenge[cid]) recipesForChallenge[cid] = [];
      recipesForChallenge[cid].push(recipe);
    }
  }

  let gnpdProducts = await base44.asServiceRole.entities.GNPDProduct.filter({ linked_trend_ids: global_trend_id }, '-launch_date', 1000);
  if (regionFilter) {
    gnpdProducts = gnpdProducts.filter(p => getCommercialRegion(p.region, p.country) === regionFilter);
  }
  const regional_evidence = {
    region: regionFilter || 'all',
    total_products: gnpdProducts.length,
    products: gnpdProducts.slice(0, 30).map(p => ({
      id: p.id, product_name: p.product_name, brand: p.brand,
      country: p.country, region: p.region || 'unknown', launch_date: p.launch_date,
    })),
  };

  const section1_header = {
    trend_name: trend.trend_name,
    driver: trend.mega_trend || trend.driver_key || null,
    driver_key: trend.driver_key || null,
    confidence: trend.confidence,
    category: trend.category,
    capability_area: trend.capability_area,
    is_active: trend.is_active,
  };
  const section2_why_it_matters = {
    market_signal: trend.market_signal || null,
    whats_changing: trend.whats_changing || [],
    why_now: trend.why_now || null,
    regional_manifestations: trend.regional_manifestations || [],
    gnpd_examples: (trend.sources || [])
      .filter(s => s.source_type === 'gnpd')
      .map(s => ({ title: s.title, key_finding: s.key_finding, date: s.date })),
  };
  const section3_approved_challenges = approvedChallenges.map(c => ({
    id: c.id, name: c.name, description: c.description,
    capability_observation: c.capability_observation || null,
    capability_hypothesis: c.capability_hypothesis || null,
    capability_hypothesis_note: 'UNCONFIRMED HYPOTHESIS — awaiting field validation',
    capability_area: c.capability_area,
    capability_fit: c.capability_fit || 'unknown',
    validation_status: c.validation_status || 'unvalidated',
    validated_by: c.validated_by || null,
    validated_date: c.validated_date || null,
    defaulted_conservatively: c.defaulted_conservatively || false,
    region_code: c.region_code || null,
  }));
  const section4_solvability = approvedChallenges.map(c => {
    const linked = recipesForChallenge[c.id] || [];
    return {
      challenge_id: c.id, challenge_name: c.name,
      capability_fit: c.capability_fit || 'unknown',
      recipes: linked.map(r => ({ id: r.id, name: r.name, recipe_match_status: r.recipe_match_status })),
      has_existing_recipe: linked.some(r => r.recipe_match_status === 'existing'),
      has_concept_needed: linked.some(r => r.recipe_match_status === 'concept_needed'),
      recipe_count: linked.length,
    };
  });
  const section5_white_space = approvedChallenges
    .filter(c => {
      const fitOk = c.capability_fit === 'strong' || c.capability_fit === 'possible';
      if (!fitOk) return false;
      const linked = recipesForChallenge[c.id] || [];
      return !linked.some(r => r.recipe_match_status === 'existing');
    })
    .map(c => {
      const linked = recipesForChallenge[c.id] || [];
      return {
        challenge_id: c.id, challenge_name: c.name, description: c.description,
        capability_fit: c.capability_fit, capability_area: c.capability_area,
        capability_hypothesis: c.capability_hypothesis || null,
        validation_status: c.validation_status || 'unvalidated',
        linked_recipe_count: linked.length,
        linked_recipes: linked.map(r => ({ id: r.id, name: r.name, recipe_match_status: r.recipe_match_status })),
        priority_reason: linked.length === 0 ? 'No recipe linked — pure white space' : 'No existing recipe — concept development needed',
      };
    });
  const section6_candidates = candidateChallenges.map(c => ({
    id: c.id, name: c.name, description: c.description,
    capability_observation: c.capability_observation || null,
    capability_hypothesis: c.capability_hypothesis || null,
    capability_area: c.capability_area,
    capability_fit: c.capability_fit || 'unknown',
    review_status: c.review_status,
    defaulted_conservatively: c.defaulted_conservatively || false,
    decision_pending: c.decision_pending || false,
  }));

  return {
    global_trend_id,
    region: regionFilter || 'all',
    is_primary: !!trend._is_primary,
    regional_evidence,
    summary: {
      has_approved_challenges: approvedChallenges.length > 0,
      approved_challenge_count: approvedChallenges.length,
      white_space_count: section5_white_space.length,
      candidate_count: candidateChallenges.length,
    },
    section1_header,
    section2_why_it_matters,
    section3_approved_challenges,
    section4_solvability,
    section5_white_space,
    section6_candidates,
  };
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const isAuth = await base44.auth.isAuthenticated();
    if (!isAuth) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { theme_id, region } = await req.json();
    if (!theme_id) return Response.json({ error: 'theme_id required' }, { status: 400 });
    const regionFilter = region && region !== 'all' ? region : null;

    const themes = await base44.asServiceRole.entities.CommunicationTheme.filter({ id: theme_id });
    const theme = themes?.[0];
    if (!theme) return Response.json({ error: 'CommunicationTheme not found' }, { status: 404 });

    // Approved links only — a theme report shows curated trends.
    const links = await base44.asServiceRole.entities.ThemeLink.filter({ theme_id, link_status: 'approved' });
    const trendIds = [...new Set(links.map(l => l.global_trend_id).filter(Boolean))];
    const primarySet = new Set(links.filter(l => l.is_primary).map(l => l.global_trend_id));

    // Fetch trends
    const trends = [];
    for (const id of trendIds) {
      const found = await base44.asServiceRole.entities.GlobalTrend.filter({ id });
      if (found?.[0]) trends.push({ ...found[0], _is_primary: primarySet.has(id) });
    }
    // Primary trends first, then by name
    trends.sort((a, b) => (b._is_primary === a._is_primary ? (a.trend_name || '').localeCompare(b.trend_name || '') : (b._is_primary ? 1 : -1)));

    const trendReports = [];
    for (const trend of trends) {
      trendReports.push(await buildTrendReport(base44, trend, regionFilter));
    }

    // Theme-level rollup
    const total_approved_challenges = trendReports.reduce((acc, r) => acc + r.summary.approved_challenge_count, 0);
    const total_white_space = trendReports.reduce((acc, r) => acc + r.summary.white_space_count, 0);

    return Response.json({
      ok: true,
      theme_id,
      region: regionFilter || 'all',
      generated_at: new Date().toISOString(),
      theme_header: {
        name: theme.name,
        tagline: theme.tagline || null,
        description: theme.description || null,
        sub_points: theme.sub_points || [],
        color_key: theme.color_key || 'blue',
        year: theme.year,
      },
      summary: {
        trend_count: trends.length,
        primary_count: primarySet.size,
        total_approved_challenges,
        total_white_space,
      },
      trend_reports: trendReports,
    });
  } catch (error) {
    console.error('[generateThemeReport] Fatal:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});