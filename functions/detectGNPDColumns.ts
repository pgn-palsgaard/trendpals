import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

// Column name synonyms for auto-detection (P0 canonical mapping)
const COLUMN_SYNONYMS = {
  // REQUIRED mappings (block if missing)
  record_id: ['record id', 'recordid', 'record_id', 'id', 'gnpd id', 'product id'],
  date_published: ['date published', 'datepublished', 'date_published', 'launch date', 'launchdate', 'date'],
  market: ['market', 'country', 'market country', 'launch country'],
  product_name: ['product', 'product name', 'productname', 'product_name', 'name'],
  category: ['category', 'main category', 'product category'],
  sub_category: ['sub-category', 'sub category', 'subcategory', 'sub_category'],
  
  // RECOMMENDED mappings (use if present)
  brand: ['brand', 'brand name', 'brandname'],
  company: ['company', 'manufacturer', 'producer'],
  ultimate_company: ['ultimate company', 'ultimate_company', 'parent company', 'ultimate'],
  launch_type: ['launch type', 'launch_type', 'type'],
  claims: ['claims', 'product claims'],
  product_description: ['product description', 'description', 'product_description'],
  flavours: ['flavours', 'flavors', 'flavor', 'flavour'],
  storage: ['storage', 'storage type'],
  format_type: ['format type', 'format_type', 'format'],
  unit_pack_size: ['unit pack size (ml/g)', 'unit pack size', 'pack size', 'size'],
  packaging_units: ['packaging units', 'units'],
  package_type: ['package type', 'packaging type', 'pack type'],
  package_material: ['package material', 'packaging material', 'material'],
  barcode: ['bar code', 'barcode', 'ean', 'upc'],
  price_usd: ['price in us dollars', 'price (usd)', 'price usd', 'usd price'],
  price_eur: ['price in euros', 'price (eur)', 'price eur', 'eur price'],
  product_variants: ['product variants', 'variants', 'product_variants'],
  record_hyperlink: ['record hyperlink', 'record_hyperlink', 'hyperlink', 'url', 'link']
};

function detectColumnMapping(columns) {
  // Columns may contain unique keys (e.g., "Serving Size__2" for duplicates)
  // We need to match on the base name before "__"
  const normalizedColumns = columns.map(col => {
    // Extract base name before "__N" suffix
    const baseName = col.split('__')[0];
    return baseName.toLowerCase().trim();
  });
  
  const mappings = {};

  for (const [field, synonyms] of Object.entries(COLUMN_SYNONYMS)) {
    for (const synonym of synonyms) {
      const index = normalizedColumns.indexOf(synonym);
      if (index !== -1) {
        mappings[field] = columns[index]; // Use original unique key (with __N if duplicate)
        break;
      }
    }
  }

  return mappings;
}

function validateDateParsing(rows, dateColumn) {
  if (!dateColumn) {
    return { 
      success_rate: 0, 
      success_count: 0,
      failure_count: 0,
      date_range_min: null, 
      date_range_max: null, 
      errors: [] 
    };
  }

  let successCount = 0;
  let failureCount = 0;
  let minDate = null;
  let maxDate = null;
  const errors = [];

  // Use pre-parsed dates if available (from processSource)
  for (let i = 0; i < Math.min(rows.length, 100); i++) { // Sample first 100 rows
    const row = rows[i];
    
    // Check if date was already parsed during ingestion
    if (row._date_published_parsed !== undefined) {
      if (row._date_published_parsed) {
        successCount++;
        const date = new Date(row._date_published_parsed);
        if (!minDate || date < minDate) minDate = date;
        if (!maxDate || date > maxDate) maxDate = date;
      } else {
        failureCount++;
        if (errors.length < 10 && row._date_parse_error) {
          errors.push({
            row_index: i + 1,
            raw_value: row[dateColumn],
            detected_type: row._date_parse_type,
            error: row._date_parse_error
          });
        }
      }
      continue;
    }
    
    // Fallback: parse on-demand if not pre-parsed (shouldn't happen with new flow)
    const dateValue = row[dateColumn];
    if (!dateValue && dateValue !== 0) {
      failureCount++;
      continue;
    }

    try {
      let parsedDate = null;
      
      // Handle Date objects
      if (dateValue instanceof Date) {
        parsedDate = dateValue;
      }
      // Handle Excel serial dates (numbers)
      else if (typeof dateValue === 'number') {
        const excelEpoch = new Date(1899, 11, 30);
        parsedDate = new Date(excelEpoch.getTime() + dateValue * 86400000);
      }
      // Handle strings
      else if (typeof dateValue === 'string') {
        const trimmed = dateValue.trim();
        if (trimmed) {
          // Format: "DD MMM YYYY"
          const ddMmmYyyy = trimmed.match(/(\d{1,2})\s+([A-Za-z]{3,})\s+(\d{4})/);
          if (ddMmmYyyy) {
            const [, day, month, year] = ddMmmYyyy;
            const monthMap = {
              jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5,
              jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11
            };
            const monthNum = monthMap[month.toLowerCase().slice(0, 3)];
            if (monthNum !== undefined) {
              parsedDate = new Date(year, monthNum, parseInt(day));
            }
          } else {
            parsedDate = new Date(trimmed);
          }
        }
      }

      if (parsedDate && !isNaN(parsedDate.getTime())) {
        successCount++;
        if (!minDate || parsedDate < minDate) minDate = parsedDate;
        if (!maxDate || parsedDate > maxDate) maxDate = parsedDate;
      } else {
        failureCount++;
        if (errors.length < 10) {
          errors.push({
            row_index: i + 1,
            raw_value: dateValue,
            detected_type: typeof dateValue,
            error: `Cannot parse date`
          });
        }
      }
    } catch (e) {
      failureCount++;
      if (errors.length < 10) {
        errors.push({
          row_index: i + 1,
          raw_value: dateValue,
          detected_type: typeof dateValue,
          error: e.message
        });
      }
    }
  }

  const sampleSize = Math.min(rows.length, 100);
  return {
    success_rate: sampleSize > 0 ? (successCount / sampleSize) * 100 : 0,
    success_count: successCount,
    failure_count: failureCount,
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

    // Set detecting status
    await base44.entities.Source.update(source_id, {
      gnpd_mapping_status: 'detecting',
      gnpd_mapping_error: null
    });

    // Set timeout (15 seconds)
    const timeoutPromise = new Promise((_, reject) => 
      setTimeout(() => reject(new Error('Detection timeout')), 15000)
    );

    const detectionResult = await Promise.race([
      (async () => {
        // Get the source
        const source = await base44.entities.Source.get(source_id);
    
        // If GNPD data doesn't exist, try parsing from file
        if (!source.gnpd_data || !Array.isArray(source.gnpd_data) || source.gnpd_data.length === 0) {
          // Check if file exists
          if (!source.file_url) {
            throw new Error('GNPD file not available');
          }
          
          // Try to parse file on-demand
          const fileResponse = await fetch(source.file_url);
          const arrayBuffer = await fileResponse.arrayBuffer();
          
          // Parse based on file type
          const { read, utils } = await import('npm:xlsx@0.18.5');
          const workbook = read(arrayBuffer, { type: 'array', cellDates: true });
          const sheetName = workbook.SheetNames[0];
          const sheet = workbook.Sheets[sheetName];
          const rows = utils.sheet_to_json(sheet, { raw: false, dateNF: 'yyyy-mm-dd' });
          
          if (rows.length === 0) {
            throw new Error('Empty GNPD file');
          }
          
          // Get headers (handle duplicate column names)
          const headers = Object.keys(rows[0]);
          
          // Parse date_published field
          const dateColumnGuess = headers.find(h => 
            h.toLowerCase().includes('date published') || 
            h.toLowerCase().includes('launch date') ||
            h.toLowerCase() === 'date'
          );
          
          if (dateColumnGuess) {
            for (const row of rows) {
              const rawDate = row[dateColumnGuess];
              let parsedDate = null;
              let parseError = null;
              let parseType = null;
              
              if (rawDate instanceof Date) {
                parsedDate = rawDate.toISOString();
                parseType = 'Date';
              } else if (typeof rawDate === 'number') {
                const excelEpoch = new Date(1899, 11, 30);
                parsedDate = new Date(excelEpoch.getTime() + rawDate * 86400000).toISOString();
                parseType = 'number';
              } else if (typeof rawDate === 'string') {
                const trimmed = rawDate.trim();
                if (trimmed) {
                  parseType = 'string';
                  try {
                    // Try parsing as DD MMM YYYY
                    const ddMmmYyyy = trimmed.match(/(\d{1,2})\s+([A-Za-z]{3,})\s+(\d{4})/);
                    if (ddMmmYyyy) {
                      const [, day, month, year] = ddMmmYyyy;
                      const monthMap = {
                        jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5,
                        jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11
                      };
                      const monthNum = monthMap[month.toLowerCase().slice(0, 3)];
                      if (monthNum !== undefined) {
                        parsedDate = new Date(year, monthNum, parseInt(day)).toISOString();
                      }
                    } else {
                      // Try standard Date parsing
                      const date = new Date(trimmed);
                      if (!isNaN(date.getTime())) {
                        parsedDate = date.toISOString();
                      }
                    }
                  } catch (e) {
                    parseError = e.message;
                  }
                }
              }
              
              row._date_published_parsed = parsedDate;
              row._date_parse_error = parseError;
              row._date_parse_type = parseType;
            }
          }
          
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
        }

        // Get available columns from first row
        const firstRow = source.gnpd_data[0];
        const availableColumns = Object.keys(firstRow);

        // Auto-detect mappings
        const detectedMappings = detectColumnMapping(availableColumns);

        // Check if required mappings are present
        const requiredFields = ['record_id', 'product_name', 'market', 'date_published', 'category', 'sub_category'];
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
          date_parsing_success_count: dateValidation.success_count,
          date_parsing_failure_count: dateValidation.failure_count,
          date_range_min: dateValidation.date_range_min,
          date_range_max: dateValidation.date_range_max,
          unique_markets_count: uniqueMarkets.size,
          parsing_errors: dateValidation.errors
        };

        // Consistency check: if gnpd_processing_status is ready but headers are empty
        if (source.gnpd_processing_status === 'ready' && (!source.gnpd_headers || source.gnpd_headers.length === 0)) {
          await base44.entities.Source.update(source_id, {
            gnpd_processing_status: 'failed',
            gnpd_processing_error: 'Headers missing despite ready status. File may be corrupted.'
          });
          throw new Error('Data integrity issue');
        }

        // Update source with global mapping
        const mappingUpdate = {
          gnpd_column_mapping: detectedMappings,
          gnpd_mapping_status: requiredMappingsComplete ? 'complete' : 'failed',
          gnpd_mapping_updated_at: new Date().toISOString(),
          gnpd_mapping_error: requiredMappingsComplete ? null : `Missing required mappings: ${requiredFields.filter(f => !detectedMappings[f]).join(', ')}`
        };

        await base44.entities.Source.update(source_id, mappingUpdate);

        return {
          success: true,
          mapping: {
            ...detectedMappings,
            validation_status: validationStatus,
            available_columns: availableColumns
          },
          source_updated: true
        };
      })(),
      timeoutPromise
    ]);

    return Response.json(detectionResult);
  } catch (error) {
    // Handle timeout or detection errors
    if (error.message === 'Detection timeout') {
      await base44.entities.Source.update(source_id, {
        gnpd_mapping_status: 'failed',
        gnpd_mapping_error: 'Column detection timed out after 15 seconds. Please try again or map manually.'
      });

      return Response.json({
        error: 'Detection timeout',
        message: 'Column detection timed out. Please retry or map columns manually.',
        actionable: true
      }, { status: 408 });
    }

    // Handle other errors
    await base44.entities.Source.update(source_id, {
      gnpd_mapping_status: 'failed',
      gnpd_mapping_error: error.message
    });

    return Response.json({
      error: 'Detection failed',
      message: error.message,
      actionable: true
    }, { status: 500 });
  }
      // Handle timeout or detection errors
      await base44.entities.Source.update(source_id, {
        gnpd_mapping_status: 'failed',
        gnpd_mapping_error: timeoutOrError.message === 'Detection timeout' 
          ? 'Column detection timed out after 15 seconds. Please try again or map manually.'
          : timeoutOrError.message
      });

      return Response.json({
        error: timeoutOrError.message === 'Detection timeout' ? 'Detection timeout' : 'Detection failed',
        message: timeoutOrError.message === 'Detection timeout'
          ? 'Column detection timed out. Please retry or map columns manually.'
          : `Detection failed: ${timeoutOrError.message}`,
        actionable: true
      }, { status: 408 });
    }
});