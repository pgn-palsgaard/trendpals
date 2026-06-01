import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';
import JSZip from 'npm:jszip@3.10.1';

const BASE_SYSTEM_PROMPT = `You are a food industry expert working for Palsgaard, a producer of plant-based emulsifiers and stabilisers founded in 1917.

Your job is to extract structured insights from documents. These insights will power trend reports that open conversations with food manufacturers — they are NOT sales pitches.

CRITICAL RULES:
- Do NOT mention specific product names (e.g. Palsgaard® ArtisanIce 158, Emulpals® 117)
- Do NOT mention dosage figures (e.g. 0.45%, 0.18%)
- Do NOT mention E-numbers as the main point (e.g. E471, E401)
- DO frame insights as industry expertise and technical know-how
- DO include insights where Palsgaard knowledge is relevant even if no specific product is needed — showing broad expertise builds credibility

For each meaningful insight in the document, return a JSON object with this exact structure:

{
  "id": "unique_snake_case_id",
  "market_signal": "What is happening in the market or industry — a consumer shift, regulatory pressure, economic driver, sustainability challenge, or category trend. Write from the outside in. Max 2 sentences.",
  "customer_pain": "The concrete challenge or pressure this creates for food manufacturers. What makes this hard for them? What are they struggling with? Max 2 sentences.",
  "palsgaard_angle": "How Palsgaard technical expertise and capability can help address this challenge. Frame as know-how and problem-solving ability, not as a product. No product names, no dosages. Max 2 sentences.",
  "has_direct_role": true,
  "capability_area": "sustainability | texture_quality | cost_efficiency | compliance_regulatory | new_product_development | food_safety | supply_chain | plant_based | general",
  "category_relevance": ["Ice Cream", "Dairy", "Confectionery", "Bakery", "Spreads", "Dressings"],
  "confidence": "high | medium | low",
  "source_quote": "A short grounding quote or data point from the source that supports this insight. Max 1-2 sentences. No product names.",
  "trend_keywords": ["clean label", "resource scarcity", "sustainability"],
  "page_ref": "page 3 or slide 7"
}

Set has_direct_role to false when the insight represents valuable expert industry framing but does not require a Palsgaard product to address. This is intentional and valuable.

Return only a JSON array of insight objects. No explanatory text, no markdown, no preamble.`;

const MINTEL_EXTRA_PROMPT = `
This is a Mintel market research report. In addition to the insights array, also return a "chunks" array with chapter-level extractions.

For each chapter or major section return:
{
  "chunk_id": "chapter_snake_case_id",
  "chapter_title": "Exact chapter heading from the report",
  "chapter_index": 1,
  "text": "Full text content of this chapter",
  "statistics": [
    {
      "stat": "The exact statistic as stated",
      "context": "What this statistic measures and why it matters",
      "geography": "Western Europe / Global / etc",
      "year": "2024"
    }
  ],
  "trend_signals": ["clean label", "premiumisation"],
  "key_insights": ["One-sentence insight from this chapter", "Another insight"],
  "category_tags": ["Ice Cream", "Dairy"]
}

Never extract a number without its context. A statistic without explanation of what it measures and for whom is worthless.

Return: { "insights": [...], "chunks": [...] }`;

// File type detection
function getFileType(url) {
  const lower = url.toLowerCase().split('?')[0];
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
    const isMintel = source.source_type === 'mintel';

    // Skip unsupported file types gracefully (xlsx, docx, etc.)
    if (fileType === 'unsupported') {
      const msg = `Unsupported file type — only PDF, PPTX, and images are supported`;
      await base44.entities.Source.update(source_id, {
        status: 'failed',
        status_message: msg,
        processing_error: msg,
        rag_processed: false
      });
      return Response.json({ success: false, skipped: true, reason: 'unsupported_file_type' });
    }

    // Mark as processing
    await base44.entities.Source.update(source_id, { status: 'processing', status_message: null });

    const claudeApiKey = Deno.env.get('ANTHROPIC_API_KEY');
    if (!claudeApiKey) {
      throw new Error('ANTHROPIC_API_KEY secret not set');
    }

    // Build system prompt — append Mintel chunk instructions if needed
    const systemPrompt = isMintel
      ? BASE_SYSTEM_PROMPT + MINTEL_EXTRA_PROMPT
      : BASE_SYSTEM_PROMPT;

    let messageContent;
    const claudeHeaders = {
      'Content-Type': 'application/json',
      'x-api-key': claudeApiKey,
      'anthropic-version': '2023-06-01'
    };

    if (fileType === 'pdf') {
      claudeHeaders['anthropic-beta'] = 'pdfs-2024-09-25';
      messageContent = [
        {
          type: 'document',
          source: { type: 'url', url: source.file_url }
        },
        {
          type: 'text',
          text: `Extract structured insights from this document titled: "${source.title}". Return only valid JSON, no markdown fences.`
        }
      ];

    } else if (fileType === 'pptx') {
      const extractedText = await extractTextFromPptx(source.file_url);

      if (!extractedText || extractedText.length < 50) {
        const msg = 'Could not extract text from PPTX — file may be empty or image-only slides';
        await base44.entities.Source.update(source_id, {
          status: 'failed',
          status_message: msg,
          processing_error: msg,
          rag_processed: false
        });
        return Response.json({ success: false, reason: 'empty_pptx' });
      }

      messageContent = [
        {
          type: 'text',
          text: `Extract structured insights from this PowerPoint presentation titled: "${source.title}". Return only valid JSON, no markdown fences.\n\nDOCUMENT CONTENT:\n${extractedText.substring(0, 15000)}`
        }
      ];

    } else if (fileType === 'image') {
      const base64Data = await fetchImageAsBase64(source.file_url);
      const mediaType = getImageMediaType(source.file_url);
      messageContent = [
        {
          type: 'image',
          source: { type: 'base64', media_type: mediaType, data: base64Data }
        },
        {
          type: 'text',
          text: `Extract structured insights visible in this image titled: "${source.title}". Return only valid JSON, no markdown fences.`
        }
      ];
    }

    const claudeResponse = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: claudeHeaders,
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 8000,
        system: systemPrompt,
        messages: [{ role: 'user', content: messageContent }]
      })
    });

    if (!claudeResponse.ok) {
      const errText = await claudeResponse.text();
      const msg = `Claude API error ${claudeResponse.status}: ${errText.substring(0, 300)}`;
      await base44.entities.Source.update(source_id, {
        status: 'failed',
        status_message: msg,
        processing_error: msg,
        rag_processed: false
      });
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
      await base44.entities.Source.update(source_id, {
        status: 'failed',
        status_message: msg,
        processing_error: msg,
        rag_processed: false
      });
      return Response.json({ error: 'JSON parse failed', raw: rawText.substring(0, 200) }, { status: 500 });
    }

    // For Mintel: expect { insights: [...], chunks: [...] }
    // For others: expect a plain array of insight objects
    let insights;
    let updatePayload;

    if (isMintel) {
      insights = parsed.insights || [];
      const chunks = parsed.chunks || [];
      const excerptCount = insights.length;
      updatePayload = {
        excerpts: insights,
        mintel_chunks: chunks,
        mintel_chunking_status: 'ready',
        status: 'ready',
        status_message: `RAG complete: ${excerptCount} insight${excerptCount !== 1 ? 's' : ''} + ${chunks.length} chapter chunk${chunks.length !== 1 ? 's' : ''} extracted`,
        processing_error: null,
        rag_processed: true,
        rag_excerpt_count: excerptCount,
        processing_completed_at: new Date().toISOString()
      };
    } else {
      insights = Array.isArray(parsed) ? parsed : (parsed.excerpts || []);
      const excerptCount = insights.length;
      updatePayload = {
        excerpts: insights,
        status: 'ready',
        status_message: `RAG complete: ${excerptCount} insight${excerptCount !== 1 ? 's' : ''} extracted`,
        processing_error: null,
        rag_processed: true,
        rag_excerpt_count: excerptCount,
        processing_completed_at: new Date().toISOString()
      };
    }

    await base44.entities.Source.update(source_id, updatePayload);

    return Response.json({
      success: true,
      source_id,
      insights_count: insights.length,
      is_mintel: isMintel
    });

  } catch (error) {
    console.error('processKnowledgeSource error:', error.message);
    if (source_id && base44) {
      try {
        await base44.entities.Source.update(source_id, {
          status: 'failed',
          status_message: 'RAG processing failed: ' + error.message,
          processing_error: error.message,
          rag_processed: false
        });
      } catch (_) {}
    }
    return Response.json({ error: error.message }, { status: 500 });
  }
});