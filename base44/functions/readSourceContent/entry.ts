import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

/**
 * readSourceContent
 * 
 * Given a source_id, this function:
 * 1. Fetches the Source entity (metadata + stored excerpts)
 * 2. If the source has a file_url (public) or private file_uri, generates a signed URL and extracts full text via AI
 * 3. Returns both the stored excerpts AND a full-text extraction if possible
 * 
 * Used by the AI agent to read actual source content, not just metadata.
 */
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { source_id, max_excerpts } = await req.json();

    if (!source_id) {
      return Response.json({ error: 'source_id is required' }, { status: 400 });
    }

    // Fetch the source entity
    const source = await base44.entities.Source.get(source_id);
    if (!source) {
      return Response.json({ error: 'Source not found' }, { status: 404 });
    }

    const excerptLimit = max_excerpts || 50;

    // Build base response from stored excerpts
    const storedExcerpts = (source.excerpts || []).slice(0, excerptLimit).map(e => ({
      id: e.id,
      text: e.text,
      page_ref: e.page_ref
    }));

    // Attempt to extract full text from the file if a file_url exists
    let fullTextExtraction = null;
    const fileUrl = source.file_url;

    if (fileUrl && source.source_type !== 'gnpd') {
      try {
        const extractResult = await base44.integrations.Core.ExtractDataFromUploadedFile({
          file_url: fileUrl,
          json_schema: {
            type: "object",
            properties: {
              full_text: {
                type: "string",
                description: "The complete readable text content of the document"
              },
              key_statistics: {
                type: "array",
                items: { type: "string" },
                description: "Any specific statistics, percentages, or data points mentioned"
              },
              key_themes: {
                type: "array",
                items: { type: "string" },
                description: "Main themes and topics covered"
              },
              publication_date: {
                type: "string",
                description: "Publication date if mentioned"
              }
            }
          }
        });

        if (extractResult.status === 'success' && extractResult.output) {
          fullTextExtraction = extractResult.output;
        }
      } catch (extractError) {
        console.warn('Full text extraction failed:', extractError.message);
        // Continue with stored excerpts only
      }
    }

    // For GNPD sources, return structured product data summary
    let gnpdSummary = null;
    if (source.source_type === 'gnpd' && source.gnpd_data) {
      const products = source.gnpd_data.slice(0, 100);
      gnpdSummary = {
        total_products: source.gnpd_row_count || source.gnpd_data.length,
        columns: source.gnpd_headers || [],
        sample_products: products.slice(0, 20),
        date_range: {
          min: products.reduce((min, p) => {
            const d = p._date_published_parsed;
            return d && (!min || d < min) ? d : min;
          }, null),
          max: products.reduce((max, p) => {
            const d = p._date_published_parsed;
            return d && (!max || d > max) ? d : max;
          }, null)
        }
      };
    }

    return Response.json({
      source_id: source.id,
      title: source.title,
      source_type: source.source_type,
      publisher: source.publisher,
      date_published: source.date_published || source.date,
      coverage_period: source.coverage_period,
      category: source.category,
      region_code: source.region_code,
      ai_summary: source.ai_summary,
      notes: source.notes,
      status: source.status,
      stored_excerpts: storedExcerpts,
      stored_excerpts_count: source.excerpts?.length || 0,
      full_text_extraction: fullTextExtraction,
      gnpd_summary: gnpdSummary,
      has_file: !!fileUrl
    });

  } catch (error) {
    console.error('readSourceContent error:', error);
    return Response.json({
      error: error.message || 'Failed to read source content',
      details: error.stack
    }, { status: 500 });
  }
});