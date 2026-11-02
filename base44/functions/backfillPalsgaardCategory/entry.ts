import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';
import { MAPPING, normTop, resolvePalsgaardCategory } from '../../shared/palsgaardCategory.ts';

// One-off backfill (2 Nov 2026): GNPD products created before runGNPDBatchParse
// always set palsgaard_category have it null, which hides them from every
// category-scoped filter, dashboard and trend-linking drain.
//
// Resolution = the importer's own rules (shared/palsgaardCategory.ts). Two lookups
// the importer does not need but historical rows do:
//   - BSA main group -> 'personal_care' (as the importer does).
//   - A top-level category the table does not list (e.g. 'Ice Cream', 'Chocolate'
//     from older exports) resolves through its sub-category when that sub-category
//     appears in exactly ONE top-level map. Otherwise -> 'needs_human_review'.
// Never guesses: anything unresolved becomes 'needs_human_review', exactly like import.
// mode 'audit' (default) writes nothing; mode 'apply' writes, throttled, time-boxed,
// idempotent (each run re-queries rows that are still null).
// Products finalised with zero links because their category was unresolved are sent
// back to trend_linking_pending when they now resolve to a canonical category.

const TIME_BUDGET_MS = 80 * 1000;
const UNRESOLVED = new Set(['out_of_scope', 'needs_human_review']);
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

// sub-category -> canonical key, only where the sub-category is unique across maps
const SUB_INDEX: Record<string, string | null> = {};
for (const top of Object.keys(MAPPING)) {
  for (const [sub, key] of Object.entries(MAPPING[top])) {
    if (sub === '*') continue;
    SUB_INDEX[sub] = sub in SUB_INDEX && SUB_INDEX[sub] !== key ? null : key;
  }
}

function resolve(p): { key: string; via: string } {
  if (p.main_group === 'BSA') return { key: 'personal_care', via: 'bsa' };
  const cat = String(p.category || '').trim();
  const sub = String(p.sub_category || '').trim();
  if (cat && MAPPING[normTop(cat)]) return { key: resolvePalsgaardCategory(cat, sub), via: 'top_level' };
  const viaSub = SUB_INDEX[sub.toLowerCase()];
  if (viaSub) return { key: viaSub, via: 'sub_category' };
  return { key: 'needs_human_review', via: 'unresolved' };
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
    const mode = body.mode === 'apply' ? 'apply' : 'audit';
    const E = base44.asServiceRole.entities.GNPDProduct;
    const q = { palsgaard_category: null, processing_status: { $ne: 'skipped' } };

    const byKey = {}, byVia = {}, unresolvedTops = {};
    let scanned = 0, applied = 0, requeued = 0, timedOut = false, skip = 0;
    while (true) {
      if (Date.now() - started > TIME_BUDGET_MS) { timedOut = true; break; }
      // apply: always read the first page of what is still null (rows leave the query as they are fixed)
      const page = await E.filter(q, 'created_date', 100, mode === 'apply' ? 0 : skip);
      if (page.length === 0) break;
      for (const p of page) {
        if (Date.now() - started > TIME_BUDGET_MS) { timedOut = true; break; }
        scanned++;
        const r = resolve(p);
        byKey[r.key] = (byKey[r.key] || 0) + 1;
        byVia[r.via] = (byVia[r.via] || 0) + 1;
        if (r.via === 'unresolved') {
          const k = `${p.category || 'none'} / ${p.sub_category || 'none'}`;
          unresolvedTops[k] = (unresolvedTops[k] || 0) + 1;
        }
        if (mode === 'apply') {
          const data: Record<string, unknown> = { palsgaard_category: r.key };
          if (!UNRESOLVED.has(r.key) && p.processing_status === 'trend_linked' && (p.trend_links || []).length === 0) {
            data.processing_status = 'trend_linking_pending';
            requeued++;
          }
          await throttledUpdate(E, p.id, data);
          applied++;
        }
      }
      if (timedOut) break;
      if (mode === 'audit') { skip += page.length; if (page.length < 100) break; }
    }
    const topUnresolved = Object.entries(unresolvedTops).sort((a, b) => b[1] - a[1]).slice(0, 15);
    const report = { mode, scanned, applied, requeued, timed_out: timedOut, by_category: byKey, by_route: byVia, top_unresolved: topUnresolved };
    console.log('[backfill] ' + JSON.stringify(report));
    return Response.json(report);
  } catch (error) {
    console.error('[backfill] Fatal:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});
