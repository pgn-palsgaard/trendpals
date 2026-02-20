import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { source_id, project_id } = await req.json();

    if (!source_id) {
      return Response.json({ error: 'source_id required' }, { status: 400 });
    }

    // Get the source
    const source = await base44.entities.Source.get(source_id);
    if (!source || !source.file_url) {
      return Response.json({ error: 'Source not found or has no file' }, { status: 404 });
    }

    // Only process PDFs
    if (!source.file_url.toLowerCase().endsWith('.pdf')) {
      return Response.json({ error: 'Source must be a PDF' }, { status: 400 });
    }

    // Use LLM to extract product references from PDF
    const extractionResult = await base44.integrations.Core.InvokeLLM({
      prompt: `Extract all product references from this Mintel PDF, focusing on GNPD product mentions.

For each product found, extract:
- Mintel GNPD Record ID (if present, usually in format "Record ID 12345678" or in URL like "gnpd.com/...record=12345678")
- Product URL (if it's a Mintel GNPD product link)
- Product name
- Brand name (if mentioned)
- Country (if mentioned)
- Page number where found
- Context snippet (the sentence/paragraph mentioning the product)
- Section heading (the nearest heading above the mention)

CRITICAL RULES:
- Only extract actual product mentions, not generic category references
- If a Record ID or URL is present, capture it exactly
- Include enough context to understand why this product was highlighted
- Mark the type of reference: direct_link, record_id_mention, or narrative_mention

Return a structured list.`,
      file_urls: [source.file_url],
      response_json_schema: {
        type: "object",
        properties: {
          products: {
            type: "array",
            items: {
              type: "object",
              properties: {
                mintel_record_id: { type: "string" },
                mintel_product_url: { type: "string" },
                product_name: { type: "string" },
                brand: { type: "string" },
                country: { type: "string" },
                page_number: { type: "number" },
                context_snippet: { type: "string" },
                section_heading: { type: "string" },
                reference_type: { 
                  type: "string",
                  enum: ["direct_link", "record_id_mention", "narrative_mention"]
                }
              },
              required: ["product_name", "page_number", "context_snippet"]
            }
          }
        }
      }
    });

    const extractedProducts = extractionResult.products || [];
    
    // Create PDFCuratedProduct records
    const createdRecords = [];
    for (const product of extractedProducts) {
      // Determine status based on what we have
      let status = 'extracted';
      if (product.mintel_record_id) {
        status = 'extracted'; // We have Record ID, good to go
      } else if (product.mintel_product_url) {
        // Try to extract Record ID from URL
        const urlMatch = product.mintel_product_url.match(/record[=\/](\d+)/i);
        if (urlMatch) {
          product.mintel_record_id = urlMatch[1];
          status = 'extracted';
        } else {
          status = 'needs_manual_review';
        }
      } else {
        status = 'needs_manual_review'; // No ID, need manual matching
      }

      const record = await base44.entities.PDFCuratedProduct.create({
        project_id: project_id || source.project_id,
        source_id,
        mintel_record_id: product.mintel_record_id || null,
        mintel_product_url: product.mintel_product_url || null,
        page_number: product.page_number,
        section_heading: product.section_heading || null,
        context_snippet: product.context_snippet,
        anchor_text: product.reference_type === 'direct_link' ? product.product_name : null,
        product_name: product.product_name,
        brand: product.brand || null,
        country: product.country || null,
        status
      });

      createdRecords.push(record);
    }

    return Response.json({
      success: true,
      extracted_count: createdRecords.length,
      products: createdRecords
    });

  } catch (error) {
    console.error('Extract products error:', error);
    return Response.json({ 
      error: error.message,
      details: error.stack
    }, { status: 500 });
  }
});