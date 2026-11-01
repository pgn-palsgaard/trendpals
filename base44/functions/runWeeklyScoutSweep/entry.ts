// Weekly unattended sweep. Rotates through the Palsgaard categories one per week
// so every category gets refreshed, without ever running several sweeps at once.
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';
import { SCOUT_CATEGORIES } from '../../shared/marketScout.ts';

export default async function (req) {
  try {
    const base44 = createClientFromRequest(req);

    let user = null;
    try { user = await base44.auth.me(); } catch { user = null; }
    if (user && user.role !== 'admin') {
      return Response.json({ error: 'Forbidden' }, { status: 403 });
    }

    const body = await req.json().catch(() => ({}));

    // A continuous week counter drives the rotation, so the schedule is deterministic
    // and never skips or repeats a category at the new year (a per-year week number
    // resets every 1 January). Anchored on Monday 2026-11-02 = index 7, so the
    // rotation carries on exactly where the old formula had it.
    const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
    const ANCHOR_MS = Date.UTC(2026, 10, 2);
    const ANCHOR_INDEX = 7;
    const n = SCOUT_CATEGORIES.length;
    const weeksSinceAnchor = Math.floor((Date.now() - ANCHOR_MS) / WEEK_MS);
    const index = (((ANCHOR_INDEX + weeksSinceAnchor) % n) + n) % n;
    const category = SCOUT_CATEGORIES.includes(body.category)
      ? body.category
      : SCOUT_CATEGORIES[index];

    // Nested call: this wrapper is itself on a runtime budget, so the sweep gets a
    // short one. A full 240s sweep here got the wrapper killed and left the child
    // run stuck in 'running' with zero findings.
    const res = await base44.functions.invoke('runMarketScout', {
      category,
      window: 'the last 4 weeks',
      time_budget_ms: 90000,
      // The workflow runs under the owner's identity, so runMarketScout cannot tell
      // it apart from a button press on its own.
      triggered_by: 'schedule',
    });

    return Response.json({ success: true, category, result: res?.data || null });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}