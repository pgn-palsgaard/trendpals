// Deep-sweep web reconnaissance for the market_scout agent.
//
// Coverage techniques, in the order they run:
//   1. Multi-query fan-out   — 3-5 angle-different queries per sweep
//   2. Source-kind diversity — each query is told which source buckets to cover
//   3. Region rotation       — one pass per Palsgaard sales region
//   4. Citation hopping      — a second round on names/concepts found in round 1
//   5. Reflection            — "what angles did I miss?" plus targeted follow-ups
//   6. Date scoping          — explicit recency window in every query
//   7. Cross-check           — findings compared against the existing trend library
//
// Web findings are ALWAYS supplementary: paywalled Mintel/GNPD data stays the
// primary evidence layer, so nothing written here is ever auto-approved.

export const SCOUT_CATEGORIES = [
  'bakery', 'condiments', 'chocolate_confectionery', 'dairy', 'ice_cream',
  'meat', 'oils_fats', 'plant_based', 'rutf_rusf',
];

export const SCOUT_REGIONS = ['EMEC', 'AMERICAS', 'ASPAC', 'IMEA'];

const REGION_HINT = {
  EMEC: 'Europe and the Middle East (UK, Germany, France, Nordics, Benelux, Turkey)',
  AMERICAS: 'North and Latin America (USA, Canada, Mexico, Brazil)',
  ASPAC: 'Asia Pacific (China, Japan, South Korea, India, Indonesia, Australia)',
  IMEA: 'India, Middle East and Africa (India, Gulf states, South Africa, Nigeria)',
};

const ANGLES = [
  { key: 'consumer_demand', focus: 'shifting consumer demand, attitudes and purchase behaviour', kinds: 'trade press, retail news, consumer research' },
  { key: 'ingredient_innovation', focus: 'ingredient and formulation innovation, new technologies and textures', kinds: 'supplier news, trade press, technical media' },
  { key: 'regulatory_claims', focus: 'regulation, labelling and permitted claims', kinds: 'regulatory authorities (EFSA, FDA, FSANZ), industry associations' },
  { key: 'competitive_launches', focus: 'competitive activity and new product launches by manufacturers and retailers', kinds: 'company press releases, retail news, trade press' },
  { key: 'supply_chain_cost', focus: 'raw material availability, cost pressure and supply chain shifts', kinds: 'commodity press, trade press, industry associations' },
];

const FINDING_SCHEMA = {
  type: 'object',
  properties: {
    findings: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          title: { type: 'string' },
          url: { type: 'string' },
          publisher: { type: 'string' },
          published_date: { type: 'string' },
          market_signal: { type: 'string' },
          key_quote: { type: 'string' },
          source_kind: { type: 'string' },
          signal_type: { type: 'string' },
          region: { type: 'string' },
          relevance_score: { type: 'number' },
          entities_to_follow: { type: 'array', items: { type: 'string' } },
        },
      },
    },
  },
};

const SOURCE_KINDS = ['trade_press', 'regulatory', 'company_pr', 'retail_news', 'industry_association', 'supplier_news', 'research', 'competitor', 'other'];

// Rival ingredient suppliers. Their trend material is inside-out sales collateral,
// not market evidence — it is stored for awareness and kept out of the evidence layer.
export const COMPETITOR_SUPPLIERS = 'IFF, Kerry, dsm-firmenich, DSM, Firmenich, Corbion, Cargill, ADM, Ingredion, Tate & Lyle, Givaudan, Symrise, BASF, Bunge, AAK, Roquette, Ashland, CP Kelco, Glanbia, Novonesis (Novozymes/Chr. Hansen), Puratos, Zeelandia, Beneo, Sensient';
const SIGNAL_TYPES = ['consumer_driver', 'category_movement', 'regional_expression', 'competitive_activity', 'other'];
const REGION_CODES = ['ASPAC', 'AMERICAS', 'EMEC', 'IMEA', 'Global'];

function normalizeUrl(url) {
  if (!url) return '';
  return String(url).trim().replace(/[#?].*$/, '').replace(/\/+$/, '').toLowerCase();
}

// Echo-dedup key. Strips the publisher/section prefixes outlets bolt onto a
// rewritten press release ("Exclusive: ", "FoodNavigator | ") plus punctuation,
// so the same story from five outlets collapses to one key. Deliberately exact
// (not fuzzy) after normalisation, so distinct stories are never merged.
function normalizeTitle(title) {
  return String(title || '')
    .toLowerCase()
    .replace(/^[^:|–—-]{0,28}[:|]\s*/, '')
    .replace(/[^a-z0-9 ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function pick(value, allowed, fallback) {
  const v = String(value || '').toLowerCase().trim();
  return allowed.includes(v) ? v : fallback;
}

function pickRegion(value, fallback) {
  const v = String(value || '').toUpperCase();
  return REGION_CODES.find(r => v.includes(r)) || fallback || 'Global';
}

const RULES = `
Rules for every finding:
- Report only what the retrieved web pages actually say. Never invent a URL, publisher, date or statistic.
- market_signal is written OUTSIDE-IN: what is happening in the market. Never mention Palsgaard, emulsifiers or stabilisers as the point of the signal.
- relevance_score (0-100) reflects COMMERCIAL market-signal value for a food-ingredient supplier's customer conversations. Ingredient presence neither raises nor lowers it.
- source_kind must be one of: ${SOURCE_KINDS.join(', ')}.
- signal_type must be one of: ${SIGNAL_TYPES.join(', ')}.
- region must be one of: ASPAC, AMERICAS, EMEC, IMEA, Global.
- entities_to_follow: up to 3 concrete brand, company, ingredient or concept names worth searching next.
- Skip anything paywalled or that you cannot actually read. Skip pure advertising.
Return at most 5 findings. Fewer good findings beats padding.
`.trim();

async function search(base44, prompt) {
  try {
    const res = await base44.asServiceRole.integrations.Core.InvokeLLM({
      prompt,
      add_context_from_internet: true,
      model: 'gemini_3_flash',
      response_json_schema: FINDING_SCHEMA,
    });
    const findings = Array.isArray(res?.findings) ? res.findings : [];
    return findings;
  } catch {
    return [];
  }
}

function buildQueryPrompt({ category, question, window, angle, region, extra }) {
  const label = String(category).replace(/_/g, ' ');
  return `You are a food-industry market scout searching the open web.

Topic: ${label}${question ? `\nUser question: ${question}` : ''}
Search angle: ${angle.focus}
Source types you MUST try to cover: ${angle.kinds}
${region ? `Geographic focus: ${REGION_HINT[region] || region}. Use local-market terminology where relevant.` : 'Geographic focus: global.'}
Recency window: ${window}
${extra || ''}

Search the web now, read the results, and extract the market signals you find.

${RULES}`;
}

/**
 * Run a full deep sweep. Returns raw, de-duplicated findings.
 * `deadline` is an epoch-ms budget — later rounds are skipped if time runs out.
 */
export async function runDeepSweep(base44, { category, question = '', window = 'the last 3 months', regions = SCOUT_REGIONS, deadline = Date.now() + 240000 }) {
  const queries = [];
  const seen = new Set();
  const findings = [];

  function absorb(list, queryLabel) {
    for (const f of list || []) {
      const key = normalizeUrl(f.url) || String(f.title || '').toLowerCase().trim();
      if (!key || seen.has(key)) continue;
      seen.add(key);
      findings.push({ ...f, discovered_via_query: queryLabel });
    }
  }

  const timeLeft = () => deadline - Date.now();

  // --- Round 1: angle fan-out + region rotation, all fired concurrently ---
  // These are independent, so running them in one batch keeps the sweep inside
  // its time budget while still covering every angle and every region.
  const round1 = [
    ...ANGLES.map((angle) => ({
      label: `${category} · ${angle.key} · ${window}`,
      prompt: buildQueryPrompt({ category, question, window, angle }),
    })),
    ...regions.map((region, i) => {
      const angle = ANGLES[(i + 3) % ANGLES.length];
      return {
        label: `${category} · ${region} · ${angle.key}`,
        prompt: buildQueryPrompt({ category, question, window, angle, region }),
      };
    }),
  ];
  for (const q of round1) queries.push(q.label);
  const round1Runs = await Promise.all(
    round1.map(async (q) => ({ label: q.label, list: await search(base44, q.prompt) }))
  );
  for (const r of round1Runs) absorb(r.list, r.label);

  // --- Round 3: citation hopping on named entities from earlier rounds ---
  const hops = [...new Set(findings.flatMap(f => (f.entities_to_follow || []).map(e => String(e).trim())).filter(e => e.length > 2))].slice(0, 4);
  if (hops.length > 0 && timeLeft() > 20000) {
    const hopRuns = await Promise.all(
      hops.map(async (entity) => {
        const label = `citation hop · ${entity}`;
        queries.push(label);
        const list = await search(base44, buildQueryPrompt({
          category, question, window,
          angle: { focus: `everything recent about "${entity}" and how it relates to ${String(category).replace(/_/g, ' ')}`, kinds: 'any credible source' },
          extra: `This is a follow-up search on "${entity}", a name that came up in earlier results. Find the second-layer angle: who else is doing this, what reaction has it triggered, what does it change.`,
        }));
        return { label, list };
      })
    );
    for (const r of hopRuns) absorb(r.list, r.label);
  }

  // --- Round 4: reflection — what did we miss? ---
  let gapNote = '';
  if (timeLeft() > 15000) {
    try {
      const covered = findings.map(f => `- [${f.source_kind || '?'} | ${f.region || '?'}] ${f.title}`).join('\n').slice(0, 6000);
      const reflection = await base44.asServiceRole.integrations.Core.InvokeLLM({
        prompt: `A market sweep on "${String(category).replace(/_/g, ' ')}" produced these findings:\n\n${covered || '(none)'}\n\nName the 2 most important angles, source types or regions that are clearly MISSING from this coverage, and write one precise web search query for each. Be specific and food-industry literate.`,
        model: 'gemini_3_flash',
        response_json_schema: {
          type: 'object',
          properties: {
            gap_note: { type: 'string' },
            queries: { type: 'array', items: { type: 'string' } },
          },
        },
      });
      gapNote = reflection?.gap_note || '';
      const gapQueries = (reflection?.queries || []).slice(0, 2);
      const gapRuns = await Promise.all(
        gapQueries.map(async (q) => {
          const label = `gap fill · ${q}`.slice(0, 120);
          queries.push(label);
          const list = await search(base44, buildQueryPrompt({
            category, question, window,
            angle: { focus: q, kinds: 'whichever source types best answer this query' },
            extra: 'This search fills a gap in existing coverage. Prioritise sources the earlier rounds would have missed.',
          }));
          return { label, list };
        })
      );
      for (const r of gapRuns) absorb(r.list, r.label);
    } catch { /* reflection is optional */ }
  }

  const clean = findings
    .filter(f => f.title && f.market_signal)
    .map(f => ({
      title: String(f.title).slice(0, 300),
      url: String(f.url || '').slice(0, 900),
      publisher: String(f.publisher || '').slice(0, 200),
      published_date: String(f.published_date || '').slice(0, 60),
      market_signal: String(f.market_signal).slice(0, 1200),
      key_quote: String(f.key_quote || '').slice(0, 600),
      source_kind: pick(f.source_kind, SOURCE_KINDS, 'other'),
      signal_type: pick(f.signal_type, SIGNAL_TYPES, 'other'),
      region: pickRegion(f.region, 'Global'),
      relevance_score: Number.isFinite(f.relevance_score) ? Math.max(0, Math.min(100, f.relevance_score)) : 50,
      discovered_via_query: f.discovered_via_query || '',
    }))
    .sort((a, b) => b.relevance_score - a.relevance_score)
    .slice(0, 40);

  return { findings: clean, queries, gap_note: gapNote };
}

/**
 * Cross-check findings against the live trend library.
 * Pure classification — no writes.
 */
export async function classifyFindings(base44, { findings, trends, category }) {
  if (findings.length === 0) return [];

  const trendList = trends.map((t, i) => `${i + 1}. [${t.id}] ${t.trend_name} — ${(t.market_signal || t.description || '').slice(0, 260)}`).join('\n');
  const findingList = findings.map((f, i) => `${i + 1}. ${f.title} (${f.publisher || 'unknown publisher'}, ${f.region}) — ${f.market_signal}`).join('\n');

  try {
    const res = await base44.asServiceRole.integrations.Core.InvokeLLM({
      prompt: `You are the evidence gatekeeper for a food-ingredient trend library.

EXISTING VERIFIED TRENDS in ${String(category).replace(/_/g, ' ')}:
${trendList || '(the library has no active trends in this category yet)'}

NEW WEB FINDINGS:
${findingList}

For EACH finding (by its number) decide exactly one disposition:
- "confirms_trend": it is fresh evidence for an existing trend. Give that trend's id.
- "new_angle": genuinely new market movement, but too thin on its own to be a trend — a candidate to watch.
- "new_signal": a distinct, well-evidenced market movement that no existing trend covers, strong enough to propose as a new trend. Use this sparingly, only when the signal is clearly substantial and repeated.
- "noise": advertising, thin content, off-topic, or not a market signal.

Be conservative: prefer confirms_trend over new_signal whenever an existing trend plausibly covers the movement.
For new_signal, also propose a short trend_name (max 8 words, outside-in, no supplier or ingredient names).

ALSO set is_competitor_content=true for any finding that is trend, marketing or thought-leadership material PUBLISHED BY a competing ingredient supplier (${COMPETITOR_SUPPLIERS}, or any comparable ingredient/flavour/emulsifier supplier). That is inside-out sales collateral, not a market signal: it is kept for competitive awareness only and must never enter the trend taxonomy. A news article merely MENTIONING such a company is NOT competitor content — only material the supplier itself published. When is_competitor_content is true, still give your best disposition, but it will be filed separately regardless.`,
      model: 'claude_sonnet_4_6',
      response_json_schema: {
        type: 'object',
        properties: {
          decisions: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                index: { type: 'number' },
                disposition: { type: 'string' },
                is_competitor_content: { type: 'boolean' },
                trend_id: { type: 'string' },
                proposed_trend_name: { type: 'string' },
                reasoning: { type: 'string' },
              },
            },
          },
        },
      },
    });

    const byIndex = {};
    for (const d of res?.decisions || []) {
      const i = Number(d.index) - 1;
      if (i < 0 || i >= findings.length) continue;
      byIndex[i] = d;
    }
    return findings.map((f, i) => {
      const d = byIndex[i] || {};
      const disposition = pick(d.disposition, ['confirms_trend', 'new_angle', 'new_signal', 'noise'], 'new_angle');
      const trend = trends.find(t => t.id === d.trend_id);
      return {
        ...f,
        disposition,
        is_competitor_content: d.is_competitor_content === true,
        linked_trend_id: disposition === 'confirms_trend' && trend ? trend.id : '',
        linked_trend_name: disposition === 'confirms_trend' && trend ? trend.trend_name : '',
        proposed_trend_name: String(d.proposed_trend_name || '').slice(0, 120),
        disposition_reasoning: String(d.reasoning || '').slice(0, 600),
      };
    });
  } catch {
    return findings.map(f => ({ ...f, disposition: 'new_angle', is_competitor_content: false, linked_trend_id: '', linked_trend_name: '', proposed_trend_name: '', disposition_reasoning: 'Cross-check unavailable — filed as a candidate for manual review.' }));
  }
}

/**
 * Persist classified findings. Nothing is auto-approved:
 *   confirms_trend -> pending citation appended to GlobalTrend.sources
 *   new_signal     -> new GlobalTrend with is_active=false
 *   new_angle      -> EmergingSignalCluster candidate
 * All findings (except noise) are stored as WebSignal records for report enrichment.
 */
export async function persistFindings(base44, { classified, category, runId }) {
  const now = new Date().toISOString();
  const summary = { stored: 0, trend_citations: 0, trend_proposals: 0, candidates: 0, noise: 0, duplicates: 0, competitor_content: 0, echoes_merged: 0 };

  // Dedup against what the scout already knows.
  const existing = await base44.asServiceRole.entities.WebSignal.filter({ category }, '-created_date', 500);
  const knownUrls = new Set(existing.map(s => normalizeUrl(s.url)).filter(Boolean));
  // Echo index: normalized title -> the stored record that owns that story.
  const byTitle = {};
  for (const s of existing) {
    const key = normalizeTitle(s.title);
    if (key && !byTitle[key]) byTitle[key] = s;
  }
  const echoUpdates = {}; // record id -> { record, outlets }

  const trendCitations = {}; // trend_id -> citations to append
  const toStore = [];
  const newTrends = [];
  const candidates = [];

  for (const f of classified) {
    if (f.disposition === 'noise') { summary.noise += 1; continue; }
    const urlKey = normalizeUrl(f.url);
    const titleKey = normalizeTitle(f.title);
    if (urlKey && knownUrls.has(urlKey)) { summary.duplicates += 1; continue; }

    // Echo: the same story already on file from another outlet. Count the outlet,
    // never store a second record — republication is not breadth of evidence.
    const owner = titleKey ? byTitle[titleKey] : null;
    if (owner) {
      if (urlKey) knownUrls.add(urlKey);
      if (owner.id) {
        if (!echoUpdates[owner.id]) echoUpdates[owner.id] = { record: owner, outlets: [] };
        echoUpdates[owner.id].outlets.push({ publisher: f.publisher || '', url: f.url || '' });
      }
      summary.echoes_merged += 1;
      continue;
    }
    if (urlKey) knownUrls.add(urlKey);

    const isCompetitor = f.is_competitor_content === true;
    if (isCompetitor) summary.competitor_content += 1;

    const stored = {
      title: f.title,
      url: f.url,
      publisher: f.publisher,
      published_date: f.published_date,
      market_signal: f.market_signal,
      key_quote: f.key_quote,
      category,
      region: f.region,
      angle: f.discovered_via_query.split('·')[1]?.trim() || 'other',
      source_kind: isCompetitor ? 'competitor' : f.source_kind,
      signal_type: f.signal_type,
      relevance_score: f.relevance_score,
      disposition: f.disposition,
      linked_trend_id: isCompetitor ? '' : f.linked_trend_id,
      linked_trend_name: isCompetitor ? '' : f.linked_trend_name,
      disposition_reasoning: f.disposition_reasoning,
      discovered_via_query: f.discovered_via_query,
      is_competitor_content: isCompetitor,
      carried_by_count: 1,
      echo_outlets: [],
      run_id: runId || '',
      discovered_at: now,
      review_status: 'pending',
    };
    toStore.push(stored);
    if (titleKey) byTitle[titleKey] = { ...stored, id: null };

    // Competitor collateral is stored for awareness only — it never becomes a
    // trend citation, a proposed trend or a candidate cluster.
    if (isCompetitor) {
      continue;
    }

    if (f.disposition === 'confirms_trend' && f.linked_trend_id) {
      if (!trendCitations[f.linked_trend_id]) trendCitations[f.linked_trend_id] = [];
      trendCitations[f.linked_trend_id].push({
        title: f.title,
        publisher: f.publisher || '',
        source_type: 'web_article',
        url: f.url || '',
        key_finding: f.market_signal,
        quote: f.key_quote || '',
        auto_linked: true,
        review_status: 'pending',
        link_confidence: f.relevance_score >= 70 ? 'high' : f.relevance_score >= 45 ? 'medium' : 'low',
        confidence_score: f.relevance_score,
        confidence_reasoning: f.disposition_reasoning,
        linked_via_run_id: runId || '',
      });
    } else if (f.disposition === 'new_signal' && f.proposed_trend_name) {
      newTrends.push(f);
    } else {
      candidates.push(f);
    }
  }

  if (toStore.length > 0) {
    await base44.asServiceRole.entities.WebSignal.bulkCreate(toStore);
    summary.stored = toStore.length;
  }

  // Record the echo: one story, several outlets.
  for (const { record, outlets } of Object.values(echoUpdates)) {
    try {
      const have = new Set((record.echo_outlets || []).map(o => normalizeUrl(o.url)).filter(Boolean));
      const fresh = outlets.filter(o => !o.url || !have.has(normalizeUrl(o.url)));
      if (fresh.length === 0) continue;
      await base44.asServiceRole.entities.WebSignal.update(record.id, {
        echo_outlets: [...(record.echo_outlets || []), ...fresh],
        carried_by_count: (record.carried_by_count || 1) + fresh.length,
      });
    } catch { /* skip */ }
  }

  // Append pending citations to the trends they support.
  for (const [trendId, citations] of Object.entries(trendCitations)) {
    try {
      const trend = await base44.asServiceRole.entities.GlobalTrend.get(trendId);
      if (!trend) continue;
      const have = new Set((trend.sources || []).map(s => normalizeUrl(s.url)).filter(Boolean));
      const fresh = citations.filter(c => !c.url || !have.has(normalizeUrl(c.url)));
      if (fresh.length === 0) continue;
      await base44.asServiceRole.entities.GlobalTrend.update(trendId, {
        sources: [...(trend.sources || []), ...fresh],
      });
      summary.trend_citations += fresh.length;
    } catch { /* skip this trend */ }
  }

  // Propose new trends — never active, always awaiting human approval.
  for (const f of newTrends.slice(0, 3)) {
    try {
      await base44.asServiceRole.entities.GlobalTrend.create({
        trend_name: f.proposed_trend_name,
        category,
        description: f.market_signal,
        market_signal: f.market_signal,
        why_now: f.disposition_reasoning,
        confidence: f.relevance_score >= 70 ? 'medium' : 'low',
        is_active: false,
        regional_manifestations: f.region && f.region !== 'Global' ? [{
          region: f.region,
          signal: f.market_signal,
          intensity: 'emerging',
        }] : [],
        sources: [{
          title: f.title,
          publisher: f.publisher || '',
          source_type: 'web_article',
          url: f.url || '',
          key_finding: f.market_signal,
          quote: f.key_quote || '',
          auto_linked: true,
          review_status: 'pending',
          link_confidence: 'medium',
          linked_via_run_id: runId || '',
        }],
      });
      summary.trend_proposals += 1;
    } catch { /* skip */ }
  }

  // Candidate pool entries for angles not yet mature enough to be trends.
  for (const f of candidates.slice(0, 8)) {
    try {
      await base44.asServiceRole.entities.EmergingSignalCluster.create({
        theme_short_label: (f.proposed_trend_name || f.title).slice(0, 80),
        theme_description: f.market_signal,
        category,
        signal_type: f.signal_type,
        gnpd_evidence_strength: 'none',
        gnpd_reasoning: 'Discovered on the open web by market_scout — no GNPD launch evidence attached yet.',
        source_diversity_count: 1,
        publisher_diversity_count: f.publisher ? 1 : 0,
        distance_from_existing_note: f.disposition_reasoning,
        status: 'emerging',
        detected_in_run_id: runId || '',
        detected_at: now,
      });
      summary.candidates += 1;
    } catch { /* skip */ }
  }

  return summary;
}