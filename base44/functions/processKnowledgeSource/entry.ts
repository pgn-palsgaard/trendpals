import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

const CLAUDE_SYSTEM_PROMPT = `You are a Palsgaard product knowledge extractor. Palsgaard is a Danish company that makes plant-based emulsifiers and stabilisers for the food industry.

Extract ALL capability claims from this document. For each claim, identify:
- The specific Palsgaard product name (e.g. "Palsgaard® ArtisanIce 158", "Palsgaard® ExtruIce 306")  
- The product code or INCI name if mentioned (e.g. "E471", "PGMS", "Palsgaard® 6135")
- The application category (e.g. "Ice Cream", "Plant-Based Frozen Desserts", "Margarine", "Bakery")
- The specific technical benefit or claim (e.g. "reduces LBG/tara gum by 30-50%", "heat shock stable at 0.3% dosage", "enables 120% overrun without quality loss")
- Any quantitative data mentioned (percentages, dosage levels, cost savings)
- Key formulation keywords that would match consumer trend signals (e.g. "plant-based", "clean label", "cost reduction", "texture", "creamy mouthfeel")

Return ONLY a valid JSON object, no markdown, no preamble:
{
  "ai_summary": "2-3 sentence summary of what this document is about and which products/applications it covers",
  "excerpts": [
    {
      "id": "unique string",
      "text": "The specific claim or capability statement, written as a complete sentence that could be injected directly into a customer-facing report",
      "page_ref": "slide X or page X if identifiable",
      "product_name": "Palsgaard® product name",
      "product_code": "code/INCI if available",
      "application": "category",
      "benefit_type": "one of: texture, cost_reduction, stability, clean_label, plant_based, functionality, sustainability",
      "quantitative_data": "any numbers/percentages mentioned or null",
      "trend_keywords": ["array", "of", "matching", "keywords"]
    }
  ],
  "suggested_tags": ["array of relevant tags for filtering"],
  "category": "primary food category this document covers"
}

Be specific. Use exact product names and numbers from the document. Do not generalize. If you cannot extract specific claims, say so.`;

Deno.serve(async (req) => {
  let source_id;
  let base44;
  try {
    base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();
    source_id = body.source_id;

    if (!source_id) {
      return Response.json({ error: 'source_id required' }, { status: 400 });
    }

    const source = await base44.entities.Source.get(source_id);
    if (!source) {
      return Response.json({ error: 'Source not found' }, { status: 404 });
    }

    if (!source.file_url) {
      await base44.entities.Source.update(source_id, {
        status: 'failed',
        status_message: 'No file URL'
      });
      return Response.json({ error: 'Source has no file_url' }, { status: 400 });
    }

    // Mark as processing
    await base44.entities.Source.update(source_id, { status: 'processing' });

    const claudeApiKey = Deno.env.get('ANTHROPIC_API_KEY');
    if (!claudeApiKey) {
      throw new Error('ANTHROPIC_API_KEY secret not set');
    }

    // Use Claude's URL source type — let Claude fetch the document directly
    const claudeResponse = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': claudeApiKey,
        'anthropic-version': '2023-06-01',
        'anthropic-beta': 'pdfs-2024-09-25'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 4000,
        system: CLAUDE_SYSTEM_PROMPT,
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'document',
                source: {
                  type: 'url',
                  url: source.file_url
                }
              },
              {
                type: 'text',
                text: `Extract all Palsgaard capability claims from this document titled: "${source.title}". Return only valid JSON, no markdown fences.`
              }
            ]
          }
        ]
      })
    });

    if (!claudeResponse.ok) {
      const errText = await claudeResponse.text();
      await base44.entities.Source.update(source_id, {
        status: 'failed',
        status_message: `Claude API error ${claudeResponse.status}: ${errText.substring(0, 300)}`
      });
      return Response.json({ error: `Claude API error ${claudeResponse.status}: ${errText}` }, { status: 500 });
    }

    const claudeData = await claudeResponse.json();
    const rawText = claudeData.content?.[0]?.text || '';

    // Parse JSON — strip markdown fences if present
    let parsed;
    try {
      const jsonMatch = rawText.match(/```json\s*([\s\S]*?)```/) || rawText.match(/```\s*([\s\S]*?)```/);
      const jsonText = jsonMatch ? jsonMatch[1] : rawText.trim();
      parsed = JSON.parse(jsonText);
    } catch (parseErr) {
      await base44.entities.Source.update(source_id, {
        status: 'failed',
        status_message: `JSON parse error: ${rawText.substring(0, 200)}`
      });
      return Response.json({ error: 'JSON parse failed', raw: rawText.substring(0, 200) }, { status: 500 });
    }

    // Update source record with extracted knowledge
    await base44.entities.Source.update(source_id, {
      ai_summary: parsed.ai_summary || null,
      excerpts: parsed.excerpts || [],
      suggested_tags: parsed.suggested_tags || [],
      category: parsed.category || source.category || null,
      status: 'ready',
      status_message: null,
      processing_completed_at: new Date().toISOString()
    });

    return Response.json({
      success: true,
      source_id,
      excerpts_count: parsed.excerpts?.length || 0,
      ai_summary: parsed.ai_summary
    });

  } catch (error) {
    console.error('processKnowledgeSource error:', error);
    if (source_id && base44) {
      try {
        await base44.entities.Source.update(source_id, {
          status: 'failed',
          status_message: error.message
        });
      } catch (_) {}
    }
    return Response.json({ error: error.message }, { status: 500 });
  }
});