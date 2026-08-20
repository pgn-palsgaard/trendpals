// TEMPORARY measurement rig. Not part of the product. Delete after Phase 2.
// Four modes, one per open question:
//   ceiling  — how long may a function run BEFORE it responds? Loops to 900s,
//              writing elapsed to a ProcessingJob every 10s. The last recorded
//              elapsed value IS the kill point.
//   sleep    — sleeps N seconds then responds. Used to find the gateway/proxy
//              response timeout by calling it with rising N.
//   fullload — the real job: resolve + upload pack shots, then run the skill
//              synchronously on a real 12-slide report. Reports upload time and
//              skill time separately.
//   cache    — same as fullload but prompt-only (no skill run) to compare input
//              token accounting with and without cache_control on the static rules.
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';
import { API, SKILL_ID, anthropicHeaders, uploadPackshotImages, buildSkillPrompt } from '../../shared/claudePptx.ts';
import { resolveDeckProducts } from '../../shared/deckImages.ts';
import { buildDeckMarkdown } from '../../shared/buildDeckMarkdown.ts';

const MAX_PROBE_SECONDS = 900;

async function newJob(base44, mode, extra = {}) {
  return base44.asServiceRole.entities.ProcessingJob.create({
    job_type: 'revalidate_trend_links', // enum placeholder — probe rows are identified by triggered_by
    status: 'running',
    started_at: new Date().toISOString(),
    last_progress_at: new Date().toISOString(),
    triggered_by: `__probeRuntimeBudget:${mode}`,
    summary: { probe: mode, ...extra },
  });
}

async function mark(base44, jobId, status, summary) {
  await base44.asServiceRole.entities.ProcessingJob.update(jobId, {
    status,
    last_progress_at: new Date().toISOString(),
    summary,
  });
}

// ---- mode: ceiling -----------------------------------------------------------
// Runs PRE-response, so it measures the function's own execution ceiling.
async function measureCeiling(base44, jobId) {
  const t0 = Date.now();
  let elapsed = 0;
  while (elapsed < MAX_PROBE_SECONDS) {
    await new Promise(r => setTimeout(r, 10_000));
    elapsed = Math.round((Date.now() - t0) / 1000);
    console.log(`[probe:ceiling] elapsed=${elapsed}s`);
    await mark(base44, jobId, 'running', { probe: 'ceiling', elapsed, reached_max: false });
  }
  await mark(base44, jobId, 'completed', { probe: 'ceiling', elapsed, reached_max: true });
  return elapsed;
}

// ---- shared: synchronous skill run ------------------------------------------
async function runSkill(prompt, uploads, model, useCache) {
  const rulesEnd = prompt.indexOf('DECK CONTENT:');
  const staticPart = useCache && rulesEnd > 0 ? prompt.slice(0, rulesEnd) : null;
  const dynamicPart = staticPart ? prompt.slice(rulesEnd) : prompt;

  const textBlocks = staticPart
    ? [
        { type: 'text', text: staticPart, cache_control: { type: 'ephemeral' } },
        { type: 'text', text: dynamicPart },
      ]
    : [{ type: 'text', text: dynamicPart }];

  const body = {
    model,
    max_tokens: 16000,
    stream: true, // non-streamed calls are cut with HTTP 524 at ~2 minutes
    container: { skills: [{ type: 'custom', skill_id: SKILL_ID, version: 'latest' }] },
    tools: [{ type: 'code_execution_20250825', name: 'code_execution' }],
    messages: [{
      role: 'user',
      content: [...uploads.map(u => ({ type: 'container_upload', file_id: u.file_id })), ...textBlocks],
    }],
  };

  const res = await fetch(`${API}/v1/messages`, {
    method: 'POST',
    headers: anthropicHeaders({ 'content-type': 'application/json' }),
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text();
    return { ok: false, status: res.status, raw: text.slice(0, 500), usage: null, stopReason: null };
  }

  // Read the SSE stream to completion, keeping only what the measurement needs.
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let raw = '';
  let usage = null;
  let stopReason = null;
  let lastEventAt = Date.now();
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    lastEventAt = Date.now();
    raw += decoder.decode(value, { stream: true });
    if (raw.length > 2_000_000) raw = raw.slice(-500_000); // bound memory, keep the tail
  }
  for (const m of raw.matchAll(/"usage"\s*:\s*(\{[^}]*\})/g)) {
    try { usage = { ...(usage || {}), ...JSON.parse(m[1]) }; } catch { /* partial frame */ }
  }
  const stop = [...raw.matchAll(/"stop_reason"\s*:\s*"([a-z_]+)"/g)].pop();
  if (stop) stopReason = stop[1];
  const errMatch = raw.match(/"error"\s*:\s*\{[^}]*"message"\s*:\s*"([^"]+)"/);

  return {
    ok: true,
    status: res.status,
    raw,
    usage,
    stopReason,
    streamError: errMatch ? errMatch[1] : null,
    idleTailMs: Date.now() - lastEventAt,
  };
}

function producedPptx(raw) {
  return /\.pptx/i.test(raw || '');
}

// ---- mode: fullload ---------------------------------------------------------
async function measureFullLoad(base44, jobId, reportId, model, imageLimit, useCache) {
  const report = await base44.asServiceRole.entities.Report.get(reportId);
  const tStart = Date.now();

  const resolved = (await resolveDeckProducts(base44, report, imageLimit)).filter(r => r.image_url);
  const tResolved = Date.now();

  const uploads = await uploadPackshotImages(base44, report, imageLimit);
  const tUploaded = Date.now();

  const prompt = buildSkillPrompt(report, uploads);
  const run = await runSkill(prompt, uploads, model, useCache);
  const tDone = Date.now();

  const summary = {
    probe: 'fullload',
    report_id: reportId,
    model,
    use_cache: !!useCache,
    slides: (report.slides || []).length,
    image_limit: imageLimit,
    resolved_with_image: resolved.length,
    uploaded: uploads.length,
    prompt_chars: prompt.length,
    resolve_seconds: Math.round((tResolved - tStart) / 1000),
    upload_seconds: Math.round((tUploaded - tResolved) / 1000),
    skill_seconds: Math.round((tDone - tUploaded) / 1000),
    total_seconds: Math.round((tDone - tStart) / 1000),
    http_ok: run.ok,
    http_status: run.status,
    stop_reason: run.stopReason,
    produced_pptx: producedPptx(run.raw),
    usage: run.usage,
    error: run.streamError || (run.ok ? null : run.raw),
  };
  await mark(base44, jobId, run.ok ? 'completed' : 'failed', summary);
  return summary;
}

export default async function (req) {
  const base44 = createClientFromRequest(req);
  const { mode = 'ceiling', seconds = 30, report_id, model = 'claude-sonnet-5', image_limit = 15, use_cache = false } =
    await req.json().catch(() => ({}));

  if (mode === 'sleep') {
    const t0 = Date.now();
    await new Promise(r => setTimeout(r, Number(seconds) * 1000));
    return Response.json({ probe: 'sleep', requested: Number(seconds), actual_seconds: Math.round((Date.now() - t0) / 1000) });
  }

  if (mode === 'ceiling') {
    const job = await newJob(base44, 'ceiling', { elapsed: 0 });
    const elapsed = await measureCeiling(base44, job.id);
    return Response.json({ job_id: job.id, elapsed, reached_max: elapsed >= MAX_PROBE_SECONDS });
  }

  if (mode === 'fullload') {
    if (!report_id) return Response.json({ error: 'report_id is required' }, { status: 400 });
    const job = await newJob(base44, 'fullload', { report_id, model });
    try {
      const summary = await measureFullLoad(base44, job.id, report_id, model, Number(image_limit), !!use_cache);
      return Response.json({ job_id: job.id, result: summary });
    } catch (e) {
      await mark(base44, job.id, 'failed', { probe: 'fullload', error: String(e?.message || e) });
      return Response.json({ job_id: job.id, error: String(e?.message || e) }, { status: 200 });
    }
  }

  return Response.json({ error: `unknown mode: ${mode}` }, { status: 400 });
}