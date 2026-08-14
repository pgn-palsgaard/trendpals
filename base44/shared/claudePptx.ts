// Shared Anthropic plumbing for the Palsgaard PowerPoint skill export.
// Used by startClaudePptxExport (submits a Message Batch) and
// checkClaudePptxExport (polls the batch and stores the .pptx).
import { secrets } from 'base44:runtime';
import { buildDeckMarkdown, productNameFromExample } from './buildDeckMarkdown.ts';

export const SKILL_ID = 'skill_01X6Ebs4KnmYNkUivvifnrpo';
export const API = 'https://api.anthropic.com';
const BETAS = 'code-execution-2025-08-25,skills-2025-10-02,files-api-2025-04-14';

export function anthropicHeaders(extra = {}) {
  return {
    'x-api-key': secrets.get('ANTHROPIC_API_KEY'),
    'anthropic-version': '2023-06-01',
    'anthropic-beta': BETAS,
    ...extra,
  };
}

// Resolves GNPD pack shots for the deck and uploads them to Anthropic's Files
// API so they are reachable inside the (internet-less) code-execution container.
export async function uploadPackshotImages(base44, report) {
  const productNames = [...new Set(
    (report.slides || [])
      .flatMap(s => s.gnpd_examples || [])
      .map(productNameFromExample)
      .filter(n => n.length >= 4)
  )].slice(0, 15);

  const uploads = [];
  for (const name of productNames) {
    try {
      const esc = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const hits = await base44.asServiceRole.entities.GNPDProduct.filter(
        { product_name: { $regex: esc, $options: 'i' } }, null, 3
      );
      const withImage = hits.find(h => h.image_url && String(h.image_url).startsWith('http'));
      if (!withImage) continue;
      const imgRes = await fetch(withImage.image_url);
      if (!imgRes.ok) continue;
      const bytes = await imgRes.arrayBuffer();
      if (bytes.byteLength > 4_000_000) continue;
      const ctype = imgRes.headers.get('content-type') || 'image/jpeg';
      const ext = ctype.includes('png') ? 'png' : 'jpg';
      const fname = `product_${uploads.length + 1}.${ext}`;
      const form = new FormData();
      form.append('file', new Blob([bytes], { type: ctype }), fname);
      const up = await fetch(`${API}/v1/files`, { method: 'POST', headers: anthropicHeaders(), body: form });
      if (!up.ok) continue;
      const meta = await up.json();
      uploads.push({ file_id: meta.id, filename: fname, product: name });
    } catch { /* skip unresolvable images */ }
  }
  return uploads;
}

export function buildSkillPrompt(report, uploads) {
  const deckMarkdown = buildDeckMarkdown(report, {});
  const imageNote = uploads.length
    ? `\n\nPRODUCT PACK-SHOT IMAGES are available as uploaded files in your working directory:\n${uploads.map(u => `- ${u.filename} = "${u.product}"`).join('\n')}\nPlace each image as a SMALL thumbnail next to its product's evidence bullet. Never enlarge or distort them. Skip any image that fails to open.`
    : '';

  return `Use the Palsgaard PowerPoint skill to build a complete .pptx presentation from the deck content below.

RULES:
- Follow the skill's Palsgaard CVI template exactly (colors, fonts, layouts).
- Keep every fact, number and product name EXACTLY as written — never invent or embellish data.
- One slide per "---" separated block. Blocks containing only headings are full-bleed section divider slides.
- Produce exactly ONE .pptx file as the final output.${imageNote}

DECK CONTENT:
${deckMarkdown}`;
}

export function buildBatchRequest(report, uploads) {
  return {
    custom_id: 'deck',
    params: {
      model: 'claude-sonnet-4-5-20250929',
      max_tokens: 16000,
      container: { skills: [{ type: 'custom', skill_id: SKILL_ID, version: 'latest' }] },
      tools: [{ type: 'code_execution_20250825', name: 'code_execution' }],
      messages: [{
        role: 'user',
        content: [
          ...uploads.map(u => ({ type: 'container_upload', file_id: u.file_id })),
          { type: 'text', text: buildSkillPrompt(report, uploads) },
        ],
      }],
    },
  };
}

// Pulls the generated .pptx out of a finished message and stores it on Base44.
export async function storeGeneratedPptx(base44, message, uploadedFileIds) {
  const excluded = new Set(uploadedFileIds || []);
  const ids = [...new Set(
    [...JSON.stringify(message?.content || []).matchAll(/"file_id"\s*:\s*"(file_[A-Za-z0-9]+)"/g)].map(m => m[1])
  )].filter(id => !excluded.has(id));

  let pptx = null;
  for (const id of ids) {
    const mRes = await fetch(`${API}/v1/files/${id}`, { headers: anthropicHeaders() });
    if (!mRes.ok) continue;
    const m = await mRes.json();
    if ((m.filename || '').toLowerCase().endsWith('.pptx')) { pptx = { id, filename: m.filename }; break; }
  }
  if (!pptx) throw new Error('Claude finished but did not produce a .pptx file');

  const dl = await fetch(`${API}/v1/files/${pptx.id}/content`, { headers: anthropicHeaders() });
  if (!dl.ok) throw new Error(`Could not download the generated file (${dl.status})`);
  const bytes = await dl.arrayBuffer();
  const file = new File([bytes], pptx.filename, {
    type: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  });
  const { file_url } = await base44.asServiceRole.integrations.Core.UploadFile({ file });
  return file_url;
}