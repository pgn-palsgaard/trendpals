import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { X, Upload, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

export default function UploadSourceModal({ onClose }) {
  const queryClient = useQueryClient();
  const [file, setFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [formData, setFormData] = useState({
    source_type: 'mintel',
    title: '',
    region: '',
    category: '',
    date: '',
    trust_tier: 'medium',
    usage_permission: 'evidence',
    tags: '',
    notes: ''
  });

  const [duplicateInfo, setDuplicateInfo] = useState(null);

  const uploadSourceMutation = useMutation({
    mutationFn: async (data) => {
      const response = await base44.functions.invoke('processSource', data);
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sourcesDatabase'] });
      toast.success('Source uploaded and processed ✓');
      onClose();
    },
    onError: (error) => {
      // Handle duplicate detection
      if (error.response?.data?.error === 'DUPLICATE_DETECTED') {
        setDuplicateInfo(error.response.data);
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
      if (!formData.title) {
        setFormData({ ...formData, title: selectedFile.name });
      }
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!file) {
      toast.error('Please select a file');
      return;
    }

    if (!formData.title || !formData.region || !formData.category || !formData.date) {
      toast.error('Please fill in all required fields');
      return;
    }

    setUploading(true);
    try {
      // Upload file first
      const { file_url } = await base44.integrations.Core.UploadFile({ file });

      // Process source
      await uploadSourceMutation.mutateAsync({
        source_type: formData.source_type,
        file_url,
        title: formData.title,
        region: formData.region,
        category: formData.category,
        date: formData.date,
        trust_tier: formData.trust_tier,
        usage_permission: formData.usage_permission,
        tags: formData.tags ? formData.tags.split(',').map(t => t.trim()) : [],
        notes: formData.notes,
        project_id: null // Library upload, not project-specific
      });
    } catch (error) {
      // Error handled by mutation
    }
  };

  // If duplicate detected, show duplicate warning UI
  if (duplicateInfo) {
    const { duplicate } = duplicateInfo;
    return (
      <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
        <div className="bg-white rounded-lg shadow-xl w-full max-w-lg">
          <div className="p-6">
            <div className="flex items-start gap-3 mb-4">
              <div className="w-12 h-12 rounded-full bg-orange-100 flex items-center justify-center flex-shrink-0">
                <AlertCircle className="w-6 h-6 text-orange-600" />
              </div>
              <div className="flex-1">
                <h3 className="text-lg font-semibold text-slate-900 mb-1">Duplicate Source Detected</h3>
                <p className="text-sm text-slate-600">{duplicateInfo.message}</p>
              </div>
            </div>

            <div className="bg-slate-50 border border-slate-200 rounded-lg p-4 mb-4">
              <p className="text-xs text-slate-500 mb-2">Existing source:</p>
              <p className="font-medium text-slate-900">{duplicate.title}</p>
              <div className="flex gap-4 text-xs text-slate-600 mt-2">
                {duplicate.category && <span>Category: {duplicate.category}</span>}
                {duplicate.region_code && <span>Region: {duplicate.region_code}</span>}
                {duplicate.date && <span>Uploaded: {new Date(duplicate.date).toLocaleDateString()}</span>}
              </div>
            </div>

            <div className="flex gap-3">
              <Button
                onClick={() => {
                  setDuplicateInfo(null);
                  onClose();
                }}
                className="flex-1"
              >
                Close
              </Button>
              <Button
                variant="outline"
                onClick={() => {
                  // Navigate to existing source
                  setDuplicateInfo(null);
                  onClose();
                  // Could trigger callback to show source detail
                }}
                className="flex-1"
              >
                View Existing Source
              </Button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="sticky top-0 bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-slate-900">Upload Source</h2>
          <Button variant="ghost" size="icon" onClick={onClose}>
            <X className="w-5 h-5" />
          </Button>
        </div>

        {/* Form */}
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

          {/* Required Metadata */}
          <div className="space-y-2">
            <Label>Source Type *</Label>
            <Select
              value={formData.source_type}
              onValueChange={(value) => setFormData({ ...formData, source_type: value })}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="mintel">Mintel Report</SelectItem>
                <SelectItem value="gnpd">GNPD Export</SelectItem>
                <SelectItem value="report">Other Report</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Title *</Label>
            <Input
              value={formData.title}
              onChange={(e) => setFormData({ ...formData, title: e.target.value })}
              placeholder="Source title..."
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>Region *</Label>
              <Select
                value={formData.region}
                onValueChange={(value) => setFormData({ ...formData, region: value })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="EMEA">EMEA</SelectItem>
                  <SelectItem value="APAC">APAC</SelectItem>
                  <SelectItem value="Americas">Americas</SelectItem>
                  <SelectItem value="Global">Global</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Category *</Label>
              <Input
                value={formData.category}
                onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                placeholder="e.g., Ice Cream"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label>Date Published *</Label>
            <Input
              type="date"
              value={formData.date}
              onChange={(e) => setFormData({ ...formData, date: e.target.value })}
            />
          </div>

          {/* Optional Metadata */}
          <div className="pt-4 border-t border-slate-200">
            <h3 className="text-sm font-semibold text-slate-900 mb-3">Optional Metadata</h3>

            <div className="grid grid-cols-2 gap-3 mb-3">
              <div className="space-y-2">
                <Label>Trust Tier</Label>
                <Select
                  value={formData.trust_tier}
                  onValueChange={(value) => setFormData({ ...formData, trust_tier: value })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="high">High</SelectItem>
                    <SelectItem value="medium">Medium</SelectItem>
                    <SelectItem value="low">Low</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Usage Permission</Label>
                <Select
                  value={formData.usage_permission}
                  onValueChange={(value) => setFormData({ ...formData, usage_permission: value })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="evidence">Evidence</SelectItem>
                    <SelectItem value="framing">Framing</SelectItem>
                    <SelectItem value="reference">Reference only</SelectItem>
                    <SelectItem value="forbidden">Forbidden</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2 mb-3">
              <Label>Tags</Label>
              <Input
                value={formData.tags}
                onChange={(e) => setFormData({ ...formData, tags: e.target.value })}
                placeholder="Comma-separated tags..."
              />
            </div>

            <div className="space-y-2">
              <Label>Notes</Label>
              <Textarea
                value={formData.notes}
                onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                placeholder="Internal context and notes..."
                rows={3}
                maxLength={500}
              />
            </div>
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-2 pt-4">
            <Button type="button" variant="outline" onClick={onClose} disabled={uploading}>
              Cancel
            </Button>
            <Button type="submit" disabled={uploading}>
              {uploading ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Uploading...
                </>
              ) : (
                <>
                  <Upload className="w-4 h-4 mr-2" />
                  Upload Source
                </>
              )}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}