import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { project_id, xlsx_file_url, extracted_images } = await req.json();

    console.log(`Merging GNPD data with ${extracted_images.length} extracted images`);

    // Extract product data from XLSX
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
        details: xlsxExtractResult.details
      }, { status: 400 });
    }

    console.log(`Extracted ${xlsxExtractResult.output?.products?.length || 0} products from Excel`);

    // Create lookup map for images
    const imageMap = {};
    for (const mapping of extracted_images) {
      if (mapping.record_id && mapping.image_url) {
        imageMap[mapping.record_id.trim()] = mapping.image_url;
      }
    }

    // Merge data and upload images
    const mergedProducts = [];
    let successfulUploads = 0;
    let failedUploads = 0;
    
    if (xlsxExtractResult.output?.products) {
      for (const product of xlsxExtractResult.output.products) {
        const recordId = String(product.record_id).trim();
        let has_image = false;
        let uploaded_image_url = null;

        const imageUrl = imageMap[recordId];
        
        if (imageUrl) {
          try {
            console.log(`Downloading image for product ${recordId}...`);
            const imgResponse = await fetch(imageUrl);
            
            if (imgResponse.ok) {
              const imgBlob = await imgResponse.blob();
              const contentType = imgResponse.headers.get('content-type') || 'image/jpeg';
              const ext = contentType.includes('png') ? 'png' : 'jpg';
              const imgFile = new File([imgBlob], `gnpd_${recordId}.${ext}`, { type: contentType });
              
              const uploadResult = await base44.integrations.Core.UploadFile({ file: imgFile });
              
              if (uploadResult.file_url) {
                uploaded_image_url = uploadResult.file_url;
                has_image = true;
                successfulUploads++;
              }
            } else {
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
      title: 'GNPD Data with Images',
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
      images_failed: failedUploads
    });
  } catch (error) {
    console.error('Merge GNPD with images error:', error);
    return Response.json({ 
      error: error.message || 'Failed to merge data',
      details: error.stack
    }, { status: 500 });
  }
});