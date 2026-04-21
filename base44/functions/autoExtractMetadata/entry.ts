import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

/**
 * Auto-triggered function: runs when a Source record is created.
 * Deep-reads the uploaded file (PDF/report) and fills in all metadata fields
 * using a thorough LLM analysis of the full document content.
 */
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);

    const payload = await req.json();
    const { event, data } = payload;

    // Support both direct call (source_id) and entity automation payload
    let source;
    if (data && data.id) {
      source = data;
    } else if (payload.source_id) {
      source = await base44.asServiceRole.entities.Source.get(payload.source_id);
    } else {
      return Response.json({ error: 'No source data provided' }, { status: 400 });
    }

    const source_id = source.id;

    // Only process file-based sources that need extraction
    if (!source.file_url && !source.url) {
      return Response.json({ skipped: true, reason: 'No file or URL to process' });
    }

    // Skip GNPD sources — they have their own processing pipeline
    if (source.source_type === 'gnpd') {
      return Response.json({ skipped: true, reason: 'GNPD handled by separate pipeline' });
    }

    // Skip if metadata already extracted and verified
    if (source.metadata_extraction?.status === 'extracted' && source.metadata_extraction?.verified) {
      return Response.json({ skipped: true, reason: 'Already verified' });
    }

    console.log(`[autoExtractMetadata] Processing source: ${source_id} (${source.title})`);

    // Mark as processing
    await base44.asServiceRole.entities.Source.update(source_id, {
      metadata_extraction: {
        ...(source.metadata_extraction || {}),
        status: 'pending',
        last_attempted: new Date().toISOString()
      }
    });

    // ── STEP 1: Extract full document text ──────────────────────────────────
    let documentText = '';
    let extractionMethod = 'none';

    if (source.file_url) {
      try {
        const extractResult = await base44.asServiceRole.integrations.Core.ExtractDataFromUploadedFile({
          file_url: source.file_url,
          json_schema: {
            type: 'object',
            properties: {
              full_text: { type: 'string', description: 'Complete extracted text from the document' },
              page_count: { type: 'number' }
            }
          }
        });

        if (extractResult.status === 'success' && extractResult.output?.full_text) {
          documentText = extractResult.output.full_text;
          extractionMethod = 'file_extraction';
          console.log(`[autoExtractMetadata] Extracted ${documentText.length} chars from file`);
        }
      } catch (e) {
        console.warn('[autoExtractMetadata] File extraction failed, trying fetch:', e.message);
      }
    }

    // For URL sources, fetch the content
    if (!documentText && source.url) {
      try {
        const response = await fetch(source.url);
        documentText = await response.text();
        extractionMethod = 'url_fetch';
        // Strip HTML tags for cleaner text
        documentText = documentText.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
      } catch (e) {
        console.warn('[autoExtractMetadata] URL fetch failed:', e.message);
      }
    }

    if (!documentText || documentText.length < 100) {
      await base44.asServiceRole.entities.Source.update(source_id, {
        metadata_extraction: {
          status: 'failed',
          last_attempted: new Date().toISOString(),
          missing_fields: ['title', 'date_published', 'category', 'region_code', 'document_type', 'publisher']
        }
      });
      return Response.json({ error: 'Could not extract text from document' }, { status: 422 });
    }

    // Limit text to ~12,000 chars (first ~6 pages worth) — enough for metadata, avoids token overload
    // But we send a representative sample: first 8000 chars + last 2000 chars for context
    const textForLLM = documentText.length > 10000
      ? documentText.substring(0, 8000) + '\n\n[...middle of document...]\n\n' + documentText.substring(documentText.length - 2000)
      : documentText;

    const fileName = source.title || '';

    // ── STEP 2: Deep LLM analysis ────────────────────────────────────────────
    const llmPrompt = `You are a metadata extraction specialist for a B2B food ingredient company (Palsgaard). 
Analyze the following document content and extract ALL available metadata with high accuracy.

DOCUMENT TEXT:
${textForLLM}

FILENAME: ${fileName}

TASK: Extract all metadata fields you can find. Be thorough — read the entire text carefully.

CONTROLLED VOCABULARIES (use ONLY these values for enum fields):
- document_type: "REPORT" | "INDUSTRY TREND" | "WEBINAR" | "PRESENTATION" | "WHITEPAPER" | "OTHER"
- category: "Bakery" | "Confectionery" | "Dairy" | "Feed" | "Fine Food" | "Ice Cream" | "Lipid" | "Meat" | "Other Food Applications" | "PCI" | "Polymer" | "Tech"
- main_group: "Food" (for food categories) | "BSA" (for PCI, Polymer, Tech)
- region_code: "ASPAC" | "AMERICAS" | "EMEC" | "IMEA" | "Global"
  - ASPAC = Asia Pacific / APAC
  - AMERICAS = North America, South America, US, Canada, Latin America
  - EMEC = Europe, Middle East, Central (EMEA, Europe)
  - IMEA = India, Middle East, Africa
  - Global = worldwide / global scope

RULES:
1. date_published: Extract the publication/report date. Return as YYYY-MM-DD. If only year available, return YYYY-01-01.
2. coverage_period: The time period the DATA covers (e.g. "2024", "2023-2025", "Q1 2025"). Different from publication date.
3. title: The main document title (not subtitle). Preserve original casing.
4. subtitle: The deck/report subtitle or summary line if present.
5. publisher: "Mintel" | "GNPD" | "Other/Unknown". Look for branding, logos mentioned, copyright lines.
6. author: Person's name if listed as author or analyst.
7. category: Choose the SINGLE best matching food category from the controlled list.
8. region_code: Map to the closest canonical region code. If document covers multiple regions, use "Global".
9. ai_summary: Write a 2-3 sentence summary of what this document covers and its key insights.

IMPORTANT: Only return fields you are confident about. Do not guess.`;

    let llmResult;
    try {
      llmResult = await base44.asServiceRole.integrations.Core.InvokeLLM({
        prompt: llmPrompt,
        model: 'claude_sonnet_4_6',
        response_json_schema: {
          type: 'object',
          properties: {
            title: { type: 'string' },
            subtitle: { type: 'string' },
            author: { type: 'string' },
            publisher: { type: 'string' },
            date_published: { type: 'string', description: 'YYYY-MM-DD format' },
            coverage_period: { type: 'string' },
            document_type: { type: 'string' },
            category: { type: 'string' },
            main_group: { type: 'string' },
            region_code: { type: 'string' },
            source_type: { type: 'string', description: 'mintel | gnpd | report | url | knowledge | other' },
            ai_summary: { type: 'string' },
            tags: { type: 'array', items: { type: 'string' } }
          }
        }
      });
    } catch (llmError) {
      console.error('[autoExtractMetadata] LLM call failed:', llmError.message);
      await base44.asServiceRole.entities.Source.update(source_id, {
        metadata_extraction: {
          status: 'failed',
          last_attempted: new Date().toISOString(),
          missing_fields: ['title', 'date_published', 'category', 'region_code']
        }
      });
      return Response.json({ error: 'LLM extraction failed', details: llmError.message }, { status: 500 });
    }

    // ── STEP 3: Build update payload ─────────────────────────────────────────
    const updateData = {
      metadata_extraction: {
        status: 'extracted',
        last_attempted: new Date().toISOString(),
        verified: false,
        extraction_method: extractionMethod,
        extracted_data: llmResult
      }
    };

    // Apply extracted fields to top-level Source fields
    // Only overwrite if currently empty/missing
    const fieldMapping = {
      title: 'title',
      subtitle: 'subtitle',
      author: 'author',
      publisher: 'publisher',
      date_published: 'date_published',
      coverage_period: 'coverage_period',
      document_type: 'document_type',
      category: 'category',
      main_group: 'main_group',
      region_code: 'region_code',
      source_type: 'source_type',
      ai_summary: 'ai_summary',
      tags: 'tags'
    };

    for (const [llmField, sourceField] of Object.entries(fieldMapping)) {
      const value = llmResult[llmField];
      if (value && value !== '' && (Array.isArray(value) ? value.length > 0 : true)) {
        // Only overwrite empty fields (don't clobber user-set values)
        const currentValue = source[sourceField];
        const isEmpty = currentValue === null || currentValue === undefined || currentValue === '' ||
          (Array.isArray(currentValue) && currentValue.length === 0);
        if (isEmpty) {
          updateData[sourceField] = value;
        }
      }
    }

    // Compute freshness from date_published
    if (llmResult.date_published && !source.freshness) {
      try {
        const pubDate = new Date(llmResult.date_published);
        const now = new Date();
        const ageMonths = (now - pubDate) / (1000 * 60 * 60 * 24 * 30);
        if (ageMonths < 12) updateData.freshness = 'recent';
        else if (ageMonths < 30) updateData.freshness = 'aging';
        else updateData.freshness = 'outdated';
      } catch (e) {
        // ignore date parse errors
      }
    }

    // Missing fields tracking
    const requiredFields = ['title', 'date_published', 'category', 'region_code'];
    const missingFields = requiredFields.filter(f => !llmResult[f] && !source[f]);
    updateData.metadata_extraction.missing_fields = missingFields;
    if (missingFields.length > 0) {
      updateData.metadata_extraction.status = 'partial';
    }

    await base44.asServiceRole.entities.Source.update(source_id, updateData);

    console.log(`[autoExtractMetadata] Done. Applied fields: ${Object.keys(updateData).filter(k => k !== 'metadata_extraction').join(', ')}`);
    console.log(`[autoExtractMetadata] Missing fields: ${missingFields.join(', ') || 'none'}`);

    return Response.json({
      success: true,
      source_id,
      applied_fields: Object.keys(updateData).filter(k => k !== 'metadata_extraction'),
      missing_fields: missingFields,
      extraction_status: updateData.metadata_extraction.status
    });

  } catch (error) {
    console.error('[autoExtractMetadata] Fatal error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});