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

    // ISO week number drives the rotation, so the schedule is deterministic.
    const now = new Date();
    const start = new Date(Date.UTC(now.getUTCFullYear(), 0, 1));
    const week = Math.floor((now.getTime() - start.getTime()) / (7 * 24 * 60 * 60 * 1000));
    const category = SCOUT_CATEGORIES.includes(body.category)
      ? body.category
      : SCOUT_CATEGORIES[week % SCOUT_CATEGORIES.length];

    // Nested call: this wrapper is itself on a runtime budget, so the sweep gets a
    // short one. A full 240s sweep here got the wrapper killed and left the child
    // run stuck in 'running' with zero findings.
    const res = await base44.functions.invoke('runMarketScout', {
      category,
      window: 'the last 4 weeks',
      time_budget_ms: 90000,
    });

    return Response.json({ success: true, category, result: res?.data || null });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}