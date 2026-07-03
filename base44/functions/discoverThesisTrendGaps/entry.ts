import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

// discoverThesisTrendGaps — outside-in gap report (READ-ONLY, writes nothing).
//
// Instead of asking "does this Mintel section fit each existing trend?", it flips the direction:
// it collects the analyst SECTION THESES that extractExpertExamples now stores, clusters the
// distinct theses per category, and for each thesis-cluster asks whether the active GlobalTrend
// library COVERS it or is MISSING it. Output is a diagnostic: exactly where Mintel is
// communicating a trend the library does not yet name.
//
// No EmergingSignalCluster / GlobalTrend records are created. This is a report the admin reads
// to decide which trends to add or rename.

const CANONICAL_CATEGORIES = ['bakery','condiments','chocolate_confectionery','dairy','ice_cream','meat','oils_fats','plant_based','rutf_rusf','needs_human_review'];

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
  if (!res.ok) throw new Error(`Haiku API ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const data = await res.json();
  return { rawText: data.content?.[0]?.text || '', usage: data.usage || { input_tokens: 0, output_tokens: 0 } };
}

function parseJson(rawText) {
  const m = rawText.match(/\[[\s\S]*\]/) || rawText.match(/\{[\s\S]*\}/);
  if (!m) return null;
  try { return JSON.parse(m[0]); } catch { return null; }
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json().catch(() => ({}));

    let user = null;
    try { user = await base44.auth.me(); } catch (_) {}
    const isAutomation = !!body.event || body.triggered_by === 'schedule' || body.worker === true;
    if (!user && !isAutomation) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    const svc = base44.asServiceRole;

    const filterCategory = CANONICAL_CATEGORIES.includes(body.category) ? body.category : null;

    // ── STEP 1 — Collect distinct section theses that are actually stored ──
    let skip = 0; const page = 500; let examples = [];
    while (true) {
      const batch = await svc.entities.ExpertExample.list('-created_date', page, skip);
      examples = examples.concat(batch);
      if (batch.length < page) break;
      skip += page;
      if (skip > 20000) break;
    }

    // Group by (category + section heading) → one thesis per section. Dedup identical theses.
    const thesisMap = {}; // key -> { category, heading, thesis, products:Set, sources:Set }
    for (const e of examples) {
      if (!e.section_thesis || !e.section_thesis.trim()) continue;
      const cat = e.category || 'needs_human_review';
      if (filterCategory && cat !== filterCategory) continue;
      const key = `${cat}::${(e.mintel_section_heading || '').trim().toLowerCase()}::${e.section_thesis.trim().slice(0, 80).toLowerCase()}`;
      if (!thesisMap[key]) {
        thesisMap[key] = { category: cat, heading: e.mintel_section_heading || '', thesis: e.section_thesis.trim(), products: new Set(), sources: new Set() };
      }
      if (e.product_name) thesisMap[key].products.add(e.product_name);
      if (e.source_id) thesisMap[key].sources.add(e.source_id);
    }
    const theses = Object.values(thesisMap).map(t => ({
      category: t.category,
      heading: t.heading,
      thesis: t.thesis,
      product_count: t.products.size,
      source_count: t.sources.size,
      example_products: Array.from(t.products).slice(0, 5),
    }));

    const summary = {
      total_examples_scanned: examples.length,
      examples_with_thesis: examples.filter(e => e.section_thesis && e.section_thesis.trim()).length,
      distinct_theses: theses.length,
      category_filter: filterCategory,
      covered: 0,
      missing: 0,
      partial: 0,
      by_category: {},
    };

    if (theses.length === 0) {
      return Response.json({
        ok: true,
        note: 'No stored section theses yet. Run the Mintel re-extraction backfill first.',
        summary,
        gaps: [],
      });
    }

    // ── STEP 2 — Active GlobalTrends by category (name + signal for the LLM to judge coverage) ──
    let tskip = 0; let trends = [];
    while (true) {
      const batch = await svc.entities.GlobalTrend.list('-created_date', page, tskip);
      trends = trends.concat(batch);
      if (batch.length < page) break;
      tskip += page;
      if (tskip > 10000) break;
    }
    const activeByCat = {};
    for (const t of trends) {
      if (t.is_active === false) continue;
      const c = t.category || 'needs_human_review';
      if (!activeByCat[c]) activeByCat[c] = [];
      activeByCat[c].push({
        trend_id: t.id,
        trend_name: t.trend_name || '',
        market_signal: (t.market_signal || t.description || '').slice(0, 220),
      });
    }

    // ── STEP 3 — Per category: ask Haiku, for each thesis, whether the library covers it ──
    const gaps = [];
    let totalIn = 0, totalOut = 0;
    const cats = [...new Set(theses.map(t => t.category))];

    for (const cat of cats) {
      const catTheses = theses.filter(t => t.category === cat);
      const libraryTrends = activeByCat[cat] || [];

      const prompt = `You are auditing an outside-in food-market trend library for the "${cat}" category.

Below are (A) the analyst SECTION THESES that Mintel innovation reports actually communicate, and
(B) the trends currently in the library. For EACH thesis, decide whether the library already names
that trend.

verdict rules:
- "covered": an existing library trend clearly names the same market movement.
- "partial": a library trend is adjacent but does not fully capture the thesis (a rename/broaden would help).
- "missing": no library trend names this movement — a genuine gap.

(A) MINTEL SECTION THESES (JSON):
${JSON.stringify(catTheses.map((t, i) => ({ idx: i, heading: t.heading, thesis: t.thesis, example_products: t.example_products })))}

(B) LIBRARY TRENDS (JSON):
${JSON.stringify(libraryTrends)}

Return ONLY a JSON array, one object per thesis idx:
[
  {
    "idx": 0,
    "verdict": "covered|partial|missing",
    "matched_trend_id": "<id or null>",
    "matched_trend_name": "<name or null>",
    "suggested_trend_name": "<for missing/partial: a concise outside-in trend name, max 6 words. null if covered>",
    "reasoning": "one sentence, outside-in (consumer/plate/market as subject)"
  }
]`;

      let parsed = null;
      try {
        const res = await callHaiku(prompt, 4096);
        totalIn += res.usage.input_tokens; totalOut += res.usage.output_tokens;
        parsed = parseJson(res.rawText);
      } catch (e) {
        gaps.push({ category: cat, error: e.message });
        continue;
      }
      if (!Array.isArray(parsed)) {
        gaps.push({ category: cat, error: 'unparseable LLM response' });
        continue;
      }

      summary.by_category[cat] = { covered: 0, partial: 0, missing: 0, library_trend_count: libraryTrends.length };
      for (const r of parsed) {
        const t = catTheses[r.idx];
        if (!t) continue;
        const verdict = ['covered', 'partial', 'missing'].includes(r.verdict) ? r.verdict : 'missing';
        summary[verdict]++;
        summary.by_category[cat][verdict]++;
        gaps.push({
          category: cat,
          verdict,
          thesis: t.thesis,
          section_heading: t.heading,
          source_count: t.source_count,
          product_count: t.product_count,
          example_products: t.example_products,
          matched_trend_id: r.matched_trend_id || null,
          matched_trend_name: r.matched_trend_name || null,
          suggested_trend_name: r.suggested_trend_name || null,
          reasoning: (r.reasoning || '').slice(0, 300),
        });
      }
    }

    summary.estimated_cost_usd = Number(((totalIn / 1e6) * 1.0 + (totalOut / 1e6) * 5.0).toFixed(4));

    // Sort so the actionable gaps (missing, then partial) surface first, strongest evidence on top.
    const order = { missing: 0, partial: 1, covered: 2 };
    gaps.sort((a, b) => (order[a.verdict] ?? 3) - (order[b.verdict] ?? 3) || (b.source_count || 0) - (a.source_count || 0));

    return Response.json({ ok: true, summary, gaps });
  } catch (error) {
    console.error('[discoverThesisTrendGaps] Fatal:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});