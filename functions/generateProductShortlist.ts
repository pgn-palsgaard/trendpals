import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

// Enhanced date parser for multiple formats
function parseDate(dateStr) {
  if (!dateStr) return null;
  
  try {
    // Format: "13 Feb 2026"
    const ddMmmYyyy = dateStr.match(/(\d{1,2})\s+([A-Za-z]{3,})\s+(\d{4})/);
    if (ddMmmYyyy) {
      const [, day, month, year] = ddMmmYyyy;
      const monthMap = {
        jan: 0, january: 0, feb: 1, february: 1, mar: 2, march: 2,
        apr: 3, april: 3, may: 4, jun: 5, june: 5,
        jul: 6, july: 6, aug: 7, august: 7, sep: 8, september: 8,
        oct: 9, october: 9, nov: 10, november: 10, dec: 11, december: 11
      };
      const monthNum = monthMap[month.toLowerCase().slice(0, 3)];
      if (monthNum !== undefined) {
        return new Date(year, monthNum, day);
      }
    }
    
    // Try ISO and other standard formats
    const parsed = new Date(dateStr);
    if (!isNaN(parsed.getTime())) {
      return parsed;
    }
  } catch (e) {
    // Parsing failed
  }
  
  return null;
}

Deno.serve(async (req) => {
  const requestId = crypto.randomUUID();
  
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { project_id, trend_id } = await req.json();

    if (!project_id || !trend_id) {
      return Response.json({ error: 'project_id and trend_id required' }, { status: 400 });
    }

    // Initialize debug tracking
    const debug = {
      gnpd_rows_loaded: 0,
      rows_after_date_filter: 0,
      rows_after_region_filter: 0,
      candidates_retrieved_stage_a: 0,
      candidates_scored_stage_b: 0,
      final_shortlist_size: 0,
      fields_searched: [],
      trend_signals_used: [],
      empty_reasons: []
    };

    // Get project, trend, and linked sources
    const project = await base44.entities.Project.get(project_id);
    const trend = await base44.entities.TrendCandidate.get(trend_id);
    
    // Get sources linked to this project via selected_source_ids
    let sources = [];
    if (project.selected_source_ids && project.selected_source_ids.length > 0) {
      for (const sourceId of project.selected_source_ids) {
        try {
          const source = await base44.entities.Source.get(sourceId);
          if (source) sources.push(source);
        } catch (e) {
          console.warn(`Source ${sourceId} not found`);
        }
      }
    } else {
      // Fallback: old projects with direct project_id linkage
      sources = await base44.entities.Source.filter({ project_id });
    }
    
    const pdfCuratedProducts = await base44.entities.PDFCuratedProduct.filter({ project_id });

    // Check GNPD sources and column mappings
    const gnpdSources = sources.filter(s => s.source_type === 'gnpd');
    
    if (gnpdSources.length === 0) {
      debug.empty_reasons.push('No GNPD source linked to this project');
      return Response.json({ 
        error: 'No GNPD source',
        message: 'No GNPD source is linked to this project. Please link a GNPD source to generate product proofs.',
        debug
      }, { status: 400 });
    }
    
    for (const source of gnpdSources) {
      // Check processing status
      if (source.gnpd_processing_status !== 'ready') {
        return Response.json({ 
          error: 'GNPD source not ready',
          message: `GNPD source "${source.title}" is not ready yet. Status: ${source.gnpd_processing_status || 'pending'}`,
          source_id: source.id,
          source_title: source.title,
          processing_status: source.gnpd_processing_status
        }, { status: 400 });
      }
      
      // Check if data exists
      if (!source.gnpd_data || !Array.isArray(source.gnpd_data) || source.gnpd_data.length === 0) {
        return Response.json({ 
          error: 'GNPD source has no data',
          message: `GNPD source "${source.title}" has no product data. Please re-upload or process the file.`,
          source_id: source.id,
          source_title: source.title
        }, { status: 400 });
      }
      
      // Validate that required mapped columns exist
      const requiredFields = ['record_id', 'product_name', 'market', 'date_published', 'category', 'sub_category'];
      const columnMap = source.gnpd_column_mapping || {};
      
      console.log(`[generateProductShortlist] Validating source ${source.id} (${source.title})`);
      console.log(`[generateProductShortlist] gnpd_mapping_status: ${source.gnpd_mapping_status}`);
      console.log(`[generateProductShortlist] gnpd_column_mapping exists: ${!!source.gnpd_column_mapping}`);
      console.log(`[generateProductShortlist] columnMap keys: ${Object.keys(columnMap).join(', ')}`);
      
      const missingMappings = requiredFields.filter(field => !columnMap[field]);
      
      if (missingMappings.length > 0) {
        // Mark mapping as failed and save error
        await base44.entities.Source.update(source.id, {
          gnpd_mapping_status: 'failed',
          gnpd_mapping_error: `Missing required mappings: ${missingMappings.join(', ')}`
        });
        
        return Response.json({ 
          error: 'GNPD column mapping incomplete',
          error_code: 'MAPPING_INCOMPLETE',
          message: `Required GNPD column mappings are missing for "${source.title}": ${missingMappings.join(', ')}. Please complete mapping in the Sources tab.`,
          missing: missingMappings,
          source_id: source.id,
          source_title: source.title,
          request_id: requestId
        }, { status: 400 });
      }
      
      console.log(`[generateProductShortlist] Validation passed for source ${source.id}`);
      
      // Verify mapped columns exist in headers
      const headers = source.gnpd_headers || [];
      const missingHeaders = Object.values(columnMap).filter(col => col && !headers.includes(col));
      
      if (missingHeaders.length > 0) {
        // Mark mapping as failed
        await base44.entities.Source.update(source.id, {
          gnpd_mapping_status: 'failed',
          gnpd_mapping_error: `Mapped columns not found in file: ${missingHeaders.join(', ')}`
        });
        
        return Response.json({ 
          error: 'Invalid GNPD column mapping',
          error_code: 'MAPPING_INVALID',
          message: `Some mapped columns don't exist in "${source.title}". The file may have changed. Please remap in the Sources tab.`,
          source_id: source.id,
          source_title: source.title,
          request_id: requestId
        }, { status: 400 });
      }
    }

    // Get all GNPD products from sources with column mapping
    const gnpdProducts = [];
    for (const source of sources) {
      if (source.gnpd_data && Array.isArray(source.gnpd_data)) {
        // Get column mapping from source directly
        const columnMap = source.gnpd_column_mapping || {};

        source.gnpd_data.forEach((product, idx) => {
          // Map columns to standard names - convert Record ID to string
          const mapped = {
            record_id: String(product[columnMap.record_id] || ''),
            product_name: product[columnMap.product_name],
            market: product[columnMap.market],
            date_published: product[columnMap.date_published],
            product_variants: product[columnMap.product_variants],
            brand: product[columnMap.brand],
            company: product[columnMap.company],
            ultimate_company: product[columnMap.ultimate_company],
            category: product[columnMap.category],
            sub_category: product[columnMap.sub_category],
            product_description: product[columnMap.product_description],
            claims: product[columnMap.claims],
            flavours: product[columnMap.flavours],
            launch_type: product[columnMap.launch_type],
            record_hyperlink: product[columnMap.record_hyperlink],
            source_id: source.id,
            row_index: idx,
            _raw: product
          };
          
          gnpdProducts.push(mapped);
          debug.gnpd_rows_loaded++;
        });
      }
    }

    debug.fields_searched = ['product_name', 'product_variants', 'product_description', 'claims', 'category', 'sub_category', 'flavours'];

    // Build candidates list
    const candidates = [];
    const seenRecordIds = new Set();

    // Add PDF-curated products first (automatically included)
    for (const pdfProduct of pdfCuratedProducts) {
      if (pdfProduct.mintel_record_id) {
        seenRecordIds.add(pdfProduct.mintel_record_id);
      }

      candidates.push({
        source_pool: 'PDF_CURATED',
        mintel_record_id: pdfProduct.mintel_record_id,
        product_name: pdfProduct.product_name,
        brand: pdfProduct.brand,
        country: pdfProduct.country,
        evidence_links: {
          pdf_curated_id: pdfProduct.id,
          pdf_page: pdfProduct.page_number,
          pdf_snippet: pdfProduct.context_snippet
        }
      });
    }

    // Add GNPD products from Excel/CSV (deterministic retrieval)
    const signals = trend.signals_dictionary || {};
    const keywords = signals.keywords || [];
    debug.trend_signals_used = keywords.slice(0, 10);
    
    // Apply date filter using pre-parsed dates
    const twoYearsAgo = new Date();
    twoYearsAgo.setFullYear(twoYearsAgo.getFullYear() - 2);
    
    const dateFilteredProducts = gnpdProducts.filter(product => {
      // Use pre-parsed date if available
      const dateValue = product._raw?._date_published_parsed || product.date_published;
      
      if (!dateValue) {
        // Exclude rows with unknown dates from date-filtered matching
        debug.rows_excluded_unknown_date = (debug.rows_excluded_unknown_date || 0) + 1;
        return false;
      }
      
      const parsedDate = new Date(dateValue);
      if (isNaN(parsedDate.getTime())) {
        debug.rows_excluded_invalid_date = (debug.rows_excluded_invalid_date || 0) + 1;
        return false;
      }
      
      const isRecent = parsedDate >= twoYearsAgo;
      if (isRecent) debug.rows_after_date_filter++;
      return isRecent;
    });
    
    // Apply region filter
    const regionFilteredProducts = dateFilteredProducts.filter(product => {
      // TODO: Implement region matching based on project.region_code
      debug.rows_after_region_filter++;
      return true; // For now, include all
    });
    
    for (const gnpdProduct of regionFilteredProducts) {
      const recordId = gnpdProduct.record_id;
      
      // Skip if already added from PDF
      if (recordId && seenRecordIds.has(recordId)) {
        // Upgrade to BOTH
        const existing = candidates.find(c => c.mintel_record_id === recordId);
        if (existing) {
          existing.source_pool = 'BOTH';
          existing.evidence_links.gnpd_source_id = gnpdProduct.source_id;
          existing.evidence_links.gnpd_row_index = gnpdProduct.row_index;
          // Merge GNPD data
          existing.company = gnpdProduct.company;
          existing.launch_date = gnpdProduct.date_published;
          existing.description = gnpdProduct.product_variants;
          existing.brand = gnpdProduct.brand;
          existing.category = gnpdProduct.category;
          existing.gnpd_data_raw = gnpdProduct._raw;
        }
        continue;
      }

      // Keyword matching (basic retrieval)
      const searchText = [
        gnpdProduct.product_name,
        gnpdProduct.product_variants,
        gnpdProduct.category,
        gnpdProduct.sub_category
      ].filter(Boolean).join(' ').toLowerCase();

      const matchesKeywords = keywords.length === 0 || keywords.some(kw => 
        searchText.includes(kw.toLowerCase())
      );

      if (matchesKeywords) {
        if (recordId) {
          seenRecordIds.add(recordId);
        }

        candidates.push({
          source_pool: 'GNPD_EXCEL',
          mintel_record_id: recordId,
          product_name: gnpdProduct.product_name,
          brand: gnpdProduct.brand,
          company: gnpdProduct.company,
          country: gnpdProduct.market,
          region_code: project.region_code,
          launch_date: gnpdProduct.date_published,
          description: gnpdProduct.product_variants,
          category: gnpdProduct.category,
          sub_category: gnpdProduct.sub_category,
          gnpd_data_raw: gnpdProduct._raw,
          evidence_links: {
            gnpd_source_id: gnpdProduct.source_id,
            gnpd_row_index: gnpdProduct.row_index
          }
        });
        debug.candidates_retrieved_stage_a++;
      }
    }

    // Check for empty state
    if (debug.gnpd_rows_loaded === 0) {
      debug.empty_reasons.push('No GNPD data loaded from sources');
    }
    if (debug.rows_after_date_filter === 0 && debug.gnpd_rows_loaded > 0) {
      debug.empty_reasons.push('All rows filtered out by date (older than 2 years)');
    }
    if (debug.candidates_retrieved_stage_a === 0 && debug.rows_after_region_filter > 0) {
      debug.empty_reasons.push('No products matched trend signals (keywords)');
    }

    // Limit to top 50 for LLM reranking (to save costs)
    const candidatesToRank = candidates.slice(0, 50);
    debug.candidates_scored_stage_b = candidatesToRank.length;

    // LLM reranking (Stage B)
    const rankedCandidates = [];
    
    for (const candidate of candidatesToRank) {
      const llmResult = await base44.integrations.Core.InvokeLLM({
        prompt: `System: You are a QA-grade classifier. Only use the provided product fields/snippet. Do not invent facts.

Trend: ${trend.trend_name}
Trend description: ${trend.whats_changing?.join(' ') || ''}
Trend rubric:
- Must-have signals: ${signals.must_have_signals?.join(', ') || 'None specified'}
- Nice-to-have signals: ${signals.nice_to_have_signals?.join(', ') || 'None specified'}
- Exclusions: ${signals.exclusions?.join(', ') || 'None'}

Product candidate:
- Record ID: ${candidate.mintel_record_id || 'N/A'}
- Name: ${candidate.product_name}
- Brand: ${candidate.brand || 'N/A'}
- Company: ${candidate.company || 'N/A'}
- Country: ${candidate.country || 'N/A'}
- Launch date: ${candidate.launch_date || 'N/A'}
- Description: ${candidate.description || 'N/A'}
- Claims: ${candidate.claims?.join(', ') || 'N/A'}
- Ingredients: ${candidate.ingredients || 'N/A'}
- Format: ${candidate.format || 'N/A'}
- PDF snippet: ${candidate.evidence_links?.pdf_snippet || 'N/A'}

Task: Classify whether this product supports the trend. Output JSON with grounded rationale ONLY using fields above.`,
        response_json_schema: {
          type: "object",
          properties: {
            support_label: { 
              type: "string",
              enum: ["SUPPORTS", "PARTIAL", "NOT_SUPPORT"]
            },
            support_score: { type: "number" },
            matched_evidence_fields: {
              type: "array",
              items: { type: "string" }
            },
            rationale_bullets: {
              type: "array",
              items: { type: "string" }
            },
            missing_info: { type: "string" }
          },
          required: ["support_label", "support_score", "matched_evidence_fields", "rationale_bullets"]
        }
      });

      // Calculate recency score
      let recencyScore = 50;
      if (candidate.launch_date) {
        const launchYear = new Date(candidate.launch_date).getFullYear();
        const currentYear = new Date().getFullYear();
        const age = currentYear - launchYear;
        recencyScore = Math.max(0, 100 - (age * 20)); // Decay 20 pts per year
      }

      // Evidence strength score
      let evidenceScore = 50;
      if (candidate.source_pool === 'BOTH') evidenceScore = 100;
      else if (candidate.source_pool === 'PDF_CURATED') evidenceScore = 80;
      else evidenceScore = 60;

      // Final rank score
      const finalScore = (
        llmResult.support_score * 0.5 +
        recencyScore * 0.2 +
        evidenceScore * 0.3
      );

      rankedCandidates.push({
        ...candidate,
        support_label: llmResult.support_label,
        support_score: llmResult.support_score,
        matched_evidence_fields: llmResult.matched_evidence_fields,
        rationale_bullets: llmResult.rationale_bullets,
        recency_score: recencyScore,
        evidence_score: evidenceScore,
        final_rank_score: finalScore
      });
    }

    // Sort by final score
    rankedCandidates.sort((a, b) => b.final_rank_score - a.final_rank_score);

    // Filter to SUPPORTS only
    const supportedCandidates = rankedCandidates.filter(c => 
      c.support_label === 'SUPPORTS' || c.support_label === 'PARTIAL'
    );

    // Apply composition rules
    let finalShortlist = [];
    
    // Ensure at least 1 PDF-curated if available
    const pdfCurated = supportedCandidates.filter(c => c.source_pool === 'PDF_CURATED' || c.source_pool === 'BOTH');
    if (pdfCurated.length > 0) {
      finalShortlist.push(pdfCurated[0]);
    }

    // Ensure at least 1 GNPD-discovered
    const gnpdOnly = supportedCandidates.filter(c => c.source_pool === 'GNPD_EXCEL' || c.source_pool === 'BOTH');
    if (gnpdOnly.length > 0 && !finalShortlist.some(p => p.mintel_record_id === gnpdOnly[0].mintel_record_id)) {
      finalShortlist.push(gnpdOnly[0]);
    }

    // Fill remaining slots (up to 10 total)
    for (const candidate of supportedCandidates) {
      if (finalShortlist.length >= 10) break;
      if (!finalShortlist.some(p => p.mintel_record_id === candidate.mintel_record_id)) {
        finalShortlist.push(candidate);
      }
    }

    // Mark hero products (top 2)
    finalShortlist.slice(0, 2).forEach(p => p.is_hero = true);
    debug.final_shortlist_size = finalShortlist.length;

    // Delete existing candidates for this trend to avoid duplicates
    const existingCandidates = await base44.entities.ProductCandidate.filter({ trend_id });
    for (const candidate of existingCandidates) {
      await base44.entities.ProductCandidate.delete(candidate.id);
    }

    // Create ProductCandidate records
    const createdCandidates = [];
    for (const candidate of finalShortlist) {
      const created = await base44.entities.ProductCandidate.create({
        project_id,
        trend_id,
        ...candidate
      });
      createdCandidates.push(created);
    }

    return Response.json({
      success: true,
      shortlist_count: createdCandidates.length,
      products: createdCandidates,
      debug
    });

  } catch (error) {
    console.error('Generate product shortlist error:', error);
    return Response.json({ 
      error_code: 'SHORTLIST_FAILED',
      message: error.message || 'Failed to generate product shortlist',
      request_id: requestId,
      details: error.stack
    }, { status: 500 });
  }
});