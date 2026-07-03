import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

// Backfill: for every ExpertExample with category='cross_industry' that has no
// category_relevance yet, ask the LLM which of the 9 canonical Palsgaard industries
// the product/section actually touches. category stays 'cross_industry' — this only
// POPULATES category_relevance so the record shows "cross-industry + the specific industries".
//
// Runs in small batches (each call handles up to batch_size records) so it never times out.
// Returns remaining count so a scheduled automation (or repeated manual calls) can drain it.

const CANONICAL_KEYS = [
  'bakery', 'condiments', 'chocolate_confectionery', 'dairy', 'ice_cream',
  'meat', 'oils_fats', 'plant_based', 'rutf_rusf',
];

async function callClaude(prompt) {
  const apiKey = Deno.env.get('ANTHROPIC_API_KEY');
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-6',
      max_tokens: 400,
      messages: [{ role: 'user', content: prompt }],
    }),
  });
  if (!res.ok) throw new Error(`Anthropic ${res.status}: ${await res.text()}`);
  const data = await res.json();
  return data.content?.[0]?.text || '';
}

function parseJson(text) {
  if (!text) return null;
  let t = text.trim();
  const fence = t.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fence) t = fence[1].trim();
  const start = t.indexOf('{');
  const end = t.lastIndexOf('}');
  if (start === -1 || end === -1) return null;
  try { return JSON.parse(t.slice(start, end + 1)); } catch { return null; }
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json().catch(() => ({}));
    const isWorker = body.worker === true;

    if (!isWorker) {
      const user = await base44.auth.me();
      if (!user || user.role !== 'admin') {
        return Response.json({ error: 'Admin only' }, { status: 403 });
      }
    }

    const batchSize = Math.min(body.batch_size || 8, 15);

    const all = await base44.asServiceRole.entities.ExpertExample.filter(
      { category: 'cross_industry' }, '-created_date', 500
    );
    const queue = all.filter(e => !(e.category_relevance && e.category_relevance.length));
    const batch = queue.slice(0, batchSize);

    let updated = 0;
    const results = [];
    for (const e of batch) {
      const prompt = `You map a consumer/cross-industry product example to the specific Palsgaard food industries it touches.

The 9 canonical Palsgaard industry keys:
- bakery, condiments, chocolate_confectionery, dairy, ice_cream, meat, oils_fats, plant_based, rutf_rusf

This example is tagged "cross_industry" (a consumer trend spanning categories). Identify which SPECIFIC industries the product and its section actually apply to. Return 1-3 keys — only industries genuinely relevant. If truly none apply, return an empty array.

Product: ${e.product_name || '(unknown)'}
Brand: ${e.brand || '—'}
Mintel section: ${e.mintel_section_heading || '—'}
Section thesis: ${e.section_thesis || '—'}
Analyst framing: ${e.analyst_framing || '—'}

Return ONLY JSON: {"industries": ["key1", "key2"], "reasoning": "one short sentence"}`;

      try {
        const raw = await callClaude(prompt);
        const parsed = parseJson(raw);
        const industries = (parsed?.industries || [])
          .map(k => String(k).trim().toLowerCase())
          .filter(k => CANONICAL_KEYS.includes(k));
        const unique = [...new Set(industries)];

        await base44.asServiceRole.entities.ExpertExample.update(e.id, {
          category_relevance: unique,
        });
        updated++;
        results.push({ product: e.product_name, industries: unique });
      } catch (err) {
        console.warn(`[backfillCrossIndustryRelevance] failed for ${e.id}: ${err.message}`);
      }
    }

    return Response.json({
      success: true,
      updated,
      remaining: Math.max(0, queue.length - updated),
      total_pending_before: queue.length,
      done: queue.length - updated <= 0,
      results,
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});