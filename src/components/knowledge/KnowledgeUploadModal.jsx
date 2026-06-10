import React, { useState, useRef } from 'react';
import { base44 } from '@/api/base44Client';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Upload, FolderOpen, File, X, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

export default function KnowledgeUploadModal({ onClose, defaultSourceType = 'knowledge' }) {
  const queryClient = useQueryClient();
  const fileInputRef = useRef(null);
  const folderInputRef = useRef(null);
  const [files, setFiles] = useState([]);
  const [batchName, setBatchName] = useState('');
  const [sourceType, setSourceType] = useState(defaultSourceType);
  const [options, setOptions] = useState({
    default_trust_tier: 'draft',
    default_knowledge_subtype: 'other',
    auto_tag_from_folders: true,
    skip_duplicates: true
  });

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

      // Start background processing
      base44.functions.invoke('processBulkUpload', {
        batch_id: batch.id,
        files: files.map((f, idx) => ({
          index: idx,
          filename: f.filename,
          relative_path: f.relative_path,
          folder_path: f.folder_path
        }))
      }).catch(err => {
        console.error('Background upload failed:', err);
      });

      // Upload files with concurrency limit
      const uploadPromises = files.map((fileItem, index) => 
        uploadSingleFile(fileItem, batch.id, index)
      );

      // Process in batches of 5
      const batchSize = 5;
      for (let i = 0; i < uploadPromises.length; i += batchSize) {
        await Promise.allSettled(uploadPromises.slice(i, i + batchSize));
      }

      return batch.id;
    },
    onSuccess: (batchId) => {
      queryClient.invalidateQueries(['knowledgeSources']);
      queryClient.invalidateQueries(['uploadBatches']);
      toast.success('Bulk upload started', {
        description: 'Files are being processed in the background'
      });
      onClose();
    },
    onError: (error) => {
      toast.error(error.message || 'Failed to start upload');
    }
  });

  const uploadSingleFile = async (fileItem, batchId, index) => {
    try {
      // Upload file
      const { file_url } = await base44.integrations.Core.UploadFile({
        file: fileItem.file
      });

      // Create knowledge source
      const tags = options.auto_tag_from_folders && fileItem.folder_path
        ? extractTagsFromPath(fileItem.relative_path)
        : [];

      const createdSource = await base44.entities.Source.create({
        source_type: sourceType,
        ...(sourceType === 'knowledge' && { knowledge_subtype: options.default_knowledge_subtype }),
        title: fileItem.filename,
        file_url,
        relative_path: fileItem.relative_path,
        folder_path: fileItem.folder_path,
        file_size: fileItem.file_size,
        visibility: 'org_shared',
        allowed_use: 'capability_proof_only',
        tags,
        upload_batch_id: batchId,
        pipeline_stage: 'uploaded',
        review_status: 'pending',
        date: new Date().toISOString().split('T')[0]
      });

      // Update batch progress (with source_id for traceability)
      await base44.functions.invoke('updateBatchProgress', {
        batch_id: batchId,
        file_index: index,
        status: 'completed',
        source_id: createdSource.id
      });
    } catch (error) {
      console.error('File upload failed:', fileItem.filename, error);
      await base44.functions.invoke('updateBatchProgress', {
        batch_id: batchId,
        file_index: index,
        status: 'failed',
        error_message: error.message
      });
      throw error;
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

          {/* Source type */}
          <div>
            <Label>Source Type</Label>
            <Select value={sourceType} onValueChange={setSourceType}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="mintel">Mintel Report</SelectItem>
                <SelectItem value="report">Other Report / Trade Press</SelectItem>
                <SelectItem value="knowledge">Knowledge / Internal Doc</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Upload Options */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Default Subtype</Label>
              <Select
                value={options.default_knowledge_subtype}
                onValueChange={(value) => setOptions({ ...options, default_knowledge_subtype: value })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="product_sheet">Product Sheet</SelectItem>
                  <SelectItem value="technical_doc">Technical Doc</SelectItem>
                  <SelectItem value="capability_overview">Capability Overview</SelectItem>
                  <SelectItem value="certification">Certification</SelectItem>
                  <SelectItem value="sustainability">Sustainability</SelectItem>
                  <SelectItem value="application_note">Application Note</SelectItem>
                  <SelectItem value="other">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

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