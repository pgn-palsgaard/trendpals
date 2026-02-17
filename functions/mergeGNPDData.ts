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
    console.log('HTML URL:', html_file_url);
    console.log('XLSX URL:', xlsx_file_url);

    // Extract product data with images from HTML
    console.log('Extracting data from HTML...');
    const htmlExtractResult = await base44.integrations.Core.ExtractDataFromUploadedFile({
      file_url: html_file_url,
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
                image_url: { type: "string" }
              },
              required: ["record_id"]
            }
          }
        },
        required: ["products"]
      }
    });

    console.log('HTML extraction result:', JSON.stringify(htmlExtractResult, null, 2));

    // Extract full product data from XLSX
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

    if (htmlExtractResult.status !== 'success' || xlsxExtractResult.status !== 'success') {
      return Response.json({ 
        error: 'Failed to extract data from files',
        html_status: htmlExtractResult.status,
        xlsx_status: xlsxExtractResult.status
      }, { status: 400 });
    }

    // Create image map by record_id
    const imageMap = {};
    if (htmlExtractResult.output?.products) {
      for (const product of htmlExtractResult.output.products) {
        if (product.record_id && product.image_url) {
          imageMap[product.record_id] = product.image_url;
        }
      }
    }

    // Merge data and upload images
    const mergedProducts = [];
    if (xlsxExtractResult.output?.products) {
      for (const product of xlsxExtractResult.output.products) {
        const recordId = String(product.record_id);
        let has_image = false;
        let uploaded_image_url = null;

        // Check if we have an image for this product
        const imageUrl = imageMap[recordId];
        if (imageUrl) {
          try {
            const imgResponse = await fetch(imageUrl);
            const imgBlob = await imgResponse.blob();
            const imgFile = new File([imgBlob], `gnpd_${recordId}.jpg`, { type: imgBlob.type });
            
            const uploadResult = await base44.integrations.Core.UploadFile({ file: imgFile });
            if (uploadResult.file_url) {
              uploaded_image_url = uploadResult.file_url;
              has_image = true;
            }
          } catch (e) {
            console.error(`Failed to upload image for product ${recordId}:`, e);
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
    const totalImages = allSources.reduce((sum, s) => 
      sum + (s.gnpd_data?.filter(p => p.has_image).length || 0), 0
    );

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
      images_count: mergedProducts.filter(p => p.has_image).length
    });
  } catch (error) {
    console.error('Merge GNPD data error:', error);
    return Response.json({ 
      error: error.message || 'Failed to merge GNPD data',
      details: error.stack
    }, { status: 500 });
  }
});