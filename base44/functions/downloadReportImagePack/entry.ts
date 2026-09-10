import { createClientFromRequest } from 'npm:@base44/sdk@0.8.44';
import JSZip from 'npm:jszip@3.10.1';

function safeName(value) {
  return String(value || 'report-images')
    .normalize('NFKD')
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 100) || 'report-images';
}

function extensionFor(contentType, url) {
  const types = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif' };
  if (types[contentType]) return types[contentType];
  const match = String(url).match(/\.([a-zA-Z0-9]{2,5})(?:[?#]|$)/);
  return match ? match[1].toLowerCase() : 'jpg';
}

export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { report_id: reportId } = await req.json();
    if (!reportId) return Response.json({ error: 'report_id is required' }, { status: 400 });

    const report = await base44.entities.Report.get(reportId);
    if (!report) return Response.json({ error: 'Report not found' }, { status: 404 });

    const shortlist = Array.isArray(report.product_shortlist) ? report.product_shortlist : [];
    const slideIds = (report.slides || []).flatMap(slide => (slide.gnpd_examples || []).map(example => String(example).match(/^\s*(?:\[[^\]]*\]\s*)?(\d{6,})\s*\|/)?.[1]).filter(Boolean));
    const ids = [...new Set([...shortlist.map(item => String(item.gnpd_record_id || '')).filter(Boolean), ...slideIds])].slice(0, 100);
    if (!ids.length) return Response.json({ error: 'This report has no product images to download' }, { status: 400 });

    const currentProducts = await base44.entities.GNPDProduct.filter({ gnpd_record_id: { $in: ids } }, '-updated_date', 500);
    const currentById = Object.fromEntries((currentProducts || []).map(item => [String(item.gnpd_record_id), item]));
    const savedById = Object.fromEntries(shortlist.map(item => [String(item.gnpd_record_id || ''), item]));
    const zip = new JSZip();
    let imageCount = 0;

    for (const id of ids) {
      const product = currentById[id] || savedById[id] || {};
      const imageUrl = currentById[id]?.image_url || savedById[id]?.image_url;
      if (!imageUrl) continue;
      try {
        const response = await fetch(imageUrl);
        if (!response.ok) continue;
        const contentType = String(response.headers.get('content-type') || '').split(';')[0].toLowerCase();
        if (contentType && !contentType.startsWith('image/')) continue;
        const extension = extensionFor(contentType, imageUrl);
        const productName = safeName(product.product_name || product.name || 'product');
        zip.file(`${id}-${productName}.${extension}`, await response.arrayBuffer());
        imageCount += 1;
      } catch { /* Skip an unavailable image and continue the pack. */ }
    }

    if (!imageCount) return Response.json({ error: 'No available images were found for this report' }, { status: 404 });
    const zipBytes = await zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE', compressionOptions: { level: 6 } });
    const filename = `${safeName(report.title)}-image-pack.zip`;
    const file = new File([zipBytes], filename, { type: 'application/zip' });
    const { file_url: fileUrl } = await base44.integrations.Core.UploadFile({ file });
    return Response.json({ file_url: fileUrl, filename, image_count: imageCount });
  } catch (error) {
    return Response.json({ error: error.message || 'Could not create image pack' }, { status: 500 });
  }
}