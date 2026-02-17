import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { project_id, source_type, file_url, url, title } = await req.json();

    // Create source record first
    const sourceData = {
      project_id,
      source_type,
      title,
      file_url: file_url || null,
      url: url || null,
      status: 'processing',
      excerpts: [],
      gnpd_data: []
    };

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
          // Parse HTML and extract images
          const recordIdMatches = fileContent.match(/Record ID[:\s]*([0-9]+)/gi) || [];
          const imageMatches = fileContent.match(/<img[^>]+src=["']([^"']+)["']/gi) || [];
          
          // Extract and upload images
          const imageUrls = [];
          for (const imgTag of imageMatches.slice(0, 50)) {
            const srcMatch = imgTag.match(/src=["']([^"']+)["']/);
            if (srcMatch && srcMatch[1]) {
              let imageSrc = srcMatch[1];
              
              // Convert relative URLs to absolute if needed
              if (imageSrc.startsWith('data:image')) {
                // Handle base64 images
                try {
                  const base64Match = imageSrc.match(/^data:image\/([^;]+);base64,(.+)$/);
                  if (base64Match) {
                    const imageType = base64Match[1];
                    const base64Data = base64Match[2];
                    
                    // Decode base64 to binary
                    const binaryString = atob(base64Data);
                    const bytes = new Uint8Array(binaryString.length);
                    for (let i = 0; i < binaryString.length; i++) {
                      bytes[i] = binaryString.charCodeAt(i);
                    }
                    
                    // Create a Blob and File
                    const blob = new Blob([bytes], { type: `image/${imageType}` });
                    const file = new File([blob], `product_${Date.now()}.${imageType}`, { type: `image/${imageType}` });
                    
                    // Upload to Base44
                    const uploadResult = await base44.integrations.Core.UploadFile({ file });
                    if (uploadResult.file_url) {
                      imageUrls.push(uploadResult.file_url);
                    }
                  }
                } catch (e) {
                  console.error('Failed to process base64 image:', e);
                }
              } else if (imageSrc.startsWith('http')) {
                // Direct URL - download and re-upload
                try {
                  const imgResponse = await fetch(imageSrc);
                  const imgBlob = await imgResponse.blob();
                  const imgFile = new File([imgBlob], `product_${Date.now()}.jpg`, { type: imgBlob.type });
                  
                  const uploadResult = await base44.integrations.Core.UploadFile({ file: imgFile });
                  if (uploadResult.file_url) {
                    imageUrls.push(uploadResult.file_url);
                  }
                } catch (e) {
                  console.error('Failed to download/upload image:', e);
                }
              }
            }
          }
          
          for (let i = 0; i < Math.min(recordIdMatches.length, 200); i++) {
            gnpd_data.push({
              record_id: recordIdMatches[i].replace(/[^0-9]/g, ''),
              parsed_from_html: true,
              image_url: imageUrls[i] || null,
              has_image: !!imageUrls[i]
            });
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