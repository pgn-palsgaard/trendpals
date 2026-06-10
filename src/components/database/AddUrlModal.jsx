import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { X, Link as LinkIcon, Loader2, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';
import { getAllRegionCodes } from '@/components/RegionsTaxonomy';
import { intakeUrl } from '../intake/sourceIntake';

export default function AddUrlModal({ onClose, projectId, onLinkSource }) {
  const queryClient = useQueryClient();
  const [url, setUrl] = useState('');
  const [snapshotPolicy, setSnapshotPolicy] = useState('snapshot');
  const [formData, setFormData] = useState({
    title: '',
    region_code: '',
    category: '',
    date: '',
    usage_permission: 'evidence'
  });
  const [adding, setAdding] = useState(false);

  const regions = [...getAllRegionCodes(), 'Global'];
  const categories = ['Ice Cream', 'Bakery', 'Confectionery', 'Dairy', 'Chocolate', 'Beverages', 'Snacks', 'Other'];

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!url || !formData.title || !formData.region_code || !formData.category || !formData.date) {
      toast.error('Please fill in all required fields');
      return;
    }

    setAdding(true);
    try {
      await intakeUrl({
        url,
        title: formData.title,
        projectId: projectId || null,
        extraFields: {
          region_code: formData.region_code,
          category: formData.category,
          date: formData.date,
          usage_permission: formData.usage_permission,
          snapshot_url: snapshotPolicy === 'snapshot' ? url : null,
        },
      });
      queryClient.invalidateQueries({ queryKey: ['sourcesDatabase'] });
      if (projectId) {
        queryClient.invalidateQueries({ queryKey: ['projectSources', projectId] });
      }
      toast.success('URL added — pending verification & approval');
      onClose();
    } catch (error) {
      toast.error(error.message || 'Failed to add URL');
    } finally {
      setAdding(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="sticky top-0 bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-slate-900">Add URL Source</h2>
          <Button variant="ghost" size="icon" onClick={onClose}>
            <X className="w-5 h-5" />
          </Button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {/* URL */}
          <div className="space-y-2">
            <Label>URL *</Label>
            <Input
              type="url"
              value={url}
              onChange={(e) => {
                setUrl(e.target.value);
                if (!formData.title && e.target.value) {
                  setFormData({ ...formData, title: e.target.value });
                }
              }}
              placeholder="https://..."
            />
          </div>

          {/* Snapshot Policy */}
          <div className="space-y-2">
            <Label>Snapshot Policy</Label>
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <input
                  type="radio"
                  checked={snapshotPolicy === 'snapshot'}
                  onChange={() => setSnapshotPolicy('snapshot')}
                  className="w-4 h-4"
                />
                <span className="text-sm text-slate-700">Save snapshot now (archives page content)</span>
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="radio"
                  checked={snapshotPolicy === 'link'}
                  onChange={() => setSnapshotPolicy('link')}
                  className="w-4 h-4"
                />
                <span className="text-sm text-slate-700">Link only (no snapshot, may break)</span>
              </div>
            </div>
            {snapshotPolicy === 'link' && (
              <div className="flex items-start gap-2 p-3 bg-orange-50 border border-orange-200 rounded text-sm text-orange-900">
                <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                <span>External URLs may change or expire. Use snapshots for critical sources.</span>
              </div>
            )}
          </div>

          {/* Required Metadata */}
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
                value={formData.region_code}
                onValueChange={(value) => setFormData({ ...formData, region_code: value })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select..." />
                </SelectTrigger>
                <SelectContent>
                  {[...new Set(regions)].map(r => <SelectItem key={r} value={r}>{r}</SelectItem>)}
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

          {/* Optional */}
          <div className="grid grid-cols-2 gap-3">
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

          {/* Actions */}
          <div className="flex justify-end gap-2 pt-4">
            <Button type="button" variant="outline" onClick={onClose} disabled={adding}>
              Cancel
            </Button>
            <Button type="submit" disabled={adding}>
              {adding ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Adding...
                </>
              ) : (
                <>
                  <LinkIcon className="w-4 h-4 mr-2" />
                  Add Source
                </>
              )}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}