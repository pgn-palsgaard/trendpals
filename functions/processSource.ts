import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

// Helper to normalize URL for duplicate detection
function normalizeUrl(url) {
  try {
    const urlObj = new URL(url);
    // Remove tracking params
    const trackingParams = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term', 'fbclid', 'gclid'];
    trackingParams.forEach(param => urlObj.searchParams.delete(param));
    // Normalize protocol and remove trailing slash
    return urlObj.href.toLowerCase().replace(/\/$/, '');
  } catch {
    return url.toLowerCase().replace(/\/$/, '');
  }
}

// Helper to compute SHA-256 hash
async function computeFileHash(fileContent) {
  const msgBuffer = new TextEncoder().encode(fileContent);
  const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { project_id, source_type, file_url, url, title, category, region, tags } = await req.json();

    // DUPLICATE DETECTION
    let file_hash = null;
    let normalized_url = null;

    // For file uploads: compute hash
    if (file_url && source_type !== 'url') {
      const fileResponse = await fetch(file_url);
      const fileContent = await fileResponse.text();
      file_hash = await computeFileHash(fileContent);

      // Check for exact hash match
      const existingSources = await base44.asServiceRole.entities.Source.filter({ file_hash });
      if (existingSources.length > 0) {
        const duplicate = existingSources[0];
        return Response.json({
          error: 'DUPLICATE_DETECTED',
          message: 'This file has already been uploaded',
          duplicate: {
            id: duplicate.id,
            title: duplicate.title,
            date: duplicate.date,
            category: duplicate.category,
            region_code: duplicate.region_code
          }
        }, { status: 409 });
      }
    }

    // For URL sources: normalize and check
    if (source_type === 'url' && url) {
      normalized_url = normalizeUrl(url);

      // Check for normalized URL match
      const existingSources = await base44.asServiceRole.entities.Source.filter({ normalized_url });
      if (existingSources.length > 0) {
        const duplicate = existingSources[0];
        return Response.json({
          error: 'DUPLICATE_DETECTED',
          message: 'This URL has already been added',
          duplicate: {
            id: duplicate.id,
            title: duplicate.title,
            date: duplicate.date,
            category: duplicate.category,
            region_code: duplicate.region_code
          }
        }, { status: 409 });
      }
    }

    // Create source record first (project_id is now optional)
    const sourceData = {
      source_type,
      title,
      file_url: file_url || null,
      url: url || null,
      status: 'processing',
      excerpts: [],
      gnpd_data: [],
      category: category || null,
      region: region || null,
      tags: tags || [],
      file_hash: file_hash || null,
      normalized_url: normalized_url || null
    };

    // Only add project_id if provided (for backward compatibility)
    if (project_id) {
      sourceData.project_id = project_id;
    }

    const source = await base44.entities.Source.create(sourceData);

    // Process based on source type
    try {
      if (source_type === 'url') {
        // Fetch URL content
        const response = await fetch(url);
        const text = await response.text();
        
        // Extract text chunks (simplified)
        const excerpts = [{
          id: `excerpt_${Date.now()}`,
          text: text.substring(0, 1000),
          page_ref: 'web'
        }];

        await base44.entities.Source.update(source.id, {
          status: 'processed',
          excerpts,
          freshness: 'recent'
        });
      } else if (source_type === 'gnpd') {
        // Process GNPD file
        const fileResponse = await fetch(file_url);
        const fileContent = await fileResponse.text();

        let gnpd_data = [];

        // Detect file type and parse
        if (file_url.endsWith('.csv') || fileContent.includes(',')) {
          // Parse CSV
          const lines = fileContent.split('\n');
          const headers = lines[0].split(',').map(h => h.trim().replace(/"/g, ''));
          
          for (let i = 1; i < lines.length && i < 1000; i++) {
            const values = lines[i].split(',').map(v => v.trim().replace(/"/g, ''));
            if (values.length === headers.length) {
              const product = {};
              headers.forEach((header, idx) => {
                product[header] = values[idx];
              });
              gnpd_data.push(product);
            }
          }
        } else if (fileContent.includes('<html') || fileContent.includes('<table')) {
          // Use ExtractDataFromUploadedFile for more robust HTML parsing
          const extractResult = await base44.integrations.Core.ExtractDataFromUploadedFile({
            file_url,
            json_schema: {
              type: "object",
              properties: {
                products: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      record_id: { type: "string" },
                      product_name: { type: "string" },
                      image_url: { type: "string" },
                      brand: { type: "string" },
                      launch_date: { type: "string" },
                      country: { type: "string" }
                    },
                    required: ["record_id", "product_name"]
                  }
                }
              },
              required: ["products"]
            }
          });

          if (extractResult.status === 'success' && extractResult.output?.products) {
            const extractedProducts = extractResult.output.products;
            
            for (const product of extractedProducts) {
              let has_image = false;
              let uploaded_image_url = null;

              if (product.image_url) {
                try {
                  const imgResponse = await fetch(product.image_url);
                  const imgBlob = await imgResponse.blob();
                  const imgFile = new File([imgBlob], `gnpd_product_${product.record_id || Date.now()}.jpg`, { type: imgBlob.type });
                  
                  const uploadResult = await base44.integrations.Core.UploadFile({ file: imgFile });
                  if (uploadResult.file_url) {
                    uploaded_image_url = uploadResult.file_url;
                    has_image = true;
                  }
                } catch (e) {
                  console.error(`Failed to download/upload image for product ${product.record_id}:`, e);
                }
              }

              gnpd_data.push({
                record_id: product.record_id,
                product_name: product.product_name,
                brand: product.brand || null,
                launch_date: product.launch_date || null,
                country: product.country || null,
                image_url: uploaded_image_url,
                has_image: has_image,
                parsed_from_html: true
              });
            }
          }
        }

        // Calculate freshness based on dates in GNPD data
        const currentYear = new Date().getFullYear();
        const hasRecentProducts = gnpd_data.some(p => {
          const dateStr = p.Date || p.date || p['Launch Date'] || '';
          return dateStr.includes(String(currentYear)) || dateStr.includes(String(currentYear - 1));
        });

        await base44.entities.Source.update(source.id, {
          status: 'processed',
          gnpd_data,
          freshness: hasRecentProducts ? 'recent' : 'aging'
        });
      } else {
        // Process PDF or other report
        // Use ExtractDataFromUploadedFile for PDFs
        const extractResult = await base44.integrations.Core.ExtractDataFromUploadedFile({
          file_url,
          json_schema: {
            type: "object",
            properties: {
              excerpts: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    text: { type: "string" },
                    page_number: { type: "number" }
                  }
                }
              },
              publication_date: { type: "string" }
            }
          }
        });

        let excerpts = [];
        let publicationDate = null;

        if (extractResult.status === 'success' && extractResult.output) {
          const data = extractResult.output;
          
          // Create excerpt chunks
          if (data.excerpts && Array.isArray(data.excerpts)) {
            excerpts = data.excerpts.map((excerpt, idx) => ({
              id: `excerpt_${source.id}_${idx}`,
              text: excerpt.text,
              page_ref: excerpt.page_number ? `p${excerpt.page_number}` : `chunk_${idx}`
            }));
          }

          publicationDate = data.publication_date;
        }

        // Determine freshness based on publication date
        let freshness = 'recent';
        if (publicationDate) {
          const pubYear = new Date(publicationDate).getFullYear();
          const currentYear = new Date().getFullYear();
          const age = currentYear - pubYear;
          
          if (age > 2) freshness = 'outdated';
          else if (age > 1) freshness = 'aging';
        }

        await base44.entities.Source.update(source.id, {
          status: 'processed',
          excerpts,
          date: publicationDate,
          freshness
        });
      }

      // Update project data sufficiency score (only if project_id provided)
      if (project_id) {
        const project = await base44.entities.Project.get(project_id);
        
        // Get all sources linked to this project
        let allSources = [];
        if (project.selected_source_ids && project.selected_source_ids.length > 0) {
          for (const sourceId of project.selected_source_ids) {
            try {
              const src = await base44.entities.Source.get(sourceId);
              if (src) allSources.push(src);
            } catch (e) {
              console.warn(`Source ${sourceId} not found`);
            }
          }
        } else {
          // Fallback: get sources directly linked to project (legacy)
          allSources = await base44.entities.Source.filter({ project_id });
        }
        
        const mintelCount = allSources.filter(s => s.source_type === 'mintel').length;
        const gnpdCount = allSources.filter(s => s.source_type === 'gnpd').length;
        const totalExcerpts = allSources.reduce((sum, s) => sum + (s.excerpts?.length || 0), 0);
        const totalGnpdProducts = allSources.reduce((sum, s) => sum + (s.gnpd_data?.length || 0), 0);

        let score = 0;
        if (mintelCount > 0) score += 30;
        if (gnpdCount > 0) score += 20;
        if (totalExcerpts > 10) score += 25;
        if (totalGnpdProducts > 20) score += 25;

        await base44.entities.Project.update(project_id, {
          data_sufficiency_score: Math.min(score, 100)
        });
      }

      return Response.json({ 
        success: true, 
        source_id: source.id,
        excerpts_count: source.excerpts?.length || 0,
        gnpd_count: source.gnpd_data?.length || 0
      });
    } catch (processingError) {
      // Update source status to error
      await base44.entities.Source.update(source.id, {
        status: 'error'
      });
      
      throw processingError;
    }
  } catch (error) {
    console.error('Process source error:', error);
    return Response.json({ 
      error: error.message || 'Failed to process source',
      details: error.stack
    }, { status: 500 });
  }
});