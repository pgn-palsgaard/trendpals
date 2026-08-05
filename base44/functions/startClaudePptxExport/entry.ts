// Generates a Palsgaard-branded PPTX for a saved report by running the custom
// "Palsgaard PowerPoint" Agent Skill on the Anthropic API (code execution container).
// Responds immediately with { started: true }; the heavy work runs post-response
// via waitUntil and writes claude_export_status / claude_pptx_url on the Report.
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';
import { secrets, waitUntil } from 'base44:runtime';
import { buildDeckMarkdown, productNameFromExample } from '../../shared/buildDeckMarkdown.ts';

const SKILL_ID = 'skill_01X6Ebs4KnmYNkUivvifnrpo';
const API = 'https://api.anthropic.com';
const BETAS = 'code-execution-2025-08-25,skills-2025-10-02,files-api-2025-04-14';

function anthropicHeaders(extra = {}) {
  return {
    'x-api-key': secrets.get('ANTHROPIC_API_KEY'),
    'anthropic-version': '2023-06-01',
    'anthropic-beta': BETAS,
    ...extra,
  };
}

async function runExport(base44, report) {
  try {
    // 1. Resolve GNPD pack-shot images and upload them to Anthropic's Files API so
    // they are available inside the code-execution container (which has no internet).
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

    // 2. Build the prompt from the approved slide deck.
    const deckMarkdown = buildDeckMarkdown(report, {});
    const imageNote = uploads.length
      ? `\n\nPRODUCT PACK-SHOT IMAGES are available as uploaded files in your working directory:\n${uploads.map(u => `- ${u.filename} = "${u.product}"`).join('\n')}\nPlace each image as a SMALL thumbnail next to its product's evidence bullet. Never enlarge or distort them. Skip any image that fails to open.`
      : '';

    const prompt = `Use the Palsgaard PowerPoint skill to build a complete .pptx presentation from the deck content below.

RULES:
- Follow the skill's Palsgaard CVI template exactly (colors, fonts, layouts).
- Keep every fact, number and product name EXACTLY as written — never invent or embellish data.
- One slide per "---" separated block. Blocks containing only headings are full-bleed section divider slides.
- Produce exactly ONE .pptx file as the final output.${imageNote}

DECK CONTENT:
${deckMarkdown}`;

    const content = [
      ...uploads.map(u => ({ type: 'container_upload', file_id: u.file_id })),
      { type: 'text', text: prompt },
    ];

    // 3. Run the skill.
    const res = await fetch(`${API}/v1/messages`, {
      method: 'POST',
      headers: anthropicHeaders({ 'content-type': 'application/json' }),
      body: JSON.stringify({
        model: 'claude-sonnet-4-5-20250929',
        max_tokens: 16000,
        container: { skills: [{ type: 'custom', skill_id: SKILL_ID, version: 'latest' }] },
        tools: [{ type: 'code_execution_20250825', name: 'code_execution' }],
        messages: [{ role: 'user', content }],
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data?.error?.message || `Anthropic returned ${res.status}`);

    // 4. Find the generated .pptx among the container output files.
    const uploadedIds = new Set(uploads.map(u => u.file_id));
    const ids = [...new Set(
      [...JSON.stringify(data.content || []).matchAll(/"file_id"\s*:\s*"(file_[A-Za-z0-9]+)"/g)].map(m => m[1])
    )].filter(id => !uploadedIds.has(id));

    let pptx = null;
    for (const id of ids) {
      const mRes = await fetch(`${API}/v1/files/${id}`, { headers: anthropicHeaders() });
      if (!mRes.ok) continue;
      const m = await mRes.json();
      if ((m.filename || '').toLowerCase().endsWith('.pptx')) { pptx = { id, filename: m.filename }; break; }
    }
    if (!pptx) throw new Error('Claude finished but did not produce a .pptx file');

    // 5. Download it and store it on Base44 storage.
    const dl = await fetch(`${API}/v1/files/${pptx.id}/content`, { headers: anthropicHeaders() });
    if (!dl.ok) throw new Error(`Could not download the generated file (${dl.status})`);
    const bytes = await dl.arrayBuffer();
    const file = new File([bytes], pptx.filename, {
      type: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    });
    const { file_url } = await base44.asServiceRole.integrations.Core.UploadFile({ file });

    await base44.asServiceRole.entities.Report.update(report.id, {
      claude_pptx_url: file_url,
      claude_export_status: 'ready',
      claude_export_error: null,
    });
  } catch (error) {
    await base44.asServiceRole.entities.Report.update(report.id, {
      claude_export_status: 'failed',
      claude_export_error: String(error?.message || error).slice(0, 500),
    }).catch(() => {});
  }
}

export default async function (req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { report_id } = await req.json();
    if (!report_id) return Response.json({ error: 'report_id is required' }, { status: 400 });

    const report = await base44.asServiceRole.entities.Report.get(report_id);
    if (!report) return Response.json({ error: 'Report not found' }, { status: 404 });
    if (!report.slides || report.slides.length === 0) {
      return Response.json({ error: 'This report has no slides to export' }, { status: 400 });
    }

    await base44.asServiceRole.entities.Report.update(report_id, {
      claude_export_status: 'generating',
      claude_export_error: null,
      claude_pptx_url: null,
      claude_export_started_at: new Date().toISOString(),
    });

    waitUntil(runExport(base44, report));

    return Response.json({ started: true, slide_count: report.slides.length });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}