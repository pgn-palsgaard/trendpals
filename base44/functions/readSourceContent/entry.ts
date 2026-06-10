import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

// Extract text from a URL using fetch + basic mime detection
async function fetchAndExtract(url) {
  const res = await fetch(url, { signal: AbortSignal.timeout(60_000) });
  if (!res.ok) throw new Error(`Fetch failed: ${res.status} ${res.statusText}`);

  const contentType = res.headers.get('content-type') || '';
  const mime = contentType.split(';')[0].trim().toLowerCase();

  // Image — skip
  if (mime.startsWith('image/')) {
    return { skip: true, reason: 'Image source — skip' };
  }

  // PDF
  if (mime === 'application/pdf' || url.toLowerCase().endsWith('.pdf')) {
    const arrayBuffer = await res.arrayBuffer();
    const { getDocument } = await import('npm:pdfjs-dist@4.4.168/legacy/build/pdf.mjs');
    const pdf = await getDocument({ data: new Uint8Array(arrayBuffer) }).promise;
    const parts = [];
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const content = await page.getTextContent();
      parts.push(content.items.map(item => item.str).join(' '));
    }
    return { text: parts.join('\n'), mime_type: 'application/pdf' };
  }

  // DOCX
  if (
    mime === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
    url.toLowerCase().endsWith('.docx')
  ) {
    const arrayBuffer = await res.arrayBuffer();
    const mammoth = await import('npm:mammoth@1.8.0');
    const result = await mammoth.extractRawText({ arrayBuffer });
    return { text: result.value, mime_type: mime };
  }

  // PPTX
  if (
    mime === 'application/vnd.openxmlformats-officedocument.presentationml.presentation' ||
    url.toLowerCase().endsWith('.pptx')
  ) {
    const arrayBuffer = await res.arrayBuffer();
    // Extract text from pptx xml manually
    const JSZip = (await import('npm:jszip@3.10.1')).default;
    const zip = await JSZip.loadAsync(arrayBuffer);
    const slideFiles = Object.keys(zip.files).filter(f => /ppt\/slides\/slide[0-9]+\.xml/.test(f));
    slideFiles.sort();
    const parts = [];
    for (const slideFile of slideFiles) {
      const xml = await zip.files[slideFile].async('string');
      const text = xml.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
      if (text) parts.push(text);
    }
    return { text: parts.join('\n'), mime_type: mime };
  }

  // HTML — strip tags
  if (mime === 'text/html' || url.toLowerCase().endsWith('.html') || url.toLowerCase().endsWith('.htm')) {
    const html = await res.text();
    const text = html.replace(/<script[\s\S]*?<\/script>/gi, '')
                     .replace(/<style[\s\S]*?<\/style>/gi, '')
                     .replace(/<[^>]+>/g, ' ')
                     .replace(/\s+/g, ' ')
                     .trim();
    return { text, mime_type: 'text/html' };
  }

  // Plain text / markdown
  if (mime.startsWith('text/') || url.toLowerCase().endsWith('.md') || url.toLowerCase().endsWith('.txt')) {
    const text = await res.text();
    return { text, mime_type: mime || 'text/plain' };
  }

  // Unsupported
  return { skip: true, reason: `Unsupported mime type: ${mime || 'unknown'}` };
}

Deno.serve(async (req) => {
  let base44 = null;
  let sourceId = null;
  try {
    base44 = createClientFromRequest(req);

    const isAuthenticated = await base44.auth.isAuthenticated();
    if (!isAuthenticated) {
      return Response.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
    }

    const { source_id } = await req.json();
    if (!source_id) {
      return Response.json({ ok: false, error: 'source_id is required' }, { status: 400 });
    }
    sourceId = source_id;

    // Look up source record (use service role so agent can call without user session)
    const sources = await base44.asServiceRole.entities.Source.filter({ id: source_id });
    const source = sources?.[0];
    if (!source) {
      return Response.json({ ok: false, error: 'Source not found' });
    }

    const targetUrl = source.file_url || source.url;
    if (!targetUrl) {
      return Response.json({ ok: false, error: 'No file_url or url on source' });
    }

    // Resolve fetch URL — private files need a signed URL
    let fetchUrl = targetUrl;
    if (!targetUrl.startsWith('http')) {
      // Explicit private URI — get signed URL directly
      const signed = await base44.asServiceRole.integrations.Core.CreateFileSignedUrl({
        file_uri: targetUrl,
        expires_in: 300,
      });
      fetchUrl = signed.signed_url;
    }

    // Try fetching; if 403, the file is private — attempt signed URL via file_uri field
    let result;
    try {
      result = await fetchAndExtract(fetchUrl);
    } catch (fetchErr) {
      if (fetchErr.message?.includes('403') && source.file_url && source.file_url.startsWith('http')) {
        // Try to get a signed URL using the file_url as a URI reference
        const signed = await base44.asServiceRole.integrations.Core.CreateFileSignedUrl({
          file_uri: source.file_url,
          expires_in: 300,
        });
        result = await fetchAndExtract(signed.signed_url);
      } else {
        throw fetchErr;
      }
    }

    if (result.skip) {
      return Response.json({ ok: false, error: result.reason });
    }

    const fullText = result.text || '';
    const truncated = fullText.slice(0, 200_000);

    return Response.json({
      ok: true,
      content: truncated,
      mime_type: result.mime_type,
      char_count: fullText.length,
    });

  } catch (error) {
    // Write failure_reason to the Source record (best effort)
    if (base44 && sourceId) {
      try {
        await base44.asServiceRole.entities.Source.update(sourceId, { failure_reason: error.message });
      } catch (_) { /* best effort */ }
    }
    return Response.json({ ok: false, error: error.message });
  }
});