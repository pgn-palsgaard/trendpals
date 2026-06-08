import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();
    const { ids } = body;

    if (!Array.isArray(ids) || ids.length === 0) {
      return Response.json({ error: 'ids must be a non-empty array' }, { status: 400 });
    }
    if (ids.length > 100) {
      return Response.json({ error: 'Cannot delete more than 100 records at once' }, { status: 400 });
    }

    console.log(`[deleteSourceRecords] User ${user.email} deleting ${ids.length} sources:`, ids);

    const results = await Promise.allSettled(
      ids.map(id => base44.asServiceRole.entities.Source.delete(id))
    );

    const errors = [];
    let deleted = 0;
    let failed = 0;

    results.forEach((result, index) => {
      if (result.status === 'fulfilled') {
        deleted++;
      } else {
        failed++;
        errors.push({ id: ids[index], error: result.reason?.message || 'Unknown error' });
      }
    });

    console.log(`[deleteSourceRecords] Done: ${deleted} deleted, ${failed} failed`);

    return Response.json({ deleted, failed, errors });
  } catch (error) {
    console.error('[deleteSourceRecords] Fatal error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});