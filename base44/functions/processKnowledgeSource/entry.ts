import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';
import JSZip from 'npm:jszip@3.10.1';

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
      "product_name": "Palsgaard® product name or null",
      "product_code": "code/INCI if available or null",
      "application": "category",
      "benefit_type": "one of: texture, cost_reduction, stability, clean_label, plant_based, functionality, sustainability",
      "quantitative_data": "any numbers/percentages mentioned or null",
      "trend_keywords": ["array", "of", "matching", "keywords"]
    }
  ],
  "suggested_tags": ["array of relevant tags for filtering"],
  "category": "primary food category this document covers"
}

Be specific. Use exact product names and numbers from the document. Do not generalize.`;

// File type detection
function getFileType(url) {
  const lower = url.toLowerCase().split('?')[0]; // strip query params
  if (lower.endsWith('.pdf')) return 'pdf';
  if (lower.endsWith('.pptx') || lower.endsWith('.ppt')) return 'pptx';
  if (lower.endsWith('.jpg') || lower.endsWith('.jpeg') || lower.endsWith('.png') || lower.endsWith('.webp') || lower.endsWith('.gif')) return 'image';
  return 'unsupported';
}

function getImageMediaType(url) {
  const lower = url.toLowerCase().split('?')[0];
  if (lower.endsWith('.png')) return 'image/png';
  if (lower.endsWith('.webp')) return 'image/webp';
  if (lower.endsWith('.gif')) return 'image/gif';
  return 'image/jpeg';
}

// Extract text from PPTX via JSZip
async function extractTextFromPptx(fileUrl) {
  const response = await fetch(fileUrl);
  if (!response.ok) {
    throw new Error(`Failed to fetch PPTX: ${response.status} ${response.statusText}`);
  }
  const arrayBuffer = await response.arrayBuffer();
  const zip = await JSZip.loadAsync(arrayBuffer);

  const slideFiles = Object.keys(zip.files)
    .filter(name => /^ppt\/slides\/slide\d+\.xml$/.test(name))
    .sort((a, b) => {
      const numA = parseInt(a.match(/\d+/)[0]);
      const numB = parseInt(b.match(/\d+/)[0]);
      return numA - numB;
    });

  let fullText = '';
  for (let i = 0; i < slideFiles.length; i++) {
    const slideXml = await zip.files[slideFiles[i]].async('text');
    const textMatches = slideXml.match(/<a:t[^>]*>([^<]+)<\/a:t>/g) || [];
    const slideText = textMatches
      .map(match => match.replace(/<[^>]+>/g, '').trim())
      .filter(t => t.length > 0)
      .join(' ');
    if (slideText.trim()) {
      fullText += `\n[Slide ${i + 1}]\n${slideText}\n`;
    }
  }
  return fullText.trim();
}

// Fetch image and convert to base64 for Claude vision
async function fetchImageAsBase64(fileUrl) {
  const response = await fetch(fileUrl);
  if (!response.ok) {
    throw new Error(`Failed to fetch image: ${response.status} ${response.statusText}`);
  }
  const arrayBuffer = await response.arrayBuffer();
  const uint8 = new Uint8Array(arrayBuffer);
  let binary = '';
  for (let i = 0; i < uint8.length; i++) {
    binary += String.fromCharCode(uint8[i]);
  }
  return btoa(binary);
}

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

    const fileType = getFileType(source.file_url);

    // Skip unsupported file types gracefully (xlsx, docx, etc.)
    if (fileType === 'unsupported') {
      await base44.entities.Source.update(source_id, {
        status: 'failed',
        status_message: `Unsupported file type — only PDF, PPTX, and images are supported`
      });
      return Response.json({
        success: false,
        skipped: true,
        reason: 'unsupported_file_type'
      });
    }

    // Mark as processing
    await base44.entities.Source.update(source_id, { status: 'processing', status_message: null });

    const claudeApiKey = Deno.env.get('ANTHROPIC_API_KEY');
    if (!claudeApiKey) {
      throw new Error('ANTHROPIC_API_KEY secret not set');
    }

    let messageContent;
    let claudeHeaders = {
      'Content-Type': 'application/json',
      'x-api-key': claudeApiKey,
      'anthropic-version': '2023-06-01'
    };

    if (fileType === 'pdf') {
      // PDF: Claude's native URL source
      claudeHeaders['anthropic-beta'] = 'pdfs-2024-09-25';
      messageContent = [
        {
          type: 'document',
          source: { type: 'url', url: source.file_url }
        },
        {
          type: 'text',
          text: `Extract all Palsgaard capability claims from this document titled: "${source.title}". Return only valid JSON, no markdown fences.`
        }
      ];

    } else if (fileType === 'pptx') {
      // PPTX: extract text server-side via JSZip
      const extractedText = await extractTextFromPptx(source.file_url);

      if (!extractedText || extractedText.length < 50) {
        await base44.entities.Source.update(source_id, {
          status: 'failed',
          status_message: 'Could not extract text from PPTX — file may be empty or image-only slides'
        });
        return Response.json({ success: false, reason: 'empty_pptx' });
      }

      messageContent = [
        {
          type: 'text',
          text: `Extract all Palsgaard product capability claims from this PowerPoint presentation titled: "${source.title}". Return only valid JSON, no markdown fences.\n\nDOCUMENT CONTENT:\n${extractedText.substring(0, 15000)}`
        }
      ];

    } else if (fileType === 'image') {
      // Image: Claude vision with base64
      const base64Data = await fetchImageAsBase64(source.file_url);
      const mediaType = getImageMediaType(source.file_url);
      messageContent = [
        {
          type: 'image',
          source: { type: 'base64', media_type: mediaType, data: base64Data }
        },
        {
          type: 'text',
          text: `Extract all Palsgaard product capability claims visible in this image titled: "${source.title}". Return only valid JSON, no markdown fences.`
        }
      ];
    }

    const claudeResponse = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: claudeHeaders,
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 4000,
        system: CLAUDE_SYSTEM_PROMPT,
        messages: [{ role: 'user', content: messageContent }]
      })
    });

    if (!claudeResponse.ok) {
      const errText = await claudeResponse.text();
      const msg = `Claude API error ${claudeResponse.status}: ${errText.substring(0, 300)}`;
      await base44.entities.Source.update(source_id, { status: 'failed', status_message: msg });
      return Response.json({ error: msg }, { status: 500 });
    }

    const claudeData = await claudeResponse.json();
    const rawText = claudeData.content?.[0]?.text || '';

    // Parse JSON — strip markdown fences if present
    let parsed;
    try {
      const jsonMatch = rawText.match(/```json\s*([\s\S]*?)```/) || rawText.match(/```\s*([\s\S]*?)```/);
      const jsonText = jsonMatch ? jsonMatch[1] : rawText.trim();
      parsed = JSON.parse(jsonText);
    } catch (_) {
      const msg = `JSON parse error: ${rawText.substring(0, 200)}`;
      await base44.entities.Source.update(source_id, { status: 'failed', status_message: msg });
      return Response.json({ error: 'JSON parse failed', raw: rawText.substring(0, 200) }, { status: 500 });
    }

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
    console.error('processKnowledgeSource error:', error.message);
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