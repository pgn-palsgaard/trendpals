// Deterministic evidence retrieval for the Report Architect.
// Mirrors the manual workflow: start from the verified trend library, pull the
// Source records that actually back each trend, and shortlist REAL GNPD products
// whose data supports that trend. No LLM here — retrieval only, so the architect
// can never invent products or citations.
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';

const RECENCY_MONTHS = 30;

function productText(p) {
  return [
    p.product_name, p.brand, p.company, p.product_description,
    p.sub_category, p.format_type,
    ...(Array.isArray(p.claims) ? p.claims : []),
    ...(Array.isArray(p.flavours) ? p.flavours : []),
  ].filter(Boolean).join(' ').toLowerCase();
}

export default async function (req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { categories, region } = await req.json();
    const cats = (Array.isArray(categories) ? categories : [categories]).filter(Boolean).slice(0, 3);
    if (cats.length === 0) return Response.json({ error: 'categories is required' }, { status: 400 });

    const cutoff = new Date();
    cutoff.setMonth(cutoff.getMonth() - RECENCY_MONTHS);

    const trendsOut = [];
    const sourcesById = {};
    const productsById = {};

    for (const category of cats) {
      const trends = await base44.asServiceRole.entities.GlobalTrend.filter(
        { category, is_active: true }, '-updated_date', 8
      );
      if (trends.length === 0) continue;

      // Product pool for this category — real GNPD records, most recent first.
      const pool = await base44.asServiceRole.entities.GNPDProduct.filter(
        { palsgaard_category: category }, '-launch_date', 600
      );
      const recent = pool.filter(p => !p.launch_date || new Date(p.launch_date) >= cutoff);
      const searchable = (recent.length >= 50 ? recent : pool).map(p => ({ p, text: productText(p) }));

      for (const t of trends) {
        // --- Sources backing this trend (same evidence a human would attach) ---
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
        // Inline citations curated straight on the trend (no Source record behind them)
        const inlineCitations = (t.sources || [])
          .filter(s => !s.source_id && (s.title || s.publisher))
          .slice(0, 5)
          .map(s => ({ title: s.title || '', publisher: s.publisher || '', key_finding: s.key_finding || '' }));

        // --- GNPD products that support this trend ---
        const keywords = (t.trend_keywords || []).map(k => String(k).toLowerCase()).filter(k => k.length >= 3);
        const scored = [];
        for (const { p, text } of searchable) {
          if (!p.gnpd_record_id) continue;
          const matched = keywords.filter(k => text.includes(k));
          const linked = (p.trend_links || []).some(l => l.trend_id === t.id && l.review_status !== 'rejected');
          if (matched.length === 0 && !linked) continue;
          let score = matched.length + (linked ? 6 : 0) + (p.image_url ? 1 : 0);
          if (region && region !== 'Global' && p.region_code === region) score += 2;
          scored.push({ p, score, matched });
        }
        scored.sort((a, b) => b.score - a.score);

        const trendProducts = scored.slice(0, 10).map(({ p, matched }) => {
          if (!productsById[p.gnpd_record_id]) {
            productsById[p.gnpd_record_id] = {
              gnpd_record_id: p.gnpd_record_id,
              product_name: p.product_name,
              brand: p.brand || '',
              company: p.company || '',
              country: p.country || '',
              launch_date: p.launch_date || '',
              category: p.palsgaard_category || p.category || '',
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
          sources: trendSources,
          inline_citations: inlineCitations,
          products: trendProducts,
        });
      }
    }

    // --- Fresh web signals from market_scout (supplementary, clearly separated) ---
    const webCutoff = new Date();
    webCutoff.setDate(webCutoff.getDate() - 120);
    const webSignals = [];
    for (const category of cats) {
      const signals = await base44.asServiceRole.entities.WebSignal.filter(
        { category }, '-created_date', 60
      );
      const usable = signals
        .filter(s => s.review_status !== 'rejected')
        .filter(s => !s.discovered_at || new Date(s.discovered_at) >= webCutoff)
        .filter(s => !region || region === 'Global' || !s.region || s.region === 'Global' || s.region === region)
        .sort((a, b) => (b.relevance_score || 0) - (a.relevance_score || 0))
        .slice(0, 8);
      for (const s of usable) {
        webSignals.push({
          title: s.title,
          publisher: s.publisher || '',
          url: s.url || '',
          published_date: s.published_date || '',
          category: s.category,
          region: s.region || 'Global',
          market_signal: s.market_signal,
          key_quote: s.key_quote || '',
          linked_trend_name: s.linked_trend_name || '',
          relevance_score: s.relevance_score || 0,
        });
      }
    }

    return Response.json({
      success: true,
      region: region || 'Global',
      trends: trendsOut,
      web_signals: webSignals,
      source_ids: Object.keys(sourcesById),
      products: Object.values(productsById),
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}