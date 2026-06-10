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

    // Skip if metadata already extracted and verified
    if (source.metadata_extraction?.status === 'extracted' && source.metadata_extraction?.verified) {
      return Response.json({ skipped: true, reason: 'Already verified' });
    }

    // ── Smart skip rules (DEL 4) ──────────────────────────────────────────────
    // GNPD: has its own column-mapping pipeline
    if (source.source_type === 'gnpd') {
      await base44.asServiceRole.entities.Source.update(source_id, {
        metadata_extraction: { ...(source.metadata_extraction || {}), status: 'skipped', skip_reason: 'GNPD handled by separate pipeline' }
      });
      return Response.json({ skipped: true, reason: 'GNPD handled by separate pipeline' });
    }

    // Archive or image file extensions — no extractable text
    const fileUrl = source.file_url || source.url || '';
    const lowerUrl = fileUrl.toLowerCase();
    if (/\.(zip|rar|7z)(\?|$)/.test(lowerUrl)) {
      await base44.asServiceRole.entities.Source.update(source_id, {
        metadata_extraction: { ...(source.metadata_extraction || {}), status: 'skipped', skip_reason: 'Archive file — no extractable content' }
      });
      return Response.json({ skipped: true, reason: 'Archive file' });
    }
    if (/\.(jpg|jpeg|png|gif|webp)(\?|$)/.test(lowerUrl)) {
      await base44.asServiceRole.entities.Source.update(source_id, {
        metadata_extraction: { ...(source.metadata_extraction || {}), status: 'skipped', skip_reason: 'Image file — no text content' }
      });
      return Response.json({ skipped: true, reason: 'Image file' });
    }
    // Excel files that are NOT Mintel: structured data, not a narrative document
    if (/\.xlsx(\?|$)/.test(lowerUrl) && source.source_type !== 'mintel') {
      await base44.asServiceRole.entities.Source.update(source_id, {
        metadata_extraction: { ...(source.metadata_extraction || {}), status: 'skipped', skip_reason: 'Excel/structured data — not a narrative document' }
      });
      return Response.json({ skipped: true, reason: 'Excel structured data' });
    }

    // Only run full extraction for narrative document types
    const narrativeExtensions = /\.(pdf|docx|pptx|txt|md|html|htm)(\?|$)/;
    const narrativeTypes = ['mintel', 'report', 'url', 'knowledge'];
    const isNarrativeExt = narrativeExtensions.test(lowerUrl) || !lowerUrl.includes('.');
    const isNarrativeType = narrativeTypes.includes(source.source_type);
    if (!isNarrativeExt && !isNarrativeType) {
      await base44.asServiceRole.entities.Source.update(source_id, {
        metadata_extraction: { ...(source.metadata_extraction || {}), status: 'skipped', skip_reason: 'Not a supported narrative document type' }
      });
      return Response.json({ skipped: true, reason: 'Not a narrative document' });
    }

    const isKnowledge = source.source_type === 'knowledge';
    console.log(`[autoExtractMetadata] Processing source: ${source_id} (${source.title})${isKnowledge ? ' [knowledge variant]' : ''}`);

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

    // Knowledge sources are often pptx/docx — extract text inline (same logic as readSourceContent)
    if (isKnowledge && source.file_url && /\.(pptx|docx)(\?|$)/.test(lowerUrl)) {
      try {
        let fetchUrl = source.file_url;
        if (!fetchUrl.startsWith('http')) {
          const signed = await base44.asServiceRole.integrations.Core.CreateFileSignedUrl({ file_uri: fetchUrl, expires_in: 300 });
          fetchUrl = signed.signed_url;
        }
        const res = await fetch(fetchUrl, { signal: AbortSignal.timeout(60_000) });
        if (res.ok) {
          const arrayBuffer = await res.arrayBuffer();
          if (/\.docx(\?|$)/.test(lowerUrl)) {
            const mammoth = await import('npm:mammoth@1.8.0');
            const result = await mammoth.extractRawText({ arrayBuffer });
            documentText = result.value || '';
          } else {
            const JSZip = (await import('npm:jszip@3.10.1')).default;
            const zip = await JSZip.loadAsync(arrayBuffer);
            const slideFiles = Object.keys(zip.files).filter(f => /ppt\/slides\/slide[0-9]+\.xml/.test(f)).sort();
            const parts = [];
            for (const slideFile of slideFiles) {
              const xml = await zip.files[slideFile].async('string');
              const text = xml.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
              if (text) parts.push(text);
            }
            documentText = parts.join('\n');
          }
          if (documentText.length >= 100) {
            extractionMethod = 'office_inline';
            console.log(`[autoExtractMetadata] Inline office extraction: ${documentText.length} chars`);
          } else {
            documentText = '';
          }
        }
      } catch (e) {
        console.warn('[autoExtractMetadata] Inline office extraction failed:', e.message);
      }
    }

    if (!documentText && source.file_url) {
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

    // Fallback for PDFs that ExtractDataFromUploadedFile rejects (e.g. >10MB): pdfjs text extraction
    if (!documentText && source.file_url && (/\.pdf(\?|$)/.test(lowerUrl) || !lowerUrl.includes('.'))) {
      try {
        let fetchUrl = source.file_url;
        try {
          const signed = await base44.asServiceRole.integrations.Core.CreateFileSignedUrl({ file_uri: fetchUrl, expires_in: 300 });
          if (signed?.signed_url) fetchUrl = signed.signed_url;
        } catch (_) { /* not a private file */ }
        const { getDocument } = await import('npm:pdfjs-dist@4.4.168/legacy/build/pdf.mjs');
        const res = await fetch(fetchUrl);
        if (res.ok) {
          const buf = new Uint8Array(await res.arrayBuffer());
          const pdf = await getDocument({ data: buf }).promise;
          const parts = [];
          const maxPages = Math.min(pdf.numPages, 40);
          for (let i = 1; i <= maxPages; i++) {
            const page = await pdf.getPage(i);
            const content = await page.getTextContent();
            parts.push(content.items.map(it => it.str).join(' '));
          }
          documentText = parts.join('\n');
          extractionMethod = 'pdfjs_fallback';
          console.log(`[autoExtractMetadata] pdfjs fallback extracted ${documentText.length} chars`);
        }
      } catch (e) {
        console.warn('[autoExtractMetadata] pdfjs fallback failed:', e.message);
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
        pipeline_stage: 'failed',
        failure_reason: 'Metadata extraction failed: could not extract text from document',
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
    // Knowledge variant: internal Palsgaard material gets its own field set
    const knowledgePrompt = `You are a metadata extraction specialist for Palsgaard, a B2B food ingredient company.
The following is an INTERNAL Palsgaard knowledge document (sales material, recipe concept, technical guide, etc.).

DOCUMENT TEXT:
${textForLLM}

FILENAME: ${fileName}

TASK: Extract metadata. Use ONLY these values for enum fields:
- document_type: "sales_presentation" | "recipe_concept" | "white_paper" | "troubleshooting_guide" | "consumer_insight" | "technical_guide" | "other"
- application_categories: array from ["Ice Cream", "Bakery", "Confectionery", "Dairy", "Dressings", "Spreads"]
- audience_scope: "internal" | "external" | "distributor_only" | "regional_restricted"
  Detect from title/content markers like "FOR DISTRIBUTOR USE ONLY", "AGENTS AND DISTRIBUTORS" (→ distributor_only), "EU ONLY", "ASPAC" or other region restrictions (→ regional_restricted), "EXTERNAL" (→ external). Default to "internal" when unmarked.
- region_restriction: ONLY when audience_scope="regional_restricted" — the restricted region (e.g. "EU", "ASPAC")
- product_references: Palsgaard product names mentioned, exactly as written (e.g. "Emulpals 117", "PGPR 4190", "CreamWhip 431")
- capability_areas: array from ["sustainability", "texture_quality", "cost_efficiency", "compliance_regulatory", "new_product_development", "food_safety", "supply_chain", "plant_based", "general"]

ALSO extract:
- title: clean human-readable document title (not the raw filename)
- ai_summary: 2-3 sentence summary of what the document covers
- notes: 1-2 sentence internal note on its relevance/use
- tags: short keyword tags

IMPORTANT: Only return fields you are confident about. Do not guess.`;

    const knowledgeSchema = {
      type: 'object',
      properties: {
        title: { type: 'string' },
        document_type: { type: 'string' },
        application_categories: { type: 'array', items: { type: 'string' } },
        audience_scope: { type: 'string' },
        region_restriction: { type: 'string' },
        product_references: { type: 'array', items: { type: 'string' } },
        capability_areas: { type: 'array', items: { type: 'string' } },
        ai_summary: { type: 'string' },
        notes: { type: 'string' },
        tags: { type: 'array', items: { type: 'string' } }
      }
    };

    const llmPrompt = isKnowledge ? knowledgePrompt : `You are a metadata extraction specialist for a B2B food ingredient company (Palsgaard). 
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
10. notes: Write a concise internal note (1-2 sentences) describing the document's focus, scope, and relevance for a food ingredient company. This goes in the internal notes field.

IMPORTANT: Only return fields you are confident about. Do not guess.`;

    let llmResult;
    try {
      llmResult = await base44.asServiceRole.integrations.Core.InvokeLLM({
        prompt: llmPrompt,
        model: 'claude_sonnet_4_6',
        response_json_schema: isKnowledge ? knowledgeSchema : {
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
            notes: { type: 'string' },
            tags: { type: 'array', items: { type: 'string' } }
          }
        }
      });
    } catch (llmError) {
      console.error('[autoExtractMetadata] LLM call failed:', llmError.message);
      await base44.asServiceRole.entities.Source.update(source_id, {
        pipeline_stage: 'failed',
        failure_reason: `Metadata extraction failed: ${llmError.message}`,
        metadata_extraction: {
          status: 'failed',
          last_attempted: new Date().toISOString(),
          missing_fields: ['title', 'date_published', 'category', 'region_code']
        }
      });
      return Response.json({ error: 'LLM extraction failed', details: llmError.message }, { status: 500 });
    }

    // ── STEP 3: Build update payload ─────────────────────────────────────────
    // Normalize: some LLM responses wrap in a "response" key
    if (llmResult && llmResult.response && typeof llmResult.response === 'object') {
      Object.assign(llmResult, llmResult.response);
      delete llmResult.response;
    }

    const updateData = {
      metadata_extraction: {
        status: 'extracted',
        last_attempted: new Date().toISOString(),
        // Knowledge sources are internal Palsgaard material — auto-verified, no manual gate
        verified: isKnowledge,
        variant: isKnowledge ? 'knowledge' : 'market_intel',
        extraction_method: extractionMethod,
        extracted_data: llmResult
      }
    };

    if (isKnowledge) {
      // Auto-approve so knowledge sources flow straight to excerpt processing
      updateData.review_status = 'approved';
      updateData.reviewed_at = new Date().toISOString();
    }

    // Apply extracted fields to top-level Source fields
    // Only overwrite if currently empty/missing
    const fieldMapping = isKnowledge ? {
      title: 'title',
      ai_summary: 'ai_summary',
      notes: 'notes',
      tags: 'tags'
    } : {
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
      notes: 'notes',
      tags: 'tags'
    };

    for (const [llmField, sourceField] of Object.entries(fieldMapping)) {
      const value = llmResult[llmField];
      const hasValue = value !== null && value !== undefined && value !== '' &&
        (Array.isArray(value) ? value.length > 0 : true);
      if (hasValue) {
        // Only overwrite if field is empty/missing — don't clobber user-set values
        const currentValue = source[sourceField];
        const isEmpty = currentValue === null || currentValue === undefined || currentValue === '' ||
          currentValue === 'the-future-of-yogurt-and-chilled-desserts-2026 (1).pdf' || // overwrite raw filenames
          (Array.isArray(currentValue) && currentValue.length === 0) ||
          (typeof currentValue === 'string' && currentValue.endsWith('.pdf')) || // overwrite raw filenames
          (typeof currentValue === 'string' && currentValue.endsWith('.xlsx')) ||
          (typeof currentValue === 'string' && currentValue.endsWith('.html'));
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

    // Knowledge: map first application category to Source.category if empty
    if (isKnowledge && Array.isArray(llmResult.application_categories) && llmResult.application_categories.length > 0 && !source.category) {
      updateData.category = llmResult.application_categories[0];
    }

    // Missing fields tracking
    const requiredFields = isKnowledge ? ['title'] : ['title', 'date_published', 'category', 'region_code'];
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