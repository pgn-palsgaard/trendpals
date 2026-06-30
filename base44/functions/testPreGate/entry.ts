// TEMPORARY Phase 2C synthetic test harness — exercises the verbatim pre-gate
// prompt against three mocked inputs and reports decisions + token usage.
// Delete after the Phase 2C report is accepted.
const PRE_GATE_TEXT_CHARS = 2000;

async function runPreGate(source, openingText) {
  const summary = source.summary || '';
  const description = source.description || '';
  const opening = (openingText || '').slice(0, PRE_GATE_TEXT_CHARS);

  const prompt = `You are evaluating whether a source document should be extracted for TrendPals, an outside-in market intelligence tool for commercial teams in the food ingredients industry. TrendPals captures market signals, consumer drivers, category movements, regional expressions, and competitive activity — to help account managers prepare better customer conversations.
Given the title, summary, and opening text below, answer:

Does this source plausibly contain ANY market-intelligence signal of this kind?
Be inclusive — uncertain → proceed. Only reject sources that are clearly off-scope (e.g. internal HR documents, equipment manuals, off-topic press releases, pure advertising, finance reports unrelated to category, regulatory filings without market content).
Ingredient mentions are NOT required. A signal-rich, ingredient-free source is fully in scope.

Title: ${source.title || 'Unknown'}
Summary: ${summary || 'None provided'}
Description: ${description || 'None provided'}
Opening text (first ~${PRE_GATE_TEXT_CHARS} chars):
${opening || 'None provided'}

Return JSON: { "proceed": boolean, "reason": "one short sentence" }.`;

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': Deno.env.get('ANTHROPIC_API_KEY'),
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5',
      max_tokens: 256,
      messages: [{ role: 'user', content: prompt }],
    }),
  });
  if (!res.ok) return { error: `API ${res.status}: ${(await res.text()).slice(0, 200)}` };
  const data = await res.json();
  const rawText = data.content?.[0]?.text || '';
  const jsonMatch = rawText.match(/\{[\s\S]*\}/);
  if (!jsonMatch) return { error: 'no JSON', usage: data.usage, prompt_chars: prompt.length };
  let parsed;
  try { parsed = JSON.parse(jsonMatch[0]); } catch (e) { return { error: `malformed: ${e.message}`, usage: data.usage }; }
  return { proceed: parsed.proceed, reason: parsed.reason, usage: data.usage, prompt_chars: prompt.length, input_text_chars: openingText.length };
}

async function probe(model) {
  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'x-api-key': Deno.env.get('ANTHROPIC_API_KEY'), 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      body: JSON.stringify({ model, max_tokens: 16, messages: [{ role: 'user', content: 'Reply with the single word OK.' }] }),
    });
    if (!res.ok) return { model, ok: false, status: res.status, err: (await res.text()).slice(0, 120) };
    const d = await res.json();
    return { model, ok: true, text: d.content?.[0]?.text, usage: d.usage };
  } catch (e) { return { model, ok: false, err: e.message }; }
}

Deno.serve(async (req) => {
  try {
    const body = await req.json().catch(() => ({}));
    if (body.probe) {
      const candidates = ['claude-3-5-haiku-latest', 'claude-3-haiku-20240307', 'claude-haiku-4-5', 'claude-3-5-haiku-20241022', 'claude-sonnet-4-5'];
      const results = [];
      for (const m of candidates) results.push(await probe(m));
      return Response.json({ probe: results });
    }
    const FULL_ONLY = body.fullOnly === true;
    const inScope = {
      title: 'Global Plant-Based Dairy Alternatives: Market Trends 2026',
      summary: 'Mintel analysis of consumer drivers and category movement in plant-based dairy across key regions.',
      text: `The plant-based dairy alternatives category continued double-digit growth across Europe and North America in 2025, with oat-based products overtaking soy for the first time. Consumers increasingly cite texture and mouthfeel parity with conventional dairy as the deciding purchase factor, while "clean label" claims rose 34% year-on-year. In APAC, regional players launched barista-format oat milks targeting the booming specialty coffee channel. Competitive activity intensified as three major dairy incumbents acquired plant-based startups. Manufacturers report ongoing challenges achieving creamy texture and heat stability in barista applications without additives consumers recognise as artificial.`.repeat(3),
    };
    const offScope = {
      title: 'Forklift Operator Safety Manual — Model XJ-200',
      summary: 'Operating and maintenance manual for warehouse forklift equipment.',
      text: `Section 1: Pre-operation inspection. Before operating the XJ-200 forklift, the operator must check hydraulic fluid levels, tyre pressure, and the condition of the forks. Always wear the seatbelt. Maximum load capacity is 2,000kg at a 500mm load centre. Section 2: Battery charging procedure. Connect the charger only in a well-ventilated area. Do not smoke near the charging station. Section 3: Maintenance schedule. Replace hydraulic filter every 500 operating hours.`.repeat(3),
    };
    const ambiguous = {
      title: 'Industry Briefing — Selected Notes',
      summary: '',
      text: `A short collection of notes from recent industry gatherings. Attendance at the spring forum was solid. One speaker touched on how shoppers in some markets are trading up to premium formats, though no figures were given. A panel mentioned that a few regional bakeries have reformulated to reduce sugar, without naming brands. Discussion of supply conditions was brief and inconclusive. The remainder of the session covered organisational housekeeping and upcoming dates.`,
    };

    const [a, b, c] = FULL_ONLY ? [null, null, null] : await Promise.all([
      runPreGate(inScope, inScope.text),
      runPreGate(offScope, offScope.text),
      runPreGate(ambiguous, ambiguous.text),
    ]);

    // Full-extraction token cost on the SAME in-scope source (production prompt + sonnet-4-5).
    let fullExtraction = null;
    if (body.measureFull) {
      const contentForLLM = inScope.text.slice(0, 25000);
      const extractionPrompt = `You are an outside-in market intelligence processor for TrendPals, a commercial signal tool used by account managers and category teams preparing customer conversations. Extract structured market intelligence excerpts that surface category movements, consumer drivers, regional expressions, and competitive activity.

Source metadata:
- Title: ${inScope.title}
- Publisher: Mintel
- Source type: market_intel
- Category: plant_based
- Date published: 2026-01-01

Document content:
${contentForLLM}

Extract market intelligence excerpts that carry an outside-in market signal useful for a commercial team preparing customer conversations — category movements, consumer drivers, regional expressions, and competitive/innovation activity. For each excerpt identify market_signal, customer_pain, palsgaard_angle, has_direct_role, capability_area, confidence, relevance_score, quality_score, signal_type, source_quote, category_relevance, trend_keywords, regions.

Return ONLY a JSON object: { "excerpts": [...], "ai_summary": "..." }`;
      const exRes = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'x-api-key': Deno.env.get('ANTHROPIC_API_KEY'), 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
        body: JSON.stringify({ model: 'claude-sonnet-4-5', max_tokens: 8192, messages: [{ role: 'user', content: extractionPrompt }] }),
      });
      const exData = await exRes.json();
      fullExtraction = {
        input_tokens: exData.usage?.input_tokens,
        output_tokens: exData.usage?.output_tokens,
        prompt_chars: extractionPrompt.length,
      };
    }

    if (FULL_ONLY) return Response.json({ full_extraction: fullExtraction });
    return Response.json({ in_scope: a, off_scope: b, ambiguous: c, full_extraction: fullExtraction });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});