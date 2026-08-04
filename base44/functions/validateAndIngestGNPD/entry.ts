import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

// The 30 required columns in the Mintel Spreadsheet Template export (lowercase for matching)
const REQUIRED_COLUMNS = [
  'record id', 'product', 'company', 'brand', 'ultimate company',
  'market', 'date published', 'category', 'sub-category', 'launch type',
  'product description', 'claims', 'flavours', 'storage', 'format type',
  'unit pack size (ml/g)', 'packaging units', 'package type', 'package material',
  'bar code', 'price in us dollars', 'price in euros', 'product variants',
  'record hyperlink'
];

// Mintel country → Palsgaard canonical region mapping
const COUNTRY_TO_REGION = {
  // ASPAC
  'australia': 'ASPAC', 'china': 'ASPAC', 'japan': 'ASPAC', 'south korea': 'ASPAC',
  'india': 'ASPAC', 'indonesia': 'ASPAC', 'malaysia': 'ASPAC', 'thailand': 'ASPAC',
  'vietnam': 'ASPAC', 'philippines': 'ASPAC', 'taiwan': 'ASPAC', 'hong kong': 'ASPAC',
  'singapore': 'ASPAC', 'new zealand': 'ASPAC', 'pakistan': 'ASPAC', 'bangladesh': 'ASPAC',
  // AMERICAS
  'united states': 'AMERICAS', 'usa': 'AMERICAS', 'us': 'AMERICAS', 'canada': 'AMERICAS',
  'brazil': 'AMERICAS', 'mexico': 'AMERICAS', 'argentina': 'AMERICAS', 'chile': 'AMERICAS',
  'colombia': 'AMERICAS', 'peru': 'AMERICAS',
  // EMEC
  'germany': 'EMEC', 'france': 'EMEC', 'united kingdom': 'EMEC', 'uk': 'EMEC',
  'spain': 'EMEC', 'italy': 'EMEC', 'netherlands': 'EMEC', 'poland': 'EMEC',
  'russia': 'EMEC', 'sweden': 'EMEC', 'norway': 'EMEC', 'denmark': 'EMEC',
  'finland': 'EMEC', 'belgium': 'EMEC', 'switzerland': 'EMEC', 'austria': 'EMEC',
  'czech republic': 'EMEC', 'hungary': 'EMEC', 'romania': 'EMEC', 'ukraine': 'EMEC',
  'portugal': 'EMEC', 'greece': 'EMEC', 'egypt': 'EMEC', 'south africa': 'EMEC',
  'nigeria': 'EMEC', 'kenya': 'EMEC', 'ethiopia': 'EMEC',
  // IMEA
  'saudi arabia': 'IMEA', 'uae': 'IMEA', 'united arab emirates': 'IMEA',
  'iran': 'IMEA', 'iraq': 'IMEA', 'turkey': 'IMEA', 'israel': 'IMEA',
  'jordan': 'IMEA', 'kuwait': 'IMEA', 'qatar': 'IMEA', 'bahrain': 'IMEA',
  'oman': 'IMEA', 'morocco': 'IMEA', 'algeria': 'IMEA', 'tunisia': 'IMEA',
  'lebanon': 'IMEA', 'pakistan': 'IMEA'
};

// Mintel category → Palsgaard category mapping
const MINTEL_TO_PALSGAARD_CATEGORY = {
  'ice cream': 'Ice Cream', 'frozen yogurt': 'Ice Cream', 'frozen desserts': 'Ice Cream',
  'dairy': 'Dairy', 'milk': 'Dairy', 'yogurt': 'Dairy', 'cheese': 'Dairy', 'butter': 'Dairy',
  'cream': 'Dairy', 'dairy-based beverages': 'Dairy',
  'confectionery': 'Confectionery', 'chocolate': 'Confectionery', 'sugar confectionery': 'Confectionery',
  'gum': 'Confectionery',
  'bakery': 'Bakery', 'bread': 'Bakery', 'biscuits': 'Bakery', 'cakes': 'Bakery',
  'pastries': 'Bakery', 'morning goods': 'Bakery',
  'spreads': 'Fine Food', 'jams': 'Fine Food', 'sauces': 'Fine Food',
  'meat': 'Meat', 'poultry': 'Meat', 'fish': 'Meat', 'seafood': 'Meat',
  'baby food': 'Other Food Applications', 'pet food': 'Other Food Applications',
  'snacks': 'Other Food Applications', 'breakfast cereals': 'Other Food Applications',
  'beverages': 'Other Food Applications', 'carbonated beverages': 'Other Food Applications',
  'oils & fats': 'Lipid', 'cooking oils': 'Lipid', 'margarine': 'Lipid',
};

function mapRegion(markets) {
  if (!markets || markets.length === 0) return 'Global';
  const regions = new Set();
  for (const market of markets) {
    const key = market.toLowerCase().trim();
    const region = COUNTRY_TO_REGION[key];
    if (region) regions.add(region);
  }
  if (regions.size === 0) return 'Global';
  if (regions.size === 1) return [...regions][0];
  return 'Global'; // Multiple regions → Global
}

function mapCategory(categories) {
  if (!categories || categories.length === 0) return null;
  for (const cat of categories) {
    const key = cat.toLowerCase().trim();
    // Direct match
    if (MINTEL_TO_PALSGAARD_CATEGORY[key]) return MINTEL_TO_PALSGAARD_CATEGORY[key];
    // Partial match
    for (const [mintelKey, palsgaardVal] of Object.entries(MINTEL_TO_PALSGAARD_CATEGORY)) {
      if (key.includes(mintelKey) || mintelKey.includes(key)) return palsgaardVal;
    }
  }
  return 'Other Food Applications';
}

function parseSearchDetails(sheet, utils) {
  const rawData = utils.sheet_to_json(sheet, { header: 1, defval: '' });
  const metadata = {
    categories: [],
    markets: [],
    dateRange: null,
    searchTitle: null,
    ingredientSearch: null,
    companySearch: null,
    rawText: ''
  };

  // Collect all non-empty cell text from the sheet (single or multi-column)
  const allLines = [];
  for (const row of rawData) {
    for (const cell of row) {
      const text = String(cell || '').trim();
      if (text) allLines.push(text);
    }
  }

  for (const line of allLines) {
    const lower = line.toLowerCase();

    // Mintel sentence-style: "where Ingredient Search matches X as the Ingredients"
    const ingredientMatch = line.match(/ingredient search matches (.+?) as the ingredients?/i);
    if (ingredientMatch) {
      metadata.ingredientSearch = ingredientMatch[1].trim();
    }

    // "and Sub-Category matches one or more of A; B; C"
    const subCatMatch = line.match(/sub-?category matches.+?of (.+)/i);
    if (subCatMatch) {
      metadata.categories.push(...subCatMatch[1].split(/[;,]/).map(s => s.trim()).filter(Boolean));
    }

    // "and Category matches one or more of A; B"
    const catMatch = !subCatMatch && line.match(/\bcategory matches.+?of (.+)/i);
    if (catMatch) {
      metadata.categories.push(...catMatch[1].split(/[;,]/).map(s => s.trim()).filter(Boolean));
    }

    // "and Market matches one or more of A; B"
    const marketMatch = line.match(/market matches.+?of (.+)/i);
    if (marketMatch) {
      metadata.markets.push(...marketMatch[1].split(/[;,]/).map(s => s.trim()).filter(Boolean));
    }

    // "and Date Published is between Jan 2015 and Jun 2026"
    const dateMatch = line.match(/date published is between (.+)/i);
    if (dateMatch) {
      metadata.dateRange = dateMatch[1].trim();
    }

    // "where Date Published is within the last three complete years"
    const relDateMatch = line.match(/date published is (within .+)/i);
    if (relDateMatch && !metadata.dateRange) {
      metadata.dateRange = relDateMatch[1].trim().replace(/["']/g, '');
    }

    // "and Date Published matches less than six months ago"
    const matchDateMatch = line.match(/date published matches (.+)/i);
    if (matchDateMatch && !metadata.dateRange) {
      metadata.dateRange = matchDateMatch[1].trim().replace(/["']/g, '');
    }

    // "and Company Search matches Froneri and all child companies as the Company"
    const companyMatch = line.match(/company search matches (.+?)(?:\s+and all child companies|\s+as the company|["']?$)/i);
    if (companyMatch && !metadata.companySearch) {
      const c = companyMatch[1].trim().replace(/["']/g, '');
      if (c) metadata.companySearch = c;
    }

    // Key: value style (older export formats)
    if (line.includes(':')) {
      const idx = line.indexOf(':');
      const label = line.slice(0, idx).toLowerCase().trim();
      const value = line.slice(idx + 1).trim();
      if (!value) continue;

      if (label.includes('categor') || label.includes('sub-cat')) {
        metadata.categories.push(...value.split(/[,;]/).map(s => s.trim()).filter(Boolean));
      } else if (label.includes('market') || label.includes('countr') || label.includes('geograph') || label.includes('region')) {
        metadata.markets.push(...value.split(/[,;]/).map(s => s.trim()).filter(Boolean));
      } else if (label.includes('date') || label.includes('period') || label.includes('time range')) {
        if (!metadata.dateRange) metadata.dateRange = value;
      } else if (label.includes('title') || label.includes('search name') || label.includes('report name')) {
        if (!metadata.searchTitle) metadata.searchTitle = value;
      }
    }
  }

  // Deduplicate
  metadata.categories = [...new Set(metadata.categories)];
  metadata.markets    = [...new Set(metadata.markets)];
  metadata.rawText    = allLines.join('\n').slice(0, 3000);

  return metadata;
}

Deno.serve(async (req) => {
  let source_id;
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json();
    source_id = body.source_id;
    if (!source_id) return Response.json({ error: 'source_id required' }, { status: 400 });

    const source = await base44.entities.Source.get(source_id);
    if (!source) return Response.json({ error: 'Source not found' }, { status: 404 });

    const fileUrl = source.file_url || '';
    const lowerUrl = fileUrl.toLowerCase().split('?')[0]; // Strip query params for extension check

    // ── STEP 1: File type check ──────────────────────────────────────────────
    const isXlsx = lowerUrl.endsWith('.xlsx');
    const isXls  = lowerUrl.endsWith('.xls');
    const isCsv  = lowerUrl.endsWith('.csv');
    const isHtml = lowerUrl.endsWith('.html') || lowerUrl.endsWith('.htm');
    const isPptx = lowerUrl.endsWith('.pptx') || lowerUrl.endsWith('.ppt');
    const isPdf  = lowerUrl.endsWith('.pdf');

    if (!isXlsx && !isXls) {
      let actualType = 'unknown';
      if (isCsv) actualType = '.csv';
      else if (isHtml) actualType = '.html';
      else if (isPptx) actualType = '.pptx';
      else if (isPdf) actualType = '.pdf';
      else {
        // Try to guess from URL
        const ext = lowerUrl.match(/\.([a-z0-9]+)$/)?.[1];
        if (ext) actualType = `.${ext}`;
      }

      const errorMsg = `Wrong file type: ${actualType}. Use the Mintel Spreadsheet Template export (.xls). Do not use HTML, CSV, or PPTX exports.`;
      await base44.entities.Source.update(source_id, {
        gnpd_mapping_status: 'failed',
        gnpd_mapping_error: errorMsg
      });
      return Response.json({ success: false, errors: [errorMsg] });
    }

    // ── Fetch the file ───────────────────────────────────────────────────────
    let fetchUrl = fileUrl;
    if (fetchUrl.startsWith('private://') || fetchUrl.includes('/private/')) {
      const signed = await base44.asServiceRole.integrations.Core.CreateFileSignedUrl({ file_uri: fetchUrl, expires_in: 300 });
      fetchUrl = signed.signed_url;
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 60000);
    let fileResponse;
    try {
      fileResponse = await fetch(fetchUrl, { signal: controller.signal });
    } finally {
      clearTimeout(timeout);
    }
    if (!fileResponse.ok) throw new Error(`Failed to fetch file: ${fileResponse.status} ${fileResponse.statusText}`);

    const fileBuffer = await fileResponse.arrayBuffer();
    const { read, utils } = await import('npm:xlsx@0.18.5');

    // Handle .xls by reading as binary (xlsx lib supports both natively)
    const workbook = read(new Uint8Array(fileBuffer), { type: 'array', cellDates: true });

    // ── STEP 2: Structure validation — collect ALL errors ────────────────────
    const errors = [];

    const sheetNames = workbook.SheetNames;
    const knownHeaders = ['record id', 'product', 'brand', 'market', 'date published', 'category'];

    // Two supported layouts:
    //  1. "Spreadsheet Template" export — two sheets: "Products from GNPD" + "Search details"
    //  2. "GNPD-download" export — a single sheet holding the search details (top rows),
    //     the column header row, then the product rows.
    const templateDataSheetName = sheetNames.find(n => n.toLowerCase() === 'products from gnpd');
    const templateMetaSheetName = sheetNames.find(n => n.toLowerCase() === 'search details');

    let dataSheet, rawData, headerRowIndex = 0, metaSheet, singleSheetMode = false;

    if (templateDataSheetName && templateMetaSheetName) {
      // Layout 1 — separate sheets
      dataSheet = workbook.Sheets[templateDataSheetName];
      metaSheet = workbook.Sheets[templateMetaSheetName];
      rawData = utils.sheet_to_json(dataSheet, { header: 1, defval: '' });
      for (let i = 0; i < Math.min(rawData.length, 10); i++) {
        const rowLower = rawData[i].map(c => String(c || '').toLowerCase().trim());
        if (knownHeaders.some(h => rowLower.includes(h))) { headerRowIndex = i; break; }
      }
    } else {
      // Layout 2 — single combined sheet (the standard GNPD-download export)
      singleSheetMode = true;
      const sheet = workbook.Sheets[sheetNames[0]];
      rawData = utils.sheet_to_json(sheet, { header: 1, defval: '' });

      // Locate the product header row anywhere in the first ~30 rows
      headerRowIndex = -1;
      for (let i = 0; i < Math.min(rawData.length, 30); i++) {
        const rowLower = rawData[i].map(c => String(c || '').toLowerCase().trim());
        const hits = knownHeaders.filter(h => rowLower.includes(h)).length;
        if (hits >= 3) { headerRowIndex = i; break; }
      }

      if (headerRowIndex === -1) {
        const errorMsg = `Could not find a product header row (Record ID, Product, Company…) in sheet "${sheetNames[0]}". Found sheets: ${sheetNames.join(', ')}. Make sure you're using the Mintel GNPD export.`;
        await base44.entities.Source.update(source_id, {
          gnpd_mapping_status: 'failed',
          gnpd_mapping_error: errorMsg
        });
        return Response.json({ success: false, errors: [errorMsg] });
      }

      // The rows above the header are the embedded "Search details" block
      const detailsAOA = rawData.slice(0, headerRowIndex);
      metaSheet = utils.aoa_to_sheet(detailsAOA);
    }

    const headers = rawData[headerRowIndex].map(h => String(h || '').trim());
    const dataRows = rawData.slice(headerRowIndex + 1).filter(r => r.some(c => c !== '' && c !== null && c !== undefined));

    if (dataRows.length === 0) {
      errors.push('The "Products from GNPD" sheet contains no product rows. Check that the export is not empty.');
    }

    // Check C: Column presence (check that core required columns exist)
    const headersLower = headers.map(h => h.toLowerCase().trim());
    const coreRequired = ['record id', 'product', 'market', 'date published', 'ingredient 1'];
    const missingColumns = coreRequired.filter(col => !headersLower.includes(col));
    if (missingColumns.length > 0) {
      errors.push(`Missing required columns: ${missingColumns.map(c => `"${c}"`).join(', ')}. Found columns: ${headers.slice(0, 10).join(', ')}${headers.length > 10 ? '...' : ''}. Make sure you selected "Spreadsheet" format (not CSV or HTML) in Mintel.`);
    }

    if (errors.length > 0) {
      await base44.entities.Source.update(source_id, {
        gnpd_mapping_status: 'failed',
        gnpd_mapping_error: errors.join(' | ')
      });
      return Response.json({ success: false, errors });
    }

    // ── STEP 3: Extract metadata from the "Search details" rows ──────────────
    const searchMetadata = parseSearchDetails(metaSheet, utils);

    // Map to Palsgaard taxonomy.
    // Search-details categories/markets are only present in some exports (e.g. the
    // "Spreadsheet Template"). The "GNPD-download" export often filters by company,
    // so fall back to deriving region/category from the product rows themselves.
    let region_code = mapRegion(searchMetadata.markets);
    let category = mapCategory(searchMetadata.categories);

    // Locate the relevant column indices once (used for fallbacks below)
    const idxOf = (names) => {
      for (const n of names) {
        const i = headersLower.indexOf(n);
        if (i !== -1) return i;
      }
      return -1;
    };
    const marketIdx   = idxOf(['market', 'country']);
    const categoryIdx = idxOf(['category']);
    const subCatIdx   = idxOf(['sub-category', 'sub category']);

    // Region fallback — derive from the actual product markets
    if ((!searchMetadata.markets || searchMetadata.markets.length === 0) && marketIdx !== -1) {
      const markets = [...new Set(dataRows.map(r => String(r[marketIdx] || '').trim()).filter(Boolean))];
      if (markets.length > 0) region_code = mapRegion(markets);
    }

    // Category fallback — pick the most common product category/sub-category
    if (!category && (categoryIdx !== -1 || subCatIdx !== -1)) {
      const counts = {};
      for (const r of dataRows) {
        const cat = String((subCatIdx !== -1 ? r[subCatIdx] : '') || (categoryIdx !== -1 ? r[categoryIdx] : '') || '').trim();
        if (cat) counts[cat] = (counts[cat] || 0) + 1;
      }
      const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]);
      if (sorted.length > 0) category = mapCategory([sorted[0][0]]);
    }

    // Build a human-readable title from search metadata
    // Format: "<Ingredient> — <Sub-Categories> — <Date Range>"
    // e.g. "Compound Chocolate — Chocolate Tablets; Countlines; ... — Jan 2015–Jun 2026"
    const ingredientLabel = searchMetadata.ingredientSearch || null;
    const catLabel = searchMetadata.categories.length > 0
      ? (searchMetadata.categories.length <= 5
          ? searchMetadata.categories.join('; ')
          : `${searchMetadata.categories.slice(0, 4).join('; ')} +${searchMetadata.categories.length - 4} more`)
      : null;
    const marketLabel = searchMetadata.markets.length > 0
      ? (searchMetadata.markets.length <= 4
          ? searchMetadata.markets.join(', ')
          : `${searchMetadata.markets.slice(0, 3).join(', ')} +${searchMetadata.markets.length - 3} more`)
      : null;
    const dateLabel = searchMetadata.dateRange || null;

    const companyLabel = searchMetadata.companySearch || null;

    let autoTitle;
    if (searchMetadata.searchTitle) {
      autoTitle = searchMetadata.searchTitle;
    } else {
      // Priority: company — ingredient — categories — markets — date
      const segments = [companyLabel, ingredientLabel, catLabel, marketLabel, dateLabel].filter(Boolean);
      autoTitle = segments.length > 0
        ? segments.join(' — ')
        : `GNPD Export — ${new Date().toLocaleDateString('en-GB', { month: 'short', year: 'numeric' })}`;

      // Preferred: a short, human-readable summary name derived from the raw
      // "Search details" block, instead of a truncated list of sub-categories.
      // Falls back silently to the segment-based title above.
      if (searchMetadata.rawText) {
        try {
          const res = await base44.asServiceRole.integrations.Core.InvokeLLM({
            prompt: `You name Mintel GNPD export files for a food-ingredient company (Palsgaard).

Below is the "Search details" block from a GNPD export. Write ONE short, descriptive file name that tells a colleague what this export contains.

RULES
- Max 70 characters.
- Summarise long sub-category lists into the umbrella area (e.g. a long list of milk, yogurt, cream, margarine and dairy-alternative sub-categories = "Dairy & Dairy Alternatives"). NEVER list individual sub-categories and never use "+N more".
- Use the format: <Area> — <Market/Region if stated> — <Time period if stated>
- If a company or ingredient is the search subject, lead with it.
- Convert relative periods to plain wording, e.g. "less than six months ago" → "Last 6 months".
- Title Case. No quotes, no file extension, no explanation.

SEARCH DETAILS
${searchMetadata.rawText}`,
            response_json_schema: {
              type: 'object',
              properties: { title: { type: 'string' } },
              required: ['title']
            }
          });
          const suggested = String(res?.title || '').trim().replace(/^["']|["']$/g, '');
          if (suggested.length >= 5) autoTitle = suggested.slice(0, 90);
        } catch (e) {
          console.warn('Auto-naming failed, using fallback title:', e.message);
        }
      }
    }

    // Build structured rows for the data sheet
    const seenHeaders = {};
    const uniqueHeaders = headers.map((h, i) => {
      const hs = h || `Column_${i}`;
      if (!seenHeaders[hs]) { seenHeaders[hs] = 1; return hs; }
      return `${hs}__${++seenHeaders[hs]}`;
    });

    const rows = dataRows.map(rowArr => {
      const obj = {};
      uniqueHeaders.forEach((h, i) => { obj[h] = rowArr[i] !== undefined ? rowArr[i] : ''; });
      return obj;
    });

    // ── STEP 4: Auto-detect column mapping ───────────────────────────────────
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
      record_hyperlink: ['record hyperlink', 'record_hyperlink', 'hyperlink', 'url', 'link']
    };

    const normalizedCols = uniqueHeaders.map(c => c.split('__')[0].toLowerCase().trim());
    const detectedMappings = {};
    for (const [field, synonyms] of Object.entries(COLUMN_SYNONYMS)) {
      for (const synonym of synonyms) {
        const idx = normalizedCols.indexOf(synonym);
        if (idx !== -1) { detectedMappings[field] = uniqueHeaders[idx]; break; }
      }
    }

    const requiredFields = ['record_id', 'product_name', 'market', 'date_published', 'category'];
    if (!detectedMappings.category && detectedMappings.sub_category) {
      detectedMappings.category = detectedMappings.sub_category;
    }
    const requiredMappingsComplete = requiredFields.every(f => detectedMappings[f]);
    const missingMappings = requiredFields.filter(f => !detectedMappings[f]);

    // ── STEP 5: Save everything to source ────────────────────────────────────
    await base44.entities.Source.update(source_id, {
      title: autoTitle,
      region_code,
      category: category || undefined,
      gnpd_data: rows,
      gnpd_headers: uniqueHeaders,
      gnpd_row_count: rows.length,
      gnpd_preview_rows: rows.slice(0, 20),
      gnpd_processing_status: 'ready',
      gnpd_column_mapping: detectedMappings,
      gnpd_mapping_status: requiredMappingsComplete ? 'complete' : 'failed',
      gnpd_mapping_updated_at: new Date().toISOString(),
      gnpd_mapping_error: requiredMappingsComplete ? null : `Missing required column mappings: ${missingMappings.join(', ')}`,
      processing_completed_at: new Date().toISOString(),
      notes: searchMetadata.dateRange ? `Search period: ${searchMetadata.dateRange}` : undefined
    });

    return Response.json({
      success: true,
      rows: rows.length,
      auto_metadata: { title: autoTitle, region_code, category, dateRange: searchMetadata.dateRange },
      mapping_complete: requiredMappingsComplete,
      missing_mappings: missingMappings
    });

  } catch (error) {
    if (source_id) {
      try {
        const base44 = createClientFromRequest(req);
        await base44.entities.Source.update(source_id, {
          gnpd_mapping_status: 'failed',
          gnpd_mapping_error: `Processing error: ${error.message}`
        });
      } catch (_) { /* ignore */ }
    }
    return Response.json({ error: error.message }, { status: 500 });
  }
});