import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

// READ-ONLY function. Persists nothing.

// DUPLICATED from lib/regions.js — keep in sync.
// Backend cannot import the frontend '@/lib/regions' path, so the commercial
// region resolver is inlined here (same pattern as MARKET_TO_REGION / EMULSIFIER_TERMS).
const CANONICAL_TO_COMMERCIAL = {
  aspac:              'aspac',
  north_america:      'americas',
  latam:              'americas',
  europe:             'emec',
  mena:               'imea',
  sub_saharan_africa: 'imea',
};
const COMMERCIAL_OVERRIDES = {
  'india':        'imea',
  'turkey':       'emec',
  'iran':         'emec',
  'uzbekistan':   'emec',
  'turkmenistan': 'emec',
  'kazakhstan':   'emec',
  'kyrgyzstan':   'emec',
  'tajikistan':   'emec',
  'afghanistan':  'emec',
  'azerbaijan':   'emec',
  'georgia':      'emec',
  'armenia':      'emec',
  'russia':       'aspac',
};
function getCommercialRegion(canonicalKey, country = null) {
  if (country) {
    const normalized = country.toLowerCase().trim();
    if (COMMERCIAL_OVERRIDES[normalized]) return COMMERCIAL_OVERRIDES[normalized];
  }
  return CANONICAL_TO_COMMERCIAL[canonicalKey] || null;
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const isAuth = await base44.auth.isAuthenticated();
    if (!isAuth) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { global_trend_id, region } = await req.json();
    if (!global_trend_id) return Response.json({ error: 'global_trend_id required' }, { status: 400 });
    const regionFilter = region && region !== 'all' ? region : null;

    // Fetch trend
    const trends = await base44.asServiceRole.entities.GlobalTrend.filter({ id: global_trend_id });
    const trend = trends?.[0];
    if (!trend) return Response.json({ error: 'GlobalTrend not found' }, { status: 404 });

    // Fetch all challenges for this trend (both approved and candidate)
    const allChallenges = await base44.asServiceRole.entities.IndustryChallenge.filter({ global_trend_id });

    const approvedChallenges = allChallenges.filter(c => c.is_active === true && c.review_status === 'approved');
    const candidateChallenges = allChallenges.filter(c => c.is_active === false);

    // Fetch approved recipes
    const allRecipes = await base44.asServiceRole.entities.Recipe.filter({ is_active: true, review_status: 'approved' });

    // Map challenge_id -> linked recipes
    const recipesForChallenge = {};
    for (const recipe of allRecipes) {
      for (const cid of (recipe.challenge_ids || [])) {
        if (!recipesForChallenge[cid]) recipesForChallenge[cid] = [];
        recipesForChallenge[cid].push(recipe);
      }
    }

    // Regional GNPD evidence — products linked to this trend, optionally region-scoped
    let gnpdProducts = await base44.asServiceRole.entities.GNPDProduct.filter({ linked_trend_ids: global_trend_id }, '-launch_date', 1000);
    if (regionFilter) {
      // regionFilter is a commercial key (aspac, americas, emec, imea).
      // Fold each product's canonical region (+ country override) to commercial.
      gnpdProducts = gnpdProducts.filter(p => getCommercialRegion(p.region, p.country) === regionFilter);
    }
    const regional_evidence = {
      region: regionFilter || 'all',
      total_products: gnpdProducts.length,
      products: gnpdProducts.slice(0, 30).map(p => ({
        id: p.id,
        product_name: p.product_name,
        brand: p.brand,
        country: p.country,
        region: p.region || 'unknown',
        launch_date: p.launch_date,
      })),
    };

    // Coverage context — distinguishes "no signal" from "not searched".
    // A region is "covered" for this trend's category if at least one Source's
    // coverage_regions includes it AND the source is relevant to the category.
    const COMMERCIAL_KEYS = ['aspac', 'americas', 'emec', 'imea'];
    const COMMERCIAL_LABELS = { aspac: 'ASPAC', americas: 'AMERICAS', emec: 'EMEC', imea: 'IMEA' };
    const coveredRegions = new Set();
    if (trend.category) {
      const sources = await base44.asServiceRole.entities.Source.filter(
        { source_type: { $in: ['gnpd', 'mintel', 'market_intel'] } }, '-created_date', 2000
      );
      for (const s of sources) {
        const cov = Array.isArray(s.coverage_regions) ? s.coverage_regions : [];
        if (!cov.length) continue;
        const relevant = s.category === trend.category ||
          (Array.isArray(s.category_relevance) && s.category_relevance.includes(trend.category));
        if (!relevant) continue;
        cov.forEach(r => { if (COMMERCIAL_KEYS.includes(r)) coveredRegions.add(r); });
      }
    }
    // Per-region signal counts (commercial fold) over the full trend-linked set
    const signalCounts = {};
    for (const p of (await base44.asServiceRole.entities.GNPDProduct.filter({ linked_trend_ids: global_trend_id }, '-launch_date', 1000))) {
      const ck = getCommercialRegion(p.region, p.country);
      if (ck) signalCounts[ck] = (signalCounts[ck] || 0) + 1;
    }
    const scopeKeys = regionFilter ? [regionFilter] : COMMERCIAL_KEYS;
    const coverage_assessment = {
      scope: regionFilter || 'all',
      regions: scopeKeys.map(key => {
        const covered = coveredRegions.has(key);
        const signal = signalCounts[key] || 0;
        let status, label;
        if (!covered) { status = 'not_searched'; label = 'Not searched — no source coverage for this category'; }
        else if (signal === 0) { status = 'no_signal'; label = 'Searched, no signal found'; }
        else { status = 'signal'; label = `${signal} product${signal === 1 ? '' : 's'} found`; }
        return { key, region_label: COMMERCIAL_LABELS[key], covered, signal_count: signal, status, label };
      }),
    };

    // Section 1: Trend header
    const section1_header = {
      trend_name: trend.trend_name,
      driver: trend.mega_trend || trend.driver_key || null,
      driver_key: trend.driver_key || null,
      confidence: trend.confidence,
      category: trend.category,
      capability_area: trend.capability_area,
      is_active: trend.is_active,
    };

    // Section 2: Why it may matter
    const section2_why_it_matters = {
      market_signal: trend.market_signal || null,
      whats_changing: trend.whats_changing || [],
      why_now: trend.why_now || null,
      regional_manifestations: trend.regional_manifestations || [],
      gnpd_examples: (trend.sources || [])
        .filter(s => s.source_type === 'gnpd')
        .map(s => ({ title: s.title, key_finding: s.key_finding, date: s.date })),
    };

    // Section 3: Approved challenges with recipe context
    const section3_approved_challenges = approvedChallenges.map(c => ({
      id: c.id,
      name: c.name,
      description: c.description,
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

    // Section 4: Solvability & recipe match — per approved challenge
    const section4_solvability = approvedChallenges.map(c => {
      const linked = recipesForChallenge[c.id] || [];
      return {
        challenge_id: c.id,
        challenge_name: c.name,
        capability_fit: c.capability_fit || 'unknown',
        recipes: linked.map(r => ({
          id: r.id,
          name: r.name,
          recipe_match_status: r.recipe_match_status,
        })),
        has_existing_recipe: linked.some(r => r.recipe_match_status === 'existing'),
        has_concept_needed: linked.some(r => r.recipe_match_status === 'concept_needed'),
        recipe_count: linked.length,
      };
    });

    // Section 5: White space — approved challenges with strong/possible fit AND no existing recipe
    const section5_white_space = approvedChallenges
      .filter(c => {
        const fitOk = c.capability_fit === 'strong' || c.capability_fit === 'possible';
        if (!fitOk) return false;
        const linked = recipesForChallenge[c.id] || [];
        const hasExisting = linked.some(r => r.recipe_match_status === 'existing');
        return !hasExisting;
      })
      .map(c => {
        const linked = recipesForChallenge[c.id] || [];
        return {
          challenge_id: c.id,
          challenge_name: c.name,
          description: c.description,
          capability_fit: c.capability_fit,
          capability_area: c.capability_area,
          capability_hypothesis: c.capability_hypothesis || null,
          validation_status: c.validation_status || 'unvalidated',
          linked_recipe_count: linked.length,
          linked_recipes: linked.map(r => ({ id: r.id, name: r.name, recipe_match_status: r.recipe_match_status })),
          priority_reason: linked.length === 0
            ? 'No recipe linked — pure white space'
            : 'No existing recipe — concept development needed',
        };
      });

    // Section 6: Candidates awaiting approval (is_active=false)
    const section6_candidates = candidateChallenges.map(c => ({
      id: c.id,
      name: c.name,
      description: c.description,
      capability_observation: c.capability_observation || null,
      capability_hypothesis: c.capability_hypothesis || null,
      capability_area: c.capability_area,
      capability_fit: c.capability_fit || 'unknown',
      review_status: c.review_status,
      defaulted_conservatively: c.defaulted_conservatively || false,
      decision_pending: c.decision_pending || false,
    }));

    // Summary flags
    const has_approved_challenges = approvedChallenges.length > 0;
    const white_space_count = section5_white_space.length;
    const candidate_count = candidateChallenges.length;

    return Response.json({
      ok: true,
      global_trend_id,
      region: regionFilter || 'all',
      generated_at: new Date().toISOString(),
      regional_evidence,
      coverage_assessment,
      summary: {
        has_approved_challenges,
        approved_challenge_count: approvedChallenges.length,
        white_space_count,
        candidate_count,
      },
      section1_header,
      section2_why_it_matters,
      section3_approved_challenges,
      section4_solvability,
      section5_white_space,
      section6_candidates,
    });

  } catch (error) {
    console.error('[generateTrendReport] Fatal:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});