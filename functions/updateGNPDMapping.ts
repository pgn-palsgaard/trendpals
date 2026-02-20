import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { source_id, mappings } = await req.json();

    if (!source_id || !mappings) {
      return Response.json({ error: 'source_id and mappings required' }, { status: 400 });
    }

    // Validate required fields
    const requiredFields = ['record_id', 'product_name', 'market', 'date_published', 'category', 'sub_category'];
    const missingFields = requiredFields.filter(field => !mappings[field]);
    
    const isComplete = missingFields.length === 0;
    
    // Update source with new mapping
    await base44.entities.Source.update(source_id, {
      gnpd_column_mapping: mappings,
      gnpd_mapping_status: isComplete ? 'complete' : 'failed',
      gnpd_mapping_updated_at: new Date().toISOString(),
      gnpd_mapping_error: isComplete ? null : `Missing required mappings: ${missingFields.join(', ')}`
    });

    return Response.json({
      success: true,
      mapping_complete: isComplete,
      missing_fields: missingFields
    });

  } catch (error) {
    console.error('Update GNPD mapping error:', error);
    return Response.json({ 
      error: error.message,
      details: error.stack
    }, { status: 500 });
  }
});