// Shared Anthropic plumbing for the Palsgaard PowerPoint skill export.
// Used by startClaudePptxExport (submits a Message Batch) and
// checkClaudePptxExport (polls the batch and stores the .pptx).
import { secrets } from 'base44:runtime';
import { buildDeckMarkdown } from './buildDeckMarkdown.ts';
import { resolveDeckProducts } from './deckImages.ts';

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
export async function uploadPackshotImages(base44, report, limit = 15) {
  const resolved = (await resolveDeckProducts(base44, report, limit)).filter(r => r.image_url);

  const uploads = [];
  for (const r of resolved) {
    const name = r.label || r.name;
    try {
      const imgRes = await fetch(r.image_url);
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
      uploads.push({ file_id: meta.id, filename: fname, product: name, record_id: r.record_id || null });
    } catch { /* skip unresolvable images */ }
  }
  return uploads;
}

// Phase 5 — the slot contract: each uploaded pack shot is addressed by filename
// under the exact evidence bullet it belongs to, keyed on record id and name.
function slotMapFrom(uploads) {
  const map = {};
  for (const u of uploads) {
    if (u.record_id) map[u.record_id] = u.filename;
    if (u.product) map[String(u.product).toLowerCase()] = u.filename;
  }
  return map;
}

export function buildSkillPrompt(report, uploads) {
  const deckMarkdown = buildDeckMarkdown(report, slotMapFrom(uploads));
  const imageNote = uploads.length
    ? `\n\nPRODUCT PACK-SHOT IMAGES are available as uploaded files in your working directory:\n${uploads.map(u => `- ${u.filename} = "${u.product}"`).join('\n')}\nIMAGE SLOT CONTRACT: the deck content marks each pack shot's position as "[IMAGE SLOT: <filename>]" directly under the evidence bullet it belongs to. Place that file as a SMALL thumbnail in that slot only — never on another bullet, another slide, or as a background. Remove the marker text itself from the slide. Never enlarge or distort a pack shot. If a file fails to open, drop it silently and leave the bullet without an image. Never place an image that has no slot marker.`
    : '';

  return `Use the Palsgaard PowerPoint skill to build a complete .pptx presentation from the deck content below.

RULES:
- Follow the skill's Palsgaard CVI template exactly (colors, fonts, layouts).
- Keep every fact, number and product name EXACTLY as written — never invent or embellish data.
- One slide per "---" separated block. Blocks containing only headings are full-bleed section divider slides.
- COMPLETENESS IS MANDATORY: every bold section present in a block ("Why it may matter", "Formulation and application questions it raises", "Supporting data", "Market evidence (Mintel GNPD)", "Conversation openers") must appear on that slide. Omitting a section that exists in the deck content is a build failure, not an editorial choice. These layers also fill the lower half of the slide — never leave a full-page slide with content only in the top third.
- The methodology block ("How this report was evidenced") is a real slide, not an appendix: render EVERY bullet, verbatim, on a dense full-page layout. Never summarise or drop lines from it.
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