// Anonymous-safe LLM proxy for the public Submit Brief page.
// Colleagues without a login use the brief assistant, so the LLM call must run
// server-side with the service role instead of the (absent) user token.
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';

export default async function (req) {
  try {
    const base44 = createClientFromRequest(req);
    const { prompt } = await req.json();
    if (!prompt || typeof prompt !== 'string' || prompt.length > 60000) {
      return Response.json({ error: 'prompt is required' }, { status: 400 });
    }
    // Guardrail: this endpoint only serves the brief-intake assistant.
    if (!prompt.includes('Market Intelligence Assistant for Palsgaard')) {
      return Response.json({ error: 'Invalid request' }, { status: 400 });
    }
    const reply = await base44.asServiceRole.integrations.Core.InvokeLLM({
      prompt,
      model: 'claude_sonnet_4_6',
    });
    return Response.json({ reply: typeof reply === 'string' ? reply : (reply?.content || '') });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}