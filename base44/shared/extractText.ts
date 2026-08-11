// Shared document text extraction. Used by readSourceContent and classifySource so
// classification never depends on a cross-function HTTP call (which was silently
// resolving to a stale deployment and failing every PDF upload).

export async function fetchAndExtract(url: string) {
  const res = await fetch(url, { signal: AbortSignal.timeout(60_000) });
  if (!res.ok) throw new Error(`Fetch failed: ${res.status} ${res.statusText}`);

  const contentType = res.headers.get('content-type') || '';
  const mime = contentType.split(';')[0].trim().toLowerCase();
  const lower = url.toLowerCase();

  if (mime.startsWith('image/')) {
    return { skip: true, reason: 'Image source — skip' };
  }

  // PDF — unpdf ships a serverless pdfjs build with no worker file to resolve.
  // The plain pdfjs-dist build fails here with: No such module "pdf.worker.mjs".
  if (mime === 'application/pdf' || lower.endsWith('.pdf')) {
    const arrayBuffer = await res.arrayBuffer();
    const { extractText, getDocumentProxy } = await import('npm:unpdf@0.12.1');
    const pdf = await getDocumentProxy(new Uint8Array(arrayBuffer));
    const { text } = await extractText(pdf, { mergePages: true });
    return { text: Array.isArray(text) ? text.join('\n') : text, mime_type: 'application/pdf' };
  }

  if (mime === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' || lower.endsWith('.docx')) {
    const arrayBuffer = await res.arrayBuffer();
    const mammoth = await import('npm:mammoth@1.8.0');
    const result = await mammoth.extractRawText({ arrayBuffer });
    return { text: result.value, mime_type: mime };
  }

  if (mime === 'application/vnd.openxmlformats-officedocument.presentationml.presentation' || lower.endsWith('.pptx')) {
    const arrayBuffer = await res.arrayBuffer();
    const JSZip = (await import('npm:jszip@3.10.1')).default;
    const zip = await JSZip.loadAsync(arrayBuffer);
    const slideFiles = Object.keys(zip.files).filter(f => /ppt\/slides\/slide[0-9]+\.xml/.test(f)).sort();
    const parts = [];
    for (const slideFile of slideFiles) {
      const xml = await zip.files[slideFile].async('string');
      const text = xml.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
      if (text) parts.push(text);
    }
    return { text: parts.join('\n'), mime_type: mime };
  }

  if (mime === 'text/html' || lower.endsWith('.html') || lower.endsWith('.htm')) {
    const html = await res.text();
    const text = html.replace(/<script[\s\S]*?<\/script>/gi, '')
                     .replace(/<style[\s\S]*?<\/style>/gi, '')
                     .replace(/<[^>]+>/g, ' ')
                     .replace(/\s+/g, ' ')
                     .trim();
    return { text, mime_type: 'text/html' };
  }

  if (mime.startsWith('text/') || lower.endsWith('.md') || lower.endsWith('.txt')) {
    const text = await res.text();
    return { text, mime_type: mime || 'text/plain' };
  }

  return { skip: true, reason: `Unsupported mime type: ${mime || 'unknown'}` };
}

// Resolve the fetchable URL for a Source (private files need a signed URL) and
// extract its text. Returns { ok, content, mime_type, char_count } or { ok:false, error }.
export async function readSourceText(svc, source) {
  const targetUrl = source.file_url || source.url;
  if (!targetUrl) return { ok: false, error: 'No file_url or url on source' };

  let fetchUrl = targetUrl;
  if (!targetUrl.startsWith('http')) {
    const signed = await svc.integrations.Core.CreateFileSignedUrl({ file_uri: targetUrl, expires_in: 300 });
    fetchUrl = signed.signed_url;
  }

  let result;
  try {
    result = await fetchAndExtract(fetchUrl);
  } catch (fetchErr) {
    if (fetchErr.message?.includes('403') && source.file_url?.startsWith('http')) {
      const signed = await svc.integrations.Core.CreateFileSignedUrl({ file_uri: source.file_url, expires_in: 300 });
      result = await fetchAndExtract(signed.signed_url);
    } else {
      throw fetchErr;
    }
  }

  if (result.skip) return { ok: false, error: result.reason };
  const fullText = result.text || '';
  return { ok: true, content: fullText.slice(0, 200_000), mime_type: result.mime_type, char_count: fullText.length };
}