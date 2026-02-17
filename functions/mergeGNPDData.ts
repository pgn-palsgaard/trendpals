import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { project_id, html_file_url, xlsx_file_url, title } = await req.json();

    console.log('Starting GNPD merge process...');

    // Fetch and parse HTML directly
    console.log('Fetching HTML from:', html_file_url);
    const htmlResponse = await fetch(html_file_url);
    const htmlText = await htmlResponse.text();
    
    // Parse HTML to extract record IDs and image URLs
    const imageMap = {};
    
    // Match patterns like: record_id="12345" and img src="..."
    // or data-record-id="12345" and corresponding images
    const recordIdPattern = /(?:record[_-]?id|data-record[_-]?id|id)=["'](\d+)["']/gi;
    const imgPattern = /<img[^>]+src=["']([^"']+)["'][^>]*>/gi;
    
    // Split HTML into sections by tables or divs
    const sections = htmlText.split(/(?=<tr|<div[^>]*class=["'][^"']*product)/i);
    
    for (const section of sections) {
      const recordMatch = section.match(/(?:record[_-]?id|data-record[_-]?id|id)=["'](\d+)["']/i);
      const imgMatch = section.match(/<img[^>]+src=["']([^"']+)["'][^>]*>/i);
      
      if (recordMatch && imgMatch) {
        const recordId = recordMatch[1];
        let imageUrl = imgMatch[1];
        
        // Handle relative URLs
        if (imageUrl.startsWith('/') || imageUrl.startsWith('..')) {
          const baseUrl = new URL(html_file_url).origin;
          imageUrl = new URL(imageUrl, baseUrl).href;
        }
        
        imageMap[recordId] = imageUrl;
        console.log(`Matched record ${recordId} to image: ${imageUrl}`);
      }
    }

    console.log(`Found ${Object.keys(imageMap).length} image mappings`);

    // Extract full product data from XLSX
    console.log('Extracting data from XLSX...');
    const xlsxExtractResult = await base44.integrations.Core.ExtractDataFromUploadedFile({
      file_url: xlsx_file_url,
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
                brand: { type: "string" },
                launch_date: { type: "string" },
                country: { type: "string" },
                market: { type: "string" },
                category: { type: "string" },
                sub_category: { type: "string" }
              },
              required: ["record_id"]
            }
          }
        },
        required: ["products"]
      }
    });

    if (xlsxExtractResult.status !== 'success') {
      return Response.json({ 
        error: 'Failed to extract data from Excel file',
        xlsx_status: xlsxExtractResult.status
      }, { status: 400 });
    }

    console.log(`Extracted ${xlsxExtractResult.output?.products?.length || 0} products from Excel`);

    // Merge data and upload images
    const mergedProducts = [];
    let successfulUploads = 0;
    let failedUploads = 0;
    
    if (xlsxExtractResult.output?.products) {
      for (const product of xlsxExtractResult.output.products) {
        const recordId = String(product.record_id).trim();
        let has_image = false;
        let uploaded_image_url = null;

        // Check if we have an image for this product
        const imageUrl = imageMap[recordId];
        if (imageUrl) {
          try {
            console.log(`Downloading image for product ${recordId}...`);
            const imgResponse = await fetch(imageUrl);
            
            if (imgResponse.ok) {
              const imgBlob = await imgResponse.blob();
              const imgFile = new File([imgBlob], `gnpd_${recordId}.jpg`, { type: imgBlob.type });
              
              console.log(`Uploading image for product ${recordId}...`);
              const uploadResult = await base44.integrations.Core.UploadFile({ file: imgFile });
              
              if (uploadResult.file_url) {
                uploaded_image_url = uploadResult.file_url;
                has_image = true;
                successfulUploads++;
                console.log(`✓ Successfully uploaded image for product ${recordId}`);
              }
            } else {
              console.log(`Failed to fetch image for product ${recordId}: ${imgResponse.status}`);
              failedUploads++;
            }
          } catch (e) {
            console.error(`Failed to upload image for product ${recordId}:`, e.message);
            failedUploads++;
          }
        }

        mergedProducts.push({
          record_id: recordId,
          product_name: product.product_name || product.product || null,
          brand: product.brand || null,
          launch_date: product.launch_date || product.date_published || null,
          country: product.country || product.market || null,
          market: product.market || null,
          category: product.category || null,
          sub_category: product.sub_category || null,
          image_url: uploaded_image_url,
          has_image: has_image
        });
      }
    }

    console.log(`Merge complete: ${successfulUploads} images uploaded, ${failedUploads} failed`);

    // Create merged source
    const source = await base44.entities.Source.create({
      project_id,
      source_type: 'gnpd',
      title: title || 'Merged GNPD Data',
      file_url: xlsx_file_url,
      status: 'processed',
      gnpd_data: mergedProducts,
      excerpts: [],
      freshness: 'recent'
    });

    // Update project data sufficiency score
    const allSources = await base44.entities.Source.filter({ project_id });
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

    return Response.json({ 
      success: true,
      source_id: source.id,
      products_count: mergedProducts.length,
      images_count: successfulUploads,
      images_failed: failedUploads,
      match_rate: Math.round((successfulUploads / mergedProducts.length) * 100)
    });
  } catch (error) {
    console.error('Merge GNPD data error:', error);
    return Response.json({ 
      error: error.message || 'Failed to merge GNPD data',
      details: error.stack
    }, { status: 500 });
  }
});