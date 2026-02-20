import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
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

    // Get project, trend, and sources
    const project = await base44.entities.Project.get(project_id);
    const trend = await base44.entities.TrendCandidate.get(trend_id);
    const sources = await base44.entities.Source.filter({ project_id });
    const pdfCuratedProducts = await base44.entities.PDFCuratedProduct.filter({ project_id });

    // Get all GNPD products from sources
    const gnpdProducts = [];
    sources.forEach(source => {
      if (source.gnpd_data && Array.isArray(source.gnpd_data)) {
        source.gnpd_data.forEach((product, idx) => {
          gnpd_products.push({
            ...product,
            source_id: source.id,
            row_index: idx
          });
        });
      }
    });

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
    
    for (const gnpdProduct of gnpdProducts) {
      const recordId = gnpdProduct['Record ID'] || gnpdProduct.record_id;
      
      // Skip if already added from PDF
      if (recordId && seenRecordIds.has(recordId)) {
        // Upgrade to BOTH
        const existing = candidates.find(c => c.mintel_record_id === recordId);
        if (existing) {
          existing.source_pool = 'BOTH';
          existing.evidence_links.gnpd_source_id = gnpdProduct.source_id;
          existing.evidence_links.gnpd_row_index = gnpdProduct.row_index;
          // Merge GNPD data
          existing.company = gnpdProduct.Company || gnpdProduct.company;
          existing.launch_date = gnpdProduct['Launch Date'] || gnpdProduct.launch_date;
          existing.description = gnpdProduct.Description || gnpdProduct.description;
          existing.claims = gnpdProduct.Claims ? gnpdProduct.Claims.split(';').map(c => c.trim()) : [];
          existing.ingredients = gnpdProduct.Ingredients || gnpdProduct.ingredients;
          existing.format = gnpdProduct.Format || gnpdProduct.format;
          existing.gnpd_data_raw = gnpdProduct;
        }
        continue;
      }

      // Keyword matching (basic retrieval)
      const searchText = [
        gnpdProduct['Product name'] || gnpdProduct.product_name,
        gnpdProduct.Description || gnpdProduct.description,
        gnpdProduct.Claims || gnpdProduct.claims,
        gnpdProduct.Ingredients || gnpdProduct.ingredients
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
          product_name: gnpdProduct['Product name'] || gnpdProduct.product_name,
          brand: gnpdProduct.Brand || gnpdProduct.brand,
          company: gnpdProduct.Company || gnpdProduct.company,
          country: gnpdProduct.Market || gnpdProduct.country,
          region_code: gnpdProduct.region_code,
          launch_date: gnpdProduct['Launch Date'] || gnpdProduct.launch_date,
          description: gnpdProduct.Description || gnpdProduct.description,
          claims: gnpdProduct.Claims ? gnpdProduct.Claims.split(';').map(c => c.trim()) : [],
          ingredients: gnpdProduct.Ingredients || gnpdProduct.ingredients,
          format: gnpdProduct.Format || gnpdProduct.format,
          gnpd_data_raw: gnpdProduct,
          evidence_links: {
            gnpd_source_id: gnpdProduct.source_id,
            gnpd_row_index: gnpdProduct.row_index
          }
        });
      }
    }

    // Limit to top 50 for LLM reranking (to save costs)
    const candidatesToRank = candidates.slice(0, 50);

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
      products: createdCandidates
    });

  } catch (error) {
    console.error('Generate product shortlist error:', error);
    return Response.json({ 
      error: error.message,
      details: error.stack
    }, { status: 500 });
  }
});