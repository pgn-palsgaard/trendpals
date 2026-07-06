import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

const DISPLAY_LABELS = {
  bakery: 'Bakery', condiments: 'Condiments', chocolate_confectionery: 'Chocolate & Confectionery',
  dairy: 'Dairy', ice_cream: 'Ice Cream', meat: 'Processed meat', oils_fats: 'Oils & Fats',
  plant_based: 'Plant-based products', rutf_rusf: 'RUTF and RUSF',
  out_of_scope: 'Out of scope', needs_human_review: 'Needs review',
};

// ── Step 1: fetch & filter relevant knowledge excerpts ─────────────────────
async function getExcerptsForProject(base44, project) {
  const allKnowledge = await base44.entities.Source.filter({
    source_type: 'knowledge',
    visibility: 'org_shared'
  });

  // Also pull project-linked knowledge sources
  const links = await base44.entities.ProjectKnowledgeLink.filter({ project_id: project.id });
  const orgSharedIds = new Set(allKnowledge.map(s => s.id));
  for (const link of links) {
    if (!orgSharedIds.has(link.source_id)) {
      try {
        const ks = await base44.entities.Source.get(link.source_id);
        if (ks) allKnowledge.push(ks);
      } catch (e) {}
    }
  }

  // Flatten excerpts, filter by category relevance
  const category = project.category || '';
  const allExcerpts = [];
  for (const ks of allKnowledge) {
    if (!ks.excerpts || ks.excerpts.length === 0) continue;
    // Only promoted excerpts feed report context. Demoted / pending_review must never reach the report.
    const promotedExcerpts = ks.excerpts.filter(ex => ex.promotion_status === 'promoted');
    if (promotedExcerpts.length === 0) {
      console.log(`[generateReport] Knowledge source "${ks.title}" (${ks.id}) has 0 promoted excerpts — skipping its excerpt contribution`);
      continue;
    }
    for (const ex of promotedExcerpts) {
      const relevantCategories = ex.category_relevance || [];
      const isRelevant =
        relevantCategories.length === 0 ||
        relevantCategories.some(c => c.toLowerCase() === category.toLowerCase()) ||
        relevantCategories.some(c => c.toLowerCase() === 'general');
      if (isRelevant) {
        allExcerpts.push({ ...ex, _source_title: ks.title });
      }
    }
  }

  // Group by capability_area, take top 3 per area (high confidence first)
  const byArea = {};
  for (const ex of allExcerpts) {
    const area = ex.capability_area || 'general';
    if (!byArea[area]) byArea[area] = [];
    byArea[area].push(ex);
  }
  const confidenceOrder = { high: 0, medium: 1, low: 2 };
  const selected = [];
  for (const area of Object.keys(byArea)) {
    const sorted = byArea[area].sort(
      (a, b) => (confidenceOrder[a.confidence] ?? 2) - (confidenceOrder[b.confidence] ?? 2)
    );
    selected.push(...sorted.slice(0, 3));
  }
  return selected;
}

// ── Step 2: system prompt ──────────────────────────────────────────────────
const SYSTEM_PROMPT = `You are building a trend intelligence report for food industry professionals. This is a conversation starter, not a sales pitch.

For each trend slide, structure the content in this exact order:
1. market_signal — what is happening externally (2-3 sentences, observable facts, consumer shifts, regulatory pressure, market data — no Palsgaard)
2. customer_pains — 2-3 specific, concrete, technical challenges this creates for manufacturers. Make these grounded and specific — not generic. Example: "Reducing sugar by 30% removes its structural contribution to viscosity and freezing point depression — ice crystal growth accelerates and mouthfeel collapses. This is a physics problem, not a label problem." Each pain must include a palsgaard_angle explaining how deep emulsification and stabilisation expertise addresses it.
3. For each pain: palsgaard_angle — how deep technical expertise can help. Use "Deep expertise in X enables..." or "Technical know-how in Y allows manufacturers to..." — NEVER "Palsgaard's..." as subject. No product names. No dosage figures.
4. supporting_data — use ONLY statistics from the MINTEL SOURCE QUOTES provided. Include source title and geography. If no quotes are available for a trend, leave supporting_data as an empty array. NEVER invent statistics.
5. conversation_openers — 2 open questions that end in the customer's world. Invite reflection on their own situation. E.g. "How are you currently managing clean label pressure in your seasonal SKU program?" — NEVER "Would you like to hear about our solutions?"

STRICT RULES:
- Never include a section called "Palsgaard Capability Relevance" or similar standalone capability list. The capability angle lives inside each customer pain only.
- Never use "Palsgaard" as a subject anywhere in the output.
- Never invent statistics. supporting_data must come exclusively from the provided MINTEL SOURCE QUOTES.
- gnpd_examples: use only real product names from the provided GNPD data. Never invent products.
- When INDUSTRY-RECOGNIZED EXAMPLES are provided, include them in a separate evidence_footer or as the last entry in gnpd_examples, prefixed with "[Expert pick]" to distinguish them from bulk GNPD data.
- If a customer pain can be addressed without emulsification expertise, still include it — showing broad industry knowledge builds credibility.

ANALYSIS MODE — Product-first: When an ACCOUNT LAUNCH HISTORY block is provided, the customer's own launches are your analytical starting point — NOT the trend list. First identify what the launches reveal (clusters, claims, markets, formats). Then treat each trend as either CONFIRMED by their launches ("your pipeline already reflects X") or a GAP ("the wider category is moving toward Y faster than your current launches"). Frame the widened global view as "what else is happening in the categories you operate in" — grounded in the GNPD examples provided.`;

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { project_id } = await req.json();
    const project = await base44.entities.Project.get(project_id);

    if (!project) {
      return Response.json({ error: 'Project not found' }, { status: 404 });
    }

    const region = project.region_code || project.region || 'Global';

    // Fetch evidence sources linked to project
    let sources = [];
    if (project.selected_source_ids && project.selected_source_ids.length > 0) {
      for (const sourceId of project.selected_source_ids) {
        try {
          const source = await base44.entities.Source.get(sourceId);
          if (source) sources.push(source);
        } catch (e) {
          console.warn(`Source ${sourceId} not found`);
        }
      }
    } else {
      sources = await base44.entities.Source.filter({ project_id });
    }

    // Fetch trends — TrendCandidate is a thin selection layer pointing at GlobalTrends.
    // Manual selection is now OPTIONAL — product-first derivation kicks in when absent.
    const trendCandidates = await base44.entities.TrendCandidate.filter({ project_id });
    const selectedTrends = trendCandidates.filter(t => t.is_selected);

    const warnings = [];

    // ── Product-first: fetch the account's own GNPD launch history ─────────
    // Clean the customer name: take only the core account name (strip parenthetical
    // notes and em-dash suffixes) and escape regex special characters.
    const accountName = (project.customer_name || '').split('(')[0].split('—')[0].trim();
    const accountPattern = accountName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    let accountLaunches = [];
    if (accountName.length >= 3) {
      try {
        accountLaunches = await base44.entities.GNPDProduct.filter({
          $or: [
            { company: { $regex: accountPattern, $options: 'i' } },
            { ultimate_company: { $regex: accountPattern, $options: 'i' } },
            { brand: { $regex: accountPattern, $options: 'i' } },
          ]
        }, '-launch_date', 60);
      } catch (e) {
        console.warn('Account launch fetch failed:', e.message);
      }
    }

    // Resolve any manually selected candidates to active GlobalTrends (optional)
    const resolvedTrends = [];
    for (const tc of selectedTrends) {
      if (!tc.global_trend_id) continue;
      try {
        const gt = await base44.entities.GlobalTrend.get(tc.global_trend_id);
        if (gt && gt.is_active !== false) resolvedTrends.push({ gt, candidate: tc });
      } catch (_) {}
    }

    // ── Product-first trend derivation ─────────────────────────────────────
    // Step 1: rank trends by how strongly the account's OWN launches link to them.
    // Step 2: fill remaining slots from active category trends (the wider industry view).
    let trendsWereDerived = false;
    if (resolvedTrends.length < 3) {
      trendsWereDerived = true;
      const scoreByTrend = new Map();
      for (const p of accountLaunches) {
        for (const l of (p.trend_links || [])) {
          if (l.trend_type !== 'mega' && ['auto_applied', 'approved'].includes(l.review_status)) {
            scoreByTrend.set(l.trend_id, (scoreByTrend.get(l.trend_id) || 0) + (l.confidence_score || 50));
          }
        }
      }
      const rankedIds = [...scoreByTrend.entries()].sort((a, b) => b[1] - a[1]).map(e => e[0]);
      for (const id of rankedIds) {
        if (resolvedTrends.length >= 4) break;
        if (resolvedTrends.some(r => r.gt.id === id)) continue;
        try {
          const gt = await base44.entities.GlobalTrend.get(id);
          if (gt && gt.is_active !== false) resolvedTrends.push({ gt, candidate: { trend_name: gt.trend_name } });
        } catch (_) {}
      }
      if (resolvedTrends.length < 4) {
        const catTrends = await base44.entities.GlobalTrend.filter({ category: project.category, is_active: true }, '-updated_date', 10);
        for (const gt of catTrends) {
          if (resolvedTrends.length >= 4) break;
          if (!resolvedTrends.some(r => r.gt.id === gt.id)) resolvedTrends.push({ gt, candidate: { trend_name: gt.trend_name } });
        }
      }
      if (resolvedTrends.length < 3) {
        return Response.json({
          error: `Not enough trend evidence: only ${resolvedTrends.length} active trend(s) could be derived from the account's launch history and the ${project.category} trend library.`
        }, { status: 400 });
      }
      warnings.push({
        type: 'auto_trends',
        severity: 'low',
        message: `Trends derived automatically from ${accountName ? accountName + "'s" : "the account's"} launch history and category activity (product-first mode)`,
        created_at: new Date().toISOString()
      });
    }
    const hasSources = sources.some(s => s.excerpts?.length > 0 || s.gnpd_data?.length > 0);
    if (!hasSources) {
      warnings.push({ type: 'weak_evidence', severity: 'medium', message: 'No processed project sources attached — report relies on Trend Library evidence only', created_at: new Date().toISOString() });
    }

    // ── Step 1: build knowledge context ───────────────────────────────────
    const relevantExcerpts = await getExcerptsForProject(base44, project);

    // ── Step 3: build user prompt ──────────────────────────────────────────

    // Mintel excerpts for supporting_data (sources with source_type = 'mintel')
    const mintelExcerpts = [];
    sources.forEach(source => {
      if (source.source_type === 'mintel' && source.excerpts?.length > 0) {
        // Only promoted excerpts feed supporting_data. Demoted / pending_review excluded.
        const promoted = source.excerpts.filter(ex => ex.promotion_status === 'promoted');
        if (promoted.length === 0) {
          console.log(`[generateReport] Mintel source "${source.title}" (${source.id}) has 0 promoted excerpts — skipping supporting_data contribution`);
          return;
        }
        promoted.slice(0, 8).forEach(ex => {
          mintelExcerpts.push({
            market_signal: ex.market_signal || ex.text || '',
            source_quote: ex.source_quote || '',
            source_title: source.title,
            geography: source.region_code || region
          });
        });
      }
    });

    // GNPD launch evidence: products linked to the selected GlobalTrends (HIGH-confidence links), images first
    // Region gate: launch examples must match the project region (Global projects see everything)
    const gnpdProducts = [];
    // Image lookup: product name (lowercased) -> image_url, built from all products in play
    const imageIndex = new Map();
    const addToImageIndex = (p) => {
      if (p.image_url && p.product_name) {
        imageIndex.set(p.product_name.trim().toLowerCase(), p.image_url);
      }
    };
    accountLaunches.forEach(addToImageIndex);
    for (const { gt } of resolvedTrends) {
      const fetched = await base44.entities.GNPDProduct.filter({ linked_trend_ids: gt.id }, '-launch_date', 40);
      const linked = region === 'Global' ? fetched : fetched.filter(p => p.region_code === region);
      linked.sort((a, b) => (b.image_url ? 1 : 0) - (a.image_url ? 1 : 0));
      linked.forEach(addToImageIndex);
      for (const p of linked.slice(0, 6)) {
        gnpdProducts.push({
          product_name: p.product_name || '',
          brand: p.brand || '',
          country: p.country || '',
          launch_date: p.launch_date || '',
          claims: (p.claims || []).join(', ').substring(0, 150),
          trend_name: gt.trend_name,
          has_image: !!p.image_url
        });
      }
      if (linked.length === 0) {
        warnings.push({ type: 'weak_evidence', severity: 'medium', message: `No linked GNPD launch evidence for trend "${gt.trend_name}"`, created_at: new Date().toISOString() });
      }
    }

    // Expert examples — matched on GlobalTrend IDs end-to-end (library-wide)
    const selectedTrendIds = new Set(resolvedTrends.map(r => r.gt.id));
    let expertExamples = [];
    try {
      const allExpertExamples = await base44.entities.ExpertExample.list('-extracted_at', 200);
      expertExamples = allExpertExamples.filter(ex => {
        return (ex.trend_links || []).some(l =>
          (l.review_status === 'auto_applied' || l.review_status === 'approved') &&
          selectedTrendIds.has(l.trend_id)
        );
      }).slice(0, 20);
    } catch (e) {
      console.warn('Could not load expert examples:', e.message);
    }

    const trendsBlock = resolvedTrends.map(({ gt, candidate }, i) => {
      const manifestation = (gt.regional_manifestations || []).find(m => m.region === region) ||
        (region === 'Global' ? (gt.regional_manifestations || [])[0] : null);
      return `
${i + 1}. ${gt.trend_name}
Market Signal: ${gt.market_signal || ''}
What's Changing: ${(gt.whats_changing || []).join('; ')}
Why Now: ${gt.why_now || ''}
${manifestation ? `Regional manifestation (${manifestation.region}): ${manifestation.signal || ''} [intensity: ${manifestation.intensity || 'n/a'}]` : ''}
${candidate.project_notes ? `Project notes: ${candidate.project_notes}` : ''}`;
    }).join('\n');

    // Approved source findings already linked to these trends in the Trend Library
    const trendSourcesBlock = resolvedTrends.map(({ gt }) => {
      const approved = (gt.sources || []).filter(s => ['auto_applied', 'approved', 'manual_curated'].includes(s.review_status));
      return approved.slice(0, 4).map(s =>
        `- [${gt.trend_name}] ${s.key_finding || s.title || ''}${s.quote ? ` | Quote: "${s.quote}"` : ''} (${s.publisher || ''})`
      ).join('\n');
    }).filter(Boolean).join('\n');

    const knowledgeBlock = relevantExcerpts.length > 0
      ? relevantExcerpts.map(ex => `- [${ex.capability_area || 'general'}] Market Signal: ${ex.market_signal || ''} | Pain: ${ex.customer_pain || ''} | Angle: ${ex.palsgaard_angle || ''} | Quote: "${ex.source_quote || ''}" (${ex._source_title})`).join('\n')
      : '(No relevant knowledge excerpts found — use general emulsification and stabilisation expertise)';

    const gnpdBlock = gnpdProducts.length > 0
      ? gnpdProducts.map(p => `- [${p.trend_name}] ${p.product_name} | ${p.brand} | ${p.country} | ${p.launch_date} | ${p.claims}${p.has_image ? ' | (image available)' : ''}`).join('\n')
      : '(No GNPD product data available)';

    // Account's own launch history — the product-first starting point
    const accountLaunchBlock = accountLaunches.length > 0
      ? accountLaunches.slice(0, 40).map(p =>
          `- ${p.product_name} | ${p.brand || ''} | ${p.country || ''} | ${p.launch_date || ''} | ${p.sub_category || p.category || ''} | Claims: ${(p.claims || []).join(', ').substring(0, 150)}`
        ).join('\n')
      : '';

    const expertExamplesBlock = expertExamples.length > 0
      ? expertExamples.map(ex => {
          const trendLinks = (ex.trend_links || []).filter(l => l.review_status === 'auto_applied' || l.review_status === 'approved');
          const trendNames = trendLinks.map(l => l.trend_name).join(', ');
          return `- ${ex.product_name}${ex.brand ? ` (${ex.brand})` : ''} | ${ex.country || 'Unknown country'} | Analyst framing: "${ex.analyst_framing}" | Quote: "${ex.analyst_quote || ''}" | Report: ${ex.report_title || ''} | Supports: ${trendNames}`;
        }).join('\n')
      : '';

    // Mintel source quotes for grounding statistics — include from all source types that have source_quote
    const allSourceQuotes = [];
    sources.forEach(source => {
      if (source.excerpts?.length > 0) {
        // Only promoted excerpts feed source-quote grounding. Demoted / pending_review excluded.
        const promoted = source.excerpts.filter(ex => ex.promotion_status === 'promoted');
        if (promoted.length === 0) {
          console.log(`[generateReport] Source "${source.title}" (${source.id}) has 0 promoted excerpts — skipping source-quote contribution`);
          return;
        }
        promoted.forEach(ex => {
          if (ex.source_quote && ex.source_quote.trim().length > 0) {
            allSourceQuotes.push({
              quote: ex.source_quote,
              source_title: source.title,
              geography: source.region_code || region,
              market_signal: ex.market_signal || ''
            });
          }
        });
      }
    });
    const mintelStatsBlock = allSourceQuotes.length > 0
      ? allSourceQuotes.slice(0, 20).map(q => `- "${q.quote}" | Source: ${q.source_title} | Geography: ${q.geography}`).join('\n')
      : '(No source quotes available — leave supporting_data empty, do not invent statistics)';

    const userPrompt = `PROJECT:
Category: ${DISPLAY_LABELS[project.category] || project.category}
Region: ${region}
Objective: ${project.objective}
Audience: ${project.audience || 'Industrial food manufacturers'}
${accountLaunchBlock ? `\nACCOUNT LAUNCH HISTORY (${accountName}'s own recent launches — this is your analytical starting point):\n${accountLaunchBlock}\n` : ''}
SELECTED TRENDS${trendsWereDerived ? ' (auto-derived from the account launch history and category activity — treat as data-driven hypotheses to validate against the launches, not user picks)' : ''}:
${trendsBlock}

PALSGAARD KNOWLEDGE BASE (use these to inform palsgaard_angle — do not copy verbatim):
${knowledgeBlock}

TREND LIBRARY SOURCE FINDINGS (approved evidence already linked to the selected trends):
${trendSourcesBlock || '(none)'}

GNPD PRODUCT EXAMPLES (use real product names only):
${gnpdBlock}
${expertExamplesBlock ? `\nINDUSTRY-RECOGNIZED EXAMPLES (Mintel analyst-curated — use these in "Industry-recognized examples" sub-section within relevant trend slides, labelled as analyst-curated proof points):\n${expertExamplesBlock}\n` : ''}
MINTEL SOURCE QUOTES (use ONLY these for supporting_data — never invent statistics):
${mintelStatsBlock}

Generate ${resolvedTrends.length + 2 + (accountLaunchBlock ? 1 : 0)} slides. Return a JSON object with "slides", "evidence_pack", and "product_shortlist" arrays.

Slide structure:
- Slide 1: Category landscape overview (no trend name required)
${accountLaunchBlock
  ? `- Slide 2: "What ${accountName} is launching" — analyse the ACCOUNT LAUNCH HISTORY above: identify 2-3 launch clusters (what they launch, in which markets, with which claims), state what innovation focus this reveals, and note where the trends confirm or challenge that focus. gnpd_examples on this slide must come from the ACCOUNT LAUNCH HISTORY only.
- Slides 3 to ${resolvedTrends.length + 2}: One per trend — open each trend by connecting it to the account's own launches where possible, then widen to the global category (use the GNPD PRODUCT EXAMPLES as the wider industry evidence)`
  : `- Slides 2 to ${resolvedTrends.length + 1}: One per selected trend (use the trend's market signal and customer pains from the SELECTED TRENDS block above as your starting point, then deepen them)`}
- Last slide: "What This Means" synthesis

IMPORTANT for trend slides: customer_pains must be concrete and technical — not generic. Explain the physics or chemistry or commercial mechanics of WHY the trend creates a problem. Then follow each pain immediately with the capability angle inside the same object.

For supporting_data: include 2 statistics per trend slide drawn from MINTEL SOURCE QUOTES above. If no matching quotes exist for a trend, leave supporting_data as [].

For conversation_openers: both questions must end in the customer's situation — their processes, their challenges, their decisions. Never pitch in a question.

Each slide schema — no extra keys:
{
  "slide_number": number,
  "slide_name": "string",
  "title": "max 6 words, no Palsgaard",
  "subtitle": "market context, no Palsgaard",
  "market_signal": "2-3 sentences, external facts only, no Palsgaard",
  "customer_pains": [
    {
      "pain": "concrete, specific, technical challenge — explain WHY it's hard, not just that it's hard",
      "palsgaard_angle": "use 'Deep expertise in...' or 'Technical know-how in...' — no product names, no Palsgaard as subject",
      "palsgaard_can_help": true,
      "expert_only": false
    }
  ],
  "conversation_openers": ["question ending in customer's world", "question ending in customer's world"],
  "supporting_data": [
    { "stat": "exact quote from MINTEL SOURCE QUOTES above", "source": "source title", "geography": "geography from quote" }
  ],
  "gnpd_examples": ["product name — brand, country, year"]
}

evidence_pack items: { "signal": "string", "capability_area": "string", "source_type": "string", "confidence": "string" }
product_shortlist items: { "product_name": "string", "brand": "string", "market": "string", "launch_date": "string", "claims": ["string"], "supporting_trends": ["string"] }`;

    // ── Call Claude via InvokeLLM ─────────────────────────────────────────
    const response = await base44.integrations.Core.InvokeLLM({
      model: 'claude_sonnet_4_6',
      prompt: userPrompt,
      response_json_schema: {
        type: 'object',
        required: ['slides', 'evidence_pack', 'product_shortlist'],
        properties: {
          slides: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                slide_number: { type: 'number' },
                slide_name: { type: 'string' },
                title: { type: 'string' },
                subtitle: { type: 'string' },
                market_signal: { type: 'string' },
                customer_pains: {
                  type: 'array',
                  items: {
                    type: 'object',
                    properties: {
                      pain: { type: 'string' },
                      palsgaard_angle: { type: 'string' },
                      palsgaard_can_help: { type: 'boolean' },
                      expert_only: { type: 'boolean' }
                    }
                  }
                },
                conversation_openers: { type: 'array', items: { type: 'string' } },
                supporting_data: {
                  type: 'array',
                  items: {
                    type: 'object',
                    properties: {
                      stat: { type: 'string' },
                      source: { type: 'string' },
                      geography: { type: 'string' }
                    }
                  }
                },
                gnpd_examples: { type: 'array', items: { type: 'string' } }
              }
            }
          },
          evidence_pack: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                signal: { type: 'string' },
                capability_area: { type: 'string' },
                source_type: { type: 'string' },
                confidence: { type: 'string' }
              }
            }
          },
          product_shortlist: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                product_name: { type: 'string' },
                brand: { type: 'string' },
                market: { type: 'string' },
                launch_date: { type: 'string' },
                claims: { type: 'array', items: { type: 'string' } },
                supporting_trends: { type: 'array', items: { type: 'string' } }
              }
            }
          }
        }
      }
    });

    // ── Determine freshness ────────────────────────────────────────────────
    const oldestSourceDate = sources
      .filter(s => s.date_published || s.date)
      .map(s => new Date(s.date_published || s.date))
      .sort((a, b) => a - b)[0];

    let freshness = 'fresh';
    if (oldestSourceDate) {
      const ageMonths = (Date.now() - oldestSourceDate.getTime()) / (1000 * 60 * 60 * 24 * 30);
      if (ageMonths > 24) freshness = 'outdated';
      else if (ageMonths > 12) freshness = 'use_with_caution';
    }

    // ── Unwrap InvokeLLM response (it nests the JSON under a "response" key) ──
    const parsed = response?.response ?? response;

    // ── Build the deterministic "Briefing Context" cover slide (always slide 1) ──
    const MEETING_CONTEXT_LABELS = {
      discovery: 'Discovery Meeting Preparation',
      innovation_day: 'Innovation Day',
      technical_workshop: 'Technical Workshop',
      other: 'Briefing',
    };
    const preparedForParts = [];
    if (project.requester_name) preparedForParts.push(project.requester_name);
    if (project.meeting_context) preparedForParts.push(MEETING_CONTEXT_LABELS[project.meeting_context] || 'Briefing');
    if (project.specific_focus) preparedForParts.push(project.specific_focus);
    const categoryLabel = (DISPLAY_LABELS[project.category] || project.category || '').toUpperCase();

    const briefingSlide = {
      slide_number: 1,
      slide_type: 'briefing_context',
      slide_name: 'Briefing Context',
      title: 'Why this report exists and what it is designed to answer',
      subtitle: `${categoryLabel} | ${String(region).toUpperCase()} | BRIEFING CONTEXT`,
      prepared_for: preparedForParts.join(' | '),
      commercial_questions: (() => {
        const objLines = String(project.objective || '')
          .split(/\n|(?<=[.?])\s+(?=[A-Z0-9])/)
          .map(s => s.trim())
          .filter(Boolean)
          .slice(0, 2);
        return objLines.map(q => ({ question: q, markets_in_scope: region }));
      })(),
      trends_under_microscope: resolvedTrends.map(({ gt }, i) => `Trend ${i + 1} — ${gt.trend_name}`),
      evidence_footer: 'All insights are evidence-led. Sources cited inline throughout.',
    };

    // Prepend briefing slide and renumber LLM slides after it
    const llmSlides = Array.isArray(parsed.slides) ? parsed.slides : [];
    const finalSlides = [briefingSlide, ...llmSlides.map((s, i) => ({ ...s, slide_number: i + 2 }))];
    console.log('SLIDES TO SAVE:', Array.isArray(parsed.slides) ? parsed.slides.length : 'NOT AN ARRAY');
    console.log('EVIDENCE_PACK TO SAVE:', Array.isArray(parsed.evidence_pack) ? parsed.evidence_pack.length : 'NOT AN ARRAY');
    console.log('PRODUCT_SHORTLIST TO SAVE:', Array.isArray(parsed.product_shortlist) ? parsed.product_shortlist.length : 'NOT AN ARRAY');

    // ── Step 4: save directly using new schema ─────────────────────────────
    const existingReports = await base44.entities.Report.filter({ project_id });
    const nextVersion = existingReports.length > 0
      ? Math.max(...existingReports.map(r => r.version || 1)) + 1
      : 1;

    const report = await base44.entities.Report.create({
      project_id,
      title: `${DISPLAY_LABELS[project.category] || project.category} Trends — ${region}`,
      category: project.category,
      region,
      slides: finalSlides,
      evidence_pack: parsed.evidence_pack || [],
      product_shortlist: (parsed.product_shortlist || []).map(item => ({
        ...item,
        image_url: imageIndex.get(String(item.product_name || '').trim().toLowerCase()) || null
      })),
      image_map: {},
      selected_trends: resolvedTrends.map(r => r.gt.trend_name),
      warnings,
      freshness,
      status: 'draft',
      analysis_mode: (trendsWereDerived && accountLaunches.length > 0) ? 'product_first' : 'standard',
      version: nextVersion
    });

    return Response.json({
      success: true,
      report_id: report.id,
      version: nextVersion,
      slides_count: report.slides.length
    });

  } catch (error) {
    console.error('Generate report error:', error);
    return Response.json({
      error: error.message || 'Failed to generate report',
      details: error.stack
    }, { status: 500 });
  }
});