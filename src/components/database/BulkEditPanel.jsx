import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { X, AlertCircle, CheckCircle } from 'lucide-react';
import { toast } from 'sonner';

export default function BulkEditPanel({ selectedSources, onClose }) {
  const queryClient = useQueryClient();
  const [showReview, setShowReview] = useState(false);
  const [user, setUser] = useState(null);
  const [changes, setChanges] = useState({
    region: null,
    category: null,
    subcategory: null,
    date: null,
    date_published: null,
    date_published_override_reason: null,
    trust_tier: null,
    usage_permission: null,
    tags: null,
    tagsAction: 'add', // add or replace
    notes: null,
    notesAction: 'append', // append or replace
  });

  useEffect(() => {
    base44.auth.me().then(setUser);
  }, []);

  // Detect mixed values
  const getMixedState = (field) => {
    const values = selectedSources.map(s => s[field]).filter(v => v != null);
    const unique = [...new Set(values)];
    if (unique.length === 0) return { isEmpty: true, isMixed: false, value: null };
    if (unique.length === 1) return { isEmpty: false, isMixed: false, value: unique[0] };
    return { isEmpty: false, isMixed: true, value: null };
  };

  const regionState = getMixedState('region');
  const categoryState = getMixedState('category');
  const trustState = getMixedState('trust_tier');
  const permissionState = getMixedState('usage_permission');

  const applyMutation = useMutation({
    mutationFn: async (changesData) => {
      for (const source of selectedSources) {
        const updates = {};
        
        if (changesData.region) updates.region = changesData.region;
        if (changesData.category) updates.category = changesData.category;
        if (changesData.subcategory) updates.subcategory = changesData.subcategory;
        if (changesData.date) updates.date = changesData.date;
        if (changesData.trust_tier) updates.trust_tier = changesData.trust_tier;
        if (changesData.usage_permission) updates.usage_permission = changesData.usage_permission;
        
        // Handle publication date override
        if (changesData.date_published) {
          updates.date_published = changesData.date_published;
          updates.date_published_source = 'manual_override';
          updates.date_published_override_reason = changesData.date_published_override_reason || 'Bulk edit';
          updates.date_published_last_updated_at = new Date().toISOString();
          updates.date_published_updated_by = user?.email || 'Unknown';
          
          // Save original if not already overridden
          if (source.date_published && source.date_published_source !== 'manual_override') {
            updates.date_published_original_extracted = source.date_published;
          }
        }
        
        if (changesData.tags) {
          if (changesData.tagsAction === 'add') {
            const existingTags = source.tags || [];
            updates.tags = [...new Set([...existingTags, ...changesData.tags.split(',').map(t => t.trim())])];
          } else {
            updates.tags = changesData.tags.split(',').map(t => t.trim());
          }
        }
        
        if (changesData.notes) {
          if (changesData.notesAction === 'append') {
            updates.notes = (source.notes || '') + '\n' + changesData.notes;
          } else {
            updates.notes = changesData.notes;
          }
        }

        if (Object.keys(updates).length > 0) {
          await base44.entities.Source.update(source.id, updates);
        }
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sourcesDatabase'] });
      toast.success(`Updated ${selectedSources.length} sources ✓`);
      onClose();
    },
    onError: () => {
      toast.error('Failed to update sources');
    }
  });

  const handleApply = () => {
    const activeChanges = Object.entries(changes).filter(([key, value]) => 
      value !== null && key !== 'tagsAction' && key !== 'notesAction'
    );

    if (activeChanges.length === 0) {
      toast.error('No changes to apply');
      return;
    }

    setShowReview(true);
  };

  const confirmApply = () => {
    applyMutation.mutate(changes);
  };

  const hasChanges = Object.values(changes).some(v => v !== null && typeof v !== 'string' || (typeof v === 'string' && v.trim()));

  if (showReview) {
    return (
      <div className="fixed right-0 top-16 bottom-0 w-[500px] bg-white border-l border-slate-200 shadow-xl z-50 overflow-y-auto">
        <div className="p-6">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-lg font-semibold text-slate-900">Review Changes</h2>
            <Button variant="ghost" size="icon" onClick={() => setShowReview(false)}>
              <X className="w-5 h-5" />
            </Button>
          </div>

          <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg mb-6">
            <p className="text-sm font-medium text-blue-900">
              You're updating {selectedSources.length} source{selectedSources.length > 1 ? 's' : ''}
            </p>
          </div>

          <div className="space-y-4">
            {changes.region && (
              <div className="p-3 border border-slate-200 rounded">
                <p className="text-sm text-slate-600">Region</p>
                <p className="font-medium">{changes.region}</p>
              </div>
            )}
            {changes.category && (
              <div className="p-3 border border-slate-200 rounded">
                <p className="text-sm text-slate-600">Category</p>
                <p className="font-medium">{changes.category}</p>
              </div>
            )}
            {changes.date && (
              <div className="p-3 border border-slate-200 rounded">
                <p className="text-sm text-slate-600">Date Published</p>
                <p className="font-medium">{new Date(changes.date).toLocaleDateString()}</p>
              </div>
            )}
            {changes.date_published && (
              <div className="p-3 border border-orange-200 bg-orange-50 rounded">
                <p className="text-sm text-orange-800 font-medium">Publication Date Override</p>
                <p className="font-medium">{new Date(changes.date_published).toLocaleDateString()}</p>
                {changes.date_published_override_reason && (
                  <p className="text-xs text-orange-700 mt-1">Reason: {changes.date_published_override_reason}</p>
                )}
                <p className="text-xs text-orange-600 mt-1">⚠️ Will override extracted dates</p>
              </div>
            )}
            {changes.trust_tier && (
              <div className="p-3 border border-slate-200 rounded">
                <p className="text-sm text-slate-600">Trust Tier</p>
                <p className="font-medium capitalize">{changes.trust_tier}</p>
              </div>
            )}
            {changes.usage_permission && (
              <div className="p-3 border border-slate-200 rounded">
                <p className="text-sm text-slate-600">Usage Permission</p>
                <p className="font-medium capitalize">{changes.usage_permission}</p>
              </div>
            )}
            {changes.tags && (
              <div className="p-3 border border-slate-200 rounded">
                <p className="text-sm text-slate-600">Tags ({changes.tagsAction})</p>
                <p className="font-medium">{changes.tags}</p>
              </div>
            )}
            {changes.notes && (
              <div className="p-3 border border-slate-200 rounded">
                <p className="text-sm text-slate-600">Notes ({changes.notesAction})</p>
                <p className="font-medium text-sm">{changes.notes}</p>
              </div>
            )}
          </div>

          <div className="flex gap-2 mt-6">
            <Button onClick={confirmApply} disabled={applyMutation.isPending} className="flex-1">
              {applyMutation.isPending ? 'Applying...' : 'Confirm & Apply'}
            </Button>
            <Button variant="outline" onClick={() => setShowReview(false)}>
              Back
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed right-0 top-16 bottom-0 w-[500px] bg-white border-l border-slate-200 shadow-xl z-50 overflow-y-auto">
      <div className="sticky top-0 bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between z-10">
        <h2 className="text-lg font-semibold text-slate-900">Edit {selectedSources.length} sources</h2>
        <Button variant="ghost" size="icon" onClick={onClose}>
          <X className="w-5 h-5" />
        </Button>
      </div>

      <div className="p-6 space-y-6">
        <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg">
          <p className="text-sm text-blue-900">
            Changes will apply to all {selectedSources.length} selected source{selectedSources.length > 1 ? 's' : ''}
          </p>
        </div>

        {/* Region */}
        <div className="space-y-2">
          <Label>Region</Label>
          {regionState.isMixed && (
            <p className="text-xs text-amber-600 mb-1">⚠️ Mixed values across selection</p>
          )}
          <Select
            value={changes.region || ''}
            onValueChange={(value) => setChanges({ ...changes, region: value || null })}
          >
            <SelectTrigger>
              <SelectValue placeholder={regionState.isMixed ? 'Mixed values' : 'No change'} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="_none">No change</SelectItem>
              <SelectItem value="EMEA">EMEA</SelectItem>
              <SelectItem value="APAC">APAC</SelectItem>
              <SelectItem value="Americas">Americas</SelectItem>
              <SelectItem value="Global">Global</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Category */}
        <div className="space-y-2">
          <Label>Category</Label>
          {categoryState.isMixed && (
            <p className="text-xs text-amber-600 mb-1">⚠️ Mixed values across selection</p>
          )}
          <Input
            placeholder={categoryState.isMixed ? 'Mixed values' : 'No change'}
            value={changes.category || ''}
            onChange={(e) => setChanges({ ...changes, category: e.target.value || null })}
          />
        </div>

        {/* Publication Date */}
        <div className="space-y-2">
          <Label>Publication Date Override</Label>
          <Input
            type="date"
            placeholder="No change"
            value={changes.date_published || ''}
            onChange={(e) => setChanges({ ...changes, date_published: e.target.value || null })}
          />
          {changes.date_published && (
            <div className="space-y-2 mt-2">
              <Label className="text-xs">Reason for override</Label>
              <Input
                placeholder="e.g., Bulk correction from..."
                value={changes.date_published_override_reason || ''}
                onChange={(e) => setChanges({ ...changes, date_published_override_reason: e.target.value })}
                maxLength={200}
              />
            </div>
          )}
          <p className="text-xs text-slate-500">
            This will override extracted dates for all selected sources
          </p>
        </div>

        {/* Subcategory */}
        <div className="space-y-2">
          <Label>Subcategory</Label>
          <Input
            placeholder="No change"
            value={changes.subcategory || ''}
            onChange={(e) => setChanges({ ...changes, subcategory: e.target.value || null })}
          />
        </div>

        {/* Date Published */}
        <div className="space-y-2">
          <Label>Date Published</Label>
          <Input
            type="date"
            value={changes.date || ''}
            onChange={(e) => setChanges({ ...changes, date: e.target.value || null })}
          />
        </div>

        {/* Trust Tier */}
        <div className="space-y-2">
          <Label>Trust Tier</Label>
          {trustState.isMixed && (
            <p className="text-xs text-amber-600 mb-1">⚠️ Mixed values across selection</p>
          )}
          <Select
            value={changes.trust_tier || ''}
            onValueChange={(value) => setChanges({ ...changes, trust_tier: value || null })}
          >
            <SelectTrigger>
              <SelectValue placeholder={trustState.isMixed ? 'Mixed values' : 'No change'} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="_none">No change</SelectItem>
              <SelectItem value="high">High</SelectItem>
              <SelectItem value="medium">Medium</SelectItem>
              <SelectItem value="low">Low</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Usage Permission */}
        <div className="space-y-2">
          <Label>Usage Permission</Label>
          {permissionState.isMixed && (
            <p className="text-xs text-amber-600 mb-1">⚠️ Mixed values across selection</p>
          )}
          <Select
            value={changes.usage_permission || ''}
            onValueChange={(value) => setChanges({ ...changes, usage_permission: value || null })}
          >
            <SelectTrigger>
              <SelectValue placeholder={permissionState.isMixed ? 'Mixed values' : 'No change'} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="_none">No change</SelectItem>
              <SelectItem value="evidence">Evidence</SelectItem>
              <SelectItem value="framing">Framing</SelectItem>
              <SelectItem value="reference">Reference only</SelectItem>
              <SelectItem value="forbidden">Forbidden</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Tags */}
        <div className="space-y-2">
          <Label>Tags</Label>
          <div className="flex gap-2 mb-2">
            <button
              onClick={() => setChanges({ ...changes, tagsAction: 'add' })}
              className={`text-xs px-3 py-1 rounded ${
                changes.tagsAction === 'add' 
                  ? 'bg-blue-600 text-white' 
                  : 'bg-slate-200 text-slate-700'
              }`}
            >
              Add to existing
            </button>
            <button
              onClick={() => setChanges({ ...changes, tagsAction: 'replace' })}
              className={`text-xs px-3 py-1 rounded ${
                changes.tagsAction === 'replace' 
                  ? 'bg-blue-600 text-white' 
                  : 'bg-slate-200 text-slate-700'
              }`}
            >
              Replace all
            </button>
          </div>
          <Input
            placeholder="Comma-separated tags"
            value={changes.tags || ''}
            onChange={(e) => setChanges({ ...changes, tags: e.target.value || null })}
          />
        </div>

        {/* Notes */}
        <div className="space-y-2">
          <Label>Notes</Label>
          <div className="flex gap-2 mb-2">
            <button
              onClick={() => setChanges({ ...changes, notesAction: 'append' })}
              className={`text-xs px-3 py-1 rounded ${
                changes.notesAction === 'append' 
                  ? 'bg-blue-600 text-white' 
                  : 'bg-slate-200 text-slate-700'
              }`}
            >
              Append
            </button>
            <button
              onClick={() => setChanges({ ...changes, notesAction: 'replace' })}
              className={`text-xs px-3 py-1 rounded ${
                changes.notesAction === 'replace' 
                  ? 'bg-blue-600 text-white' 
                  : 'bg-slate-200 text-slate-700'
              }`}
            >
              Replace all
            </button>
          </div>
          <Textarea
            placeholder="Add notes..."
            value={changes.notes || ''}
            onChange={(e) => setChanges({ ...changes, notes: e.target.value || null })}
            rows={4}
          />
        </div>

        <div className="flex gap-2 pt-4 border-t">
          <Button onClick={handleApply} disabled={!hasChanges} className="flex-1">
            Review changes
          </Button>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
        </div>
      </div>
    </div>
  );
}