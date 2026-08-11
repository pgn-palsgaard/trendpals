import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

// ── Inlined constants (no imports from lib/components/pages) ────────────────
const CANONICAL_CATEGORIES = ['bakery','condiments','chocolate_confectionery','dairy','ice_cream','meat','oils_fats','plant_based','rutf_rusf','needs_human_review'];
const SIGNAL_TYPES = ['consumer_driver','category_movement','regional_expression','competitive_activity','other'];
const DRIVER_HYPOTHESES = ['Value','Wellbeing','Surroundings','Experiences','Rights','Identity'];

// Raw Mintel category-string synonyms per canonical key, for the GNPD fallback (Step 4b).
const RAW_CATEGORY_SYNONYMS = {
  bakery: ['Bakery','Baking','Cake'],
  condiments: ['Sauces & Seasonings','Condiments','Dressings','Spreads'],
  chocolate_confectionery: ['Chocolate Confectionery','Confectionery','Sugar & Gum Confectionery'],
  dairy: ['Dairy'],
  ice_cream: ['Ice Cream','Ice Cream & Frozen Yogurt'],
  meat: ['Processed Fish, Meat & Egg Products','Meat'],
  oils_fats: ['Oils & Fats','Fats'],
  plant_based: ['Plant Based','Meat Substitutes','Dairy Alternatives'],
  rutf_rusf: ['Baby Food','Nutritional Products'],
  needs_human_review: [],
};

// Haiku pricing (per 1M tokens) — inlined for cost estimate.
const HAIKU_INPUT_PER_M = 1.00;
const HAIKU_OUTPUT_PER_M = 5.00;

const NINETY_DAYS_MS = 90 * 86400000;
const EIGHTEEN_MONTHS_MS = 18 * 30.4 * 86400000;

function withinDays(dateStr, ms) {
  if (!dateStr) return false;
  const t = new Date(dateStr).getTime();
  if (!Number.isFinite(t)) return false;
  return (Date.now() - t) <= ms && t <= Date.now();
}

function estCostUsd(inTok, outTok) {
  return (inTok / 1e6) * HAIKU_INPUT_PER_M + (outTok / 1e6) * HAIKU_OUTPUT_PER_M;
}

// Jaccard over {source_id, excerpt_index} tuples.
function excerptJaccard(refsA, refsB) {
  const key = (r) => `${r.source_id}#${r.excerpt_index}`;
  const setA = new Set((refsA || []).map(key));
  const setB = new Set((refsB || []).map(key));
  if (setA.size === 0 && setB.size === 0) return 0;
  let inter = 0;
  for (const k of setA) if (setB.has(k)) inter++;
  const union = setA.size + setB.size - inter;
  return union === 0 ? 0 : inter / union;
}

// Bounded-concurrency map. Per-cluster model calls are independent, so running
// them a few at a time keeps the whole run inside the function's time budget
// without firing dozens of requests at once.
async function mapPool(items, limit, fn) {
  const out = [];
  for (let i = 0; i < items.length; i += limit) {
    const done = await Promise.all(items.slice(i, i + limit).map(fn));
    for (const d of done) out.push(d);
  }
  return out;
}

async function callHaiku(prompt, maxTokens) {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': Deno.env.get('ANTHROPIC_API_KEY'),
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5',
      max_tokens: maxTokens,
      messages: [{ role: 'user', content: prompt }],
    }),
  });
  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Haiku API ${res.status}: ${errText.slice(0, 200)}`);
  }
  const data = await res.json();
  const rawText = data.content?.[0]?.text || '';
  const usage = data.usage || { input_tokens: 0, output_tokens: 0 };
  return { rawText, usage };
}

function parseJsonBlock(rawText) {
  // Accepts either an array or object payload.
  const arrMatch = rawText.match(/\[[\s\S]*\]/);
  const objMatch = rawText.match(/\{[\s\S]*\}/);
  const candidate = arrMatch && (!objMatch || arrMatch.index <= objMatch.index) ? arrMatch[0] : (objMatch ? objMatch[0] : null);
  if (!candidate) return null;
  try { return JSON.parse(candidate); } catch { /* fall through to salvage */ }
  // Salvage a truncated array: parse each complete top-level {...} object.
  const open = rawText.indexOf('[');
  if (open === -1) return null;
  const objs = [];
  let depth = 0, start = -1, inStr = false, esc = false;
  for (let i = open + 1; i < rawText.length; i++) {
    const ch = rawText[i];
    if (inStr) {
      if (esc) esc = false;
      else if (ch === '\\') esc = true;
      else if (ch === '"') inStr = false;
      continue;
    }
    if (ch === '"') { inStr = true; continue; }
    if (ch === '{') { if (depth === 0) start = i; depth++; }
    else if (ch === '}') {
      depth--;
      if (depth === 0 && start !== -1) {
        try { objs.push(JSON.parse(rawText.slice(start, i + 1))); } catch { /* skip partial */ }
        start = -1;
      }
    }
  }
  return objs.length ? objs : null;
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json().catch(() => ({}));
    const testFlag = body.test_flag === true; // dry run: no EmergingSignalCluster writes

    let user = null;
    try { user = await base44.auth.me(); } catch (_) { /* automation context */ }
    const isAutomation = !!body.event || body.triggered_by === 'schedule';
    if (!user && !isAutomation) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    const db = user ? base44 : base44.asServiceRole;
    const svc = base44.asServiceRole;

    // Wall-clock budget. The platform kills long invocations, so work that does
    // not fit is DEFERRED and reported — never dropped silently. Nothing is
    // written for a deferred cluster, so the next run picks it up unchanged.
    const RUN_DEADLINE = Date.now() + 70000;
    const budgetLeft = () => RUN_DEADLINE - Date.now();

    let totalInTok = 0, totalOutTok = 0;
    const summary = {
      input_pool_size: 0,
      candidate_pool_size: 0,
      drop_breakdown_by_category: {},
      clusters_proposed_by_llm: 0,
      batches_run: 0,
      pool_truncated: false,
      dropped_no_category: 0,
      batches_deferred: 0,
      clusters_deferred_no_budget: 0,
      clusters_merged_across_batches: 0,
      clusters_revived_from_dismissed: 0,
      clusters_suppressed_dismissed: 0,
      distance_check_failed: 0,
      clusters_after_distance_check: 0,
      clusters_after_gnpd_overlay: 0,
      clusters_written_new: 0,
      clusters_refreshed_existing: 0,
      gnpd_strength_breakdown: { strong: 0, moderate: 0, none: 0 },
      gnpd_fallback_used_categories: [],
      estimated_cost_usd: 0,
    };
    const errors = [];

    // Schema snapshot log at start of each entity read.
    console.log('[detectEmergingSignals] schema snapshot: Source.excerpts = inline array; ref by {source_id, excerpt_index}. GNPDProduct pk = id. GlobalTrend.category = canonical key.');

    // ── STEP 1 — Pool assembly ────────────────────────────────────────────
    // 1a. All Sources (paginate — never a single 500 page as total).
    let skip = 0; const page = 500; let sources = [];
    while (true) {
      const batch = await svc.entities.Source.list('-created_date', page, skip);
      sources = sources.concat(batch);
      if (batch.length < page) break;
      skip += page;
      if (skip > 20000) break;
    }

    // 1b. Flatten promoted excerpts from Sources created within last 90 days.
    const poolExcerpts = [];
    for (const s of sources) {
      if (!withinDays(s.created_date, NINETY_DAYS_MS)) continue;
      const exs = Array.isArray(s.excerpts) ? s.excerpts : [];
      for (let i = 0; i < exs.length; i++) {
        const e = exs[i];
        if (e.promotion_status !== 'promoted') continue;
        poolExcerpts.push({
          source_id: s.id,
          excerpt_index: i,
          market_signal: e.market_signal || '',
          customer_pain: e.customer_pain || '',
          trend_keywords: Array.isArray(e.trend_keywords) ? e.trend_keywords : [],
          category_relevance: Array.isArray(e.category_relevance) ? e.category_relevance : [],
          signal_type: SIGNAL_TYPES.includes(e.signal_type) ? e.signal_type : 'other',
          publisher: s.publisher || '(none)',
          page_ref: e.page_ref || '',
        });
      }
    }
    summary.input_pool_size = poolExcerpts.length;

    // 1c. Active GlobalTrends → keyword index by category.
    let tskip = 0; let trends = [];
    while (true) {
      const batch = await svc.entities.GlobalTrend.list('-created_date', page, tskip);
      trends = trends.concat(batch);
      if (batch.length < page) break;
      tskip += page;
      if (tskip > 10000) break;
    }
    const activeTrends = trends.filter(t => t.is_active !== false);
    const kwByCategory = {}; // category -> [{trend_id, kwSet}]
    for (const t of activeTrends) {
      const c = t.category || '(null)';
      if (!kwByCategory[c]) kwByCategory[c] = [];
      kwByCategory[c].push({
        trend_id: t.id,
        kwSet: new Set((t.trend_keywords || []).map(k => String(k).toLowerCase().trim())),
      });
    }

    // 1d/1e. Filter to candidates: for ALL category_relevance entries, no active
    // trend has 2+ keyword overlap. Drop empty market_signal/customer_pain.
    const candidates = [];
    for (const ex of poolExcerpts) {
      if (!ex.market_signal.trim() || !ex.customer_pain.trim()) continue;
      // P1.3 — an excerpt with no category_relevance cannot be clustered (clusters
      // are category-scoped) and would only consume a batch slot. Drop it early.
      if (!ex.category_relevance.length) { summary.dropped_no_category++; continue; }
      const exKw = new Set(ex.trend_keywords.map(k => String(k).toLowerCase().trim()));
      const cats = ex.category_relevance.length ? ex.category_relevance : [];
      let hasHome = false;
      let droppedCat = null;
      for (const cat of cats) {
        const trendList = kwByCategory[cat] || [];
        for (const t of trendList) {
          let overlap = 0;
          for (const k of exKw) if (t.kwSet.has(k)) overlap++;
          if (overlap >= 2) { hasHome = true; droppedCat = cat; break; }
        }
        if (hasHome) break;
      }
      if (hasHome) {
        summary.drop_breakdown_by_category[droppedCat] = (summary.drop_breakdown_by_category[droppedCat] || 0) + 1;
        continue;
      }
      candidates.push(ex);
    }
    summary.candidate_pool_size = candidates.length;
    console.log(`[detectEmergingSignals] input=${summary.input_pool_size} candidate=${summary.candidate_pool_size}`);

    if (candidates.length === 0) {
      const job = await svc.entities.ProcessingJob.create({
        job_type: 'detect_emerging_signals',
        status: 'completed',
        started_at: new Date().toISOString(),
        last_progress_at: new Date().toISOString(),
        total_items: 0,
        processed_items: 0,
        summary: { ...summary, note: 'No candidate excerpts — empty input pool.' },
        triggered_by: user?.email || 'schedule',
      });
      return Response.json({ ok: true, test_flag: testFlag, job_id: job.id, summary, clusters: [] });
    }

    // ── STEP 2 — Semantic clustering (one Haiku call) ─────────────────────
    // Cap the pool sent to the LLM so the JSON response fits inside max_tokens.
    // 120 excerpts × trimmed fields keeps input manageable and output un-truncated.
    // P1.1 — no candidate left behind. The pool is grouped by category and each
    // group runs in batches of <=120, so a large pool costs more calls instead
    // of silently losing everything past the 120th excerpt.
    const CLUSTER_INPUT_CAP = 120;
    const byCategory = {};
    for (const c of candidates) {
      for (const cat of c.category_relevance) {
        if (!CANONICAL_CATEGORIES.includes(cat)) continue;
        if (!byCategory[cat]) byCategory[cat] = [];
        byCategory[cat].push(c);
      }
    }
    const batches = [];
    for (const [cat, list] of Object.entries(byCategory)) {
      for (let i = 0; i < list.length; i += CLUSTER_INPUT_CAP) {
        batches.push({ category: cat, items: list.slice(i, i + CLUSTER_INPUT_CAP) });
      }
    }
    summary.batches_run = batches.length;
    console.log(`[detectEmergingSignals] clustering ${candidates.length} candidates in ${batches.length} batch(es) across ${Object.keys(byCategory).length} categor(ies)`);

    const buildClusterPrompt = (items) => `You are grouping market-intelligence excerpts into emerging-signal clusters for TrendPals, an outside-in food-ingredients market tool.

Each excerpt has a market_signal and customer_pain. Group excerpts that share a coherent emerging theme.

STRICT RULES:
- Same category required within a cluster (use one canonical key from the excerpt's category_relevance). Valid keys: ${CANONICAL_CATEGORIES.join(', ')}.
- Same signal_type required within a cluster. Valid: ${SIGNAL_TYPES.join(', ')}.
- Minimum 3 excerpts per cluster.
- Minimum 2 DISTINCT source_ids per cluster.
- An excerpt with multiple category_relevance values may appear in more than one cluster only if the theme genuinely applies.
- Excerpts that fit no coherent theme: OMIT them. Do NOT create a misc/other bucket.

For each cluster also propose a driver_hypothesis (one of: ${DRIVER_HYPOTHESES.join(', ')}) — a hypothesis only.

Excerpts (JSON):
${JSON.stringify(items.map((c, i) => ({
  idx: i,
  source_id: c.source_id,
  excerpt_index: c.excerpt_index,
  market_signal: c.market_signal.slice(0, 220),
  customer_pain: c.customer_pain.slice(0, 220),
  category_relevance: c.category_relevance,
  signal_type: c.signal_type,
})))}

Return ONLY a JSON array:
[
  {
    "theme_short_label": "max 5 words",
    "theme_description": "1-2 sentences",
    "category": "canonical key",
    "signal_type": "enum",
    "driver_hypothesis": "enum",
    "excerpt_refs": [{ "source_id": "...", "excerpt_index": 0 }]
  }
]`;

    // Batches are independent, so they run concurrently — sequential calls would
    // push a multi-category pool past the function's time budget.
    const rawClusters = [];
    const batchRuns = await mapPool(batches, 6, async (batch) => {
      // Clustering must leave room for the distance + GNPD stages.
      if (budgetLeft() < 40000) {
        summary.batches_deferred++;
        summary.pool_truncated = true;
        return { batch, deferred: true };
      }
      try {
        const clusterRes = await callHaiku(buildClusterPrompt(batch.items), 8192);
        const parsed = parseJsonBlock(clusterRes.rawText);
        return { batch, usage: clusterRes.usage, parsed };
      } catch (err) {
        return { batch, error: err.message };
      }
    });
    for (const r of batchRuns) {
      if (r.error) { errors.push(`Step 2: clustering batch (${r.batch.category}) failed — ${r.error}`); continue; }
      totalInTok += r.usage.input_tokens; totalOutTok += r.usage.output_tokens;
      if (!Array.isArray(r.parsed)) {
        errors.push(`Step 2: clustering batch (${r.batch.category}) returned non-array or unparseable JSON`);
        continue;
      }
      for (const c of r.parsed) rawClusters.push(c);
    }
    summary.clusters_proposed_by_llm = rawClusters.length;

    // Validate at write-time — reject malformed, do not coerce.
    const validCandidateKey = new Set(candidates.map(c => `${c.source_id}#${c.excerpt_index}`));
    const validClusters = [];
    for (const c of rawClusters) {
      const problems = [];
      if (!c || typeof c !== 'object') { errors.push('Step 2: non-object cluster'); continue; }
      if (typeof c.theme_short_label !== 'string' || !c.theme_short_label.trim()) problems.push('theme_short_label');
      if (typeof c.theme_description !== 'string' || !c.theme_description.trim()) problems.push('theme_description');
      if (!CANONICAL_CATEGORIES.includes(c.category)) problems.push('category');
      if (!SIGNAL_TYPES.includes(c.signal_type)) problems.push('signal_type');
      if (!DRIVER_HYPOTHESES.includes(c.driver_hypothesis)) problems.push('driver_hypothesis');
      if (!Array.isArray(c.excerpt_refs)) problems.push('excerpt_refs');
      let refs = [];
      if (Array.isArray(c.excerpt_refs)) {
        refs = c.excerpt_refs.filter(r => r && typeof r.source_id === 'string' && Number.isInteger(r.excerpt_index) && validCandidateKey.has(`${r.source_id}#${r.excerpt_index}`));
      }
      const distinctSources = new Set(refs.map(r => r.source_id));
      if (refs.length < 3) problems.push('min_3_excerpts');
      if (distinctSources.size < 2) problems.push('min_2_sources');
      if (problems.length) {
        errors.push(`Step 2: rejected cluster "${c.theme_short_label || '?'}" — ${problems.join(', ')}`);
        continue;
      }
      // Enrich refs with snippet + publisher from candidate pool.
      const candByKey = {};
      for (const cd of candidates) candByKey[`${cd.source_id}#${cd.excerpt_index}`] = cd;
      const enrichedRefs = refs.map(r => {
        const cd = candByKey[`${r.source_id}#${r.excerpt_index}`];
        return {
          source_id: r.source_id,
          excerpt_index: r.excerpt_index,
          market_signal_snippet: (cd?.market_signal || '').slice(0, 200),
          publisher: cd?.publisher || '(none)',
        };
      });
      validClusters.push({ ...c, excerpt_refs: enrichedRefs, _candRefs: refs });
    }

    // ── STEP 2b — Cross-batch merge (one Haiku call over ALL batch outputs) ─
    // Two batches in the same category can name the same theme slightly
    // differently, so exact-label matching would not catch it. One semantic
    // merge pass at >=0.8 similarity, then a tuple-level dedup of excerpt_refs
    // so a merged cluster never inherits the sum of two overlapping sets.
    let mergedClusters = validClusters;
    if (validClusters.length > 1 && batches.length > 1) {
      try {
        const mergePrompt = `You are de-duplicating emerging-signal clusters produced by separate batch runs over the same market-intelligence pool.

Clusters (JSON):
${JSON.stringify(validClusters.map((c, i) => ({ idx: i, category: c.category, signal_type: c.signal_type, theme_short_label: c.theme_short_label, theme_description: c.theme_description })))}

Group together the clusters that describe the SAME underlying theme — semantic similarity of 0.8 or higher. Only clusters with the same category AND same signal_type may be grouped. A cluster that has no twin is left alone and must NOT be listed.

Return ONLY a JSON array of merge groups, each an array of 2+ idx values:
[[1, 4], [7, 9, 12]]`;
        const mRes = await callHaiku(mergePrompt, 2048);
        totalInTok += mRes.usage.input_tokens; totalOutTok += mRes.usage.output_tokens;
        const groups = parseJsonBlock(mRes.rawText);
        if (Array.isArray(groups)) {
          const claimed = new Set();
          const out = [];
          for (const g of groups) {
            if (!Array.isArray(g)) continue;
            const idxs = [...new Set(g.filter(n => Number.isInteger(n) && n >= 0 && n < validClusters.length))]
              .filter(n => !claimed.has(n));
            if (idxs.length < 2) continue;
            const members = idxs.map(n => validClusters[n]);
            // Same category + signal_type is a hard requirement, not advisory.
            if (!members.every(m => m.category === members[0].category && m.signal_type === members[0].signal_type)) continue;
            for (const n of idxs) claimed.add(n);
            // Union of refs, deduped on the {source_id, excerpt_index} tuple.
            const seen = new Set();
            const refs = [];
            const candRefs = [];
            for (const m of members) {
              for (const r of m.excerpt_refs) {
                const k = `${r.source_id}#${r.excerpt_index}`;
                if (seen.has(k)) continue;
                seen.add(k);
                refs.push(r);
                candRefs.push({ source_id: r.source_id, excerpt_index: r.excerpt_index });
              }
            }
            out.push({ ...members[0], excerpt_refs: refs, _candRefs: candRefs });
            summary.clusters_merged_across_batches += members.length - 1;
          }
          for (let i = 0; i < validClusters.length; i++) if (!claimed.has(i)) out.push(validClusters[i]);
          mergedClusters = out;
        } else {
          errors.push('Step 2b: merge pass returned unparseable JSON — batch outputs kept unmerged');
        }
      } catch (err) {
        errors.push(`Step 2b: merge pass failed — ${err.message} (batch outputs kept unmerged)`);
      }
    }

    // ── STEP 3 — Distance from existing (Haiku per cluster) ───────────────
    const distanceResults = await mapPool(mergedClusters, 5, async (cluster) => {
      const sameCatTrends = activeTrends
        .filter(t => t.category === cluster.category)
        .map(t => ({
          trend_id: t.id,
          trend_name: t.trend_name || '',
          market_signal: (t.market_signal || '').slice(0, 300),
          description: (t.description || '').slice(0, 300),
          trend_keywords: t.trend_keywords || [],
        }));

      // No active trend in the category is a STRONG state, not a failure —
      // genuinely new territory, and the best promote candidate there is.
      if (sameCatTrends.length === 0) {
        cluster._distance = { most_similar_trend_id: null, similarity_score: 0, distance_note: 'No existing active trends in this category — genuinely new territory.', status: 'no_active_trends' };
        return { cluster, keep: true };
      }

      const distPrompt = `Cluster theme: "${cluster.theme_description}"

Existing active trends in the same category (JSON):
${JSON.stringify(sameCatTrends)}

Is this cluster genuinely distinct from every existing trend, or does it substantially overlap with one?

Return ONLY JSON:
{ "most_similar_trend_id": "<trend_id or null>", "similarity_score": <0-100>, "distance_note": "1-2 sentences" }`;

      // P1.4 — one retry, then keep the cluster flagged as failed. A transient
      // model timeout must not destroy a genuine signal.
      let dist = null;
      const localErrors = [];
      let inTok = 0, outTok = 0;
      for (let attempt = 1; attempt <= 2; attempt++) {
        try {
          const dRes = await callHaiku(distPrompt, 1024);
          inTok += dRes.usage.input_tokens; outTok += dRes.usage.output_tokens;
          const parsed = parseJsonBlock(dRes.rawText);
          if (parsed && typeof parsed === 'object' && Number.isFinite(Number(parsed.similarity_score))) { dist = parsed; break; }
          localErrors.push(`Step 3: unparseable distance result for "${cluster.theme_short_label}" (attempt ${attempt})`);
        } catch (err) {
          localErrors.push(`Step 3: distance call failed for "${cluster.theme_short_label}" (attempt ${attempt}) — ${err.message}`);
        }
      }
      if (!dist) {
        cluster._distance = {
          most_similar_trend_id: null,
          similarity_score: 0,
          distance_note: 'Distance to existing trends could not be assessed in this run.',
          status: 'failed',
        };
        return { cluster, keep: true, failed: true, localErrors, inTok, outTok };
      }
      const score = Math.max(0, Math.min(100, Number(dist.similarity_score)));
      const simId = (typeof dist.most_similar_trend_id === 'string' && sameCatTrends.some(t => t.trend_id === dist.most_similar_trend_id)) ? dist.most_similar_trend_id : null;
      cluster._distance = {
        most_similar_trend_id: simId,
        similarity_score: score,
        distance_note: typeof dist.distance_note === 'string' ? dist.distance_note.slice(0, 500) : '',
        status: 'ok',
      };
      if (score > 75) {
        console.log(`[detectEmergingSignals] discard (covered, score ${score}): ${cluster.theme_short_label}`);
        return { cluster, keep: false, covered: true, localErrors, inTok, outTok };
      }
      return { cluster, keep: true, localErrors, inTok, outTok };
    });

    const survivedDistance = [];
    for (const r of distanceResults) {
      totalInTok += r.inTok || 0; totalOutTok += r.outTok || 0;
      for (const e of r.localErrors || []) errors.push(e);
      if (r.failed) summary.distance_check_failed++;
      if (r.covered) {
        summary.drop_breakdown_by_category[r.cluster.category] = summary.drop_breakdown_by_category[r.cluster.category] || 0;
      }
      if (r.keep) survivedDistance.push(r.cluster);
    }
    summary.clusters_after_distance_check = survivedDistance.length;

    // ── STEP 4 — GNPD overlay (Haiku per cluster) ─────────────────────────
    await mapPool(survivedDistance, 4, async (cluster) => {
      // 4a. GNPDProduct by palsgaard_category, launched last 18 months, newest 100.
      let gnpd = await svc.entities.GNPDProduct.filter({ palsgaard_category: cluster.category }, '-launch_date', 500);
      let usedFallback = false;
      // 4b. Fallback to raw category strings if pool empty or < 20.
      if (gnpd.length < 20) {
        const synonyms = RAW_CATEGORY_SYNONYMS[cluster.category] || [];
        if (synonyms.length) {
          const rawMatches = await svc.entities.GNPDProduct.filter({ category: { $in: synonyms } }, '-launch_date', 500);
          const seen = new Set(gnpd.map(p => p.id));
          for (const p of rawMatches) if (!seen.has(p.id)) { gnpd.push(p); seen.add(p.id); }
          usedFallback = true;
          if (!summary.gnpd_fallback_used_categories.includes(cluster.category)) summary.gnpd_fallback_used_categories.push(cluster.category);
        }
      }
      const recent = gnpd.filter(p => withinDays(p.launch_date, EIGHTEEN_MONTHS_MS)).slice(0, 100);

      if (recent.length === 0) {
        cluster._gnpd = { product_ids: [], strength: 'none', reasoning: 'No GNPD products in this category launched in the last 18 months.' };
        summary.gnpd_strength_breakdown.none++;
        return;
      }

      const productList = recent.map(p => {
        const o = { id: p.id, name: p.product_name };
        if (p.sub_category) o.sub_category = p.sub_category;
        if (p.product_description) o.description = String(p.product_description).slice(0, 300);
        if (Array.isArray(p.claims) && p.claims.length) o.claims = p.claims.slice(0, 12);
        if (p.ingredients) o.ingredients = String(p.ingredients).slice(0, 300);
        return o;
      });

      const gnpdPrompt = `Cluster theme: "${cluster.theme_description}"

Product launches (JSON):
${JSON.stringify(productList)}

Which of these products show claim/format/positioning patterns matching the theme? Only include clear matches.

Return ONLY JSON:
{ "matching_product_ids": ["<id>", ...], "strength": "strong|moderate|none", "reasoning": "1-2 sentences" }`;

      let gnpdOut;
      try {
        const gRes = await callHaiku(gnpdPrompt, 2048);
        totalInTok += gRes.usage.input_tokens; totalOutTok += gRes.usage.output_tokens;
        gnpdOut = parseJsonBlock(gRes.rawText);
      } catch (err) {
        errors.push(`Step 4: GNPD call failed for "${cluster.theme_short_label}" — ${err.message}`);
        gnpdOut = null;
      }
      const validIds = new Set(recent.map(p => p.id));
      let matched = [];
      if (gnpdOut && Array.isArray(gnpdOut.matching_product_ids)) {
        matched = gnpdOut.matching_product_ids.filter(id => typeof id === 'string' && validIds.has(id));
      } else {
        errors.push(`Step 4: invalid GNPD result for "${cluster.theme_short_label}" — treated as 0 matches`);
      }
      // Deterministic strength override — count wins over LLM advisory.
      let strength = 'none';
      if (matched.length >= 5) strength = 'strong';
      else if (matched.length >= 2) strength = 'moderate';
      cluster._gnpd = {
        product_ids: matched,
        strength,
        reasoning: (gnpdOut && typeof gnpdOut.reasoning === 'string' ? gnpdOut.reasoning : '').slice(0, 500) + (usedFallback ? ' [raw-category fallback used]' : ''),
      };
      summary.gnpd_strength_breakdown[strength]++;
    });
    summary.clusters_after_gnpd_overlay = survivedDistance.length;

    summary.estimated_cost_usd = Number(estCostUsd(totalInTok, totalOutTok).toFixed(4));

    // ── STEP 5 — Idempotency + write ──────────────────────────────────────
    // Create the job record first so detected_in_run_id is available.
    const job = await svc.entities.ProcessingJob.create({
      job_type: 'detect_emerging_signals',
      status: 'running',
      started_at: new Date().toISOString(),
      last_progress_at: new Date().toISOString(),
      total_items: survivedDistance.length,
      processed_items: 0,
      summary,
      triggered_by: user?.email || 'schedule',
    });

    const nowIso = new Date().toISOString();
    const writtenClusters = [];

    if (!testFlag) {
      // Idempotency lookup across ALL four decided states — paginated, because a
      // fixed 1000-row ceiling starts missing duplicates silently once the
      // library grows past it.
      const loadByStatus = async (status) => {
        let s = 0; let out = [];
        while (true) {
          const b = await svc.entities.EmergingSignalCluster.filter({ status }, '-detected_at', page, s);
          out = out.concat(b);
          if (b.length < page) break;
          s += page;
          if (s > 20000) break;
        }
        return out;
      };
      const [emergingEx, snoozedEx, dismissedEx, promotedEx] = await Promise.all([
        loadByStatus('emerging'),
        loadByStatus('snoozed'),
        loadByStatus('dismissed'),
        loadByStatus('promoted_to_trend'),
      ]);
      const existing = [...emergingEx, ...snoozedEx, ...promotedEx];
      const STRENGTH_RANK = { none: 0, moderate: 1, strong: 2 };

      for (const cluster of survivedDistance) {
        const refs = cluster.excerpt_refs;
        const sourceSet = new Set(refs.map(r => r.source_id));
        const pubSet = new Set(refs.map(r => r.publisher));
        const newStrength = cluster._gnpd?.strength || 'none';

        // 5a. A theme already dismissed stays dismissed — unless the evidence has
        // moved up a band since that decision, in which case the decision deserves
        // to be taken again. A permanent dismissal is never revived.
        const dismissedDup = dismissedEx.find(ex => ex.category === cluster.category && excerptJaccard(ex.excerpt_refs, refs) >= 0.6);
        if (dismissedDup) {
          const priorStrength = dismissedDup.gnpd_evidence_strength || 'none';
          const permanence = dismissedDup.dismiss_permanence || 'revisitable';
          const rose = (STRENGTH_RANK[newStrength] ?? 0) > (STRENGTH_RANK[priorStrength] ?? 0);
          if (permanence === 'permanent' || !rose) {
            await svc.entities.EmergingSignalCluster.update(dismissedDup.id, { last_refreshed_at: nowIso });
            summary.clusters_suppressed_dismissed++;
            continue;
          }
          await svc.entities.EmergingSignalCluster.update(dismissedDup.id, {
            status: 'emerging',
            previously_dismissed: true,
            prior_dismiss_strength: priorStrength,
            prior_dismissed_at: dismissedDup.updated_date || dismissedDup.last_refreshed_at || dismissedDup.detected_at || nowIso,
            gnpd_product_ids: cluster._gnpd?.product_ids || [],
            gnpd_evidence_strength: newStrength,
            gnpd_reasoning: cluster._gnpd?.reasoning || '',
            excerpt_refs: refs,
            source_diversity_count: sourceSet.size,
            publisher_diversity_count: pubSet.size,
            detected_in_run_id: job.id,
            last_refreshed_at: nowIso,
          });
          summary.clusters_revived_from_dismissed++;
          continue;
        }

        // 5b. Idempotency — >=60% Jaccard overlap within same category → refresh.
        const dup = existing.find(ex => ex.category === cluster.category && excerptJaccard(ex.excerpt_refs, refs) >= 0.6);
        if (dup) {
          await svc.entities.EmergingSignalCluster.update(dup.id, { last_refreshed_at: nowIso });
          summary.clusters_refreshed_existing++;
          continue;
        }

        const record = {
          theme_description: cluster.theme_description,
          theme_short_label: cluster.theme_short_label,
          category: cluster.category,
          signal_type: cluster.signal_type,
          driver_hypothesis: cluster.driver_hypothesis,
          excerpt_refs: refs,
          gnpd_product_ids: cluster._gnpd?.product_ids || [],
          gnpd_evidence_strength: cluster._gnpd?.strength || 'none',
          gnpd_reasoning: cluster._gnpd?.reasoning || '',
          source_diversity_count: sourceSet.size,
          publisher_diversity_count: pubSet.size,
          distance_from_existing_note: cluster._distance?.distance_note || '',
          most_similar_existing_trend_id: cluster._distance?.most_similar_trend_id || null,
          most_similar_existing_trend_score: cluster._distance?.similarity_score ?? 0,
          distance_check_status: cluster._distance?.status || 'ok',
          status: 'emerging',
          detected_in_run_id: job.id,
          detected_at: nowIso,
          last_refreshed_at: nowIso,
        };
        const created = await svc.entities.EmergingSignalCluster.create(record);
        // Self-claim read-back verification.
        const readBack = await svc.entities.EmergingSignalCluster.get(created.id);
        if (!readBack || readBack.id !== created.id) {
          errors.push(`Step 5: read-back failed for cluster "${cluster.theme_short_label}"`);
        }
        summary.clusters_written_new++;
        writtenClusters.push({ id: created.id, label: record.theme_short_label });
      }
    } else {
      // Dry run — count what WOULD be written, write nothing.
      for (const cluster of survivedDistance) {
        writtenClusters.push({ id: null, label: cluster.theme_short_label, dry_run: true });
      }
    }

    // ── STEP 6 — Finalize job ─────────────────────────────────────────────
    const finalUpdate = {
      status: 'completed',
      last_progress_at: new Date().toISOString(),
      processed_items: survivedDistance.length,
      summary,
      last_error: errors.length ? errors.slice(0, 20).join(' | ') : null,
    };
    if (testFlag) finalUpdate.dry_run_summary = summary;
    await svc.entities.ProcessingJob.update(job.id, finalUpdate);

    return Response.json({
      ok: true,
      test_flag: testFlag,
      job_id: job.id,
      summary,
      errors,
      clusters: writtenClusters,
    });

  } catch (error) {
    console.error('[detectEmergingSignals] Fatal:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});