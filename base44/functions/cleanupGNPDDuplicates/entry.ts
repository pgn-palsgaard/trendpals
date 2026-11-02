import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

// Cleanup of duplicate / misparsed GNPDProduct records (created 2 Nov 2026).
//
// Two populations are checked:
//   A) every record from a misparsed upload (body.broken_source_id) — columns were
//      shifted on ingest (brand = market, country = description, sub_category = date).
//   B) every record with palsgaard_category = body.duplicate_category (e.g. 'plant_based')
//      that also exists under another category from another upload.
// A record is a SAFE duplicate when the same gnpd_record_id exists in another,
// correctly parsed record. Safe duplicates are never deleted: in mode 'apply' they are
// marked processing_status 'skipped', their trend links are cleared (so they stop
// counting as evidence) and processing_error records which record they duplicate.
// Records WITHOUT a correct counterpart are only reported — never changed.
//
// mode 'audit' (default) writes nothing. Results go to the function log ([cleanup] lines).

const MONTH_YEAR = /^[A-Z][a-z]{2} [0-9]{4}$/;
const TIME_BUDGET_MS = 80 * 1000;

Deno.serve(async (req) => {
  const base44 = createClientFromRequest(req);
  const started = Date.now();
  try {
    const body = await req.json().catch(() => ({}));
    const isPipeline = body.source === 'scheduled_resume';
    let user = null;
    try { user = await base44.auth.me(); } catch (_) { /* automation context */ }
    if (!isPipeline && (!user || user.role !== 'admin')) {
      return Response.json({ error: 'Admin access required' }, { status: 403 });
    }

    const mode = body.mode === 'apply' ? 'apply' : 'audit';
    const brokenSourceId = body.broken_source_id ? String(body.broken_source_id) : null;
    const dupCategory = body.duplicate_category ? String(body.duplicate_category) : null;
    const E = base44.asServiceRole.entities.GNPDProduct;

    async function pageAll(query) {
      const out = [];
      let skip = 0;
      while (true) {
        const batch = await E.filter(query, 'created_date', 500, skip);
        out.push(...batch);
        if (batch.length < 500) break;
        skip += 500;
      }
      return out;
    }

    // ── Population A: misparsed upload ──
    const popA = brokenSourceId ? await pageAll({ source_id: brokenSourceId }) : [];
    const popAMisparsed = popA.filter(p => MONTH_YEAR.test(String(p.sub_category || '')));

    // ── Population B: records in a category that should not hold them ──
    const popB = dupCategory ? await pageAll({ palsgaard_category: dupCategory }) : [];

    // ── Population C (2 Nov 2026): every non-skipped record from one upload
    // (body.suspect_source_id), checked for copies of the same gnpd_record_id in
    // other uploads. Audit only unless mode 'apply'; in apply the copy with FEWER
    // validated trend links is marked skipped (ties: the newer record goes).
    const suspectSourceId = body.suspect_source_id ? String(body.suspect_source_id) : null;
    const popC = suspectSourceId
      ? (await pageAll({ source_id: suspectSourceId })).filter(p => p.processing_status !== 'skipped')
      : [];

    // ── Find correct counterparts by gnpd_record_id ──
    const suspects = [
      ...popAMisparsed.map(p => ({ p, population: 'A_misparsed_upload' })),
      ...popB.filter(p => !brokenSourceId || p.source_id !== brokenSourceId)
             .map(p => ({ p, population: 'B_category_' + dupCategory })),
      ...popC.map(p => ({ p, population: 'C_source_' + suspectSourceId })),
    ];
    const suspectIds = new Set(suspects.map(s => s.p.id));
    const rids = [...new Set(suspects.map(s => String(s.p.gnpd_record_id || '')).filter(Boolean))];

    const counterpart = new Map();
    for (let i = 0; i < rids.length; i += 100) {
      const chunk = rids.slice(i, i + 100);
      const hits = await E.filter({ gnpd_record_id: { $in: chunk } }, 'created_date', 500);
      for (const h of hits) {
        if (suspectIds.has(h.id)) continue;
        if (MONTH_YEAR.test(String(h.sub_category || ''))) continue;
        if (h.processing_status === 'skipped') continue;
        const rid = String(h.gnpd_record_id);
        const prev = counterpart.get(rid);
        if (!prev || (prev.palsgaard_category === dupCategory && h.palsgaard_category !== dupCategory)) {
          counterpart.set(rid, h);
        }
      }
    }

    const safe = [];
    const orphans = [];
    for (const s of suspects) {
      const c = counterpart.get(String(s.p.gnpd_record_id || ''));
      if (c) safe.push({ ...s, c });
      else orphans.push(s);
    }

    const countBy = (arr, fn) => arr.reduce((m, x) => { const k = fn(x); m[k] = (m[k] || 0) + 1; return m; }, {});
    const linksOnSafe = safe.reduce((n, s) => n + ((s.p.trend_links || []).length), 0);
    const approvedOnSafe = safe.reduce((n, s) => n + ((s.p.linked_trend_ids || []).length), 0);

    const report = {
      mode,
      broken_source_id: brokenSourceId,
      population_a_total: popA.length,
      population_a_misparsed: popAMisparsed.length,
      duplicate_category: dupCategory,
      population_b_total: popB.length,
      suspect_source_id: suspectSourceId,
      population_c_total: popC.length,
      safe_duplicates: safe.length,
      safe_by_population: countBy(safe, s => s.population),
      counterpart_categories: countBy(safe, s => String(s.c.palsgaard_category || 'none')),
      orphans_no_counterpart: orphans.length,
      orphans_by_population: countBy(orphans, s => s.population),
      orphans_by_category: countBy(orphans, s => String(s.p.palsgaard_category || 'none')),
      trend_links_on_safe_duplicates: linksOnSafe,
      approved_trend_links_on_safe_duplicates: approvedOnSafe,
      applied: 0,
      timed_out: false,
    };

    // Optional: quarantine population-A records that have NO correct counterpart.
    // They are corrupt (shifted columns, no claims/launch date) and must not count as
    // evidence. processing_error starts with 'misparsed_' so runGNPDBatchParse ignores
    // them in its dedup check, which lets a correct re-upload create clean records.
    // Population B orphans are never touched.
    const quarantineA = mode === 'apply' && body.quarantine_misparsed_orphans === true;
    report.quarantined_orphans = 0;

    if (mode === 'apply') {
      const now = new Date().toISOString();
      const validatedLinks = (r) => (r.trend_links || []).filter(l => l.llm_validated_at || l.review_status === 'auto_applied').length;
      for (const s of safe) {
        if (s.population.startsWith('C_')) {
          // Keep the better-linked copy; when the suspect copy is better, retire the other one.
          const a = validatedLinks(s.p), b = validatedLinks(s.c);
          if (a > b || (a === b && String(s.p.created_date) < String(s.c.created_date))) {
            const tmp = s.p; s.p = s.c; s.c = tmp;
          }
        }
        if (Date.now() - started > TIME_BUDGET_MS) { report.timed_out = true; break; }
        if (s.p.processing_status === 'skipped') continue;
        await E.update(s.p.id, {
          processing_status: 'skipped',
          processing_error: `duplicate_of:${s.c.id} (gnpd_record_id ${s.p.gnpd_record_id}; ${s.population}; cleanup ${now})`,
          trend_links: [],
          linked_trend_ids: [],
          linked_mega_trend_ids: [],
          rejected_link_candidates: [],
          support_label: 'NOT_SUPPORT',
        });
        report.applied++;
      }
      if (quarantineA) {
        for (const o of orphans) {
          if (o.population !== 'A_misparsed_upload') continue;
          if (Date.now() - started > TIME_BUDGET_MS) { report.timed_out = true; break; }
          if (o.p.processing_status === 'skipped') continue;
          await E.update(o.p.id, {
            processing_status: 'skipped',
            processing_error: `misparsed_upload_no_counterpart (source ${brokenSourceId}; columns shifted on ingest; re-upload from Mintel to restore; cleanup ${now})`,
            trend_links: [],
            linked_trend_ids: [],
            linked_mega_trend_ids: [],
            rejected_link_candidates: [],
            support_label: 'NOT_SUPPORT',
          });
          report.quarantined_orphans++;
        }
      }
    }

    console.log('[cleanup] SUMMARY ' + JSON.stringify(report));
    orphans.slice(0, 15).forEach(o => console.log('[cleanup] ORPHAN ' + JSON.stringify({
      id: o.p.id, rid: o.p.gnpd_record_id, population: o.population,
      name: o.p.product_name, category: o.p.palsgaard_category, sub_category: o.p.sub_category,
    })));
    return Response.json(report);
  } catch (error) {
    console.error('[cleanup] Fatal:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});
