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
  record_hyperlink: ['record hyperlink', 'record_hyperlink', 'hyperlink', 'url', 'link', 'record hyperlink']
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

function stripHtml(str) {
  return str.replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&#[0-9]+;/g, '').replace(/&[a-z]+;/g, '').trim();
}

// Parse GNPD HTML export format — each product is a <dl> with <dt>/<dd> pairs
// Extracts record ID from the product URL link
function parseGNPDHtml(html) {
  const rows = [];
  const fieldSet = new Set();

  // Each product block is wrapped in a <dl>...</dl>
  const dlRegex = /<dl>([\s\S]*?)<\/dl>/gi;
  let m;

  while ((m = dlRegex.exec(html)) !== null) {
    const dlHtml = m[1];
    const row = {};

    // Extract product URL and record ID from anchor tag
    const urlMatch = dlHtml.match(/href="[^"]*\/recordpage\/(\d+)\//i);
    if (urlMatch) {
      row['Record ID'] = urlMatch[1];
      row['Record Hyperlink'] = `http://www.gnpd.com/sinatra/recordpage/${urlMatch[1]}/`;
      fieldSet.add('Record ID');
      fieldSet.add('Record Hyperlink');
    }

    // Extract product name from first <dt> (before any known field label)
    const firstDtMatch = dlHtml.match(/<dt>([\s\S]*?)<\/dt>/i);
    if (firstDtMatch) {
      const name = stripHtml(firstDtMatch[1]);
      if (name && name !== '&nbsp;' && !['Category','Sub-Category','Date Published','Launch Type','Brand','Market','Product Description','Company','Ultimate Company','Claims','Flavours'].includes(name)) {
        row['Product'] = name;
        fieldSet.add('Product');
      }
    }

    // Extract all dt/dd pairs
    const dtddRegex = /<dt>([\s\S]*?)<\/dt>\s*<dd>([\s\S]*?)<\/dd>/gi;
    let p;
    while ((p = dtddRegex.exec(dlHtml)) !== null) {
      const key = stripHtml(p[1]);
      const val = stripHtml(p[2]);
      if (key && val && val !== '&nbsp;') {
        row[key] = val;
        fieldSet.add(key);
      }
    }

    if (Object.keys(row).length > 2) {
      rows.push(row);
    }
  }

  // Build ordered headers: fixed important ones first, then rest
  const fixedOrder = ['Record ID', 'Product', 'Brand', 'Company', 'Ultimate Company', 'Market', 'Category', 'Sub-Category', 'Date Published', 'Launch Type', 'Product Description', 'Claims', 'Flavours', 'Record Hyperlink'];
  const headers = [
    ...fixedOrder.filter(f => fieldSet.has(f)),
    ...[...fieldSet].filter(f => !fixedOrder.includes(f))
  ];

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
        // GNPD HTML definition-list format parsing
        const { headers, rows } = parseGNPDHtml(fileText);
        if (rows.length === 0) {
          throw new Error('Could not extract product data from GNPD HTML file. Make sure the file is a valid GNPD export.');
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