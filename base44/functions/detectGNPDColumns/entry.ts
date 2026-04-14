import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

// Column name synonyms for auto-detection
const COLUMN_SYNONYMS = {
  record_id: ['record id', 'recordid', 'record_id', 'id', 'gnpd id', 'product id'],
  date_published: ['date published', 'datepublished', 'date_published', 'launch date', 'launchdate', 'date'],
  market: ['market', 'country', 'market country', 'launch country'],
  product_name: ['product', 'product name', 'productname', 'product_name', 'name'],
  category: ['category', 'main category', 'product category'],
  sub_category: ['sub-category', 'sub category', 'subcategory', 'sub_category'],
  brand: ['brand', 'brand name', 'brandname'],
  company: ['company', 'manufacturer', 'producer'],
  ultimate_company: ['ultimate company', 'ultimate_company', 'parent company', 'ultimate'],
  launch_type: ['launch type', 'launch_type', 'type'],
  claims: ['claims', 'product claims', 'positioning claims', 'positioning/claims'],
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
  const normalizedColumns = columns.map(col => col.split('__')[0].toLowerCase().trim());
  const mappings = {};
  for (const [field, synonyms] of Object.entries(COLUMN_SYNONYMS)) {
    for (const synonym of synonyms) {
      const index = normalizedColumns.indexOf(synonym);
      if (index !== -1) {
        mappings[field] = columns[index];
        break;
      }
    }
  }
  return mappings;
}

// Parse an HTML table into rows (array of objects)
function parseHtmlTable(html) {
  // Extract first <table>
  const tableMatch = html.match(/<table[\s\S]*?<\/table>/i);
  if (!tableMatch) return { headers: [], rows: [] };

  const tableHtml = tableMatch[0];

  // Extract header row from <thead> or first <tr>
  const theadMatch = tableHtml.match(/<thead[\s\S]*?<\/thead>/i);
  let headerRow = '';
  if (theadMatch) {
    const trMatch = theadMatch[0].match(/<tr[\s\S]*?<\/tr>/i);
    headerRow = trMatch ? trMatch[0] : '';
  } else {
    const trMatch = tableHtml.match(/<tr[\s\S]*?<\/tr>/i);
    headerRow = trMatch ? trMatch[0] : '';
  }

  const cellRegex = /<t[hd][^>]*>([\s\S]*?)<\/t[hd]>/gi;
  const rawHeaders = [];
  let m;
  while ((m = cellRegex.exec(headerRow)) !== null) {
    rawHeaders.push(m[1].replace(/<[^>]+>/g, '').trim());
  }

  if (rawHeaders.length === 0) return { headers: [], rows: [] };

  // Make headers unique
  const seenHeaders = {};
  const headers = rawHeaders.map(h => {
    if (!seenHeaders[h]) {
      seenHeaders[h] = 1;
      return h;
    } else {
      const idx = ++seenHeaders[h];
      return `${h}__${idx}`;
    }
  });

  // Extract body rows
  const tbodyMatch = tableHtml.match(/<tbody[\s\S]*?<\/tbody>/i);
  const bodyHtml = tbodyMatch ? tbodyMatch[0] : tableHtml;
  const trRegex = /<tr[\s\S]*?<\/tr>/gi;
  const rows = [];

  // Skip the first <tr> if there was no thead (it was the header row)
  let firstTr = true;
  while ((m = trRegex.exec(bodyHtml)) !== null) {
    if (!theadMatch && firstTr) {
      firstTr = false;
      continue;
    }
    firstTr = false;
    const trHtml = m[0];
    const tdRegex = /<t[hd][^>]*>([\s\S]*?)<\/t[hd]>/gi;
    const cells = [];
    let c;
    while ((c = tdRegex.exec(trHtml)) !== null) {
      cells.push(c[1].replace(/<[^>]+>/g, '').trim());
    }
    if (cells.length > 0) {
      const row = {};
      headers.forEach((h, i) => {
        row[h] = cells[i] !== undefined ? cells[i] : '';
      });
      rows.push(row);
    }
  }

  return { headers, rows };
}

Deno.serve(async (req) => {
  let source_id;
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();
    source_id = body.source_id;

    if (!source_id) {
      return Response.json({ error: 'source_id required' }, { status: 400 });
    }

    await base44.entities.Source.update(source_id, {
      gnpd_mapping_status: 'detecting',
      gnpd_mapping_error: null
    });

    const source = await base44.entities.Source.get(source_id);

    let availableColumns = [];
    let gnpdData = source.gnpd_data || [];

    // If no GNPD data exists yet, parse from file
    if (!gnpdData.length && source.file_url) {
      const fileResponse = await fetch(source.file_url);
      const contentType = fileResponse.headers.get('content-type') || '';
      const fileText = await fileResponse.text();
      const lowerUrl = (source.file_url || '').toLowerCase();

      if (lowerUrl.includes('.html') || lowerUrl.includes('.htm') || contentType.includes('html') || fileText.trim().startsWith('<')) {
        // HTML table parsing
        const { headers, rows } = parseHtmlTable(fileText);
        if (rows.length === 0) {
          throw new Error('Could not extract table data from HTML file');
        }
        gnpdData = rows;
        availableColumns = headers;
        await base44.entities.Source.update(source_id, {
          gnpd_data: rows,
          gnpd_headers: headers,
          gnpd_row_count: rows.length,
          gnpd_preview_rows: rows.slice(0, 20),
          gnpd_processing_status: 'ready',
          status: 'ready',
          processing_completed_at: new Date().toISOString()
        });
      } else {
        // Excel/CSV parsing
        const fileBuffer = await (await fetch(source.file_url)).arrayBuffer();
        const { read, utils } = await import('npm:xlsx@0.18.5');
        const workbook = read(fileBuffer, { type: 'buffer' });
        const sheetName = workbook.SheetNames.find(n => n.toLowerCase() === 'gnpd-download') || workbook.SheetNames[0];
        const sheet = workbook.Sheets[sheetName];
        const rawData = utils.sheet_to_json(sheet, { header: 1, defval: '' });
        if (rawData.length === 0) throw new Error('Empty GNPD file');

        const originalHeaders = rawData[0];
        const seenHeaders = {};
        const headers = originalHeaders.map((h, i) => {
          const hs = String(h || `Column_${i}`).trim();
          if (!seenHeaders[hs]) { seenHeaders[hs] = 1; return hs; }
          return `${hs}__${++seenHeaders[hs]}`;
        });

        const rows = rawData.slice(1).map(rowArr => {
          const obj = {};
          headers.forEach((h, i) => { obj[h] = rowArr[i] !== undefined ? rowArr[i] : ''; });
          return obj;
        });

        gnpdData = rows;
        availableColumns = headers;
        await base44.entities.Source.update(source_id, {
          gnpd_data: rows,
          gnpd_headers: headers,
          gnpd_row_count: rows.length,
          gnpd_preview_rows: rows.slice(0, 20),
          gnpd_processing_status: 'ready',
          status: 'ready',
          processing_completed_at: new Date().toISOString()
        });
      }
    } else {
      availableColumns = Object.keys(gnpdData[0] || {});
    }

    // Auto-detect column mappings
    const detectedMappings = detectColumnMapping(availableColumns);
    const requiredFields = ['record_id', 'product_name', 'market', 'date_published', 'category', 'sub_category'];
    const requiredMappingsComplete = requiredFields.every(f => detectedMappings[f]);
    const missingFields = requiredFields.filter(f => !detectedMappings[f]);

    const uniqueMarkets = new Set(
      gnpdData.map(row => row[detectedMappings.market]).filter(Boolean)
    );

    const validationStatus = {
      required_mappings_complete: requiredMappingsComplete,
      rows_loaded: gnpdData.length,
      unique_markets_count: uniqueMarkets.size
    };

    await base44.entities.Source.update(source_id, {
      gnpd_column_mapping: detectedMappings,
      gnpd_mapping_status: requiredMappingsComplete ? 'complete' : 'failed',
      gnpd_mapping_updated_at: new Date().toISOString(),
      gnpd_mapping_error: requiredMappingsComplete
        ? null
        : `Missing required mappings: ${missingFields.join(', ')}`
    });

    return Response.json({
      success: true,
      mapping: {
        ...detectedMappings,
        validation_status: validationStatus,
        available_columns: availableColumns
      },
      source_updated: true
    });

  } catch (error) {
    if (source_id) {
      try {
        const base44 = createClientFromRequest(req);
        await base44.entities.Source.update(source_id, {
          gnpd_mapping_status: 'failed',
          gnpd_mapping_error: error.message
        });
      } catch (_) { /* ignore */ }
    }
    return Response.json({
      error: 'Detection failed',
      message: error.message,
      actionable: true
    }, { status: 500 });
  }
});