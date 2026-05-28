import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

// Column name synonyms for auto-detection
const COLUMN_SYNONYMS = {
  record_id: ['record id', 'recordid', 'record_id', 'id', 'gnpd id', 'product id'],
  date_published: ['date published', 'datepublished', 'date_published', 'launch date', 'launchdate', 'date'],
  market: ['market', 'country', 'market country', 'launch country'],
  product_name: ['product', 'product name', 'productname', 'product_name', 'name', 'product title'],
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

// Parse GNPD HTML export format.
// Supports two formats:
//   1. Definition-list format: each product in <dl>...<dt>/<dd>...</dl>
//   2. Mintel detail-page format: each product in <div class="body_panel"> with <table> th/td pairs
function parseGNPDHtml(html) {
  const rows = [];
  const fieldSet = new Set();

  // --- FORMAT 2: Mintel detail-page format (body_panel divs with table th/td pairs) ---
  // Detect by checking for the characteristic hidden input + body_panel structure
  const isDetailPageFormat = html.includes('body_panel') || html.includes('detailed_packaging_table');

  if (isDetailPageFormat) {
    // Split on product panel boundaries
    // Each product starts at <div id="Product_id_XXXXXX"
    const productBlockRegex = /<div[^>]+id="Product_id_(\d+)"[^>]*>([\s\S]*?)(?=<div[^>]+id="Product_id_\d+"|$)/gi;
    let m;

    while ((m = productBlockRegex.exec(html)) !== null) {
      const productId = m[1];
      const blockHtml = m[2];
      const row = {};

      row['Record ID'] = productId;
      row['Record Hyperlink'] = `https://www.gnpd.com/sinatra/recordpage/${productId}`;
      fieldSet.add('Record ID');
      fieldSet.add('Record Hyperlink');

      // Extract product name from <h1>
      const h1Match = blockHtml.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
      if (h1Match) {
        row['Product'] = stripHtml(h1Match[1]);
        fieldSet.add('Product');
      }

      // Extract all th/td pairs from tables
      const trRegex = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
      let tr;
      while ((tr = trRegex.exec(blockHtml)) !== null) {
        const trHtml = tr[1];
        // Match <th>label</th><td>value</td>
        const thMatch = trHtml.match(/<th[^>]*>([\s\S]*?)<\/th>/i);
        const tdMatch = trHtml.match(/<td[^>]*>([\s\S]*?)<\/td>/i);
        if (thMatch && tdMatch) {
          const key = stripHtml(thMatch[1]);
          const val = stripHtml(tdMatch[1]);
          if (key && val && val.trim() !== '' && val !== '&nbsp;') {
            // Special handling for Date Published: extract "Month Year" from <monthname> tags or text
            if (key === 'Date Published') {
              // Try to extract month + year text
              const monthMatch = tdMatch[1].match(/<monthname[^>]*>([^<]+)<\/monthname>\s*(\d{4})/i);
              if (monthMatch) {
                row[key] = `${monthMatch[1]} ${monthMatch[2]}`;
              } else {
                row[key] = val;
              }
            } else {
              row[key] = val;
            }
            fieldSet.add(key);
          }
        }
      }

      // Extract Product Description text block
      const descMatch = blockHtml.match(/id="product_description_body"[^>]*>([\s\S]*?)<\/div>/i);
      if (descMatch) {
        const desc = stripHtml(descMatch[1]);
        if (desc) {
          row['Product Description'] = desc;
          fieldSet.add('Product Description');
        }
      }

      if (Object.keys(row).length > 2) {
        rows.push(row);
      }
    }

    // Fallback: if the product block regex didn't match (single product page),
    // try extracting from the whole document
    if (rows.length === 0) {
      const row = {};

      // Record ID from hidden input
      const hiddenIdMatch = html.match(/id="item_id"\s+value="(\d+)"/i);
      if (hiddenIdMatch) {
        row['Record ID'] = hiddenIdMatch[1];
        row['Record Hyperlink'] = `https://www.gnpd.com/sinatra/recordpage/${hiddenIdMatch[1]}`;
        fieldSet.add('Record ID');
        fieldSet.add('Record Hyperlink');
      }

      // Product name from h1
      const h1Match = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
      if (h1Match) {
        row['Product'] = stripHtml(h1Match[1]);
        fieldSet.add('Product');
      }

      // Extract all th/td pairs
      const trRegex = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
      let tr;
      while ((tr = trRegex.exec(html)) !== null) {
        const trHtml = tr[1];
        const thMatch = trHtml.match(/<th[^>]*>([\s\S]*?)<\/th>/i);
        const tdMatch = trHtml.match(/<td[^>]*>([\s\S]*?)<\/td>/i);
        if (thMatch && tdMatch) {
          const key = stripHtml(thMatch[1]);
          const val = stripHtml(tdMatch[1]);
          if (key && val && val.trim() !== '' && val !== '&nbsp;') {
            if (key === 'Date Published') {
              const monthMatch = tdMatch[1].match(/<monthname[^>]*>([^<]+)<\/monthname>\s*(\d{4})/i);
              row[key] = monthMatch ? `${monthMatch[1]} ${monthMatch[2]}` : val;
            } else {
              row[key] = val;
            }
            fieldSet.add(key);
          }
        }
      }

      // Product description
      const descMatch = html.match(/id="product_description_body"[^>]*>([\s\S]*?)<\/div>/i);
      if (descMatch) {
        const desc = stripHtml(descMatch[1]);
        if (desc) { row['Product Description'] = desc; fieldSet.add('Product Description'); }
      }

      if (Object.keys(row).length > 2) rows.push(row);
    }

    const fixedOrder = ['Record ID', 'Product', 'Brand', 'Company', 'Ultimate Company', 'Market', 'Category', 'Sub-Category', 'Date Published', 'Launch Type', 'Product Description', 'Claims', 'Flavours', 'Record Hyperlink'];
    const headers = [
      ...fixedOrder.filter(f => fieldSet.has(f)),
      ...[...fieldSet].filter(f => !fixedOrder.includes(f))
    ];
    return { headers, rows };
  }

  // --- FORMAT 1: Definition-list format (<dl>/<dt>/<dd>) ---
  const dlRegex = /<dl>([\s\S]*?)<\/dl>/gi;
  let m;

  while ((m = dlRegex.exec(html)) !== null) {
    const dlHtml = m[1];
    const row = {};

    const urlMatch = dlHtml.match(/href="[^"]*\/recordpage\/(\d+)\//i);
    if (urlMatch) {
      row['Record ID'] = urlMatch[1];
      row['Record Hyperlink'] = `http://www.gnpd.com/sinatra/recordpage/${urlMatch[1]}/`;
      fieldSet.add('Record ID');
      fieldSet.add('Record Hyperlink');
    }

    const firstDtMatch = dlHtml.match(/<dt>([\s\S]*?)<\/dt>/i);
    if (firstDtMatch) {
      const name = stripHtml(firstDtMatch[1]);
      if (name && name !== '&nbsp;' && !['Category','Sub-Category','Date Published','Launch Type','Brand','Market','Product Description','Company','Ultimate Company','Claims','Flavours'].includes(name)) {
        row['Product'] = name;
        fieldSet.add('Product');
      }
    }

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

    if (Object.keys(row).length > 2) rows.push(row);
  }

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