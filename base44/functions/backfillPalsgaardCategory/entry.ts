import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';
// Mapping inlined from shared/palsgaardCategory.ts (the importer's rules) so this
// one-off function deploys standalone. Keep in sync if the shared table changes.

function normTop(raw: string): string {
  const s = String(raw || '').trim().toLowerCase();
  if (s === 'confectionery' || s === 'chocolate confectionery' || s === 'chocolate & confectionery') return 'chocolate_confectionery_top';
  return s;
}

const MAPPING: Record<string, Record<string, string>> = {
  'baby food': { '*': 'out_of_scope' },
  'bakery': { '*': 'bakery' },
  'breakfast cereals': { '*': 'out_of_scope' },
  'chocolate_confectionery_top': { '*': 'chocolate_confectionery' },
  'dairy': { 'margarine & other blends': 'oils_fats', 'shortening & lard': 'oils_fats', 'plant based drinks (dairy alternatives)': 'plant_based', 'plant based spoonable yogurts (dairy alternatives)': 'plant_based', 'butter': 'dairy', 'cream': 'dairy', 'creamers': 'dairy', 'fresh cheese & cream cheese': 'dairy', 'liquid dairy other': 'dairy', 'curd & quark': 'dairy', 'hard cheese & semi-hard cheese': 'dairy', 'soft cheese & semi-soft cheese': 'dairy', 'soft cheese desserts': 'dairy', 'processed cheese': 'dairy', 'evaporated milk': 'dairy', 'flavoured milk': 'dairy', 'sweetened condensed milk': 'dairy', 'white milk': 'dairy', 'drinking yogurt & liquid cultured milk': 'dairy', 'spoonable yogurt': 'dairy', '*': 'needs_human_review' },
  'desserts & ice cream': { 'dairy based ice cream & frozen yogurt': 'ice_cream', 'plant based ice cream & frozen yogurt (dairy alternatives)': 'plant_based', 'water based ice lollies, pops & sorbets': 'ice_cream', 'frozen desserts': 'ice_cream', 'dessert toppings': 'dairy', 'chilled desserts': 'dairy', 'shelf-stable desserts': 'dairy', '*': 'needs_human_review' },
  'fruit & vegetables': { '*': 'out_of_scope' },
  'meals & meal centers': { '*': 'out_of_scope' },
  'processed fish, meat & egg products': { 'processed/cured meat': 'meat', 'fresh meat': 'meat', 'canned/ambient meat': 'meat', 'chilled/smoked meat products': 'meat', 'dried/cured meat': 'meat', 'poultry': 'meat', 'processed fish': 'out_of_scope', 'canned/ambient fish': 'out_of_scope', 'chilled/fresh fish': 'out_of_scope', 'smoked fish': 'out_of_scope', 'egg products': 'out_of_scope', 'other processed fish, meat & egg products': 'needs_human_review', '*': 'needs_human_review' },
  'sauces & seasonings': { 'oils': 'oils_fats', '*': 'condiments' },
  'savoury spreads': { '*': 'out_of_scope' },
  'side dishes': { '*': 'out_of_scope' },
  'snacks': { '*': 'out_of_scope' },
  'soup': { '*': 'out_of_scope' },
  'sugar & gum confectionery': { '*': 'chocolate_confectionery' },
  'sweet spreads': { '*': 'chocolate_confectionery' },
  'sweeteners & sugar': { '*': 'out_of_scope' },
};

function resolvePalsgaardCategory(cat: string, sub: string): string {
  if (!cat) return 'needs_human_review';
  const topMap = MAPPING[normTop(cat)];
  if (!topMap) return 'needs_human_review';
  if (sub) { const sn = String(sub).trim().toLowerCase(); if (topMap[sn] !== undefined) return topMap[sn]; }
  return topMap['*'] ?? 'needs_human_review';
}

// One-off backfill (2 Nov 2026): GNPD products created before runGNPDBatchParse
// always set palsgaard_category have it null. Resolution = the importer's own rules.
// A top-level category the table does not list resolves through its sub-category when
// that sub-category appears in exactly ONE top-level map. Otherwise needs_human_review.
// mode 'audit' (default) writes nothing; 'apply' writes, throttled, time-boxed, idempotent.

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
