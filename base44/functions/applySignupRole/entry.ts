import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';

// Applies the signup role marker set by the public access guide pages.
// /access-review → 'reviewer', /access → 'user' (submitter).
// Only ever applies to fresh accounts still holding the default 'user' role
// (or no role) — never changes admins or already-assigned reviewers.
export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { role } = await req.json().catch(() => ({}));
    if (!['user', 'reviewer'].includes(role)) {
      return Response.json({ error: 'Invalid role' }, { status: 400 });
    }

    if (user.role && user.role !== 'user') {
      return Response.json({ updated: false, role: user.role });
    }
    if (user.role === role) {
      return Response.json({ updated: false, role });
    }

    await base44.asServiceRole.entities.User.update(user.id, { role });
    return Response.json({ updated: true, role });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}