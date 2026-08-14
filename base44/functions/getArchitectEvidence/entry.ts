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

const COUNTRY_GROUPS = {
  europe: ['UK', 'Germany', 'France', 'Italy', 'Spain', 'Poland', 'Netherlands', 'Belgium', 'Denmark', 'Sweden', 'Norway', 'Finland', 'Ireland', 'Portugal', 'Austria', 'Switzerland', 'Greece', 'Czech Republic', 'Slovakia', 'Hungary', 'Romania', 'Bulgaria', 'Croatia', 'Slovenia', 'Serbia', 'Estonia', 'Latvia', 'Lithuania', 'Iceland', 'Luxembourg', 'Malta', 'Cyprus', 'Bosnia and Herzegovina', 'North Macedonia', 'Albania', 'Montenegro'],
  turkey: ['Turkey'],
  cis: ['Russia', 'Ukraine', 'Belarus', 'Kazakhstan', 'Uzbekistan', 'Azerbaijan', 'Armenia', 'Georgia', 'Kyrgyzstan', 'Tajikistan', 'Turkmenistan', 'Moldova'],
  aspac: ['China', 'Japan', 'India', 'Indonesia', 'South Korea', 'Australia', 'Thailand', 'Vietnam', 'Malaysia', 'Philippines', 'Singapore', 'Taiwan, China', 'Hong Kong, China', 'New Zealand', 'Sri Lanka', 'Bangladesh', 'Myanmar', 'Cambodia', 'Laos', 'Pakistan'],
  americas: ['USA', 'Canada', 'Mexico', 'Brazil', 'Argentina', 'Chile', 'Colombia', 'Peru', 'Ecuador', 'Guatemala', 'Costa Rica', 'Venezuela', 'Puerto Rico', 'Panama'],
  imea: ['UAE', 'Saudi Arabia', 'Kuwait', 'Qatar', 'Oman', 'Jordan', 'Lebanon', 'Israel', 'Egypt', 'Morocco', 'Algeria', 'Tunisia', 'South Africa'],
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

async function paginate(base44, query, cap) {
  const out = [];
  let skip = 0;
  while (out.length < cap) {
    const page = await base44.asServiceRole.entities.GNPDProduct.filter(query, '-launch_date', PAGE, skip);
    if (!page || page.length === 0) break;
    out.push(...page);
    skip += page.length;
    if (page.length < PAGE) break;
  }
  return out;
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
    const gate = {
      region_text: scope.region_text || region_text || '',
      region_scope: scope.scope,
      country_allow_list: scope.countries,
      sub_categories: subs,
      per_subregion_counts: {},
      after_region_gate: 0,
      after_category_gate: 0,
      excluded_by_reason: { out_of_region: 0, out_of_category: 0 },
      dropped_trends: [],
      downgraded_trends: [],
    };
    for (const key of Object.keys(scope.subregions || {})) gate.per_subregion_counts[key] = 0;

    for (const category of cats) {
      // Region-gated pool (country filter only — region/region_code are too coarse).
      let regionPass;
      if (Array.isArray(test_pool)) {
        regionPass = test_pool.filter(inRegion);
        for (const p of test_pool.filter(p => !inRegion(p))) {
          exclusions.push({ gnpd_record_id: p.gnpd_record_id, country: p.country, sub_category: p.sub_category, reason: 'out_of_region' });
          gate.excluded_by_reason.out_of_region++;
        }
      } else {
        regionPass = scope.scope === 'global'
          ? await paginate(base44, { palsgaard_category: category }, 4000)
          : await paginate(base44, { palsgaard_category: category, country: { $in: scope.countries } }, 8000);

        // Category-eligible records that the region gate threw out — logged, never returned.
        if (subs.length > 0 && scope.scope !== 'global') {
          const regionFail = await paginate(
            base44,
            { palsgaard_category: category, sub_category: { $in: subs }, country: { $nin: scope.countries } },
            5000
          );
          gate.excluded_by_reason.out_of_region += regionFail.length;
          for (const p of regionFail.slice(0, 50)) {
            exclusions.push({ gnpd_record_id: p.gnpd_record_id, country: p.country, sub_category: p.sub_category, reason: 'out_of_region' });
          }
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

      for (const [key, list] of Object.entries(scope.subregions || {})) {
        gate.per_subregion_counts[key] += eligible.filter(p => list.includes(String(p.country || '').trim())).length;
      }

      const trends = await base44.asServiceRole.entities.GlobalTrend.filter(
        { category, is_active: true }, '-updated_date', 8
      );
      if (trends.length === 0) continue;

      const recent = eligible.filter(p => !p.launch_date || new Date(p.launch_date) >= cutoff);
      const searchable = (recent.length >= 20 ? recent : eligible).map(p => ({ p, text: productText(p) }));
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
        for (const s of usable) {
          webSignals.push({
            title: s.title, publisher: s.publisher || '', url: s.url || '',
            published_date: s.published_date || '', category: s.category,
            region: s.region || 'Global', market_signal: s.market_signal,
            key_quote: s.key_quote || '', linked_trend_name: s.linked_trend_name || '',
            relevance_score: s.relevance_score || 0,
          });
        }
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