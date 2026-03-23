import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { batch_id, file_index, status, source_id, error_message } = await req.json();

    if (!batch_id || file_index === undefined) {
      return Response.json({ error: 'batch_id and file_index required' }, { status: 400 });
    }

    // Get current batch
    const batch = await base44.entities.UploadBatch.get(batch_id);

    // Update file item status
    const fileItems = [...batch.file_items];
    if (fileItems[file_index]) {
      fileItems[file_index] = {
        ...fileItems[file_index],
        status,
        source_id,
        error_message,
        progress: status === 'completed' ? 100 : fileItems[file_index].progress
      };
    }

    // Count statuses
    const completed = fileItems.filter(f => f.status === 'completed').length;
    const failed = fileItems.filter(f => f.status === 'failed').length;
    const skipped = fileItems.filter(f => f.status === 'skipped_duplicate').length;

    // Update batch
    const updateData = {
      file_items: fileItems,
      processed_files: completed,
      failed_files: failed,
      skipped_files: skipped
    };

    // Add source_id to created list
    if (source_id) {
      updateData.created_source_ids = [...(batch.created_source_ids || []), source_id];
    }

    // Check if batch is complete
    const totalProcessed = completed + failed + skipped;
    if (totalProcessed === batch.total_files) {
      updateData.status = 'completed';
      updateData.completed_at = new Date().toISOString();
    }

    await base44.entities.UploadBatch.update(batch_id, updateData);

    return Response.json({
      success: true,
      processed: completed,
      total: batch.total_files
    });

  } catch (error) {
    console.error('Update batch progress error:', error);
    return Response.json({
      error: error.message
    }, { status: 500 });
  }
});