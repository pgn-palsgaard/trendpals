import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

const VALID_CATEGORIES = ['bakery','condiments','chocolate_confectionery','dairy','ice_cream','meat','oils_fats','plant_based','rutf_rusf','needs_human_review'];
const VALID_CAP_AREAS = ['sustainability','texture_quality','cost_efficiency','compliance_regulatory','new_product_development','food_safety','supply_chain','plant_based','general'];
const VALID_CAP_FIT = ['strong','possible','none','unknown'];

// Enforce: capability_hypothesis must not use "Palsgaard" as grammatical subject
function validateHypothesis(text) {
  if (!text) return text;
  // Patterns like "Palsgaard's", "Palsgaard can", "Palsgaard offers" etc.
  const forbidden = /\bPalsgaard(?:'s|'s)?\s+(can|offers|enables|has|provides|delivers|supports|brings|is|are|would|will|could|should)\b/i;
  return !forbidden.test(text);
}

async function callClaude(apiKey, prompt) {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({
      model: 'claude-sonnet-4-5',
      max_tokens: 2000,
      messages: [{ role: 'user', content: prompt }]
    })
  });
  const data = await res.json();
  return data.content?.[0]?.text || '';
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const isAuth = await base44.auth.isAuthenticated();
    if (!isAuth) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { global_trend_id } = await req.json();
    if (!global_trend_id) return Response.json({ error: 'global_trend_id required' }, { status: 400 });

    const trends = await base44.asServiceRole.entities.GlobalTrend.filter({ id: global_trend_id });
    const trend = trends?.[0];
    if (!trend) return Response.json({ error: 'GlobalTrend not found' }, { status: 404 });

    const apiKey = Deno.env.get('ANTHROPIC_API_KEY');
    if (!apiKey) return Response.json({ error: 'ANTHROPIC_API_KEY not set' }, { status: 500 });

    // Gather evidence context
    const whatsChanging = (trend.whats_changing || []).join('\n- ');
    const regionalManifestations = (trend.regional_manifestations || [])
      .map(r => `${r.region}: ${r.signal || ''}`)
      .join('\n');

    const prompt = `You are a food science and application specialist working for an emulsifier/stabiliser company. Your job is to identify concrete formulation and application challenges that food manufacturers face, derived from a market trend.

TREND DATA:
Name: ${trend.trend_name}
Category: ${trend.category}
Capability Area: ${trend.capability_area || 'general'}
Market Signal: ${trend.market_signal || ''}
What's Changing:
- ${whatsChanging || 'Not specified'}
Why Now: ${trend.why_now || ''}
Regional Manifestations:
${regionalManifestations || 'Not specified'}

TASK: Propose 2-4 candidate IndustryChallenge records. Each must describe a CONCRETE formulation/application problem food manufacturers face — NOT a restatement of the trend itself.

RULES:
1. capability_hypothesis must NEVER use "Palsgaard" as the grammatical subject. Write "Deep expertise in X enables…" or "Proven emulsification technology allows…" — never "Palsgaard's expertise enables…" or "Palsgaard can…"
2. capability_fit: only write "strong" if clearly justified. Default to "unknown" when uncertain (set defaulted_conservatively: true).
3. category must be one of: bakery, condiments, chocolate_confectionery, dairy, ice_cream, meat, oils_fats, plant_based, rutf_rusf, needs_human_review
4. capability_area must be one of: sustainability, texture_quality, cost_efficiency, compliance_regulatory, new_product_development, food_safety, supply_chain, plant_based, general
5. capability_fit must be one of: strong, possible, none, unknown

Return ONLY a JSON array (no markdown fences) like:
[
  {
    "name": "...",
    "description": "...",
    "capability_observation": "...",
    "capability_hypothesis": "...",
    "capability_area": "...",
    "capability_fit": "...",
    "defaulted_conservatively": false
  }
]`;

    const raw = await callClaude(apiKey, prompt);
    let candidates;
    try {
      const cleaned = raw.replace(/```json|```/g, '').trim();
      candidates = JSON.parse(cleaned);
    } catch (e) {
      return Response.json({ error: 'LLM returned unparseable JSON', raw: raw.slice(0, 500) }, { status: 500 });
    }

    if (!Array.isArray(candidates) || candidates.length === 0) {
      return Response.json({ error: 'LLM returned no candidates' }, { status: 500 });
    }

    const createdIds = [];
    const createdRecords = [];

    for (const candidate of candidates) {
      // Validate and normalize fields
      const category = VALID_CATEGORIES.includes(candidate.category) ? candidate.category : trend.category || 'needs_human_review';
      const capArea = VALID_CAP_AREAS.includes(candidate.capability_area) ? candidate.capability_area : (trend.capability_area || 'general');
      const capFit = VALID_CAP_FIT.includes(candidate.capability_fit) ? candidate.capability_fit : 'unknown';
      const defaultedConservatively = capFit === 'unknown' ? true : (candidate.defaulted_conservatively || false);

      // Enforce hypothesis content rule: if violated, nullify rather than write bad data
      let hypothesis = candidate.capability_hypothesis || null;
      if (hypothesis && !validateHypothesis(hypothesis)) {
        console.warn(`[proposeChallengesForTrend] Hypothesis violated subject rule, clearing: "${hypothesis.slice(0, 80)}"`);
        hypothesis = null;
      }

      // Build write payload — NEVER include validation_status, validated_by, validated_date
      const payload = {
        name: candidate.name || 'Unnamed challenge',
        description: candidate.description || '',
        global_trend_id: global_trend_id,
        category,
        is_active: false,
        review_status: 'pending',
        defaulted_conservatively: defaultedConservatively,
        decision_pending: true,
      };

      if (candidate.capability_observation) payload.capability_observation = candidate.capability_observation;
      if (hypothesis) payload.capability_hypothesis = hypothesis;
      if (capArea) payload.capability_area = capArea;
      if (capFit) payload.capability_fit = capFit;

      const created = await base44.asServiceRole.entities.IndustryChallenge.create(payload);

      // RULE 5: Read back and confirm
      const readBack = await base44.asServiceRole.entities.IndustryChallenge.filter({ id: created.id });
      const confirmed = readBack?.[0];

      if (!confirmed) {
        console.error(`[proposeChallengesForTrend] Could not read back ${created.id}`);
        continue;
      }

      // Confirm is_active=false and human-only fields are not set
      const runLogEntry = {
        id: confirmed.id,
        name: confirmed.name,
        is_active: confirmed.is_active,
        review_status: confirmed.review_status,
        validation_status_unset: !confirmed.validation_status || confirmed.validation_status === 'unvalidated',
        validated_by_unset: !confirmed.validated_by,
        validated_date_unset: !confirmed.validated_date,
        capability_fit: confirmed.capability_fit,
        defaulted_conservatively: confirmed.defaulted_conservatively,
      };

      createdIds.push(confirmed.id);
      createdRecords.push(runLogEntry);
    }

    return Response.json({
      ok: true,
      trend_name: trend.trend_name,
      candidates_proposed: createdRecords.length,
      created_ids: createdIds,
      run_log: createdRecords,
    });

  } catch (error) {
    console.error('[proposeChallengesForTrend] Fatal:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});