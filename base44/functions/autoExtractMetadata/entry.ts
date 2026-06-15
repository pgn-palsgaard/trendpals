import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

// ── Inline category validator (inlined from lib/palsgaardCategoryMapping.js — no shared imports allowed) ──
const VALID_CATEGORY_VALUES = ['bakery','condiments','chocolate_confectionery','dairy','ice_cream','meat','oils_fats','plant_based','rutf_rusf','out_of_scope','needs_human_review'];
const BRIEF_NORM = {'confectionery':'chocolate_confectionery','chocolate':'chocolate_confectionery','chocolate confectionery':'chocolate_confectionery','chocolate & confectionery':'chocolate_confectionery','bakery':'bakery','cake':'bakery','cake gels':'bakery','baking':'bakery','dairy':'dairy','ice cream':'ice_cream','ice-cream':'ice_cream','soft serve ice cream':'ice_cream','soft serve':'ice_cream','meat':'meat','processed meat':'meat','oils':'oils_fats','oils & fats':'oils_fats','fats':'oils_fats','margarine':'oils_fats','plant based':'plant_based','plant-based':'plant_based','plant based products':'plant_based','plant based dairy alternatives':'plant_based','plant-based dairy alternatives':'plant_based','plant based beverages and dairy alternatives':'plant_based','rutf':'rutf_rusf','rusf':'rutf_rusf','rutf and rusf':'rutf_rusf','condiments':'condiments','condiments & sauces':'condiments','sauces':'condiments','dressings':'condiments','spreads':'condiments','sweet spreads':'condiments','coffee creamer':'dairy','creamer':'dairy','creamers':'dairy'};

/**
 * Validates a single LLM-proposed category string against the canonical enum.
 * Returns { canonical: string|null, raw: string, deviated: boolean }
 * - canonical = valid canonical key, or null if unresolvable (cross-category / too generic)
 * - deviated = true if the raw value was non-canonical (triggers deviation log)
 */
function validateLLMCategory(raw) {
  if (raw === null || raw === undefined || raw === '') return { canonical: null, raw: raw ?? null, deviated: false };
  if (VALID_CATEGORY_VALUES.includes(raw)) return { canonical: raw, raw, deviated: false };
  // Attempt normalization
  const normalized = BRIEF_NORM[raw.trim().toLowerCase()];
  if (normalized) return { canonical: normalized, raw, deviated: true };
  // Cannot normalize — set to null, record deviation
  return { canonical: null, raw, deviated: true };
}

/** Validates an array of category_relevance keys. Drops unknowns, logs deviations. */
function validateLLMCategoryArray(arr) {
  if (!Array.isArray(arr)) return { canonical: [], deviations: [] };
  const canonical = [];
  const deviations = [];
  for (const raw of arr) {
    const result = validateLLMCategory(raw);
    if (result.canonical) canonical.push(result.canonical);
    if (result.deviated) deviations.push(raw);
  }
  return { canonical, deviations };
}

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

    // Classification gate: classifySource invokes this function AFTER classification is
    // decided. Don't race the create-automation against an in-flight classification.
    if (source.classification?.status === 'classifying' || source.pipeline_stage === 'needs_classification') {
      return Response.json({ skipped: true, reason: 'Classification in progress — will be invoked after classification decision' });
    }

    // Intake invariant: a classified source must never have a null confidence
    if (source.classification &&
        ['auto_applied', 'pending', 'confirmed', 'corrected'].includes(source.classification.status) &&
        (source.classification.confidence === null || source.classification.confidence === undefined)) {
      await base44.asServiceRole.entities.Source.update(source_id, {
        pipeline_stage: 'failed',
        failure_reason: 'intake_invariant: classification_confidence is null post-intake',
      });
      return Response.json({ error: 'Invariant violation: classification_confidence null' }, { status: 422 });
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

    console.log(`[autoExtractMetadata] Processing source: ${source_id} (${source.title})`);

    // Mark as processing — pipeline_stage reflects reality during extraction
    const wasPreExtraction = !source.pipeline_stage || ['uploaded', 'extracting'].includes(source.pipeline_stage);
    await base44.asServiceRole.entities.Source.update(source_id, {
      ...(wasPreExtraction && { pipeline_stage: 'extracting' }),
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

    // Helper: get a fetchable URL (handles private files via signed URL)
    async function getSignedOrDirectUrl(url) {
      try {
        const signed = await base44.asServiceRole.integrations.Core.CreateFileSignedUrl({ file_uri: url, expires_in: 300 });
        if (signed?.signed_url) return signed.signed_url;
      } catch (_) { /* not a private file */ }
      return url;
    }

    // Fallback 1 (PDF): pdfjs — for PDFs that ExtractDataFromUploadedFile rejects (e.g. >10MB)
    if (!documentText && source.file_url && (/\.pdf(\?|$)/.test(lowerUrl) || !lowerUrl.includes('.'))) {
      try {
        const fetchUrl = await getSignedOrDirectUrl(source.file_url);
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

    // Fallback 2 (PPTX): JSZip slide text extraction — for PPTX files ExtractDataFromUploadedFile cannot handle
    // Uses <a:t> text-run node extraction (same pattern as processKnowledgeSource)
    if (!documentText && source.file_url && /\.pptx?(\?|$)/.test(lowerUrl)) {
      try {
        const fetchUrl = await getSignedOrDirectUrl(source.file_url);
        const res = await fetch(fetchUrl);
        if (res.ok) {
          const arrayBuffer = await res.arrayBuffer();
          const JSZip = (await import('npm:jszip@3.10.1')).default;
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
          documentText = fullText.trim();
          extractionMethod = 'jszip_pptx_fallback';
          console.log(`[autoExtractMetadata] JSZip PPTX fallback extracted ${documentText.length} chars from ${slideFiles.length} slides`);
        }
      } catch (e) {
        console.warn('[autoExtractMetadata] JSZip PPTX fallback failed:', e.message);
      }
    }

    // Fallback 3 (DOCX): mammoth — for DOCX files ExtractDataFromUploadedFile cannot handle
    if (!documentText && source.file_url && /\.docx?(\?|$)/.test(lowerUrl)) {
      try {
        const fetchUrl = await getSignedOrDirectUrl(source.file_url);
        const res = await fetch(fetchUrl);
        if (res.ok) {
          const arrayBuffer = await res.arrayBuffer();
          const mammoth = await import('npm:mammoth@1.8.0');
          const result = await mammoth.extractRawText({ arrayBuffer });
          documentText = result.value || '';
          extractionMethod = 'mammoth_docx_fallback';
          console.log(`[autoExtractMetadata] mammoth DOCX fallback extracted ${documentText.length} chars`);
        }
      } catch (e) {
        console.warn('[autoExtractMetadata] mammoth DOCX fallback failed:', e.message);
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
      // Build explicit failure_reason naming every method tried
      const triedMethods = [];
      if (source.file_url) triedMethods.push('ExtractDataFromUploadedFile');
      if (/\.pdf(\?|$)/.test(lowerUrl) || !lowerUrl.includes('.')) triedMethods.push('pdfjs');
      if (/\.pptx?(\?|$)/.test(lowerUrl)) triedMethods.push('jszip_pptx');
      if (/\.docx?(\?|$)/.test(lowerUrl)) triedMethods.push('mammoth_docx');
      if (source.url) triedMethods.push('url_fetch');
      const failureReason = `Text extraction failed: tried [${triedMethods.join(', ') || 'none'}] — file may be image-only, password-protected, or unsupported format`;
      await base44.asServiceRole.entities.Source.update(source_id, {
        pipeline_stage: 'failed',
        failure_reason: failureReason,
        metadata_extraction: {
          status: 'failed',
          last_attempted: new Date().toISOString(),
          missing_fields: ['title', 'date_published', 'category', 'region_code', 'document_type', 'publisher']
        }
      });
      return Response.json({ error: failureReason }, { status: 422 });
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
- category: "bakery" | "condiments" | "chocolate_confectionery" | "dairy" | "ice_cream" | "meat" | "oils_fats" | "plant_based" | "rutf_rusf" | "out_of_scope" | "needs_human_review"
  - If the document clearly covers multiple Palsgaard solution areas, return null for category (cross-category source)
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
      source_type_ai_proposed: 'source_type_ai_proposed',
      ai_summary: 'ai_summary',
      notes: 'notes',
      tags: 'tags'
    };

    // ── EN-1: Validate category before writing ────────────────────────────
    let categoryDeviation = null;
    if (llmResult.category !== null && llmResult.category !== undefined && llmResult.category !== '') {
      const catResult = validateLLMCategory(llmResult.category);
      if (catResult.deviated) {
        categoryDeviation = catResult.raw;
        console.warn(`[autoExtractMetadata] Non-canonical category from LLM: "${catResult.raw}" → ${catResult.canonical ?? 'null (cross-category)'}`);
      }
      // Replace raw LLM value with canonical (or null) before field mapping
      llmResult.category = catResult.canonical;
      if (catResult.deviated && catResult.raw) {
        llmResult.category_ai_proposed = catResult.raw;
      }
    }

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
          (typeof currentValue === 'string' && /\.(pdf|pptx?|docx?|xlsx?|html?)$/i.test(currentValue)); // overwrite raw filenames
        if (isEmpty) {
          updateData[sourceField] = value;
        }
      }
    }

    // Write category_ai_proposed if a deviation was detected and the field isn't already set
    if (categoryDeviation && !source.category_ai_proposed) {
      updateData.category_ai_proposed = categoryDeviation;
    }

    // ── EN-2: Validate source_type before writing ─────────────────────────────
    // The LLM returns source_type as free-text — never write a non-enum value to the entity.
    const VALID_SOURCE_TYPES = ['mintel', 'market_intel', 'gnpd', 'report', 'url', 'knowledge', 'other'];
    if (llmResult.source_type && !VALID_SOURCE_TYPES.includes(llmResult.source_type)) {
      const rawSourceType = llmResult.source_type;
      console.warn(`[autoExtractMetadata] Non-canonical source_type from LLM: "${rawSourceType}" — storing in source_type_ai_proposed, not writing to source_type`);
      // Log to LLMCategoryDeviation (field_name='source_type') — fire-and-forget
      base44.asServiceRole.entities.LLMCategoryDeviation.create({
        source_id: source_id,
        function_name: 'autoExtractMetadata',
        field_name: 'source_type',
        raw_llm_value: rawSourceType,
        normalized_to: null,
        normalization_succeeded: false,
        detected_at: new Date().toISOString(),
      }).catch(e => console.warn('[autoExtractMetadata] LLMCategoryDeviation create failed (source_type):', e.message));
      // Preserve proposal in source_type_ai_proposed; nullify to prevent invalid enum write
      llmResult.source_type_ai_proposed = rawSourceType;
      llmResult.source_type = null;
    }

    // Log deviation to LLMCategoryDeviation entity (fire-and-forget)
    if (categoryDeviation) {
      const catResult = validateLLMCategory(categoryDeviation);
      base44.asServiceRole.entities.LLMCategoryDeviation.create({
        source_id: source_id,
        function_name: 'autoExtractMetadata',
        field_name: 'category',
        raw_llm_value: categoryDeviation,
        normalized_to: catResult.canonical ?? null,
        normalization_succeeded: catResult.canonical !== null,
        detected_at: new Date().toISOString(),
      }).catch(e => console.warn('[autoExtractMetadata] deviation log failed:', e.message));
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

    // Metadata done → past 'uploaded' (invariant). Don't regress sources already
    // further along (extracted/gnpd_ready — e.g. legacy backfills).
    if (wasPreExtraction) {
      updateData.pipeline_stage = 'metadata_extracted';
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