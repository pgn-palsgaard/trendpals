import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

// ── Phase 2 of section-aware extraction ──
// extractExpertExamples creates ExpertExample records grouped by section (mintel_section_heading
// + section_thesis), with no trend links yet. This function reads those records, links each
// SECTION to trends once, and writes the inherited links back onto every product in the section.
// Split from extractExpertExamples so neither phase exceeds the function time budget.

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function mapWithConcurrency(items, limit, worker) {
  const results = new Array(items.length);
  let cursor = 0;
  async function run() {
    while (cursor < items.length) {
      const i = cursor++;
      results[i] = await worker(items[i], i);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, run));
  return results;
}

function normalizeCategory(raw) {
  if (!raw) return '';
  const v = String(raw).toLowerCase().trim();
  const direct = ['bakery', 'condiments', 'chocolate_confectionery', 'dairy', 'ice_cream',
    'meat', 'oils_fats', 'plant_based', 'rutf_rusf'];
  if (direct.includes(v)) return v;
  if (/chocolate|confection|candy|sugar/.test(v)) return 'chocolate_confectionery';
  if (/bakery|bread|biscuit|cookie|cake|pastr/.test(v)) return 'bakery';
  if (/dairy|cheese|yog|yoghurt|yogurt|milk/.test(v)) return 'dairy';
  if (/ice ?cream|frozen dessert|gelato/.test(v)) return 'ice_cream';
  if (/meat|poultry|sausage|processed meat/.test(v)) return 'meat';
  if (/condiment|sauce|dressing|mayo|spread/.test(v)) return 'condiments';
  if (/oil|fat|margarine|shortening/.test(v)) return 'oils_fats';
  if (/plant.?based|vegan|dairy.?free|meat.?free/.test(v)) return 'plant_based';
  return '';
}

async function validateSectionTrendLink(apiKey, section, trend) {
  const prompt = `You are evaluating whether a themed section of a Mintel innovation report is genuine evidence of a specific market trend.

TREND
Name: ${trend.trend_name}
Category: ${trend.category || 'Unknown'}
Market signal: ${trend.market_signal || ''}
Description: ${(trend.description || '').slice(0, 400)}
Keywords: ${(trend.trend_keywords || []).join(', ')}

REPORT SECTION
Heading: ${section.section_heading || ''}
Thesis (analyst's argument): ${section.section_thesis || ''}
Example products cited as evidence: ${(section.product_names || []).slice(0, 8).join('; ')}

Scoring guide:
- 80-100 SUPPORTS: The section's thesis is clearly an instance/driver of this trend.
- 50-79 PARTIAL: The section overlaps with the trend but also diverges, or alignment is implicit.
- 0-49 NOT_SUPPORT: Only incidental keyword overlap — the section is not about this trend.

Respond ONLY with JSON:
{"verdict":"SUPPORTS"|"PARTIAL"|"NOT_SUPPORT","confidence_score":0-100,"reasoning":"one sentence"}`;

  let res;
  for (let attempt = 0; attempt < 4; attempt++) {
    res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5',
        max_tokens: 200,
        messages: [{ role: 'user', content: prompt }],
      }),
    });
    if (res.status !== 429) break;
    await sleep(1000 * Math.pow(2, attempt));
  }
  if (!res.ok) throw new Error(`Validation API error ${res.status}`);
  const data = await res.json();
  const raw = (data.content?.[0]?.text || '').trim();
  const match = raw.match(/\{[\s\S]*\}/);
  if (!match) return { verdict: 'NOT_SUPPORT', confidence_score: 0, reasoning: 'Parse error' };
  return JSON.parse(match[0]);
}

function sectionText(section) {
  return [section.section_heading, section.section_thesis, ...(section.product_names || [])]
    .filter(Boolean).join(' ').toLowerCase();
}

function keywordOverlapForSection(section, trend) {
  const trendKws = (trend.keywords || []);
  if (trendKws.length === 0) return [];
  const text = sectionText(section);
  return trendKws.filter(kw => text.includes(kw));
}

const MAX_SAME_CATEGORY_FALLBACK = 6;
function selectSectionCandidates(section, sectionCategoryKey, trendIndex) {
  const keywordMatches = [];
  for (const trend of trendIndex) {
    const matched = keywordOverlapForSection(section, trend);
    if (matched.length > 0) keywordMatches.push({ trend, matched });
  }
  if (keywordMatches.length > 0) return keywordMatches;
  if (!sectionCategoryKey) return [];
  return trendIndex
    .filter(t => t.category === sectionCategoryKey)
    .sort((a, b) => (b.keywords?.length || 0) - (a.keywords?.length || 0))
    .slice(0, MAX_SAME_CATEGORY_FALLBACK)
    .map(trend => ({ trend, matched: [] }));
}

function verdictToLink(trend, matched, verdict, now) {
  const score = verdict.confidence_score || 0;
  const v = verdict.verdict;
  if (v === 'NOT_SUPPORT' || score < 40) {
    return {
      rejected: {
        trend_id: trend.id, trend_name: trend.name, matched_keywords: matched,
        llm_verdict: v, llm_reasoning: verdict.reasoning, llm_score: score, rejected_at: now,
      },
    };
  }
  const isAutoApply = v === 'SUPPORTS' && score >= 70;
  return {
    link: {
      trend_id: trend.id, trend_name: trend.name, trend_type: 'global',
      confidence: score >= 70 ? 'high' : 'medium', confidence_score: score,
      reasoning: verdict.reasoning, matched_keywords: matched, linked_via: 'section',
      review_status: isAutoApply ? 'auto_applied' : 'pending', linked_at: now,
    },
    autoApply: isAutoApply,
  };
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json().catch(() => ({}));
    const source_id = body.source_id;
    if (!source_id) return Response.json({ error: 'source_id required' }, { status: 400 });

    const apiKey = Deno.env.get('ANTHROPIC_API_KEY');
    if (!apiKey) return Response.json({ error: 'ANTHROPIC_API_KEY not set' }, { status: 500 });

    const source = await base44.asServiceRole.entities.Source.get(source_id);
    if (!source) return Response.json({ skipped: true, reason: 'no source' });

    // Load the ExpertExamples this source produced (created by extractExpertExamples).
    const examples = await base44.asServiceRole.entities.ExpertExample.filter({ source_id }, '-created_date', 500);
    if (examples.length === 0) return Response.json({ skipped: true, reason: 'no examples to link' });

    // Group examples by section (heading + thesis).
    const sectionMap = new Map();
    for (const ex of examples) {
      const key = ex.mintel_section_heading || ex.section_thesis || `__no_section_${ex.id}`;
      if (!sectionMap.has(key)) {
        sectionMap.set(key, {
          section_heading: ex.mintel_section_heading || '',
          section_thesis: ex.section_thesis || '',
          product_names: [],
          example_ids: [],
        });
      }
      const sec = sectionMap.get(key);
      if (ex.product_name) sec.product_names.push(ex.product_name);
      sec.example_ids.push(ex.id);
    }
    const sections = Array.from(sectionMap.values());

    // Trend index.
    const globalTrends = await base44.asServiceRole.entities.GlobalTrend.filter({ is_active: true });
    const trendIndex = globalTrends.map(t => ({
      id: t.id, name: t.trend_name,
      keywords: (t.trend_keywords || []).map(k => k.toLowerCase()),
      category: t.category,
    }));
    const trendDetails = {};
    globalTrends.forEach(t => {
      trendDetails[t.id] = {
        trend_name: t.trend_name, market_signal: t.market_signal || '',
        description: t.description || '', category: t.category || '',
        trend_keywords: t.trend_keywords || [],
      };
    });

    const now = new Date().toISOString();
    const sourceCategoryKey = normalizeCategory(source.category) || '';
    const sectionLinks = sections.map(() => ({ links: [], linkedTrendIds: [], rejectedCandidates: [] }));

    // Build all (section, trend) candidate pairs, run through one bounded pool.
    const pairs = [];
    sections.forEach((section, sIdx) => {
      for (const { trend, matched } of selectSectionCandidates(section, sourceCategoryKey, trendIndex)) {
        pairs.push({ sIdx, section, trend, matched });
      }
    });
    console.log(`[linkExpertExampleSections] ${sections.length} sections, ${pairs.length} section/trend pairs`);

    await mapWithConcurrency(pairs, 6, async ({ sIdx, section, trend, matched }) => {
      const trendWithDetails = { ...trend, ...(trendDetails[trend.id] || {}) };
      let verdict;
      try {
        verdict = await validateSectionTrendLink(apiKey, section, trendWithDetails);
      } catch (e) {
        console.warn(`section link failed for "${section.section_heading}" / ${trend.name}: ${e.message}`);
        return;
      }
      const out = verdictToLink(trend, matched, verdict, now);
      const bucket = sectionLinks[sIdx];
      if (out.rejected) bucket.rejectedCandidates.push(out.rejected);
      else {
        bucket.links.push(out.link);
        if (out.autoApply) bucket.linkedTrendIds.push(trend.id);
      }
    });

    // Write each section's links back onto its examples.
    const updates = [];
    sections.forEach((section, sIdx) => {
      const { links, linkedTrendIds, rejectedCandidates } = sectionLinks[sIdx];
      for (const exId of section.example_ids) {
        updates.push({
          id: exId,
          linked_trend_ids: [...linkedTrendIds],
          trend_links: links.map(l => ({ ...l })),
          rejected_link_candidates: rejectedCandidates.map(r => ({ ...r })),
        });
      }
    });

    let updated = 0;
    for (let i = 0; i < updates.length; i += 25) {
      const batch = updates.slice(i, i + 25);
      await base44.asServiceRole.entities.ExpertExample.bulkUpdate(batch);
      updated += batch.length;
    }

    const autoApplied = updates.reduce((n, u) => n + u.linked_trend_ids.length, 0);
    const pending = updates.reduce((n, u) => n + u.trend_links.filter(l => l.review_status === 'pending').length, 0);
    console.log(`[linkExpertExampleSections] Updated ${updated} examples; ${autoApplied} auto-applied, ${pending} pending links`);

    return Response.json({
      success: true,
      source_id,
      sections: sections.length,
      examples_updated: updated,
      trend_links_auto_applied: autoApplied,
      trend_links_pending: pending,
    });
  } catch (error) {
    console.error('[linkExpertExampleSections] Fatal:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});