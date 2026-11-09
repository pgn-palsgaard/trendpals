import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

// applyMintelCitations (9 Nov 2026)
// Writes Mintel report citations onto GNPDProduct records, matched EXACTLY on the GNPD
// record ID taken from the product hyperlinks in the Mintel PDF.
//
// body.items: [{ gnpd_record_id, citations:[{report_title, source_id, page, section_headline,
//                analyst_text, mapped_trend_id}], lock_trend_ids:[trendId] }]
//   - citations are merged into GNPDProduct.mintel_citations (dedup on source_id+page)
//   - every lock_trend_id becomes an APPROVED trend link with reviewed_by 'mintel_citation'
//     (existing link upgraded, or a new one added; removed from rejected_link_candidates).
//     Approved links are never touched by automated triage or re-audit.
// body.expert_links: [{ id, gnpd_record_id }] -> sets ExpertExample.gnpd_record_id
// body.mode: 'audit' (default, no writes) | 'apply'
// Skipped (duplicate/quarantined) GNPDProduct rows are never touched.

const TIME_BUDGET_MS = 85 * 1000;
const MIN_UPDATE_INTERVAL_MS = 240;
let nextUpdateAt = 0;
async function throttledUpdate(entity, id, data) {
  for (let attempt = 0; attempt < 3; attempt++) {
    const slot = Math.max(Date.now(), nextUpdateAt);
    nextUpdateAt = slot + MIN_UPDATE_INTERVAL_MS;
    const wait = slot - Date.now();
    if (wait > 0) await new Promise(r => setTimeout(r, wait));
    try { return await entity.update(id, data); }
    catch (e) {
      const msg = String(e?.message || '');
      if (/rate limit/i.test(msg) && attempt < 2) {
        const ra = msg.match(/Retry after (\d+)s/i);
        const pause = ((ra ? Number(ra[1]) : 10) + 1) * 1000;
        nextUpdateAt = Date.now() + pause;
        await new Promise(r => setTimeout(r, pause));
        continue;
      }
      throw e;
    }
  }
}

Deno.serve(async (req) => {
  const base44 = createClientFromRequest(req);
  const started = Date.now();
  try {
    const body = await req.json().catch(() => ({}));
    const isPipeline = body.source === 'scheduled_resume';
    let user = null;
    try { user = await base44.auth.me(); } catch (_) { /* automation */ }
    if (!isPipeline && (!user || user.role !== 'admin')) {
      return Response.json({ error: 'Admin access required' }, { status: 403 });
    }
    const apply = body.mode === 'apply';
    const items = Array.isArray(body.items) ? body.items : [];
    const expertLinks = Array.isArray(body.expert_links) ? body.expert_links : [];
    const sr = base44.asServiceRole.entities;
    const now = new Date().toISOString();

    // trend names
    const trendIds = [...new Set(items.flatMap(i => i.lock_trend_ids || []))];
    const trendName = {};
    for (const tid of trendIds) {
      const t = (await sr.GlobalTrend.filter({ id: tid }, null, 1))[0];
      trendName[tid] = t?.trend_name || tid;
    }

    // compact payload support: citations may omit report_title -> looked up from Source
    const srcTitle = {};
    for (const sid of [...new Set(items.flatMap(i => (i.citations || []).map(c => c.source_id)).filter(Boolean))]) {
      const s = (await sr.Source.filter({ id: sid }, null, 1, ['title']))[0];
      srcTitle[sid] = s?.title || '';
    }
    for (const it of items) for (const c of it.citations || []) if (!c.report_title) c.report_title = srcTitle[c.source_id] || '';

    const stats = { items: items.length, rows_updated: 0, rows_missing: 0, links_added: 0, links_upgraded: 0, already_approved: 0, expert_updated: 0, timed_out: false };

    for (const it of items) {
      if (Date.now() - started > TIME_BUDGET_MS) { stats.timed_out = true; break; }
      const rows = (await sr.GNPDProduct.filter({ gnpd_record_id: String(it.gnpd_record_id) }, null, 10))
        .filter(r => r.processing_status !== 'skipped');
      if (!rows.length) { stats.rows_missing++; continue; }
      for (const row of rows) {
        // merge citations
        const cites = Array.isArray(row.mintel_citations) ? [...row.mintel_citations] : [];
        for (const c of it.citations || []) {
          if (!cites.some(x => x.source_id === c.source_id && Number(x.page) === Number(c.page))) {
            cites.push({ ...c, cited_at: now });
          }
        }
        // links
        const links = Array.isArray(row.trend_links) ? row.trend_links.map(l => ({ ...l })) : [];
        let rejected = Array.isArray(row.rejected_link_candidates) ? [...row.rejected_link_candidates] : [];
        for (const tid of it.lock_trend_ids || []) {
          const c = (it.citations || []).find(x => x.mapped_trend_id === tid) || (it.citations || [])[0] || {};
          const reason = `Cited by Mintel: ${c.report_title || ''}, p${c.page || '?'} — "${String(c.section_headline || '').slice(0, 120)}"`;
          const ex = links.find(l => l.trend_id === tid);
          if (ex) {
            if (ex.review_status === 'approved' && ex.reviewed_by === 'mintel_citation') { stats.already_approved++; continue; }
            ex.review_status = 'approved'; ex.reviewed_by = 'mintel_citation'; ex.reviewed_at = now;
            ex.confidence = 'high'; ex.confidence_score = Math.max(Number(ex.confidence_score) || 0, 95);
            ex.reasoning = reason;
            stats.links_upgraded++;
          } else {
            links.push({ trend_id: tid, trend_name: trendName[tid], trend_type: 'global', confidence: 'high', confidence_score: 95,
              reasoning: reason, matched_keywords: [], review_status: 'approved', linked_at: now, reviewed_at: now, reviewed_by: 'mintel_citation' });
            stats.links_added++;
          }
          rejected = rejected.filter(r => r.trend_id !== tid);
        }
        const linkedIds = [...new Set(links.filter(l => ['auto_applied', 'approved'].includes(l.review_status)).map(l => l.trend_id))];
        const data = { mintel_citations: cites, trend_links: links, rejected_link_candidates: rejected, linked_trend_ids: linkedIds };
        if (linkedIds.length) data.processing_status = 'trend_linked';
        if (apply) await throttledUpdate(sr.GNPDProduct, row.id, data);
        stats.rows_updated++;
        console.log(`[mintel] ${apply ? 'APPLY' : 'AUDIT'} ${it.gnpd_record_id} ${row.product_name} cites=${cites.length} locks=${(it.lock_trend_ids || []).length}`);
      }
    }

    for (const el of expertLinks) {
      if (Date.now() - started > TIME_BUDGET_MS) { stats.timed_out = true; break; }
      if (apply) await throttledUpdate(sr.ExpertExample, el.id, { gnpd_record_id: String(el.gnpd_record_id) });
      stats.expert_updated++;
    }

    console.log(`[mintel] SUMMARY ${JSON.stringify(stats)}`);
    return Response.json({ mode: apply ? 'apply' : 'audit', ...stats });
  } catch (e) {
    console.error('[mintel] error', e?.message);
    return Response.json({ error: e?.message }, { status: 500 });
  }
});
