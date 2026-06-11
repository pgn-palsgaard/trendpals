import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (user?.role !== 'admin') return Response.json({ error: 'Forbidden' }, { status: 403 });

    const svc = base44.asServiceRole.entities.Source;
    const report = { steps: [] };

    // 1. Create test record with non-schema fields (service-level write)
    const created = await svc.create({
      source_type: 'other',
      title: 'PHASE0_SCHEMA_STRIP_CANARY — delete me',
      legacy_test_field: 'canary',
      excerpts: [{
        id: 'canary_exc_1',
        market_signal: 'real signal',
        legacy_nested_field: 'nested canary'
      }]
    });
    report.steps.push({ step: 'create', id: created.id });

    // Read back after create
    const afterCreate = await svc.get(created.id);
    report.after_create = {
      legacy_test_field: afterCreate.legacy_test_field ?? null,
      nested_legacy: afterCreate.excerpts?.[0]?.legacy_nested_field ?? null,
      excerpt_keys: Object.keys(afterCreate.excerpts?.[0] || {})
    };

    // 2. Update an UNRELATED field via the normal update path
    await svc.update(created.id, { notes: 'unrelated field update' });

    // 3. Read back
    const afterUpdate = await svc.get(created.id);
    report.after_update = {
      legacy_test_field: afterUpdate.legacy_test_field ?? null,
      nested_legacy: afterUpdate.excerpts?.[0]?.legacy_nested_field ?? null,
      market_signal: afterUpdate.excerpts?.[0]?.market_signal ?? null,
      excerpt_keys: Object.keys(afterUpdate.excerpts?.[0] || {}),
      notes: afterUpdate.notes
    };

    // 4. Delete the test record
    await svc.delete(created.id);
    report.steps.push({ step: 'deleted', id: created.id });

    const strippedOnCreate = report.after_create.legacy_test_field === null || report.after_create.nested_legacy === null;
    const survivedCreate = !strippedOnCreate;
    const strippedOnUpdate = survivedCreate &&
      (report.after_update.legacy_test_field === null || report.after_update.nested_legacy === null);

    report.verdict = {
      strips_on_create: strippedOnCreate,
      strips_on_update: survivedCreate ? strippedOnUpdate : 'n/a (fields never persisted at create)',
      summary: strippedOnCreate
        ? 'Non-schema fields stripped already at CREATE time'
        : strippedOnUpdate
          ? 'Base44 strips non-schema fields on update: YES'
          : 'Base44 strips non-schema fields on update: NO'
    };

    return Response.json(report);
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});