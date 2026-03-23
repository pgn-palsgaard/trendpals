import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { batch_id, files } = await req.json();

    if (!batch_id || !files) {
      return Response.json({ error: 'batch_id and files required' }, { status: 400 });
    }

    // Get batch
    const batch = await base44.entities.UploadBatch.get(batch_id);

    // Update batch status
    await base44.entities.UploadBatch.update(batch_id, {
      status: 'uploading'
    });

    // Process files
    let processedCount = 0;
    let failedCount = 0;
    const createdSourceIds = [];
    const errorLog = [];

    for (const fileInfo of files) {
      try {
        // File will be uploaded by the frontend
        // This function just tracks progress
        processedCount++;
      } catch (error) {
        failedCount++;
        errorLog.push({
          filename: fileInfo.filename,
          error: error.message
        });
      }
    }

    // Final batch update
    await base44.entities.UploadBatch.update(batch_id, {
      status: failedCount === files.length ? 'failed' : 'completed',
      processed_files: processedCount,
      failed_files: failedCount,
      completed_at: new Date().toISOString(),
      created_source_ids: createdSourceIds,
      error_log: errorLog
    });

    return Response.json({
      success: true,
      batch_id,
      processed: processedCount,
      failed: failedCount
    });

  } catch (error) {
    console.error('Bulk upload processing error:', error);
    return Response.json({
      error: error.message,
      details: error.stack
    }, { status: 500 });
  }
});