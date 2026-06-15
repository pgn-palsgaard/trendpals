import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

function mapTimeWindow(gnpdWindow) {
  if (!gnpdWindow) return "last 24 months";
  const w = gnpdWindow.toLowerCase();
  if (w.includes("6 month") || w.includes("6-month")) return "last 6 months";
  if (w.includes("12 month") || w.includes("1 year")) return "last 12 months";
  if (w.includes("36 month") || w.includes("3 year")) return "last 36 months";
  return "last 24 months";
}

function mapMeetingContext(jtbd) {
  const map = {
    prepare_customer_meeting: "discovery",
    build_trend_deck: "other",
    understand_market: "other",
    support_innovation_pipeline: "technical_workshop",
    other: "other"
  };
  return map[jtbd] || "other";
}

function mapRegion(region) {
  if (!region) return "Global";
  const r = region.toUpperCase();
  if (r.includes("ASPAC") || r.includes("ASIA")) return "ASPAC";
  if (r.includes("AMERICAS") || r.includes("LATAM")) return "AMERICAS";
  if (r.includes("EMEC") || r.includes("EUROPE") || r.includes("EMEA")) return "EMEC";
  if (r.includes("IMEA") || r.includes("MIDDLE EAST") || r.includes("AFRICA")) return "IMEA";
  return "Global";
}

async function callClaude(apiKey, systemPrompt, userContent) {
  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01"
    },
    body: JSON.stringify({
      model: "claude-haiku-4-5",
      max_tokens: 400,
      system: systemPrompt,
      messages: [{ role: "user", content: userContent }]
    })
  });
  const data = await response.json();
  return data.content?.[0]?.text || "";
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { briefId } = await req.json();
    const brief = await base44.asServiceRole.entities.ReportRequest.get(briefId);
    if (!brief) return Response.json({ error: `Brief not found: ${briefId}` }, { status: 404 });

    const apiKey = Deno.env.get('ANTHROPIC_API_KEY');

    // Extract customer priorities and specific_focus/topics_to_avoid in parallel
    const userContent = `Purpose: ${brief.purpose || ""}\nChallenges: ${brief.challenges || ""}\nNotes: ${brief.notes || ""}\nCategories: ${brief.categories || ""}\nConversation: ${
      (brief.conversation_log || []).filter(m => m.role === "user").map(m => m.content).join(" | ").slice(0, 600)
    }`;

    const [priorityText, focusText] = await Promise.all([
      callClaude(apiKey,
        'Extract 3-6 customer priority keywords from the brief text. Return ONLY a JSON array of short strings (2-4 words max each). Examples: ["chocolate volatility", "fat substitution", "compound positioning"]. No explanation, no markdown.',
        userContent
      ),
      callClaude(apiKey,
        `Extract two things and return ONLY raw JSON, no markdown:\n{"specific_focus": "1-2 sentence description of specific angles and product types to focus on", "topics_to_avoid": "anything explicitly scoped out, or null if nothing mentioned"}`,
        userContent
      )
    ]);

    let customerPriorities = [];
    try { customerPriorities = JSON.parse(priorityText.replace(/```json|```/g, "").trim()); } catch { customerPriorities = []; }

    let specificFocus = null, topicsToAvoid = null;
    try {
      const parsed = JSON.parse(focusText.replace(/```json|```/g, "").trim());
      specificFocus = parsed.specific_focus || null;
      topicsToAvoid = parsed.topics_to_avoid || null;
    } catch { specificFocus = brief.purpose || null; }

    // Parse GNPD history window from notes
    const notes = brief.notes || "";
    const historyMatch = notes.match(/Product launch history:\s*(.+?)(\n|$)/i);
    const gnpdWindow = historyMatch ? historyMatch[1].trim() : null;

    // Build warnings
    const warnings = [];
    const minDeadline = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];
    if (brief.deadline && brief.deadline < minDeadline) {
      warnings.push({
        type: "tight_deadline", severity: "high",
        message: `Requested deadline ${brief.deadline} is under 2 weeks away. Minimum lead time is 2–3 weeks.`,
        created_at: new Date().toISOString()
      });
    }
    if (brief.external_data_needed) {
      warnings.push({
        type: "external_data_needed", severity: "medium",
        message: brief.external_data_needed,
        created_at: new Date().toISOString()
      });
    }

    const rawCategory = Array.isArray(brief.categories) ? brief.categories[0] : (brief.categories?.split(",")[0].trim() || "");
    const BRIEF_NORM = {
      'confectionery': 'chocolate_confectionery', 'chocolate': 'chocolate_confectionery',
      'chocolate confectionery': 'chocolate_confectionery', 'chocolate & confectionery': 'chocolate_confectionery',
      'bakery': 'bakery', 'cake': 'bakery', 'cake gels': 'bakery', 'baking': 'bakery',
      'dairy': 'dairy', 'ice cream': 'ice_cream', 'ice-cream': 'ice_cream',
      'meat': 'meat', 'processed meat': 'meat',
      'oils': 'oils_fats', 'oils & fats': 'oils_fats', 'fats': 'oils_fats',
      'plant based': 'plant_based', 'plant-based': 'plant_based', 'plant based products': 'plant_based',
      'rutf': 'rutf_rusf', 'rusf': 'rutf_rusf', 'rutf and rusf': 'rutf_rusf',
      'condiments': 'condiments',
    };
    const canonicalCategory = BRIEF_NORM[rawCategory.trim().toLowerCase()] || 'needs_human_review';
    const projectName = `${brief.account} — ${Array.isArray(brief.categories) ? brief.categories[0] : (brief.categories?.split(",")[0].trim() || "General")}`;

    const project = await base44.asServiceRole.entities.Project.create({
      name: projectName,
      category: canonicalCategory,
      region_code: mapRegion(brief.region),
      customer_name: brief.account,
      objective: brief.purpose,
      specific_focus: specificFocus,
      topics_to_avoid: topicsToAvoid,
      trend_time_window: mapTimeWindow(gnpdWindow),
      meeting_context: mapMeetingContext(brief.jtbd),
      customer_priorities: customerPriorities,
      audience: "Industrial manufacturers",
      state: "draft",
      selected_trend_ids: [],
      selected_source_ids: [],
      warnings: warnings,
      include_trend_analysis_in_report: false
    });

    await base44.asServiceRole.entities.ReportRequest.update(briefId, {
      project_id: project.id,
      status: "in_progress"
    });

    return Response.json({ project_id: project.id, project_name: projectName, warnings });

  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});