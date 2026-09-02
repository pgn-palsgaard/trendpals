import React, { useState, useRef } from 'react';
import { base44 } from '@/api/base44Client';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Upload, FolderOpen, File, X, Loader2, Sparkles } from 'lucide-react';
import { Checkbox } from '@/components/ui/checkbox';
import { toast } from 'sonner';
import { intakeFile, DuplicateSourceError } from '../intake/sourceIntake';
import { useDivision } from '@/lib/division';

export default function KnowledgeUploadModal({ onClose }) {
  const division = useDivision();
  const queryClient = useQueryClient();
  const fileInputRef = useRef(null);
  const folderInputRef = useRef(null);
  const [files, setFiles] = useState([]);
  const [batchName, setBatchName] = useState('');
  const [allowDuplicate, setAllowDuplicate] = useState(false);
  const [options] = useState({ auto_tag_from_folders: true });

  const handleFileSelect = (e) => {
    const selectedFiles = Array.from(e.target.files);
    const fileItems = selectedFiles.map(file => ({
      file,
      filename: file.name,
      relative_path: file.webkitRelativePath || file.name,
      folder_path: extractFolderPath(file.webkitRelativePath || file.name),
      file_size: file.size
    }));
    setFiles(prev => [...prev, ...fileItems]);
  };

  const extractFolderPath = (path) => {
    const parts = path.split('/');
    return parts.length > 1 ? parts[0] : '';
  };

  const removeFile = (index) => {
    setFiles(prev => prev.filter((_, i) => i !== index));
  };

  const startBulkUpload = useMutation({
    mutationFn: async () => {
      if (files.length === 0) {
        throw new Error('No files selected');
      }

      // Create upload batch
      const batch = await base44.entities.UploadBatch.create({
        batch_name: batchName || `Upload ${new Date().toLocaleString()}`,
        source_type: 'knowledge',
        status: 'preparing',
        total_files: files.length,
        processed_files: 0,
        failed_files: 0,
        started_at: new Date().toISOString(),
        file_items: files.map(f => ({
          filename: f.filename,
          relative_path: f.relative_path,
          folder_path: f.folder_path,
          file_size: f.file_size,
          status: 'queued',
          progress: 0
        })),
        options
      });

      // Per-file outcomes are reported through updateBatchProgress, which owns the
      // batch summary and the completion flip. Here we only mark the batch in flight.
      await base44.entities.UploadBatch.update(batch.id, { status: 'uploading' });

      // Upload in batches of 5 — the work must be STARTED per batch, not created
      // up-front, or every file fires at once regardless of the limit.
      const outcome = { created: 0, duplicates: [], failed: [] };
      const batchSize = 5;
      for (let i = 0; i < files.length; i += batchSize) {
        await Promise.all(
          files.slice(i, i + batchSize).map((fileItem, j) =>
            uploadSingleFile(fileItem, batch.id, i + j, outcome)
          )
        );
      }

      return outcome;
    },
    onSuccess: (outcome) => {
      // The source tables (Knowledge + Market Intelligence) read from the 'ragSources'
      // query with a 5-minute staleTime — without invalidating that key the freshly
      // uploaded files stay invisible until a hard reload.
      queryClient.invalidateQueries({ queryKey: ['ragSources'] });
      queryClient.invalidateQueries({ queryKey: ['knowledgeSources'] });
      queryClient.invalidateQueries({ queryKey: ['uploadBatches'] });
      // Never claim success for files that were skipped or failed — a silent no-op
      // is what made a fully-skipped upload look like "nothing happened".
      if (outcome.created > 0) {
        toast.success(`${outcome.created} file(s) uploaded`, {
          description: 'Source type is being detected in the background',
        });
      }
      if (outcome.duplicates.length > 0) {
        toast.warning(
          `${outcome.duplicates.length} file(s) skipped as duplicates: ${outcome.duplicates.join(', ')}`,
          { description: 'Tick "Upload anyway as new version" to upload them again.', duration: 10000 }
        );
      }
      if (outcome.failed.length > 0) {
        toast.error(`${outcome.failed.length} file(s) failed`, {
          description: outcome.failed.join(' · '),
          duration: 10000,
        });
      }
      if (outcome.created === 0 && outcome.duplicates.length === 0 && outcome.failed.length === 0) {
        toast.error('Nothing was uploaded');
      }
      // Keep the dialog open when nothing landed, so the reason stays on screen.
      if (outcome.created > 0) onClose();
    },
    onError: (error) => {
      toast.error(error.message || 'Failed to start upload');
    }
  });

  const uploadSingleFile = async (fileItem, batchId, index, outcome) => {
    try {
      // Unified intake: dedup check + auto-classification (no manual source_type)
      const { sourceId } = await intakeFile({
        file: fileItem.file,
        title: fileItem.filename,
        allowDuplicate,
        // Tagged with the active division, so it lands in the right library.
        mainGroup: division,
      });

      // Enrich with batch/folder metadata
      const tags = options.auto_tag_from_folders && fileItem.folder_path
        ? extractTagsFromPath(fileItem.relative_path)
        : [];
      await base44.entities.Source.update(sourceId, {
        relative_path: fileItem.relative_path,
        folder_path: fileItem.folder_path,
        upload_batch_id: batchId,
        ...(tags.length > 0 && { tags }),
      });

      await base44.functions.invoke('updateBatchProgress', {
        batch_id: batchId,
        file_index: index,
        status: 'completed',
        source_id: sourceId
      });
      outcome.created++;
    } catch (error) {
      if (error instanceof DuplicateSourceError) {
        // Duplicate skips are expected, not fatal — reported in the summary instead.
        outcome.duplicates.push(fileItem.filename);
        return;
      }
      console.error('File upload failed:', fileItem.filename, error);
      outcome.failed.push(`${fileItem.filename}: ${error.message}`);
      await base44.functions.invoke('updateBatchProgress', {
        batch_id: batchId,
        file_index: index,
        status: 'failed',
        error_message: error.message
      }).catch(() => {});
    }
  };

  const extractTagsFromPath = (path) => {
    const parts = path.split('/').filter(p => p && !p.includes('.'));
    return parts.slice(0, -1); // All parts except filename
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Upload Knowledge Sources</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Batch Name */}
          <div>
            <Label>Batch Name (optional)</Label>
            <Input
              placeholder="e.g., Product Sheets Q1 2026"
              value={batchName}
              onChange={(e) => setBatchName(e.target.value)}
            />
          </div>

          {/* Auto-classification notice */}
          <div className="flex items-start gap-2 p-3 bg-purple-50 border border-purple-200 rounded-lg">
            <Sparkles className="w-4 h-4 text-purple-600 shrink-0 mt-0.5" />
            <p className="text-xs text-purple-800">
              Source type is detected automatically (Knowledge / Mintel / Market Intel — GNPD spreadsheets are validated against the Mintel template).
              If the AI isn't confident, the file lands in <span className="font-semibold">Needs Classification</span> for your one-click confirmation.
            </p>
          </div>

          {/* Duplicate override */}
          <label className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer">
            <Checkbox checked={allowDuplicate} onCheckedChange={v => setAllowDuplicate(!!v)} />
            Upload anyway as new version (override duplicate detection)
          </label>

          {/* Upload Buttons */}
          <div className="flex gap-3">
            <Button
              variant="outline"
              onClick={() => fileInputRef.current?.click()}
              className="flex-1"
            >
              <File className="w-4 h-4 mr-2" />
              Select Files
            </Button>
            <Button
              variant="outline"
              onClick={() => folderInputRef.current?.click()}
              className="flex-1"
            >
              <FolderOpen className="w-4 h-4 mr-2" />
              Select Folder
            </Button>
          </div>

          <input
            ref={fileInputRef}
            type="file"
            multiple
            className="hidden"
            onChange={handleFileSelect}
            accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx"
          />
          <input
            ref={folderInputRef}
            type="file"
            className="hidden"
            onChange={handleFileSelect}
            webkitdirectory=""
            directory=""
          />

          {/* File List */}
          {files.length > 0 && (
            <div className="border rounded-lg p-3 bg-slate-50 max-h-64 overflow-y-auto">
              <div className="text-sm font-medium text-slate-900 mb-2">
                Selected Files ({files.length})
              </div>
              <div className="space-y-1">
                {files.map((file, index) => (
                  <div key={index} className="flex items-center justify-between text-xs p-2 bg-white rounded border">
                    <div className="flex-1 truncate">
                      <div className="font-medium text-slate-900">{file.filename}</div>
                      {file.relative_path !== file.filename && (
                        <div className="text-slate-500">{file.relative_path}</div>
                      )}
                    </div>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => removeFile(index)}
                      className="h-6 w-6 p-0"
                    >
                      <X className="w-3 h-3" />
                    </Button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Actions */}
          <div className="flex justify-end gap-3">
            <Button variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button
              onClick={() => startBulkUpload.mutate()}
              disabled={files.length === 0 || startBulkUpload.isPending}
              className="bg-blue-600 hover:bg-blue-700"
            >
              {startBulkUpload.isPending ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Uploading...
                </>
              ) : (
                <>
                  <Upload className="w-4 h-4 mr-2" />
                  Upload {files.length} Files
                </>
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}