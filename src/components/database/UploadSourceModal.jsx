import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { X, Upload, Loader2, Sparkles } from 'lucide-react';
import { toast } from 'sonner';
import DuplicateDetectedModal from './DuplicateDetectedModal';
import UploadStatusCard from './UploadStatusCard';

export default function UploadSourceModal({ onClose, projectId, onLinkSource }) {
  const queryClient = useQueryClient();
  const [file, setFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [duplicate, setDuplicate] = useState(null);
  const [sourceId, setSourceId] = useState(null);
  const [uploadComplete, setUploadComplete] = useState(false);
  const [sourceType, setSourceType] = useState('mintel');

  const uploadSourceMutation = useMutation({
    mutationFn: async (data) => {
      const response = await base44.functions.invoke('processSource', data);
      return response.data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['sourcesDatabase'] });
      if (projectId) {
        queryClient.invalidateQueries({ queryKey: ['projectSources', projectId] });
      }
      setSourceId(data.source_id);
      setUploadComplete(true);
      toast.success('Upload complete — AI is filling in the metadata');
    },
    onError: (error) => {
      if (error.response?.data?.error === 'DUPLICATE_DETECTED') {
        setDuplicate(error.response.data.duplicate);
        setUploading(false);
      } else {
        toast.error(error.message || 'Failed to process source');
        setUploading(false);
      }
    }
  });

  const handleFileChange = (e) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) {
      setFile(selectedFile);
      // Auto-detect source type from filename
      const name = selectedFile.name.toLowerCase();
      if (name.includes('gnpd')) setSourceType('gnpd');
      else if (name.includes('mintel')) setSourceType('mintel');
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!file) {
      toast.error('Please select a file');
      return;
    }

    setUploading(true);
    try {
      const { file_url } = await base44.integrations.Core.UploadFile({ file });

      await uploadSourceMutation.mutateAsync({
        source_type: sourceType,
        file_url,
        title: file.name, // AI will overwrite this with the real title
        project_id: projectId || null
      });
    } catch (error) {
      toast.error('Upload failed');
    } finally {
      setUploading(false);
    }
  };

  if (duplicate) {
    return (
      <DuplicateDetectedModal
        duplicate={duplicate}
        projectId={projectId}
        onLinkToProject={onLinkSource}
        onClose={() => {
          setDuplicate(null);
          onClose();
        }}
      />
    );
  }

  if (uploadComplete && sourceId) {
    return (
      <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
        <div className="bg-white rounded-lg shadow-xl w-full max-w-lg p-6">
          <h2 className="text-lg font-semibold text-slate-900 mb-1">Upload Complete</h2>
          <p className="text-sm text-slate-500 mb-4 flex items-center gap-1.5">
            <Sparkles className="w-4 h-4 text-blue-500" />
            AI is reading the document and filling in all metadata automatically.
          </p>
          <UploadStatusCard
            sourceId={sourceId}
            initialStatus="processing"
            onRemove={() => onClose()}
            onViewSource={() => onClose()}
          />
          <div className="mt-4 flex justify-end">
            <Button onClick={onClose}>Done</Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-lg">
        {/* Header */}
        <div className="border-b border-slate-200 px-6 py-4 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">Upload Source</h2>
            <p className="text-sm text-slate-500 flex items-center gap-1 mt-0.5">
              <Sparkles className="w-3.5 h-3.5 text-blue-500" />
              AI will auto-fill title, date, category, region and more
            </p>
          </div>
          <Button variant="ghost" size="icon" onClick={onClose}>
            <X className="w-5 h-5" />
          </Button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {/* File Upload */}
          <div className="space-y-2">
            <Label>File *</Label>
            <Input
              type="file"
              accept=".pdf,.csv,.xlsx,.xls,.html,.htm"
              onChange={handleFileChange}
              disabled={uploading}
            />
            <p className="text-xs text-slate-500">Accepts: PDF, CSV, XLSX, XLS, HTML (max 50MB)</p>
          </div>

          {/* Source Type — the one thing AI can't reliably infer */}
          <div className="space-y-2">
            <Label>Source Type *</Label>
            <Select value={sourceType} onValueChange={setSourceType}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="mintel">Mintel Report</SelectItem>
                <SelectItem value="gnpd">GNPD Export</SelectItem>
                <SelectItem value="report">Other Report</SelectItem>
                <SelectItem value="knowledge">Knowledge / Internal Doc</SelectItem>
                <SelectItem value="other">Other</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {file && (
            <div className="bg-blue-50 border border-blue-200 rounded-lg px-4 py-3 text-sm text-blue-800">
              <span className="font-medium">"{file.name}"</span> ready to upload.
              After uploading, AI will read the document and automatically fill in all metadata fields.
            </div>
          )}

          {/* Actions */}
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={onClose} disabled={uploading}>
              Cancel
            </Button>
            <Button type="submit" disabled={uploading || !file}>
              {uploading ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Uploading...
                </>
              ) : (
                <>
                  <Upload className="w-4 h-4 mr-2" />
                  Upload & Auto-Fill
                </>
              )}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}