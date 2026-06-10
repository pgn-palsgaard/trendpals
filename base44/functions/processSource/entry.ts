import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

// Helper to normalize URL for duplicate detection
function normalizeUrl(url) {
  try {
    const urlObj = new URL(url);
    // Remove tracking params
    const trackingParams = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term', 'fbclid', 'gclid'];
    trackingParams.forEach(param => urlObj.searchParams.delete(param));
    // Normalize protocol and remove trailing slash
    return urlObj.href.toLowerCase().replace(/\/$/, '');
  } catch {
    return url.toLowerCase().replace(/\/$/, '');
  }
}

// Helper to compute SHA-256 hash
async function computeFileHash(fileContent) {
  const msgBuffer = new TextEncoder().encode(fileContent);
  const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { project_id, source_type, file_url, url, title, category, region, tags } = await req.json();

    // DUPLICATE DETECTION
    let file_hash = null;
    let normalized_url = null;

    // For file uploads: compute hash
    if (file_url && source_type !== 'url') {
      const fileResponse = await fetch(file_url);
      const fileContent = await fileResponse.text();
      file_hash = await computeFileHash(fileContent);

      // Check for exact hash match
      const existingSources = await base44.asServiceRole.entities.Source.filter({ file_hash });
      if (existingSources.length > 0) {
        const duplicate = existingSources[0];
        return Response.json({
          error: 'DUPLICATE_DETECTED',
          message: 'This file has already been uploaded',
          duplicate: {
            id: duplicate.id,
            title: duplicate.title,
            date: duplicate.date,
            category: duplicate.category,
            region_code: duplicate.region_code
          }
        }, { status: 409 });
      }
    }

    // For URL sources: normalize and check
    if (source_type === 'url' && url) {
      normalized_url = normalizeUrl(url);

      // Check for normalized URL match
      const existingSources = await base44.asServiceRole.entities.Source.filter({ normalized_url });
      if (existingSources.length > 0) {
        const duplicate = existingSources[0];
        return Response.json({
          error: 'DUPLICATE_DETECTED',
          message: 'This URL has already been added',
          duplicate: {
            id: duplicate.id,
            title: duplicate.title,
            date: duplicate.date,
            category: duplicate.category,
            region_code: duplicate.region_code
          }
        }, { status: 409 });
      }
    }

    // Create source record first (project_id is now optional)
    const sourceData = {
      source_type,
      title,
      file_url: file_url || null,
      url: url || null,
      status: 'uploaded',
      upload_progress: 100,
      processing_started_at: new Date().toISOString(),
      excerpts: [],
      gnpd_data: [],
      category: category || null,
      region: region || null,
      tags: tags || [],
      file_hash: file_hash || null,
      normalized_url: normalized_url || null
    };

    // Only add project_id if provided (for backward compatibility)
    if (project_id) {
      sourceData.project_id = project_id;
    }

    const source = await base44.entities.Source.create(sourceData);

    // Update status to processing
    await base44.entities.Source.update(source.id, { 
      status: 'processing',
      processing_started_at: new Date().toISOString() 
    });

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
          status: 'ready',
          processing_completed_at: new Date().toISOString(),
          excerpts,
          freshness: 'recent'
        });
      } else if (source_type === 'gnpd') {
        // Update GNPD processing status
        await base44.entities.Source.update(source.id, {
          gnpd_processing_status: 'processing'
        });
        
        // Process GNPD file
        const fileResponse = await fetch(file_url);
        const fileContent = await fileResponse.text();
        const lowerUrl = (file_url || '').toLowerCase();
        const isHtmlFile = lowerUrl.includes('.html') || lowerUrl.includes('.htm') || fileContent.trim().startsWith('<');

        let gnpd_data = [];
        let gnpd_headers = [];

        // --- HTML FORMAT: Mintel detail-page or dl/dt/dd export ---
        if (isHtmlFile) {
          const { parsed } = await (async () => {
            function stripHtml(str) {
              return str.replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&#\d+;/g, '').replace(/&[a-z]+;/g, '').trim();
            }

            const rows = [];
            const fieldSet = new Set();
            const isDetailPage = fileContent.includes('body_panel') || fileContent.includes('detailed_packaging_table');

            if (isDetailPage) {
              // Multi-product detail pages: split on Product_id_ div boundaries
              const productBlockRegex = /<div[^>]+id="Product_id_(\d+)"[^>]*>([\s\S]*?)(?=<div[^>]+id="Product_id_\d+"|$)/gi;
              let m;
              while ((m = productBlockRegex.exec(fileContent)) !== null) {
                const productId = m[1];
                const blockHtml = m[2];
                const row = {};
                row['Record ID'] = productId;
                row['Record Hyperlink'] = `https://www.gnpd.com/sinatra/recordpage/${productId}`;
                fieldSet.add('Record ID'); fieldSet.add('Record Hyperlink');

                const h1Match = blockHtml.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
                if (h1Match) { row['Product'] = stripHtml(h1Match[1]); fieldSet.add('Product'); }

                const trRegex2 = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
                let tr;
                while ((tr = trRegex2.exec(blockHtml)) !== null) {
                  const trHtml = tr[1];
                  const thM = trHtml.match(/<th[^>]*>([\s\S]*?)<\/th>/i);
                  const tdM = trHtml.match(/<td[^>]*>([\s\S]*?)<\/td>/i);
                  if (thM && tdM) {
                    const key = stripHtml(thM[1]);
                    const raw = tdM[1];
                    const val = key === 'Date Published'
                      ? (() => { const mm = raw.match(/<monthname[^>]*>([^<]+)<\/monthname>\s*(\d{4})/i); return mm ? `${mm[1]} ${mm[2]}` : stripHtml(raw); })()
                      : stripHtml(raw);
                    if (key && val && val.trim()) { row[key] = val; fieldSet.add(key); }
                  }
                }
                const descM = blockHtml.match(/id="product_description_body"[^>]*>([\s\S]*?)<\/div>/i);
                if (descM) { const d = stripHtml(descM[1]); if (d) { row['Product Description'] = d; fieldSet.add('Product Description'); } }
                if (Object.keys(row).length > 2) rows.push(row);
              }

              // Single product page fallback
              if (rows.length === 0) {
                const row = {};
                const hidM = fileContent.match(/id="item_id"\s+value="(\d+)"/i);
                if (hidM) { row['Record ID'] = hidM[1]; row['Record Hyperlink'] = `https://www.gnpd.com/sinatra/recordpage/${hidM[1]}`; fieldSet.add('Record ID'); fieldSet.add('Record Hyperlink'); }
                const h1M = fileContent.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
                if (h1M) { row['Product'] = stripHtml(h1M[1]); fieldSet.add('Product'); }
                const trRe = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
                let tr;
                while ((tr = trRe.exec(fileContent)) !== null) {
                  const trHtml = tr[1];
                  const thM = trHtml.match(/<th[^>]*>([\s\S]*?)<\/th>/i);
                  const tdM = trHtml.match(/<td[^>]*>([\s\S]*?)<\/td>/i);
                  if (thM && tdM) {
                    const key = stripHtml(thM[1]);
                    const raw = tdM[1];
                    const val = key === 'Date Published'
                      ? (() => { const mm = raw.match(/<monthname[^>]*>([^<]+)<\/monthname>\s*(\d{4})/i); return mm ? `${mm[1]} ${mm[2]}` : stripHtml(raw); })()
                      : stripHtml(raw);
                    if (key && val && val.trim()) { row[key] = val; fieldSet.add(key); }
                  }
                }
                const descM = fileContent.match(/id="product_description_body"[^>]*>([\s\S]*?)<\/div>/i);
                if (descM) { const d = stripHtml(descM[1]); if (d) { row['Product Description'] = d; fieldSet.add('Product Description'); } }
                if (Object.keys(row).length > 2) rows.push(row);
              }
            } else {
              // dl/dt/dd format
              const dlRegex = /<dl>([\s\S]*?)<\/dl>/gi;
              let m;
              while ((m = dlRegex.exec(fileContent)) !== null) {
                const dlHtml = m[1];
                const row = {};
                const urlMatch = dlHtml.match(/href="[^"]*\/recordpage\/(\d+)\//i);
                if (urlMatch) { row['Record ID'] = urlMatch[1]; row['Record Hyperlink'] = `http://www.gnpd.com/sinatra/recordpage/${urlMatch[1]}/`; fieldSet.add('Record ID'); fieldSet.add('Record Hyperlink'); }
                const dtddRegex = /<dt>([\s\S]*?)<\/dt>\s*<dd>([\s\S]*?)<\/dd>/gi;
                let p;
                while ((p = dtddRegex.exec(dlHtml)) !== null) {
                  const key = stripHtml(p[1]); const val = stripHtml(p[2]);
                  if (key && val && val !== '&nbsp;') { row[key] = val; fieldSet.add(key); }
                }
                if (Object.keys(row).length > 2) rows.push(row);
              }
            }

            const fixedOrder = ['Record ID', 'Product', 'Brand', 'Company', 'Ultimate Company', 'Market', 'Category', 'Sub-Category', 'Date Published', 'Launch Type', 'Product Description', 'Claims', 'Flavours', 'Record Hyperlink'];
            const headers = [...fixedOrder.filter(f => fieldSet.has(f)), ...[...fieldSet].filter(f => !fixedOrder.includes(f))];
            return { parsed: { headers, rows } };
          })();

          gnpd_headers = parsed.headers;
          gnpd_data = parsed.rows;

          await base44.entities.Source.update(source.id, {
            gnpd_data,
            gnpd_headers,
            gnpd_row_count: gnpd_data.length,
            gnpd_preview_rows: gnpd_data.slice(0, 20),
            gnpd_processing_status: gnpd_data.length > 0 ? 'ready' : 'failed',
            gnpd_processing_error: gnpd_data.length === 0 ? 'Could not extract product rows from HTML' : null,
            status: gnpd_data.length > 0 ? 'ready' : 'failed',
            processing_completed_at: new Date().toISOString(),
            freshness: 'recent'
          });

          return Response.json({
            success: true,
            source_id: source.id,
            gnpd_count: gnpd_data.length,
            format: 'html'
          });
        }

        // --- EXCEL / CSV FORMAT ---
        // Required GNPD columns
        const requiredColumns = ['Record ID', 'Product name', 'Brand', 'Launch Date', 'Market'];

        // Detect file type and parse - use xlsx library for robust parsing
        try {
          const { read, utils } = await import('npm:xlsx@0.18.5');
          
          // Read file as buffer for proper xlsx parsing
          const fileBuffer = await (await fetch(file_url)).arrayBuffer();
          const workbook = read(fileBuffer, { type: 'buffer' });
          
          // SHEET SELECTION LOGIC (P0)
          // 1. Prefer "GNPD-download" (canonical template)
          // 2. Then prefer sheets containing: Products, GNPD, Results
          // 3. Exclude sheets containing: Search details, Criteria, Notes
          let sheetName = null;
          
          // First: look for exact match "GNPD-download" (case-insensitive)
          const gnpdDownloadSheet = workbook.SheetNames.find(name => 
            name.toLowerCase() === 'gnpd-download'
          );
          
          if (gnpdDownloadSheet) {
            sheetName = gnpdDownloadSheet;
          } else {
            // Fallback: prefer sheets with keywords
            const preferredSheets = workbook.SheetNames.filter(name => {
              const lower = name.toLowerCase();
              return (lower.includes('products') || lower.includes('gnpd') || lower.includes('results'))
                && !lower.includes('search') && !lower.includes('criteria') && !lower.includes('notes');
            });
            sheetName = preferredSheets[0] || workbook.SheetNames[0];
          }
          
          const sheet = workbook.Sheets[sheetName];
          
          // HANDLE DUPLICATE COLUMN NAMES (P0 blocker)
          // Convert sheet to array of arrays first to detect duplicates
          const rawData = utils.sheet_to_json(sheet, { header: 1, defval: '' });
          if (rawData.length === 0) {
            await base44.entities.Source.update(source.id, {
              status: 'failed',
              gnpd_processing_status: 'failed',
              gnpd_processing_error: 'GNPD file contains no data rows',
              status_message: 'GNPD file contains no data rows'
            });
            return Response.json({ 
              error: 'GNPD file contains no data rows'
            }, { status: 400 });
          }
          
          // Get headers from first row
          const originalHeaders = rawData[0];
          
          // Create unique keys for duplicate headers
          const headerMap = new Map(); // unique_key -> display_name
          const displayToUnique = new Map(); // display_name -> [unique_keys]
          const uniqueHeaders = [];
          
          originalHeaders.forEach((header, index) => {
            const headerStr = String(header || `Column_${index}`).trim();
            
            // Check if this header already exists
            const existingKeys = displayToUnique.get(headerStr) || [];
            let uniqueKey;
            
            if (existingKeys.length === 0) {
              // First occurrence
              uniqueKey = headerStr;
            } else {
              // Duplicate - append suffix
              uniqueKey = `${headerStr}__${existingKeys.length + 1}`;
            }
            
            uniqueHeaders.push(uniqueKey);
            headerMap.set(uniqueKey, headerStr);
            existingKeys.push(uniqueKey);
            displayToUnique.set(headerStr, existingKeys);
          });
          
          // Convert rows to objects using unique keys
          const rows = [];
          for (let i = 1; i < rawData.length; i++) {
            const rowData = rawData[i];
            const rowObj = {};
            uniqueHeaders.forEach((uniqueKey, colIndex) => {
              rowObj[uniqueKey] = rowData[colIndex] !== undefined ? rowData[colIndex] : '';
            });
            rows.push(rowObj);
          }
          
          // Store both unique headers and header map for mapping UI
          gnpd_headers = uniqueHeaders;
          gnpd_data = rows;
          
          // Store header map for the mapping UI to show duplicate indicators
          const headerMapObj = {};
          headerMap.forEach((displayName, uniqueKey) => {
            headerMapObj[uniqueKey] = displayName;
          });
          
          // Robust date parser
          const parseDatePublished = (value) => {
            if (!value && value !== 0) return { isoDate: null, parseType: 'empty', error: null };
            
            try {
              // Case 1: Already a Date object
              if (value instanceof Date) {
                if (isNaN(value.getTime())) {
                  return { isoDate: null, parseType: 'invalid_date_object', error: 'Invalid Date object' };
                }
                return { 
                  isoDate: value.toISOString().split('T')[0], 
                  parseType: 'date_object', 
                  error: null 
                };
              }
              
              // Case 2: Excel serial date (number)
              if (typeof value === 'number') {
                // Excel epoch is 1899-12-30 (or 1900-01-01 depending on system)
                const excelEpoch = new Date(1899, 11, 30);
                const date = new Date(excelEpoch.getTime() + value * 86400000);
                if (isNaN(date.getTime())) {
                  return { isoDate: null, parseType: 'invalid_excel_serial', error: 'Invalid Excel serial date' };
                }
                return { 
                  isoDate: date.toISOString().split('T')[0], 
                  parseType: 'excel_serial', 
                  error: null 
                };
              }
              
              // Case 3: String parsing
              if (typeof value === 'string') {
                const trimmed = value.trim();
                if (!trimmed) return { isoDate: null, parseType: 'empty_string', error: null };
                
                // Format: "DD MMM YYYY" (e.g., "18 Feb 2026")
                const ddMmmYyyy = trimmed.match(/(\d{1,2})\s+([A-Za-z]{3,})\s+(\d{4})/);
                if (ddMmmYyyy) {
                  const [, day, month, year] = ddMmmYyyy;
                  const monthMap = {
                    jan: 0, january: 0, feb: 1, february: 1, mar: 2, march: 2,
                    apr: 3, april: 3, may: 4, jun: 5, june: 5,
                    jul: 6, july: 6, aug: 7, august: 7, sep: 8, september: 8,
                    oct: 9, october: 9, nov: 10, november: 10, dec: 11, december: 11
                  };
                  const monthNum = monthMap[month.toLowerCase().slice(0, 3)];
                  if (monthNum !== undefined) {
                    const date = new Date(year, monthNum, parseInt(day));
                    if (!isNaN(date.getTime())) {
                      return { 
                        isoDate: date.toISOString().split('T')[0], 
                        parseType: 'dd_mmm_yyyy', 
                        error: null 
                      };
                    }
                  }
                }
                
                // Try standard Date parsing (ISO, DD/MM/YYYY, etc.)
                const standardDate = new Date(trimmed);
                if (!isNaN(standardDate.getTime())) {
                  return { 
                    isoDate: standardDate.toISOString().split('T')[0], 
                    parseType: 'standard_parse', 
                    error: null 
                  };
                }
                
                return { isoDate: null, parseType: 'unparseable_string', error: `Could not parse: "${trimmed}"` };
              }
              
              return { isoDate: null, parseType: 'unknown_type', error: `Unexpected type: ${typeof value}` };
            } catch (e) {
              return { isoDate: null, parseType: 'exception', error: e.message };
            }
          };
          
          // Parse dates and calculate statistics
          let dateParseSuccessCount = 0;
          let dateParseFailureCount = 0;
          const dateParseFailures = [];
          let minDate = null;
          let maxDate = null;
          const uniqueMarkets = new Set();
          
          // Find date column (case-insensitive)
          const dateColumn = gnpd_headers.find(h => 
            h.toLowerCase().includes('date') || h.toLowerCase().includes('published')
          );
          
          // Find market column
          const marketColumn = gnpd_headers.find(h => 
            h.toLowerCase() === 'market' || h.toLowerCase() === 'country'
          );
          
          rows.forEach((row, idx) => {
            // Parse dates
            if (dateColumn) {
              const rawValue = row[dateColumn];
              const parseResult = parseDatePublished(rawValue);
              
              // Store parsed date in row
              row._date_published_parsed = parseResult.isoDate;
              row._date_parse_type = parseResult.parseType;
              row._date_parse_error = parseResult.error;
              
              if (parseResult.isoDate) {
                dateParseSuccessCount++;
                const date = new Date(parseResult.isoDate);
                if (!minDate || date < minDate) minDate = date;
                if (!maxDate || date > maxDate) maxDate = date;
              } else {
                dateParseFailureCount++;
                if (dateParseFailures.length < 10) {
                  dateParseFailures.push({
                    row_index: idx + 1,
                    raw_value: rawValue,
                    detected_type: parseResult.parseType,
                    error: parseResult.error
                  });
                }
              }
            }
            
            // Collect unique markets
            if (marketColumn && row[marketColumn]) {
              uniqueMarkets.add(row[marketColumn]);
            }
          });
          
          const totalRowsWithDateColumn = dateColumn ? rows.length : 0;
          const dateParseSuccessRate = totalRowsWithDateColumn > 0 
            ? (dateParseSuccessCount / totalRowsWithDateColumn) * 100 
            : 0;
          
          // ── Extract metadata from Sheet 2 (Search details) ──────────────────
          let gnpdRegionCode = null;
          let gnpdCategory = null;
          let gnpdDatePublished = null;
          try {
            const searchSheetName = workbook.SheetNames[1];
            if (searchSheetName) {
              const searchSheet = workbook.Sheets[searchSheetName];
              const searchRows = utils.sheet_to_json(searchSheet, { header: 1, defval: '' });
              const searchLines = searchRows.flat().map(v => String(v).trim()).filter(v => v.length > 0);

              // Extract market → region
              const marketLine = searchLines.find(l => l.toLowerCase().startsWith('where market matches'));
              if (marketLine) {
                const market = marketLine.replace(/where market matches/i, '').trim();
                // Map common market strings to region codes
                const marketRegionMap = {
                  china: 'ASPAC', japan: 'ASPAC', australia: 'ASPAC', india: 'ASPAC',
                  'south korea': 'ASPAC', indonesia: 'ASPAC', thailand: 'ASPAC',
                  'united states': 'AMERICAS', usa: 'AMERICAS', brazil: 'AMERICAS',
                  mexico: 'AMERICAS', canada: 'AMERICAS',
                  germany: 'EMEC', france: 'EMEC', 'united kingdom': 'EMEC', uk: 'EMEC',
                  spain: 'EMEC', italy: 'EMEC', netherlands: 'EMEC', poland: 'EMEC',
                  'saudi arabia': 'IMEA', uae: 'IMEA', turkey: 'IMEA', egypt: 'IMEA',
                  'south africa': 'IMEA',
                };
                const key = market.toLowerCase();
                gnpdRegionCode = marketRegionMap[key] || null;
              }

              // Extract sub-category → category
              const subCatLine = searchLines.find(l => l.toLowerCase().includes('sub-category matches'));
              if (subCatLine) {
                const catsRaw = subCatLine.replace(/and sub-category matches one or more of/i, '').trim();
                const firstCat = catsRaw.split(';')[0].trim();
                // Map to known Palsgaard categories
                const catMap = {
                  'dairy based ice cream': 'Ice Cream', 'frozen desserts': 'Ice Cream',
                  'plant based ice cream': 'Ice Cream', 'water based ice': 'Ice Cream',
                  'ice cream': 'Ice Cream', 'chilled desserts': 'Dairy',
                  'bakery': 'Bakery', 'confectionery': 'Confectionery',
                  'chocolate': 'Confectionery', 'dairy': 'Dairy',
                  'spreads': 'Fine Food', 'dressings': 'Fine Food',
                };
                const lc = firstCat.toLowerCase();
                gnpdCategory = Object.entries(catMap).find(([k]) => lc.includes(k))?.[1] || null;
              }

              // Extract date window → use as date_published approximation
              const dateLine = searchLines.find(l => l.toLowerCase().includes('date published matches'));
              if (dateLine) {
                const dateVal = dateLine.replace(/and date published matches/i, '').trim();
                // Store as a readable string, convert to rough date
                const sixMonthsAgo = new Date(); sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
                const twelveMonthsAgo = new Date(); twelveMonthsAgo.setFullYear(twelveMonthsAgo.getFullYear() - 1);
                const twentyFourMonthsAgo = new Date(); twentyFourMonthsAgo.setFullYear(twentyFourMonthsAgo.getFullYear() - 2);
                if (dateVal.includes('six months') || dateVal.includes('6 months')) gnpdDatePublished = sixMonthsAgo.toISOString().split('T')[0];
                else if (dateVal.includes('twelve months') || dateVal.includes('12 months') || dateVal.includes('one year')) gnpdDatePublished = twelveMonthsAgo.toISOString().split('T')[0];
                else if (dateVal.includes('24 months') || dateVal.includes('two years')) gnpdDatePublished = twentyFourMonthsAgo.toISOString().split('T')[0];
              }
            }
          } catch (metaErr) {
            console.warn('Could not parse Search details sheet:', metaErr.message);
          }

          // Store parsed data immediately with metadata
          await base44.entities.Source.update(source.id, {
            gnpd_data: rows,
            gnpd_headers: gnpd_headers,
            gnpd_row_count: rows.length,
            gnpd_preview_rows: rows.slice(0, 20),
            gnpd_processing_status: 'ready',
            status: 'ready',
            processing_completed_at: new Date().toISOString(),
            ...(gnpdRegionCode && { region_code: gnpdRegionCode }),
            ...(gnpdCategory && { category: gnpdCategory }),
            ...(gnpdDatePublished && { date_published: gnpdDatePublished }),
            // Add metadata for readiness checks
            metadata_extraction: {
              status: 'extracted',
              extracted_data: {
                sheet_name_used: sheetName,
                date_parse_success_count: dateParseSuccessCount,
                date_parse_failure_count: dateParseFailureCount,
                date_parse_success_rate: Math.round(dateParseSuccessRate * 10) / 10,
                date_parse_failures: dateParseFailures,
                min_date_published_parsed: minDate ? minDate.toISOString().split('T')[0] : null,
                max_date_published_parsed: maxDate ? maxDate.toISOString().split('T')[0] : null,
                unique_markets_count: uniqueMarkets.size,
                header_map: headerMapObj
              }
            }
          });
          
        } catch (xlsxError) {
          // Fallback to CSV parsing if xlsx fails
          if (file_url.endsWith('.csv') || fileContent.includes(',')) {
            // Parse CSV
            const lines = fileContent.split('\n');
            const headers = lines[0].split(',').map(h => h.trim().replace(/"/g, ''));
            gnpd_headers = headers;
            
            for (let i = 1; i < lines.length && i < 1000; i++) {
              const values = lines[i].split(',').map(v => v.trim().replace(/"/g, ''));
              if (values.length === headers.length) {
                const product = {};
                headers.forEach((header, idx) => {
                  product[header] = values[idx];
                });
                
                // Validate country and map to region
                if (product.Market || product.Country) {
                  const country = product.Market || product.Country;
                  try {
                    const { getRegionByCountry } = await import('./RegionsTaxonomy.js');
                    const regionCode = getRegionByCountry(country);
                    if (regionCode) {
                      product.region_code = regionCode;
                    }
                  } catch (err) {
                    console.warn(`Could not map country "${country}" to region:`, err.message);
                  }
                }
                
                gnpd_data.push(product);
              }
            }
            
            // Store parsed CSV data
            await base44.entities.Source.update(source.id, {
              gnpd_data: gnpd_data,
              gnpd_headers: gnpd_headers,
              gnpd_row_count: gnpd_data.length,
              gnpd_preview_rows: gnpd_data.slice(0, 20),
              gnpd_processing_status: 'ready'
            });
          } else {
            // Unsupported file type for CSV fallback
            await base44.entities.Source.update(source.id, {
              status: 'failed',
              gnpd_processing_status: 'failed',
              gnpd_processing_error: 'Unsupported file format. Please upload XLSX or CSV.',
              status_message: 'Unsupported file format'
            });
            return Response.json({ 
              error: 'Unsupported file format for GNPD. Please upload XLSX or CSV.'
            }, { status: 400 });
          }
        }
        
        // If we reach here with HTML file, process it
        if (fileContent.includes('<html') || fileContent.includes('<table')) {
          // Use ExtractDataFromUploadedFile for more robust HTML parsing
          const extractResult = await base44.integrations.Core.ExtractDataFromUploadedFile({
            file_url,
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
                      image_url: { type: "string" },
                      brand: { type: "string" },
                      launch_date: { type: "string" },
                      country: { type: "string" }
                    },
                    required: ["record_id", "product_name"]
                  }
                }
              },
              required: ["products"]
            }
          });

          if (extractResult.status === 'success' && extractResult.output?.products) {
            const extractedProducts = extractResult.output.products;
            
            for (const product of extractedProducts) {
              let has_image = false;
              let uploaded_image_url = null;

              if (product.image_url) {
                try {
                  const imgResponse = await fetch(product.image_url);
                  const imgBlob = await imgResponse.blob();
                  const imgFile = new File([imgBlob], `gnpd_product_${product.record_id || Date.now()}.jpg`, { type: imgBlob.type });
                  
                  const uploadResult = await base44.integrations.Core.UploadFile({ file: imgFile });
                  if (uploadResult.file_url) {
                    uploaded_image_url = uploadResult.file_url;
                    has_image = true;
                  }
                } catch (e) {
                  console.error(`Failed to download/upload image for product ${product.record_id}:`, e);
                }
              }

              // Validate country and map to region
              let region_code = null;
              if (product.country) {
                try {
                  const { getRegionByCountry } = await import('./RegionsTaxonomy.js');
                  region_code = getRegionByCountry(product.country);
                } catch (err) {
                  console.warn(`Could not map country "${product.country}" to region:`, err.message);
                }
              }

              gnpd_data.push({
                record_id: product.record_id,
                product_name: product.product_name,
                brand: product.brand || null,
                launch_date: product.launch_date || null,
                country: product.country || null,
                region_code: region_code,
                image_url: uploaded_image_url,
                has_image: has_image,
                parsed_from_html: true
              });
            }
          }
        }

        // Calculate freshness based on dates in GNPD data
        const currentYear = new Date().getFullYear();
        const hasRecentProducts = gnpd_data.some(p => {
          const dateStr = p.Date || p.date || p['Launch Date'] || '';
          return dateStr.includes(String(currentYear)) || dateStr.includes(String(currentYear - 1));
        });

        await base44.entities.Source.update(source.id, {
          status: 'ready',
          processing_completed_at: new Date().toISOString(),
          gnpd_data,
          freshness: hasRecentProducts ? 'recent' : 'aging'
        });
      } else {
        // Narrative report (PDF etc.) — route into the RAG extraction pipeline.
        // processSourceQueue uses pdfjs (no 10MB limit) + structured Claude extraction.
        await base44.entities.Source.update(source.id, {
          status: 'uploaded',
          pipeline_stage: 'uploaded',
          review_status: 'pending',
          status_message: 'Queued for AI extraction',
        });

        await base44.functions.invoke('processSourceQueue', { sourceIds: [source.id] });
      }

      // Update project data sufficiency score (only if project_id provided)
      if (project_id) {
        const project = await base44.entities.Project.get(project_id);
        
        // Get all sources linked to this project
        let allSources = [];
        if (project.selected_source_ids && project.selected_source_ids.length > 0) {
          for (const sourceId of project.selected_source_ids) {
            try {
              const src = await base44.entities.Source.get(sourceId);
              if (src) allSources.push(src);
            } catch (e) {
              console.warn(`Source ${sourceId} not found`);
            }
          }
        } else {
          // Fallback: get sources directly linked to project (legacy)
          allSources = await base44.entities.Source.filter({ project_id });
        }
        
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
      }

      return Response.json({ 
        success: true, 
        source_id: source.id,
        excerpts_count: source.excerpts?.length || 0,
        gnpd_count: source.gnpd_data?.length || 0
      });
    } catch (processingError) {
      // Update source status to failed
      await base44.entities.Source.update(source.id, {
        status: 'failed',
        status_message: processingError.message || 'Processing failed',
        processing_completed_at: new Date().toISOString()
      });
      
      console.error('[processSource] Processing error:', processingError);
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