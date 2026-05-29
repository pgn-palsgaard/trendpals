import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

const CLAUDE_SYSTEM_PROMPT = `You are a Palsgaard product knowledge extractor. Palsgaard is a Danish company that makes plant-based emulsifiers and stabilisers for the food industry.

Extract ALL capability claims from this document. For each claim, identify:
- The specific Palsgaard product name (e.g. "Palsgaard® ArtisanIce 158", "Palsgaard® ExtruIce 306")  
- The product code or INCI name if mentioned (e.g. "E471", "PGMS", "Palsgaard® 6135")
- The application category (e.g. "Ice Cream", "Plant-Based Frozen Desserts", "Margarine", "Bakery")
- The specific technical benefit or claim (e.g. "reduces LBG/tara gum by 30-50%", "heat shock stable at 0.3% dosage", "enables 120% overrun without quality loss")
- Any quantitative data mentioned (percentages, dosage levels, cost savings)
- Key formulation keywords that would match consumer trend signals (e.g. "plant-based", "clean label", "cost reduction", "texture", "creamy mouthfeel")

Return a JSON object with:
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
  try {
    const base44 = createClientFromRequest(req);
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
      return Response.json({ error: 'Source has no file_url' }, { status: 400 });
    }

    // Mark as processing
    await base44.entities.Source.update(source_id, { status: 'processing' });

    // Fetch file as binary and convert to base64
    const fileResponse = await fetch(source.file_url);
    if (!fileResponse.ok) {
      throw new Error(`Failed to fetch file: ${fileResponse.status}`);
    }
    const fileBuffer = await fileResponse.arrayBuffer();
    const uint8 = new Uint8Array(fileBuffer);
    let binary = '';
    for (let i = 0; i < uint8.length; i++) {
      binary += String.fromCharCode(uint8[i]);
    }
    const base64Data = btoa(binary);

    // Determine media type
    const lowerUrl = source.file_url.toLowerCase();
    let mediaType = 'application/pdf';
    if (lowerUrl.includes('.pptx') || lowerUrl.includes('.ppt')) {
      mediaType = 'application/vnd.openxmlformats-officedocument.presentationml.presentation';
    } else if (lowerUrl.includes('.docx')) {
      mediaType = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
    }

    // Call Claude API directly with file as document
    const claudeApiKey = Deno.env.get('ANTHROPIC_API_KEY');
    if (!claudeApiKey) {
      throw new Error('ANTHROPIC_API_KEY secret not set');
    }

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
                  type: 'base64',
                  media_type: mediaType,
                  data: base64Data
                }
              },
              {
                type: 'text',
                text: `Extract all Palsgaard capability claims from this document titled: "${source.title}". Return valid JSON only, no markdown.`
              }
            ]
          }
        ]
      })
    });

    if (!claudeResponse.ok) {
      const errText = await claudeResponse.text();
      throw new Error(`Claude API error ${claudeResponse.status}: ${errText}`);
    }

    const claudeData = await claudeResponse.json();
    const rawText = claudeData.content?.[0]?.text || '';

    // Parse JSON — strip markdown fences if present
    let parsed;
    const jsonMatch = rawText.match(/```json\s*([\s\S]*?)```/) || rawText.match(/```\s*([\s\S]*?)```/);
    const jsonText = jsonMatch ? jsonMatch[1] : rawText.trim();
    parsed = JSON.parse(jsonText);

    // Update source record
    await base44.entities.Source.update(source_id, {
      ai_summary: parsed.ai_summary || null,
      excerpts: parsed.excerpts || [],
      suggested_tags: parsed.suggested_tags || [],
      category: parsed.category || source.category || null,
      status: 'ready',
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
    if (source_id) {
      try {
        const base44 = createClientFromRequest(req);
        await base44.entities.Source.update(source_id, {
          status: 'failed',
          status_message: error.message
        });
      } catch (_) {}
    }
    return Response.json({ error: error.message }, { status: 500 });
  }
});