import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

async function callClaude(apiKey, prompt) {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({
      model: 'claude-haiku-4-5',
      max_tokens: 3000,
      messages: [{ role: 'user', content: prompt }]
    })
  });
  const data = await res.json();
  return data.content?.[0]?.text || '';
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const isAuth = await base44.auth.isAuthenticated();
    if (!isAuth) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { theme_id } = await req.json();
    if (!theme_id) return Response.json({ error: 'theme_id required' }, { status: 400 });

    const apiKey = Deno.env.get('ANTHROPIC_API_KEY');
    if (!apiKey) return Response.json({ error: 'ANTHROPIC_API_KEY not set' }, { status: 500 });

    // Fetch the theme
    const themes = await base44.asServiceRole.entities.CommunicationTheme.filter({ id: theme_id });
    const theme = themes?.[0];
    if (!theme) return Response.json({ error: 'CommunicationTheme not found' }, { status: 404 });

    // Fetch all active GlobalTrends
    const allTrends = await base44.asServiceRole.entities.GlobalTrend.filter({ is_active: true });
    if (!allTrends.length) return Response.json({ ok: true, message: 'No active trends found', created_ids: [], run_log: [] });

    // Fetch existing ThemeLinks for this theme to avoid duplicates
    const existingLinks = await base44.asServiceRole.entities.ThemeLink.filter({ theme_id });
    const alreadyLinkedTrendIds = new Set((existingLinks || []).map(l => l.global_trend_id));

    // Filter out already-linked trends
    const candidateTrends = allTrends.filter(t => !alreadyLinkedTrendIds.has(t.id));

    if (!candidateTrends.length) {
      return Response.json({ ok: true, message: 'All active trends already have a ThemeLink for this theme', created_ids: [], run_log: [], skipped: alreadyLinkedTrendIds.size });
    }

    // Build LLM prompt
    const subPointsText = (theme.sub_points || []).map(p => `  - ${p}`).join('\n');
    const trendsText = candidateTrends.map(t =>
      `ID: ${t.id} | Name: ${t.trend_name} | Category: ${t.category || 'unknown'} | Signal: ${(t.market_signal || '').slice(0, 120)}`
    ).join('\n');

    const prompt = `You are an editorial strategist at Palsgaard (a Danish food ingredient company). Your job is to match GlobalTrends to a Communication Theme for the annual sales deck.

COMMUNICATION THEME: ${theme.name} (${theme.year})
Tagline: ${theme.tagline || ''}
Description: ${theme.description || ''}
Adopted needs:
${subPointsText}

ACTIVE GLOBAL TRENDS (${candidateTrends.length} total):
${trendsText}

TASK: Identify which trends genuinely support this theme's narrative. Be selective — not every trend fits. For each match, provide a concise rationale (1-2 sentences) explaining why this trend supports the theme's story, and a relevance_score 0-100.

Return ONLY a JSON array (no markdown fences):
[
  {
    "global_trend_id": "...",
    "proposed_rationale": "...",
    "relevance_score": 85
  }
]

Only include trends with relevance_score >= 50. Return an empty array [] if none fit well.`;

    const raw = await callClaude(apiKey, prompt);
    let proposals;
    try {
      const cleaned = raw.replace(/```json|```/g, '').trim();
      proposals = JSON.parse(cleaned);
    } catch (e) {
      return Response.json({ error: 'LLM returned unparseable JSON', raw: raw.slice(0, 500) }, { status: 500 });
    }

    if (!Array.isArray(proposals)) {
      return Response.json({ error: 'LLM returned non-array response' }, { status: 500 });
    }

    const createdIds = [];
    const runLog = [];
    const skippedDuplicates = [];

    for (const proposal of proposals) {
      const { global_trend_id, proposed_rationale, relevance_score } = proposal;
      if (!global_trend_id) continue;

      // Re-check duplicate in case LLM returned something already linked
      if (alreadyLinkedTrendIds.has(global_trend_id)) {
        skippedDuplicates.push(global_trend_id);
        continue;
      }

      // Build write payload — NEVER include decided_by or decided_at
      const payload = {
        theme_id,
        global_trend_id,
        link_status: 'proposed',
        is_primary: false,
      };
      if (proposed_rationale) payload.proposed_rationale = String(proposed_rationale).slice(0, 1000);
      if (typeof relevance_score === 'number') payload.relevance_score = Math.min(100, Math.max(0, relevance_score));

      const created = await base44.asServiceRole.entities.ThemeLink.create(payload);

      // RULE 3: Read back and confirm
      const readBack = await base44.asServiceRole.entities.ThemeLink.filter({ id: created.id });
      const confirmed = readBack?.[0];

      if (!confirmed) {
        console.error(`[proposeThemeLinks] Could not read back ${created.id}`);
        continue;
      }

      const logEntry = {
        id: confirmed.id,
        global_trend_id: confirmed.global_trend_id,
        link_status: confirmed.link_status,
        relevance_score: confirmed.relevance_score,
        link_status_is_proposed: confirmed.link_status === 'proposed',
        decided_by_unset: !confirmed.decided_by,
        decided_at_unset: !confirmed.decided_at,
        proposed_rationale_set: !!confirmed.proposed_rationale,
      };

      createdIds.push(confirmed.id);
      runLog.push(logEntry);
    }

    return Response.json({
      ok: true,
      theme_name: theme.name,
      theme_year: theme.year,
      candidates_scanned: candidateTrends.length,
      links_proposed: createdIds.length,
      skipped_already_linked: alreadyLinkedTrendIds.size,
      skipped_duplicates_in_response: skippedDuplicates.length,
      created_ids: createdIds,
      run_log: runLog,
    });

  } catch (error) {
    console.error('[proposeThemeLinks] Fatal:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});