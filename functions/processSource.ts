import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { project_id, source_type, file_url, url, title } = await req.json();

    // Calculate freshness based on current date
    const calculateFreshness = (sourceDate) => {
      if (!sourceDate) return 'recent';
      const monthsOld = (new Date() - new Date(sourceDate)) / (1000 * 60 * 60 * 24 * 30);
      if (monthsOld <= 12) return 'recent';
      if (monthsOld <= 24) return 'aging';
      return 'outdated';
    };

    let excerpts = [];
    let gnpd_data = [];
    let status = 'processed';
    let sourceDate = new Date().toISOString().split('T')[0];

    // Process based on source type
    if (source_type === 'gnpd' && file_url) {
      // Check if it's an HTML file
      const isHtml = file_url.toLowerCase().endsWith('.html') || title.toLowerCase().endsWith('.html');
      
      try {
        const fileResponse = await fetch(file_url);
        const fileText = await fileResponse.text();
        
        if (isHtml) {
          // Parse HTML to extract images
          const imgRegex = /<img[^>]+src=["']([^"']+)["'][^>]*>/gi;
          const imageUrls = [];
          let match;
          
          while ((match = imgRegex.exec(fileText)) !== null) {
            imageUrls.push(match[1]);
          }
          
          // Process each image URL - download and re-upload to get public URL
          const processedImages = [];
          for (const imgUrl of imageUrls) {
            try {
              // Check if URL is absolute
              let fullUrl = imgUrl;
              if (!imgUrl.startsWith('http')) {
                // Skip relative URLs or data URLs
                continue;
              }
              
              // Download image
              const imgResponse = await fetch(fullUrl);
              if (imgResponse.ok) {
                const blob = await imgResponse.blob();
                
                // Convert blob to File for upload
                const arrayBuffer = await blob.arrayBuffer();
                const uint8Array = new Uint8Array(arrayBuffer);
                
                // Upload to Base44 storage
                const uploadResult = await base44.integrations.Core.UploadFile({
                  file: uint8Array
                });
                
                processedImages.push({
                  original_url: imgUrl,
                  hosted_url: uploadResult.file_url
                });
              }
            } catch (err) {
              console.error(`Failed to process image: ${imgUrl}`, err);
            }
          }
          
          // Extract product data from HTML using LLM
          const llmResponse = await base44.integrations.Core.InvokeLLM({
            prompt: `Extract GNPD product data from this HTML file. 
            Look for product information including: product name, brand, market/country, launch date, category, key ingredients, claims, etc.
            Return as a JSON array of products with all available fields.`,
            file_urls: [file_url],
            response_json_schema: {
              type: "object",
              properties: {
                products: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      product_name: { type: "string" },
                      brand: { type: "string" },
                      market: { type: "string" },
                      launch_date: { type: "string" },
                      category: { type: "string" },
                      key_ingredients: { type: "string" },
                      claims: { type: "string" }
                    }
                  }
                }
              }
            }
          });
          
          gnpd_data = (llmResponse.products || []).map((product, idx) => ({
            ...product,
            has_image: idx < processedImages.length,
            image_url: processedImages[idx]?.hosted_url || null,
            original_image_url: processedImages[idx]?.original_url || null
          }));
          
        } else {
          // CSV parsing (existing logic)
          const lines = fileText.split('\n');
          const headers = lines[0].split(',').map(h => h.trim().replace(/"/g, ''));
          
          for (let i = 1; i < lines.length; i++) {
            if (!lines[i].trim()) continue;
            const values = lines[i].split(',').map(v => v.trim().replace(/"/g, ''));
            const product = {};
            headers.forEach((header, idx) => {
              product[header] = values[idx];
            });
            
            // Mark if product has image
            product.has_image = !!(product['Image URL'] || product['ImageURL'] || product['Product Image']);
            
            gnpd_data.push(product);
          }
        }
      } catch (error) {
        console.error('Error processing GNPD file:', error);
        status = 'error';
      }
    } else if ((source_type === 'mintel' || source_type === 'report') && file_url) {
      // For PDFs, extract text
      try {
        const response = await base44.integrations.Core.InvokeLLM({
          prompt: `Extract key insights and statistics from this document as separate excerpts. 
          Each excerpt should be a meaningful chunk (2-4 sentences).
          Return as JSON array: [{"id": "EX1", "text": "...", "page_ref": "Page X"}]`,
          file_urls: [file_url],
          response_json_schema: {
            type: "object",
            properties: {
              excerpts: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    id: { type: "string" },
                    text: { type: "string" },
                    page_ref: { type: "string" }
                  }
                }
              }
            }
          }
        });
        
        excerpts = response.excerpts || [];
      } catch (error) {
        // Fallback: basic extraction
        excerpts = [{ id: "EX1", text: "Document uploaded successfully", page_ref: "Full document" }];
      }
    }

    const freshness = calculateFreshness(sourceDate);

    // Create source record
    const source = await base44.entities.Source.create({
      project_id,
      source_type,
      title,
      file_url: file_url || null,
      url: url || null,
      date: sourceDate,
      excerpts,
      gnpd_data,
      status,
      freshness
    });

    // Update project data sufficiency score
    const allSources = await base44.entities.Source.filter({ project_id });
    const hasMintel = allSources.some(s => s.source_type === 'mintel' || s.source_type === 'report');
    const hasGNPD = allSources.some(s => s.source_type === 'gnpd' && s.gnpd_data?.length > 0);
    const gnpdCount = allSources.find(s => s.source_type === 'gnpd')?.gnpd_data?.length || 0;
    
    let score = 0;
    if (hasMintel) score += 40;
    if (hasGNPD && gnpdCount >= 10) score += 60;
    else if (hasGNPD) score += 30;

    await base44.entities.Project.update(project_id, {
      data_sufficiency_score: score,
      state: score >= 60 ? 'evidence_sufficient' : 'draft'
    });

    return Response.json({ success: true, source });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});