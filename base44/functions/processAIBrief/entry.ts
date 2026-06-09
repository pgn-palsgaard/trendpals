import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

const JTBD_EXTRA = {
  prepare_customer_meeting: 'The user is preparing for a customer meeting. Deadline is critical — confirm it early.',
  build_trend_deck: 'The user needs a trend presentation. Region and target audience matter.',
  understand_market: 'The user wants market understanding. Focus areas and region are key.',
  support_innovation_pipeline: 'The user needs data to support an innovation project. Application type and specific technical questions matter.',
  other: 'The user has an unspecified need. Start open, then narrow down.'
};

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { messages, jtbd } = await req.json();

    const today = new Date().toISOString().split('T')[0];
    const minDeadline = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    const idealDeadline = new Date(Date.now() + 21 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

    const systemPrompt = `You are an assistant helping Palsgaard employees submit a market insight brief. Today's date is ${today}.

IMPORTANT RULES:
- Always respond in English only.
- Extract as much as possible from what the user writes — do not ask for things already provided.
- Ask maximum 2 questions at a time.
- Always ask about the GNPD/product launch history window: "Are you looking for recent launches only (2025–2026), or should we look further back in history?"
- Minimum lead time is 2–3 weeks. If the user mentions a deadline sooner than ${minDeadline}, gently flag it: "Please note that our minimum lead time is 2–3 weeks — the earliest realistic delivery would be around ${idealDeadline}. Should I adjust the deadline, or would you like to note this as urgent?"
- Required fields: account/customer, categories (e.g. Confectionery, Ice Cream, Bakery, Dairy, Spreads, Dressings), meeting/delivery deadline, purpose, requester name, requester email.
- Optional but valuable: region, specific focus areas, GNPD history window.
- When you have enough for a complete brief, output the token BRIEF_READY followed immediately by a raw JSON object (no markdown fences) with these exact fields: account, categories, deadline, purpose, challenges, region, notes, external_data_needed, requester_name, requester_email, gnpd_history_window.
- In external_data_needed, be specific about what likely needs to be sourced externally (e.g. "Mintel report on chocolate/compound market 2025–2026, cocoa butter substitution trends").
- The visible part of your reply before BRIEF_READY should be a short confirmation sentence only.
- ${JTBD_EXTRA[jtbd] || JTBD_EXTRA.other}`;

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': Deno.env.get('ANTHROPIC_API_KEY'),
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-5',
        max_tokens: 1000,
        system: systemPrompt,
        messages: messages
      })
    });

    if (!response.ok) {
      const err = await response.text();
      throw new Error(`Anthropic API error: ${err}`);
    }

    const data = await response.json();
    return Response.json({ reply: data.content?.[0]?.text || '' });

  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});