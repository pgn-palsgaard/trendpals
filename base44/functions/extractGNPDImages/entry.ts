import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';
import * as cheerio from 'npm:cheerio@1.0.0';
import XLSX from 'npm:xlsx@0.18.5';

// ---------- download helper ----------
async function fetchUrlBuffer(url) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch ${url}: ${response.statusText}`);
  }
  return await response.arrayBuffer();
}

function readExcelRows(buffer, sheetName = null) {
  const wb = XLSX.read(buffer, { type: "buffer" });
  const name = sheetName || wb.SheetNames[0];
  const ws = wb.Sheets[name];
  return XLSX.utils.sheet_to_json(ws, { defval: "" });
}

function normId(x) {
  return String(x || "").trim();
}

function absolutizeUrl(src, baseUrl) {
  if (!src) return null;
  if (src.startsWith("http://") || src.startsWith("https://")) return src;
  if (src.startsWith("//")) return "https:" + src;
  try {
    return new URL(src, baseUrl).toString();
  } catch {
    return src;
  }
}

/**
 * Extract record_id from hidden input field with id="item_id"
 * and all images from the HTML page.
 */
function extractRecordIdAndImages(html, baseUrl) {
  const $ = cheerio.load(html);

  // First, try to find the hidden input field with id="item_id"
  let recordId = null;
  const hiddenInput = $('#item_id');
  if (hiddenInput.length) {
    recordId = normId(hiddenInput.attr('value'));
  }

  // Fallback: look for "Record ID" in table rows
  if (!recordId) {
    $("tr").each((_, tr) => {
      const tds = $(tr).find("td");
      if (tds.length < 2) return;

      const label = $(tds[0]).text().trim().toLowerCase();
      if (label === "record id") {
        const linkText = $(tds[1]).find("a").first().text().trim();
        const plainText = $(tds[1]).text().trim();
        recordId = normId(linkText || plainText);
      }
    });
  }

  // Extract images
  const images = [];
  $("img").each((_, img) => {
    const $img = $(img);
    let src = $img.attr("src") || $img.attr("data-src") || $img.attr("srcset");
    if (!src) return;

    if (src.includes(" ")) src = src.split(" ")[0];
    src = absolutizeUrl(src, baseUrl);

    // Filter out tiny icons/spacers
    const w = parseInt($img.attr("width") || "0", 10);
    const h = parseInt($img.attr("height") || "0", 10);
    if ((w && w < 40) || (h && h < 40)) return;

    images.push(src);
  });

  const uniqueImages = [...new Set(images)];

  return { record_id: recordId, image_urls: uniqueImages };
}

function matchToExcel(excelRows, recordIdColumnName, extracted) {
  const lookup = new Map();
  for (const row of excelRows) {
    const k = normId(row[recordIdColumnName]);
    if (k) lookup.set(k, row);
  }

  const recId = normId(extracted.record_id);
  const hit = recId ? lookup.get(recId) : null;

  return {
    record_id: extracted.record_id,
    matched: Boolean(hit),
    image_urls: extracted.image_urls,
  };
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { extraction_id } = await req.json();

    if (!extraction_id) {
      return Response.json({ error: 'extraction_id is required' }, { status: 400 });
    }

    // Get the extraction job
    const extraction = await base44.entities.GNPDImageExtraction.filter({ id: extraction_id });
    if (!extraction || extraction.length === 0) {
      return Response.json({ error: 'Extraction job not found' }, { status: 404 });
    }

    const job = extraction[0];

    // Update status to processing
    await base44.entities.GNPDImageExtraction.update(job.id, {
      status: 'processing'
    });

    const htmlUrl = job.html_file_url;
    const excelUrl = job.xlsx_file_url;
    const productIdsToExtract = job.product_ids_to_extract || [];
    const recordIdColumnName = "Record ID";

    // Download files
    const htmlBuf = await fetchUrlBuffer(htmlUrl);
    const xlsxBuf = await fetchUrlBuffer(excelUrl);

    const html = new TextDecoder().decode(htmlBuf);
    const excelRows = readExcelRows(xlsxBuf);

    // Extract record ID and images from HTML
    const extracted = extractRecordIdAndImages(html, htmlUrl);

    if (!extracted.record_id) {
      await base44.entities.GNPDImageExtraction.update(job.id, {
        status: 'failed',
        error_message: 'Could not find Record ID in HTML'
      });
      return Response.json({
        status: 'failed',
        error_message: 'Could not find Record ID in HTML'
      });
    }

    // Match to Excel
    const matched = matchToExcel(excelRows, recordIdColumnName, extracted);

    // Filter: only include if record_id is in product_ids_to_extract
    const shouldInclude = productIdsToExtract.length === 0 || 
                          productIdsToExtract.includes(extracted.record_id);

    let extractedImages = [];
    if (shouldInclude && matched.matched && extracted.image_urls.length > 0) {
      extractedImages = extracted.image_urls.map((url) => ({
        record_id: extracted.record_id,
        image_url: url
      }));
    }

    // Update extraction job
    await base44.entities.GNPDImageExtraction.update(job.id, {
      status: 'completed',
      extracted_images: extractedImages
    });

    return Response.json({
      status: 'completed',
      extracted_record_id: extracted.record_id,
      images_found: extracted.image_urls.length,
      images_extracted: extractedImages.length,
      excel_match_found: matched.matched,
      included_in_filter: shouldInclude
    });
  } catch (error) {
    console.error('Error extracting images:', error);
    return Response.json({ 
      status: 'failed',
      error_message: error.message 
    }, { status: 500 });
  }
});