import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);

    const { extraction_id, extracted_images, status, error_message } = await req.json();

    if (!extraction_id) {
      return Response.json({ error: 'extraction_id is required' }, { status: 400 });
    }

    // Update the extraction record
    const updateData = {
      status: status || 'completed',
      extracted_images: extracted_images || []
    };

    if (error_message) {
      updateData.error_message = error_message;
      updateData.status = 'failed';
    }

    await base44.asServiceRole.entities.GNPDImageExtraction.update(extraction_id, updateData);

    // If completed successfully, trigger the merge
    if (status === 'completed' && extracted_images && extracted_images.length > 0) {
      const extraction = await base44.asServiceRole.entities.GNPDImageExtraction.get(extraction_id);
      
      // Call the merge function
      await base44.asServiceRole.functions.invoke('mergeGNPDWithImages', {
        project_id: extraction.project_id,
        xlsx_file_url: extraction.xlsx_file_url,
        extracted_images: extracted_images
      });
    }

    return Response.json({ 
      success: true,
      extraction_id,
      images_received: extracted_images?.length || 0
    });
  } catch (error) {
    console.error('Receive GNPD images error:', error);
    return Response.json({ 
      error: error.message || 'Failed to receive image data',
      details: error.stack
    }, { status: 500 });
  }
});