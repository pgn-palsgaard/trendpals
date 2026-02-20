import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

// Column name synonyms for auto-detection
const COLUMN_SYNONYMS = {
  record_id: ['record id', 'recordid', 'record_id', 'id', 'gnpd id', 'product id'],
  product_name: ['product', 'product name', 'productname', 'product_name', 'name'],
  market: ['market', 'country', 'market country', 'launch country'],
  date_published: ['date published', 'datepublished', 'date_published', 'launch date', 'launchdate', 'date'],
  product_variants: ['product variants', 'variants', 'product_variants'],
  brand: ['brand', 'brand name', 'brandname'],
  company: ['company', 'manufacturer', 'producer'],
  ultimate_company: ['ultimate company', 'ultimate_company', 'parent company', 'ultimate'],
  category: ['category', 'main category', 'product category'],
  sub_category: ['sub-category', 'sub category', 'subcategory', 'sub_category']
};

function detectColumnMapping(columns) {
  const normalizedColumns = columns.map(col => col.toLowerCase().trim());
  const mappings = {};

  for (const [field, synonyms] of Object.entries(COLUMN_SYNONYMS)) {
    for (const synonym of synonyms) {
      const index = normalizedColumns.indexOf(synonym);
      if (index !== -1) {
        mappings[field] = columns[index]; // Use original case
        break;
      }
    }
  }

  return mappings;
}

function validateDateParsing(rows, dateColumn) {
  if (!dateColumn) return { success_rate: 0, errors: ['Date column not mapped'] };

  let successCount = 0;
  let minDate = null;
  let maxDate = null;
  const errors = [];

  for (let i = 0; i < Math.min(rows.length, 100); i++) { // Sample first 100 rows
    const dateStr = rows[i][dateColumn];
    if (!dateStr) continue;

    try {
      // Try multiple date formats
      let parsedDate = null;
      
      // Format: "13 Feb 2026"
      const ddMmmYyyy = dateStr.match(/(\d{1,2})\s+([A-Za-z]{3,})\s+(\d{4})/);
      if (ddMmmYyyy) {
        const [, day, month, year] = ddMmmYyyy;
        const monthMap = {
          jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5,
          jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11
        };
        const monthNum = monthMap[month.toLowerCase().slice(0, 3)];
        if (monthNum !== undefined) {
          parsedDate = new Date(year, monthNum, day);
        }
      }

      // Try ISO format and other standard formats
      if (!parsedDate) {
        parsedDate = new Date(dateStr);
      }

      if (!isNaN(parsedDate.getTime())) {
        successCount++;
        if (!minDate || parsedDate < minDate) minDate = parsedDate;
        if (!maxDate || parsedDate > maxDate) maxDate = parsedDate;
      } else {
        if (errors.length < 5) {
          errors.push(`Row ${i + 1}: Cannot parse "${dateStr}"`);
        }
      }
    } catch (e) {
      if (errors.length < 5) {
        errors.push(`Row ${i + 1}: Parse error - ${e.message}`);
      }
    }
  }

  const sampleSize = Math.min(rows.length, 100);
  return {
    success_rate: sampleSize > 0 ? (successCount / sampleSize) * 100 : 0,
    date_range_min: minDate ? minDate.toISOString().split('T')[0] : null,
    date_range_max: maxDate ? maxDate.toISOString().split('T')[0] : null,
    errors
  };
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { source_id, project_id } = await req.json();

    if (!source_id) {
      return Response.json({ error: 'source_id required' }, { status: 400 });
    }

    // Get the source
    const source = await base44.entities.Source.get(source_id);
    
    // If GNPD data doesn't exist, try parsing from file
    if (!source.gnpd_data || !Array.isArray(source.gnpd_data) || source.gnpd_data.length === 0) {
      // Check if file exists
      if (!source.file_url) {
        return Response.json({ 
          error: 'GNPD file not available',
          message: 'GNPD file hasn\'t been processed yet. Please wait or re-upload the file.',
          actionable: true
        }, { status: 422 });
      }
      
      // Try to parse file on-demand
      try {
        const fileResponse = await fetch(source.file_url);
        const fileContent = await fileResponse.text();
        
        // Parse based on file type
        const { read, utils } = await import('npm:xlsx@0.18.5');
        const workbook = read(fileContent, { type: 'string' });
        const sheetName = workbook.SheetNames[0];
        const sheet = workbook.Sheets[sheetName];
        const rows = utils.sheet_to_json(sheet);
        
        if (rows.length === 0) {
          return Response.json({ 
            error: 'Empty GNPD file',
            message: 'The GNPD file contains no data rows.'
          }, { status: 422 });
        }
        
        // Get headers
        const headers = Object.keys(rows[0]);
        
        // Update source with parsed data
        await base44.entities.Source.update(source_id, {
          gnpd_data: rows,
          gnpd_headers: headers,
          gnpd_row_count: rows.length,
          gnpd_preview_rows: rows.slice(0, 20),
          gnpd_processing_status: 'ready'
        });
        
        // Continue with detection using newly parsed data
        source.gnpd_data = rows;
      } catch (parseError) {
        await base44.entities.Source.update(source_id, {
          gnpd_processing_status: 'failed',
          gnpd_processing_error: parseError.message
        });
        
        return Response.json({ 
          error: 'Failed to parse GNPD file',
          message: `Could not parse GNPD file: ${parseError.message}`,
          actionable: true
        }, { status: 422 });
      }
    }

    // Get available columns from first row
    const firstRow = source.gnpd_data[0];
    const availableColumns = Object.keys(firstRow);

    // Auto-detect mappings
    const detectedMappings = detectColumnMapping(availableColumns);

    // Check if required mappings are present
    const requiredFields = ['record_id', 'product_name', 'market', 'date_published'];
    const requiredMappingsComplete = requiredFields.every(field => detectedMappings[field]);

    // Validate date parsing
    const dateValidation = validateDateParsing(
      source.gnpd_data, 
      detectedMappings.date_published
    );

    // Count unique markets
    const uniqueMarkets = new Set(
      source.gnpd_data
        .map(row => row[detectedMappings.market])
        .filter(Boolean)
    );

    const validationStatus = {
      required_mappings_complete: requiredMappingsComplete,
      rows_loaded: source.gnpd_data.length,
      date_parsing_success_rate: dateValidation.success_rate,
      date_range_min: dateValidation.date_range_min,
      date_range_max: dateValidation.date_range_max,
      unique_markets_count: uniqueMarkets.size,
      parsing_errors: dateValidation.errors
    };

    // Create or update mapping
    const existingMappings = await base44.entities.GNPDColumnMapping.filter({ source_id });
    
    if (existingMappings.length > 0) {
      // Update existing
      await base44.entities.GNPDColumnMapping.update(existingMappings[0].id, {
        mappings: detectedMappings,
        available_columns: availableColumns,
        validation_status: validationStatus,
        auto_detected: true
      });
      
      return Response.json({
        success: true,
        mapping: existingMappings[0],
        updated: true
      });
    } else {
      // Create new
      const mapping = await base44.entities.GNPDColumnMapping.create({
        source_id,
        project_id: project_id || null,
        mappings: detectedMappings,
        available_columns: availableColumns,
        validation_status: validationStatus,
        auto_detected: true
      });

      return Response.json({
        success: true,
        mapping,
        created: true
      });
    }

  } catch (error) {
    console.error('Detect GNPD columns error:', error);
    return Response.json({ 
      error: error.message,
      details: error.stack
    }, { status: 500 });
  }
});