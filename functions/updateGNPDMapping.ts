import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { mapping_id, mappings } = await req.json();

    if (!mapping_id || !mappings) {
      return Response.json({ error: 'mapping_id and mappings required' }, { status: 400 });
    }

    // Check if required mappings are present
    const requiredFields = ['record_id', 'product_name', 'market', 'date_published'];
    const requiredMappingsComplete = requiredFields.every(field => mappings[field]);

    // Update the mapping
    const updated = await base44.entities.GNPDColumnMapping.update(mapping_id, {
      mappings,
      auto_detected: false
    });

    // Re-run validation
    const response = await base44.functions.invoke('detectGNPDColumns', {
      source_id: updated.source_id,
      project_id: updated.project_id
    });

    return Response.json({
      success: true,
      mapping: response.data.mapping,
      required_mappings_complete: requiredMappingsComplete
    });

  } catch (error) {
    console.error('Update GNPD mapping error:', error);
    return Response.json({ 
      error: error.message,
      details: error.stack
    }, { status: 500 });
  }
});