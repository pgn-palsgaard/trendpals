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
    
    // If complete, recompute validation metrics
    let validationStatus = null;
    if (isComplete) {
      const source = await base44.entities.Source.get(source_id);
      
      if (source.gnpd_data && Array.isArray(source.gnpd_data)) {
        // Count unique markets
        const uniqueMarkets = new Set(
          source.gnpd_data
            .map(row => row[mappings.market])
            .filter(Boolean)
        );
        
        // Count date parsing success from pre-parsed dates
        let dateSuccessCount = 0;
        let dateFailureCount = 0;
        let minDate = null;
        let maxDate = null;
        
        for (const row of source.gnpd_data) {
          if (row._date_published_parsed) {
            dateSuccessCount++;
            const date = new Date(row._date_published_parsed);
            if (!minDate || date < minDate) minDate = date;
            if (!maxDate || date > maxDate) maxDate = date;
          } else {
            dateFailureCount++;
          }
        }
        
        const dateParseSuccessRate = source.gnpd_data.length > 0 
          ? Math.round((dateSuccessCount / source.gnpd_data.length) * 1000) / 10 
          : 0;
        
        validationStatus = {
          required_mappings_complete: true,
          rows_loaded: source.gnpd_data.length,
          date_parsing_success_rate: dateParseSuccessRate,
          date_parsing_success_count: dateSuccessCount,
          date_parsing_failure_count: dateFailureCount,
          date_range_min: minDate ? minDate.toISOString().split('T')[0] : null,
          date_range_max: maxDate ? maxDate.toISOString().split('T')[0] : null,
          unique_markets_count: uniqueMarkets.size
        };
      }
    }
    
    // Log for debugging
    console.log('[updateGNPDMapping] source_id:', source_id);
    console.log('[updateGNPDMapping] mappings keys:', Object.keys(mappings));
    console.log('[updateGNPDMapping] isComplete:', isComplete);
    
    // Update source with new mapping and validation
    const updateData = {
      gnpd_column_mapping: mappings,
      gnpd_mapping_status: isComplete ? 'complete' : 'failed',
      gnpd_mapping_updated_at: new Date().toISOString(),
      gnpd_mapping_error: isComplete ? null : `Missing required mappings: ${missingFields.join(', ')}`
    };
    
    if (validationStatus) {
      updateData['metadata_extraction.extracted_data.validation_status'] = validationStatus;
      updateData['metadata_extraction.extracted_data.unique_markets_count'] = validationStatus.unique_markets_count;
      updateData['metadata_extraction.extracted_data.date_parse_success_rate'] = validationStatus.date_parsing_success_rate;
    }
    
    console.log('[updateGNPDMapping] updateData keys:', Object.keys(updateData));
    
    const updatedSource = await base44.entities.Source.update(source_id, updateData);
    
    console.log('[updateGNPDMapping] Update complete, gnpd_column_mapping exists:', !!updatedSource.gnpd_column_mapping);

    return Response.json({
      success: true,
      mapping_complete: isComplete,
      missing_fields: missingFields,
      validation_status: validationStatus,
      updated_source: updatedSource
    });

  } catch (error) {
    console.error('Update GNPD mapping error:', error);
    return Response.json({ 
      error: error.message,
      details: error.stack
    }, { status: 500 });
  }
});