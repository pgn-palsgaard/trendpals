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
// Region taxonomy lives in ../../shared/regionTaxonomy.ts (single backend copy).
// The frontend mirror is src/components/briefbeta/regionScope.js (backend
// functions cannot import from src/). Change both together.
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';
import { resolveAllowList } from '../../shared/regionTaxonomy.ts';

const RECENCY_MONTHS = 30;
const PAGE = 500;
const FULL_EVIDENCE_MIN = 3;
const TRENDS_EVALUATED = 8;
// Deterministic selection. Evidence strength is the RANKING; the driver cap is a
// CEILING applied afterwards — an over-cap trend is deferred to the back of the
// order, never dropped, so the cap can never force a weaker trend into the deck.
const DRIVER_CAP = 2;
// The deck's trend count is bound to the top N of the fixed order. The architect
// has no freedom to pick how many, or to skip one.
// Ceiling, not a quota: only FULL-evidence trends can take a core slot, so a
// position can never be padded by a trend that lost its records in allocation.
const DECK_MAX_TRENDS = 5;
// Floor. Below this the analyst is warned instead of the deck being filled out —
// thin evidence must look thin.
const DECK_FULL_MIN = 3;
// Signal-only trends live outside the core count: at most one, always last, under
// the existing signal divider. One record must not buy a place in the body.
const DECK_MAX_SIGNALS = 1;
// Safety ceiling only. Hitting it is a loud failure, never a silent truncation —
// a pool that is quietly cut is the same defect as a region that is quietly widened.
const SAFETY_CAP = 40000;

// WebSignal.region is a coarse 4-value commercial enum, so the brief's country
// allow-list is collapsed to those codes purely to gate web signals. Never used for
// product evidence — products are gated on country.
const GROUP_TO_REGION_CODE = {
  europe: 'EMEC', turkey: 'EMEC', cis: 'EMEC', aspac: 'ASPAC',
  latam: 'AMERICAS', north_america: 'AMERICAS', americas: 'AMERICAS',
  imea: 'IMEA', named_countries: 'Global',
};

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
    // Build C — read-across is OPT-IN. Anything other than the explicit
    // 'labelled_read_across' contract value means strict region: no cross-region
    // retrieval happens at all.
    const readAcrossOptIn = String(body.read_across || '') === 'labelled_read_across';
    const cats = (Array.isArray(categories) ? categories : [categories]).filter(Boolean).slice(0, 3);
    if (cats.length === 0) return Response.json({ error: 'categories is required' }, { status: 400 });

    // ── Region gate resolution — fails loudly, never falls back to Global ──
    // excluded_countries is an explicit, fail-closed data field: subtracted from
    // the allow-list AFTER all other resolution, never inferred from free text.
    const excludedCountries = (Array.isArray(body.excluded_countries) ? body.excluded_countries : [])
      .map(c => String(c).trim()).filter(Boolean);
    const resolved = resolveAllowList(region_text, excludedCountries);
    if (resolved.scope !== 'global' && resolved.countries.length === 0) {
      return Response.json({
        error: 'region_unresolved',
        message: `The region "${String(region_text || '').trim()}" could not be resolved to known markets (or every resolved market was excluded). Restate it using region names (Europe, Turkey, CIS, ASPAC, LATAM, North America, Americas, IMEA), named countries, or state global scope explicitly.`,
        resolution_log: resolved.resolution_log,
      }, { status: 400 });
    }
    const scope = {
      region_text: String(region_text || '').trim(),
      scope: resolved.scope === 'global' ? 'global' : 'countries',
      countries: resolved.countries,
      subregions: resolved.subregions,
    };
    // Country matching is case-insensitive: 'USA' in the database matches 'usa'
    // in the taxonomy or in an exclusion list.
    const allowedLc = new Set(scope.countries.map(c => c.toLowerCase()));
    const excludedLc = new Set(excludedCountries.map(c => c.toLowerCase()));
    const inRegion = p => {
      const c = String(p.country || '').trim().toLowerCase();
      if (excludedLc.has(c)) return false;
      return scope.scope === 'global' ? true : allowedLc.has(c);
    };

    // Placeholder values mean "no format restriction", never a literal Mintel
    // sub-category. Left un-normalised they are matched verbatim against
    // sub_category and silently empty the pool (region gate 11421 -> format gate 0).
    const SUB_CATEGORY_PLACEHOLDERS = new Set([
      'all', 'all formats', 'all format', 'all sub-categories', 'all subcategories',
      'all categories', 'any', 'any format', 'alle', 'alle formater', 'n/a', 'none',
    ]);
    const subs = (Array.isArray(sub_categories) ? sub_categories : [])
      .filter(Boolean)
      .map(s => String(s).trim())
      .filter(s => s && !SUB_CATEGORY_PLACEHOLDERS.has(s.toLowerCase()));
    // The brief states formats in plain language ('yogurt', 'cream', 'chocolate'),
    // while GNPD carries full Mintel sub-category labels ('Spoonable Yogurt',
    // 'Creamers', 'Chocolate Tablets'). Exact equality therefore emptied the pool on
    // every brief that named a format (region gate 5931 -> format gate 0). Matching
    // is normalised and containment-based in both directions, so a stated format
    // resolves to the sub-categories it names — and anything that resolves to
    // nothing is recorded in gate.format_resolution rather than silently dropped.
    const normFormat = s => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
    const subsNorm = subs.map(normFormat).filter(Boolean);
    const matchedFormatTerms = new Set();
    const matchedSubCats = new Set();
    const inCategory = p => {
      if (subsNorm.length === 0) return true;
      const n = normFormat(p.sub_category);
      if (!n) return false;
      let hit = false;
      subsNorm.forEach((q, i) => {
        if (n.includes(q) || q.includes(n)) { hit = true; matchedFormatTerms.add(subs[i]); }
      });
      if (hit) matchedSubCats.add(String(p.sub_category || '').trim());
      return hit;
    };

    const cutoff = new Date();
    cutoff.setMonth(cutoff.getMonth() - RECENCY_MONTHS);

    const trendsOut = [];
    const sourcesById = {};
    const productsById = {};
    // Build C — cross-region records live in their OWN flat set. Kept apart from
    // productsById so nothing regional can be contaminated, and returned at top
    // level so save-time resolution, the shortlist and pack shots can find them.
    const readAcrossById = {};
    const exclusions = [];
    // Sequential funnel. Every step is counted on the base that enters it, so
    // population − out_of_region = after_region_gate, and so on. Secondary figures
    // live in secondary_counts and are never comparable to the funnel steps.
    const gate = {
      region_text: scope.region_text || region_text || '',
      region_scope: scope.scope,
      country_allow_list: scope.countries,
      excluded_countries: excludedCountries,
      resolution_log: resolved.resolution_log,
      sub_categories: subs,
      // How the stated formats resolved against the real Mintel sub-categories. A
      // term that resolves to nothing is a brief/data mismatch and must be visible.
      format_resolution: { requested: subs, matched_terms: [], unmatched_terms: [], matched_sub_categories: [] },
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
      // Build C — cross-region evidence, counted SEPARATELY. Never folded into the
      // funnel or into rendered_by_country: a launch in another market is not
      // regional coverage, however useful it is as reference.
      read_across: {
        requested: readAcrossOptIn,
        total_records: 0,
        by_country: {},
        per_trend: [],
        rendered_by_country: {},
      },
      trend_truncation: [],
      // Selection audit. deck_trend_count binds the slide count; trend_ranking is the
      // pass-1 ranking basis; allocation_losses records trends that ranked on raw
      // matches but lost records to a stronger trend during exclusive allocation —
      // correct behaviour, but it must be visible or it reads as a bug.
      deck_max_trends: DECK_MAX_TRENDS,
      deck_full_min: DECK_FULL_MIN,
      deck_selection: [],
      thin_evidence_warning: null,
      driver_cap: DRIVER_CAP,
      trend_ranking: [],
      allocation_losses: [],
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

    // Build B (narrative) — fixed driver order. Trends are still SELECTED
    // alphabetically (relevance ranking is the carried open item), but the
    // evaluated set is GROUPED by primary driver in MegaTrend display order, so
    // the evidence block — and therefore the deck — reads driver by driver,
    // never A-to-Z.
    const driverOrder: Record<string, number> = {};
    try {
      const megas = await base44.asServiceRole.entities.MegaTrend.list('display_order');
      megas.forEach((m, i) => {
        const k = String(m.mega_trend_name || '').toLowerCase();
        if (k) driverOrder[k] = typeof m.display_order === 'number' ? m.display_order : i;
      });
    } catch { /* no drivers on record — alphabetical order stands */ }

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
          ? (excludedCountries.length > 0
              ? { palsgaard_category: category, country: { $nin: excludedCountries } }
              : { palsgaard_category: category })
          : { palsgaard_category: category, country: { $in: scope.countries } });
        gate.pagination_duplicates_dropped += pool.duplicates;
        // inRegion re-applied in JS: a no-op for regional scope (same list as the
        // $in query, case-insensitive), and for global scope it enforces the
        // exclusion list case-insensitively where $nin is exact-case only.
        regionPass = pool.rows.filter(inRegion);

        const population = scope.scope === 'global'
          ? pool.rows.length
          : await countRows(base44, { palsgaard_category: category });
        gate.population_total += population;
        gate.excluded_by_reason.out_of_region += population - regionPass.length;

        if (scope.scope !== 'global') {
          // No sub_category filter here: stated formats are resolved in JS (they are
          // plain-language terms, not literal Mintel labels), so a database-level
          // $in on them matches nothing.
          const sample = await base44.asServiceRole.entities.GNPDProduct.filter(
            { palsgaard_category: category, country: { $nin: scope.countries } },
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
            palsgaard_category: category, country: { $nin: scope.countries },
          });
          const label = `${category} records outside the region allow-list, all formats (read-across potential, NOT part of the funnel)`;
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
      // Group the evaluated set by primary driver (fixed MegaTrend order), name
      // second. Selection above is unchanged — this orders, it never picks.
      const driverRank = (t) => {
        const k = String(t.mega_trend || '').toLowerCase();
        return k in driverOrder ? driverOrder[k] : 999;
      };
      trends.sort((a, b) => driverRank(a) - driverRank(b)
        || String(a.trend_name).localeCompare(String(b.trend_name)));
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

      // ── PASS 1 — raw match counts, WITHOUT exclusivity ──
      // Exclusive allocation depends on the order, and the order depends on record
      // counts: it cannot run in one pass. So counting is done first on the open pool
      // (the same record may count for several trends) and is used only to rank.
      const keywordsFor = (t) => (t.trend_keywords || []).map(k => String(k).toLowerCase()).filter(k => k.length >= 3);
      const rawMatches = new Map();
      for (const t of trends) {
        const kws = keywordsFor(t);
        let raw = 0;
        for (const { p, text } of searchable) {
          if (!p.gnpd_record_id) continue;
          const matched = kws.some(k => text.includes(k));
          const linked = (p.trend_links || []).some(l => l.trend_id === t.id && l.review_status !== 'rejected');
          if (matched || linked) raw++;
        }
        rawMatches.set(t.id, raw);
      }
      // Sources are a TIEBREAKER only. Source volume measures how much has been
      // uploaded about a topic, not how much the market is moving.
      const sourceWeight = (t) => new Set([
        ...(t.source_references || []),
        ...(t.sources || []).map(s => s.source_id),
      ].filter(Boolean)).size + (t.sources || []).filter(s => !s.source_id).length;
      const rawTier = (n) => (n >= FULL_EVIDENCE_MIN ? 0 : n > 0 ? 1 : 2);
      const ranked = [...trends].sort((a, b) => {
        const ra = rawMatches.get(a.id) || 0, rb = rawMatches.get(b.id) || 0;
        return rawTier(ra) - rawTier(rb)
          || rb - ra
          || sourceWeight(b) - sourceWeight(a)
          || String(a.trend_name).localeCompare(String(b.trend_name));
      });
      // Driver cap as a CEILING: over-cap trends move to the back of the order, so
      // spread is achieved while evidence still wins whenever the deck needs filling.
      const perDriver = {};
      const capped = [], deferred = [];
      for (const t of ranked) {
        const k = String(t.mega_trend || '').toLowerCase() || 'unassigned';
        perDriver[k] = (perDriver[k] || 0) + 1;
        (perDriver[k] <= DRIVER_CAP ? capped : deferred).push(t);
      }
      const ordered = [...capped, ...deferred];
      ordered.forEach((t, i) => gate.trend_ranking.push({
        rank: i + 1,
        trend_name: t.trend_name,
        category,
        driver: t.mega_trend || 'unassigned',
        raw_matches: rawMatches.get(t.id) || 0,
        source_weight: sourceWeight(t),
        deferred_by_driver_cap: deferred.includes(t),
      }));

      // Build C — the out-of-region pool for this category, fetched at most once and
      // only when read-across was opted into. Rows, not counts (secondary_counts is
      // a count and holds nothing). The sub_category filter is applied only when the
      // brief HAS a format scope: a brief without one must still get read-across.
      let readAcrossPool = null;
      async function getReadAcrossPool() {
        if (readAcrossPool) return readAcrossPool;
        let rows;
        if (Array.isArray(test_pool)) {
          rows = test_pool.filter(p => !inRegion(p));
        } else if (scope.scope === 'global') {
          rows = []; // a global brief has no "outside the region"
        } else {
          // Format scope is applied by inCategory below, not in the query — the
          // stated formats are plain-language terms, not literal Mintel labels.
          const res = await paginate(base44, { palsgaard_category: category, country: { $nin: scope.countries } });
          gate.pagination_duplicates_dropped += res.duplicates;
          rows = res.rows;
        }
        readAcrossPool = rows
          // Exclusions bind here exactly as they bind regionally, case-insensitively
          // ($nin is exact-case only), and an in-region country can never enter this
          // pool — belt behind the $nin.
          .filter(p => {
            const c = String(p.country || '').trim().toLowerCase();
            return c && !excludedLc.has(c) && !allowedLc.has(c);
          })
          .filter(inCategory)
          // Same recency gate as regional: no launch date = cannot be shown to be
          // inside the window = excluded.
          .filter(p => p.launch_date && new Date(p.launch_date) >= cutoff)
          .map(p => ({ p, text: productText(p) }));
        return readAcrossPool;
      }

      // ── PASS 2 — exclusive allocation in the now-fixed order ──
      for (const t of ordered) {
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
        // Inline citations are objects inside GlobalTrend.sources[] — they are not
        // Source records and have no database id, so a SYNTHETIC id is minted from
        // the position in the EMITTED (filtered) array. Do NOT "fix" this into a
        // database id: the resolved citation map is frozen at deck build, so a later
        // re-order of GlobalTrend.sources[] cannot affect an already-built deck.
        const inlineCitations = (t.sources || [])
          .filter(s => !s.source_id && (s.title || s.publisher))
          .slice(0, 5)
          .map((s, i) => ({
            id: `INLINE:${t.id}:${i}`,
            title: s.title || '', publisher: s.publisher || '', key_finding: s.key_finding || '',
          }));

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
        // A trend can rank on raw matches and still end below full because a stronger
        // trend consumed its records. Correct, but logged so the methodology slide can
        // state it instead of it looking like a retrieval failure.
        const raw = rawMatches.get(t.id) || 0;
        if (raw >= FULL_EVIDENCE_MIN && picked.length < FULL_EVIDENCE_MIN) {
          gate.allocation_losses.push({
            trend_name: t.trend_name, category, raw_matches: raw,
            allocated: picked.length, resulting_status: evidenceStatus,
            reason: 'records already allocated to a higher-ranked trend (one record backs exactly one trend)',
          });
        }

        // ── Build C — read-across: opt-in, and only for a trend that is BELOW full
        // on in-region evidence. A fully evidenced regional trend never triggers it.
        // Runs BEFORE the dropped-continue below, because a trend rescued by
        // cross-region evidence must survive into the output to carry a slide.
        const readAcrossProducts = [];
        let readAcrossStatus = 'insufficient';
        if (readAcrossOptIn && evidenceStatus !== 'full') {
          const pool = await getReadAcrossPool();
          const scoredRa = [];
          for (const { p, text } of pool) {
            // A record already backing a regional trend cannot also be a
            // cross-region reference — one record, one role.
            if (!p.gnpd_record_id || consumed.has(p.gnpd_record_id)) continue;
            const matched = keywords.filter(k => text.includes(k));
            const linked = (p.trend_links || []).some(l => l.trend_id === t.id && l.review_status !== 'rejected');
            if (matched.length === 0 && !linked) continue;
            scoredRa.push({ p, score: matched.length + (linked ? 6 : 0) + (p.image_url ? 1 : 0), matched });
          }
          scoredRa.sort((a, b) => b.score - a.score);
          const pickedRa = scoredRa.slice(0, 10);
          // Registered into the flat union only once the tier CLEARS the bar: a record
          // picked for a trend that ends up with no cross-region slide is not evidence
          // this deck can cite, and must not appear in the downstream product set.
          const raBelowBar = pickedRa.length < FULL_EVIDENCE_MIN;
          for (const { p, matched } of pickedRa) {
            consumed.add(p.gnpd_record_id);
            if (!raBelowBar && !readAcrossById[p.gnpd_record_id]) {
              readAcrossById[p.gnpd_record_id] = {
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
                // Structural tag — this is what the binding map, the validator and
                // the export pre-flight key off. Never a prose label.
                read_across: true,
                original_country: p.country || '',
              };
            }
            const rec = readAcrossById[p.gnpd_record_id] || {
              gnpd_record_id: p.gnpd_record_id, product_name: p.product_name, brand: p.brand || '',
              company: p.company || '', country: p.country || '', launch_date: p.launch_date || '',
              category: p.palsgaard_category || p.category || '', sub_category: p.sub_category || '',
              claims: (p.claims || []).slice(0, 6), image_url: p.image_url || '',
              mintel_record_url: p.mintel_record_url || '', read_across: true, original_country: p.country || '',
            };
            readAcrossProducts.push({ ...rec, matched_keywords: matched.slice(0, 5) });
          }
          readAcrossStatus = readAcrossProducts.length >= FULL_EVIDENCE_MIN ? 'full' : 'insufficient';
          if (readAcrossProducts.length > 0) {
            gate.read_across.per_trend.push({
              trend_name: t.trend_name,
              category,
              regional_status: evidenceStatus,
              read_across_status: readAcrossStatus,
              record_count: readAcrossProducts.length,
              countries: [...new Set(readAcrossProducts.map(p => p.country).filter(Boolean))],
            });
            for (const p of readAcrossProducts) {
              const c = String(p.country || '').trim() || 'unknown';
              gate.read_across.by_country[c] = (gate.read_across.by_country[c] || 0) + 1;
            }
            gate.read_across.total_records += readAcrossProducts.length;
          }
        }

        // A trend with no regional evidence AND no cross-region tier is genuinely
        // empty — dropped, as before. A trend with no regional evidence but a FULL
        // cross-region tier survives, carrying its regional status untouched.
        if (evidenceStatus === 'dropped' && readAcrossStatus !== 'full') {
          gate.dropped_trends.push({ trend_name: t.trend_name, category, reason: 'no eligible GNPD records after region and category gates' });
          continue;
        }
        if (evidenceStatus === 'dropped') {
          gate.dropped_trends.push({
            trend_name: t.trend_name, category,
            reason: `no eligible regional GNPD records — carried as cross-region reference only (${readAcrossProducts.length} out-of-region launches)`,
          });
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
          // Build C — a SEPARATE tier. Never merged into products, never allowed to
          // change evidence_status above.
          read_across_status: readAcrossStatus,
          read_across_products: readAcrossProducts,
        });
      }
    }

    gate.format_resolution.matched_terms = [...matchedFormatTerms];
    gate.format_resolution.unmatched_terms = subs.filter(s => !matchedFormatTerms.has(s));
    gate.format_resolution.matched_sub_categories = [...matchedSubCats].filter(Boolean).sort();

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
    // Build C — a brief that opted into read-across and has a FULL cross-region tier
    // is not an empty brief: it is exactly the thin-regional case read-across exists
    // for. Without this, the rescued deck would still be refused here.
    if (!trendsOut.some(t => t.evidence_status === 'full' || t.read_across_status === 'full')) {
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
            // Carried so the architect can cite this signal by id instead of by
            // free-text title — a citation string it writes itself can be invented.
            id: s.id,
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

    // ── Deck binding — gated on TIER, never on position ──
    // A core slot requires full regional evidence AFTER exclusive allocation, so a
    // trend that ranked high on raw matches but lost its records cannot pad the body.
    let coreTaken = 0, signalTaken = 0;
    trendsOut.forEach((t, i) => {
      t.selection_rank = i + 1;
      if (t.evidence_status === 'full' && coreTaken < DECK_MAX_TRENDS) {
        t.deck_role = 'core'; coreTaken++;
      } else if (t.read_across_status === 'full') {
        t.deck_role = 'cross_region';
      } else if (t.evidence_status === 'signal_only' && signalTaken < DECK_MAX_SIGNALS) {
        t.deck_role = 'signal'; signalTaken++;
      } else {
        t.deck_role = 'context';
      }
      t.deck_selected = t.deck_role !== 'context';
      gate.deck_selection.push({
        rank: t.selection_rank, trend_name: t.trend_name, category: t.category,
        evidence_status: t.evidence_status, deck_role: t.deck_role, record_count: t.record_count,
      });
    });
    if (coreTaken < DECK_FULL_MIN) {
      gate.thin_evidence_warning = `Only ${coreTaken} trend${coreTaken === 1 ? '' : 's'} cleared full evidence (${FULL_EVIDENCE_MIN}+ allocated regional launches). The floor is ${DECK_FULL_MIN}. The deck is NOT padded with weaker trends — narrow or widen the brief deliberately, or accept a short deck.`;
    }

    return Response.json({
      success: true,
      gate,
      deck_core_count: coreTaken,
      deck_max_trends: DECK_MAX_TRENDS,
      thin_evidence_warning: gate.thin_evidence_warning,
      exclusions: exclusions.slice(0, 100),
      trends: trendsOut,
      web_signals: webSignals,
      source_ids: Object.keys(sourcesById),
      // Full source records (with id) — the canonical set the frontend freezes into
      // the deck's citation-resolution map without re-calling retrieval.
      sources: Object.values(sourcesById),
      products: Object.values(productsById),
      // Flat union member for downstream resolution ONLY (save-time id resolution,
      // product shortlist, pack shots). The per-trend separation above is the
      // containment spine; this list is never used as regional evidence.
      read_across_products: Object.values(readAcrossById),
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}