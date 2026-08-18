// Deterministic evidence retrieval for the Report Architect.
//
// Brief constraints are HARD GATES applied BEFORE any narrative is synthesised:
//   1. Region gate  — country allow-list (never region / region_code: Turkey is
//                     stored as 'mena' and would be wrongly excluded by EMEC).
//   2. Category gate — GNPDProduct.sub_category (palsgaard_category has no format
//                     granularity; 'category' is 'bakery' for all bakery records).
//   3. Deduplication — a record may back exactly one trend per report.
//   4. Threshold     — >=3 records = full slide, 1-2 = "Signal", 0 = dropped.
// Records failing a gate never enter the scored pool and are never returned.
//
// DUPLICATED BY DESIGN — COUNTRY_GROUPS / resolveRegionScope are mirrored in
// src/components/briefbeta/regionScope.js (backend functions cannot import from
// src/). Change both together.
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';

const RECENCY_MONTHS = 30;
const PAGE = 500;
const FULL_EVIDENCE_MIN = 3;
const TRENDS_EVALUATED = 8;
// Safety ceiling only. Hitting it is a loud failure, never a silent truncation —
// a pool that is quietly cut is the same defect as a region that is quietly widened.
const SAFETY_CAP = 40000;

const COUNTRY_GROUPS = {
  europe: ['UK', 'Germany', 'France', 'Italy', 'Spain', 'Poland', 'Netherlands', 'Belgium', 'Denmark', 'Sweden', 'Norway', 'Finland', 'Ireland', 'Portugal', 'Austria', 'Switzerland', 'Greece', 'Czech Republic', 'Slovakia', 'Hungary', 'Romania', 'Bulgaria', 'Croatia', 'Slovenia', 'Serbia', 'Estonia', 'Latvia', 'Lithuania', 'Iceland', 'Luxembourg', 'Malta', 'Cyprus', 'Bosnia and Herzegovina', 'North Macedonia', 'Albania', 'Montenegro'],
  turkey: ['Turkey'],
  cis: ['Russia', 'Ukraine', 'Belarus', 'Kazakhstan', 'Uzbekistan', 'Azerbaijan', 'Armenia', 'Georgia', 'Kyrgyzstan', 'Tajikistan', 'Turkmenistan', 'Moldova'],
  aspac: ['China', 'Japan', 'India', 'Indonesia', 'South Korea', 'Australia', 'Thailand', 'Vietnam', 'Malaysia', 'Philippines', 'Singapore', 'Taiwan, China', 'Hong Kong, China', 'New Zealand', 'Sri Lanka', 'Bangladesh', 'Myanmar', 'Cambodia', 'Laos', 'Pakistan'],
  americas: ['USA', 'Canada', 'Mexico', 'Brazil', 'Argentina', 'Chile', 'Colombia', 'Peru', 'Ecuador', 'Guatemala', 'Costa Rica', 'Venezuela', 'Puerto Rico', 'Panama'],
  imea: ['UAE', 'Saudi Arabia', 'Kuwait', 'Qatar', 'Oman', 'Jordan', 'Lebanon', 'Israel', 'Egypt', 'Morocco', 'Algeria', 'Tunisia', 'South Africa'],
};

// WebSignal.region is a coarse 4-value commercial enum, so the brief's country
// allow-list is collapsed to those codes purely to gate web signals. Never used for
// product evidence — products are gated on country.
const GROUP_TO_REGION_CODE = {
  europe: 'EMEC', turkey: 'EMEC', cis: 'EMEC',
  aspac: 'ASPAC', americas: 'AMERICAS', imea: 'IMEA', named_countries: 'Global',
};

const REGION_TERMS = [
  { match: /\b(cis|commonwealth of independent states)\b/i, groups: ['cis'] },
  { match: /\b(turkey|türkiye|turkiye)\b/i, groups: ['turkey'] },
  { match: /\b(europe|european|eu|emea)\b/i, groups: ['europe'] },
  { match: /\bemec\b/i, groups: ['europe', 'turkey', 'cis'] },
  { match: /\b(aspac|apac|asia[- ]?pacific|asia)\b/i, groups: ['aspac'] },
  { match: /\b(americas|america|latam|north america)\b/i, groups: ['americas'] },
  { match: /\b(imea|middle east|africa|mena)\b/i, groups: ['imea'] },
];

function resolveRegionScope(text) {
  const raw = String(text || '').trim();
  if (!raw) return { ok: false, error: 'No region was given. Name the markets in scope or state global scope explicitly.' };
  if (/\bglobal(ly)?\b|\bworldwide\b|\ball regions\b/i.test(raw)) {
    return { ok: true, region_text: raw, scope: 'global', countries: [], subregions: {} };
  }
  const groups = [];
  for (const t of REGION_TERMS) if (t.match.test(raw)) for (const g of t.groups) if (!groups.includes(g)) groups.push(g);
  const all = Object.values(COUNTRY_GROUPS).flat();
  const named = all.filter(c => new RegExp(`\\b${c.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i').test(raw));
  if (groups.length === 0 && named.length === 0) {
    return { ok: false, error: `The region "${raw}" could not be resolved to known markets. Restate it using region names, named countries, or state global scope explicitly.` };
  }
  const subregions = {};
  for (const g of groups) subregions[g] = COUNTRY_GROUPS[g];
  const loose = named.filter(c => !groups.some(g => COUNTRY_GROUPS[g].includes(c)));
  if (loose.length) subregions.named_countries = loose;
  return { ok: true, region_text: raw, scope: 'countries', countries: [...new Set(Object.values(subregions).flat())], subregions };
}

function productText(p) {
  return [
    p.product_name, p.brand, p.company, p.product_description,
    p.sub_category, p.format_type,
    ...(Array.isArray(p.claims) ? p.claims : []),
    ...(Array.isArray(p.flavours) ? p.flavours : []),
  ].filter(Boolean).join(' ').toLowerCase();
}

// Stable pagination. '-launch_date' is NOT a unique ordering: many records share a
// launch date, so skip-based paging over it overlapped and skipped pages — a pool
// that both double-counted and dropped rows. 'id' is unique, so the order is total
// and every page is disjoint. Recency is applied in JS afterwards, so nothing
// depends on launch-date ordering here.
// Returns { rows, duplicates } — rows are id-unique; duplicates is a defect counter
// that must stay 0.
async function paginate(base44, query) {
  const seen = new Set();
  const rows = [];
  let duplicates = 0;
  let skip = 0;
  while (true) {
    const page = await base44.asServiceRole.entities.GNPDProduct.filter(query, 'id', PAGE, skip);
    if (!page || page.length === 0) break;
    for (const r of page) {
      if (seen.has(r.id)) { duplicates++; continue; }
      seen.add(r.id);
      rows.push(r);
    }
    skip += page.length;
    if (page.length < PAGE) break;
    if (rows.length >= SAFETY_CAP) {
      throw new Error(`pool_cap_exceeded: more than ${SAFETY_CAP} records matched ${JSON.stringify(query)}. The pool was NOT truncated silently — narrow the brief or raise the ceiling deliberately.`);
    }
  }
  return { rows, duplicates };
}

// Counts a query without holding the rows. Same stable ordering.
async function countRows(base44, query) {
  const seen = new Set();
  let skip = 0;
  while (true) {
    const page = await base44.asServiceRole.entities.GNPDProduct.filter(query, 'id', PAGE, skip);
    if (!page || page.length === 0) break;
    for (const r of page) seen.add(r.id);
    skip += page.length;
    if (page.length < PAGE) break;
    if (seen.size >= SAFETY_CAP) throw new Error(`count_cap_exceeded: ${JSON.stringify(query)}`);
  }
  return seen.size;
}

export default async function (req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json();
    const { categories, region_text, sub_categories, test_pool } = body;
    const cats = (Array.isArray(categories) ? categories : [categories]).filter(Boolean).slice(0, 3);
    if (cats.length === 0) return Response.json({ error: 'categories is required' }, { status: 400 });

    // ── Region gate resolution — fails loudly, never falls back to Global ──
    const scope = resolveRegionScope(region_text);
    if (!scope.ok) return Response.json({ error: 'region_unresolved', message: scope.error }, { status: 400 });
    const allowed = new Set(scope.countries);
    const inRegion = p => scope.scope === 'global' || allowed.has(String(p.country || '').trim());

    const subs = (Array.isArray(sub_categories) ? sub_categories : []).filter(Boolean);
    const inCategory = p => subs.length === 0 || subs.includes(String(p.sub_category || '').trim());

    const cutoff = new Date();
    cutoff.setMonth(cutoff.getMonth() - RECENCY_MONTHS);

    const trendsOut = [];
    const sourcesById = {};
    const productsById = {};
    const exclusions = [];
    // Sequential funnel. Every step is counted on the base that enters it, so
    // population − out_of_region = after_region_gate, and so on. Secondary figures
    // live in secondary_counts and are never comparable to the funnel steps.
    const gate = {
      region_text: scope.region_text || region_text || '',
      region_scope: scope.scope,
      country_allow_list: scope.countries,
      sub_categories: subs,
      recency_months: RECENCY_MONTHS,
      population_total: 0,
      after_region_gate: 0,
      after_category_gate: 0,
      after_recency_gate: 0,
      per_subregion_counts: {},
      // Phase 2 — what actually reached the deck, which is NOT the same as what was
      // eligible. "0 eligible" and "eligible but nothing matched a trend" are two
      // different facts about a market and are reported as two different statements.
      rendered_by_country: {},
      rendered_per_subregion: {},
      subregion_diagnosis: [],
      web_signal_gate: { before_region_filter: 0, after_region_filter: 0, excluded_out_of_region: 0, kept_with_scope_label: 0 },
      excluded_by_reason: { out_of_region: 0, out_of_category: 0, out_of_window: 0 },
      secondary_counts: {},
      trend_truncation: [],
      // The actual launch-date span of the pool that reached matching. Distinct from
      // recency_months: the window says what was ALLOWED in, this says what is
      // ACTUALLY there. A pool spanning one period cannot evidence change over time,
      // however wide the window is.
      data_window: { earliest_launch: null, latest_launch: null, months_spanned: 0 },
      pagination_duplicates_dropped: 0,
      dropped_trends: [],
      downgraded_trends: [],
    };
    for (const key of Object.keys(scope.subregions || {})) gate.per_subregion_counts[key] = 0;

    for (const category of cats) {
      // Region-gated pool (country filter only — region/region_code are too coarse).
      let regionPass;
      if (Array.isArray(test_pool)) {
        gate.population_total += test_pool.length;
        regionPass = test_pool.filter(inRegion);
        const regionFail = test_pool.filter(p => !inRegion(p));
        gate.excluded_by_reason.out_of_region += regionFail.length;
        for (const p of regionFail) {
          exclusions.push({ gnpd_record_id: p.gnpd_record_id, country: p.country, sub_category: p.sub_category, reason: 'out_of_region' });
        }
      } else {
        // Step 1 — region gate, counted against the full category population.
        const pool = await paginate(base44, scope.scope === 'global'
          ? { palsgaard_category: category }
          : { palsgaard_category: category, country: { $in: scope.countries } });
        gate.pagination_duplicates_dropped += pool.duplicates;
        regionPass = pool.rows;

        const population = scope.scope === 'global'
          ? regionPass.length
          : await countRows(base44, { palsgaard_category: category });
        gate.population_total += population;
        gate.excluded_by_reason.out_of_region += population - regionPass.length;

        if (scope.scope !== 'global') {
          const sample = await base44.asServiceRole.entities.GNPDProduct.filter(
            subs.length > 0
              ? { palsgaard_category: category, sub_category: { $in: subs }, country: { $nin: scope.countries } }
              : { palsgaard_category: category, country: { $nin: scope.countries } },
            'id', 20, 0
          );
          for (const p of sample) {
            exclusions.push({ gnpd_record_id: p.gnpd_record_id, country: p.country, sub_category: p.sub_category, reason: 'out_of_region' });
          }
        }

        // SECONDARY figure — answers "how much would read-across bring in?".
        // Deliberately kept out of the funnel: it is not complementary to any step.
        if (subs.length > 0 && scope.scope !== 'global') {
          const readAcross = await countRows(base44, {
            palsgaard_category: category, sub_category: { $in: subs }, country: { $nin: scope.countries },
          });
          const label = `${subs.join(' / ')} records outside the region allow-list (read-across potential, NOT part of the funnel)`;
          gate.secondary_counts[label] = (gate.secondary_counts[label] || 0) + readAcross;
        }
      }
      gate.after_region_gate += regionPass.length;

      const eligible = regionPass.filter(inCategory);
      const catFail = regionPass.filter(p => !inCategory(p));
      gate.excluded_by_reason.out_of_category += catFail.length;
      for (const p of catFail.slice(0, 50)) {
        exclusions.push({ gnpd_record_id: p.gnpd_record_id, country: p.country, sub_category: p.sub_category, reason: 'out_of_category' });
      }
      gate.after_category_gate += eligible.length;

      // Step 3 — recency gate. Applied ALWAYS: no record count reopens the window.
      // A thin pool is a thin-evidence signal and must reach the full/signal_only/
      // dropped mechanic, not quietly widen the window. A record with no launch date
      // cannot be shown to fall inside the window, so it is excluded and logged.
      const inWindow = eligible.filter(p => p.launch_date && new Date(p.launch_date) >= cutoff);
      gate.excluded_by_reason.out_of_window += eligible.length - inWindow.length;
      gate.after_recency_gate += inWindow.length;
      for (const p of eligible.filter(p => !inWindow.includes(p)).slice(0, 20)) {
        exclusions.push({ gnpd_record_id: p.gnpd_record_id, country: p.country, sub_category: p.sub_category, reason: 'out_of_window' });
      }

      for (const [key, list] of Object.entries(scope.subregions || {})) {
        gate.per_subregion_counts[key] += inWindow.filter(p => list.includes(String(p.country || '').trim())).length;
      }

      // Record the real temporal span of the pool, accumulated across categories.
      for (const p of inWindow) {
        const d = String(p.launch_date).slice(0, 10);
        if (!gate.data_window.earliest_launch || d < gate.data_window.earliest_launch) gate.data_window.earliest_launch = d;
        if (!gate.data_window.latest_launch || d > gate.data_window.latest_launch) gate.data_window.latest_launch = d;
      }
      if (gate.data_window.earliest_launch && gate.data_window.latest_launch) {
        const a = new Date(gate.data_window.earliest_launch);
        const b = new Date(gate.data_window.latest_launch);
        gate.data_window.months_spanned = Math.round(((b - a) / (1000 * 60 * 60 * 24 * 30.44)) * 10) / 10;
      }

      // Trend cap kept, but ordered by name — '-updated_date' made inclusion depend
      // on which trend was last edited, so editing trend A could silently remove
      // trend B from a report. The truncation is now logged instead of hidden.
      // Relevance ranking is a separate audit (carried open item).
      const allTrends = await base44.asServiceRole.entities.GlobalTrend.filter({ category, is_active: true }, 'trend_name');
      const trends = allTrends.slice(0, TRENDS_EVALUATED);
      gate.trend_truncation.push({
        category,
        active_total: allTrends.length,
        evaluated: trends.length,
        omitted: Math.max(0, allTrends.length - trends.length),
        omitted_names: allTrends.slice(TRENDS_EVALUATED).map(t => t.trend_name),
      });
      if (trends.length === 0) continue;

      const searchable = inWindow.map(p => ({ p, text: productText(p) }));
      const consumed = new Set(); // Phase 4.2 — one record backs exactly one trend

      for (const t of trends) {
        // --- Sources backing this trend ---
        const sourceIds = [...new Set([
          ...(t.source_references || []),
          ...(t.sources || []).map(s => s.source_id),
        ].filter(Boolean))].slice(0, 12);

        const trendSources = [];
        for (const sid of sourceIds) {
          if (!sourcesById[sid]) {
            try {
              const s = await base44.asServiceRole.entities.Source.get(sid);
              if (!s) continue;
              sourcesById[sid] = {
                id: s.id,
                title: s.title,
                publisher: s.publisher || '',
                date_published: s.date_published || s.date || '',
                source_type: s.source_type,
                key_findings: (s.excerpts || [])
                  .filter(e => e.promotion_status === 'promoted' && e.market_signal)
                  .slice(0, 3)
                  .map(e => e.market_signal),
              };
            } catch { continue; }
          }
          trendSources.push(sourcesById[sid]);
        }
        const inlineCitations = (t.sources || [])
          .filter(s => !s.source_id && (s.title || s.publisher))
          .slice(0, 5)
          .map(s => ({ title: s.title || '', publisher: s.publisher || '', key_finding: s.key_finding || '' }));

        // --- Eligible GNPD products supporting this trend (region is NOT scored) ---
        const keywords = (t.trend_keywords || []).map(k => String(k).toLowerCase()).filter(k => k.length >= 3);
        const scored = [];
        for (const { p, text } of searchable) {
          if (!p.gnpd_record_id || consumed.has(p.gnpd_record_id)) continue;
          const matched = keywords.filter(k => text.includes(k));
          const linked = (p.trend_links || []).some(l => l.trend_id === t.id && l.review_status !== 'rejected');
          if (matched.length === 0 && !linked) continue;
          scored.push({ p, score: matched.length + (linked ? 6 : 0) + (p.image_url ? 1 : 0), matched });
        }
        scored.sort((a, b) => b.score - a.score);
        const picked = scored.slice(0, 10);
        for (const { p } of picked) consumed.add(p.gnpd_record_id);

        const evidenceStatus = picked.length >= FULL_EVIDENCE_MIN ? 'full' : picked.length > 0 ? 'signal_only' : 'dropped';
        if (evidenceStatus === 'dropped') {
          gate.dropped_trends.push({ trend_name: t.trend_name, category, reason: 'no eligible GNPD records after region and category gates' });
          continue;
        }
        if (evidenceStatus === 'signal_only') {
          gate.downgraded_trends.push({ trend_name: t.trend_name, category, record_count: picked.length });
        }

        const trendProducts = picked.map(({ p, matched }) => {
          if (!productsById[p.gnpd_record_id]) {
            productsById[p.gnpd_record_id] = {
              gnpd_record_id: p.gnpd_record_id,
              product_name: p.product_name,
              brand: p.brand || '',
              company: p.company || '',
              country: p.country || '',
              launch_date: p.launch_date || '',
              category: p.palsgaard_category || p.category || '',
              sub_category: p.sub_category || '',
              claims: (p.claims || []).slice(0, 6),
              image_url: p.image_url || '',
              mintel_record_url: p.mintel_record_url || '',
            };
          }
          return { ...productsById[p.gnpd_record_id], matched_keywords: matched.slice(0, 5) };
        });

        trendsOut.push({
          trend_id: t.id,
          trend_name: t.trend_name,
          category: t.category,
          // Observability is honesty about the evidence BASIS, not about strength.
          // A non-observable trend (e.g. cost reformulation — nobody labels a product
          // 'value engineered') can be real and well-sourced while being invisible in
          // product data, so its evidence is narrative and must be labelled as such
          // rather than presented as observed launches.
          product_observable: t.product_observable === true,
          evidence_basis: t.product_observable === true ? 'observed' : 'narrative',
          market_signal: t.market_signal || t.description || '',
          mega_trend: t.mega_trend || '',
          trend_keywords: keywords.slice(0, 10),
          evidence_status: evidenceStatus,
          record_count: picked.length,
          sources: trendSources,
          inline_citations: inlineCitations,
          products: trendProducts,
        });
      }
    }

    // ── Phase 2 — render-level contribution, counted on the products that actually
    // reached the deck (productsById holds exactly the picked records). Eligibility
    // is not contribution: a market can be fully in scope and still contribute nothing.
    for (const p of Object.values(productsById)) {
      const c = String(p.country || '').trim() || 'unknown';
      gate.rendered_by_country[c] = (gate.rendered_by_country[c] || 0) + 1;
    }
    for (const [key, list] of Object.entries(scope.subregions || {})) {
      gate.rendered_per_subregion[key] = Object.entries(gate.rendered_by_country)
        .filter(([c]) => list.includes(c))
        .reduce((n, [, v]) => n + v, 0);
    }
    for (const [key, eligible] of Object.entries(gate.per_subregion_counts || {})) {
      const rendered = gate.rendered_per_subregion[key] || 0;
      gate.subregion_diagnosis.push({
        subregion: key,
        eligible,
        rendered,
        // Deliberately distinct wordings — conflating them hides which problem it is.
        kind: eligible === 0 ? 'no_data' : rendered === 0 ? 'no_trend_match' : 'contributed',
      });
    }

    // Phase 4.3 — pool exhaustion is a valid outcome, never a reason to widen gates.
    if (!trendsOut.some(t => t.evidence_status === 'full')) {
      return Response.json({
        success: false,
        result: 'insufficient_regional_evidence',
        message: `No trend cleared the ${FULL_EVIDENCE_MIN}-record minimum after the region and category gates. The gates are not widened automatically.`,
        gate,
        exclusions: exclusions.slice(0, 100),
      });
    }

    // --- Fresh web signals (supplementary, clearly separated) ---
    const webCutoff = new Date();
    webCutoff.setDate(webCutoff.getDate() - 120);
    // Phase 4 — web signals pass the SAME region gate as product evidence. A signal
    // about another region is not regional evidence, and a signal whose region cannot
    // be determined may only travel with an explicit scope label.
    const briefCodes = new Set(
      scope.scope === 'global'
        ? ['EMEC', 'ASPAC', 'AMERICAS', 'IMEA', 'Global']
        : Object.keys(scope.subregions || {}).map(g => GROUP_TO_REGION_CODE[g]).filter(Boolean)
    );
    const webSignals = [];
    if (!Array.isArray(test_pool)) {
      for (const category of cats) {
        const signals = await base44.asServiceRole.entities.WebSignal.filter({ category }, '-created_date', 60);
        const usable = signals
          .filter(s => s.review_status !== 'rejected')
          .filter(s => s.is_competitor_content !== true)
          .filter(s => !s.discovered_at || new Date(s.discovered_at) >= webCutoff)
          .sort((a, b) => (b.relevance_score || 0) - (a.relevance_score || 0))
          .slice(0, 8);
        gate.web_signal_gate.before_region_filter += usable.length;
        for (const s of usable) {
          const sigRegion = String(s.region || '').trim();
          const undetermined = !sigRegion || sigRegion === 'Global';
          if (!undetermined && !briefCodes.has(sigRegion) && scope.scope !== 'global') {
            gate.web_signal_gate.excluded_out_of_region++;
            continue;
          }
          if (undetermined) gate.web_signal_gate.kept_with_scope_label++;
          webSignals.push({
            title: s.title, publisher: s.publisher || '', url: s.url || '',
            published_date: s.published_date || '', category: s.category,
            region: sigRegion || 'Global', market_signal: s.market_signal,
            key_quote: s.key_quote || '', linked_trend_name: s.linked_trend_name || '',
            relevance_score: s.relevance_score || 0,
            // Carried into the prompt so an unscoped signal can never be presented
            // as regional evidence.
            scope_label: undetermined
              ? '(Note: source region could not be determined — not regional evidence for this brief)'
              : '',
          });
        }
        gate.web_signal_gate.after_region_filter = webSignals.length;
      }
    }

    return Response.json({
      success: true,
      gate,
      exclusions: exclusions.slice(0, 100),
      trends: trendsOut,
      web_signals: webSignals,
      source_ids: Object.keys(sourcesById),
      products: Object.values(productsById),
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}