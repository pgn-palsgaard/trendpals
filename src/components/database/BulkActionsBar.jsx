import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tag, Archive, Trash2, Download, X } from 'lucide-react';
import { toast } from 'sonner';

export default function BulkActionsBar({ selectedIds, onClear, sources }) {
  const queryClient = useQueryClient();
  const [action, setAction] = useState('');

  const bulkUpdateMutation = useMutation({
    mutationFn: async ({ ids, data }) => {
      for (const id of ids) {
        await base44.entities.Source.update(id, data);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sourcesDatabase'] });
      toast.success(`Updated ${selectedIds.length} sources ✓`);
      onClear();
    },
    onError: () => {
      toast.error('Failed to update sources');
    }
  });

  const bulkDeleteMutation = useMutation({
    mutationFn: async (ids) => {
      for (const id of ids) {
        await base44.entities.Source.delete(id);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sourcesDatabase'] });
      toast.success(`Deleted ${selectedIds.length} sources ✓`);
      onClear();
    },
    onError: () => {
      toast.error('Failed to delete sources');
    }
  });

  const handleArchive = () => {
    if (confirm(`Archive ${selectedIds.length} source${selectedIds.length > 1 ? 's' : ''}?`)) {
      bulkUpdateMutation.mutate({ ids: selectedIds, data: { is_archived: true } });
    }
  };

  const handleDelete = () => {
    if (confirm(`Delete ${selectedIds.length} source${selectedIds.length > 1 ? 's' : ''}?\n\nThis cannot be undone.`)) {
      bulkDeleteMutation.mutate(selectedIds);
    }
  };

  const handleTrustTierChange = (tier) => {
    bulkUpdateMutation.mutate({ ids: selectedIds, data: { trust_tier: tier } });
  };

  const handleExport = () => {
    const selectedSources = sources.filter(s => selectedIds.includes(s.id));
    const csv = [
      ['Title', 'Type', 'Region', 'Category', 'Date', 'Trust Tier', 'Usage Permission', 'Uploaded'].join(','),
      ...selectedSources.map(s => [
        s.title,
        s.source_type,
        s.region || '',
        s.category || '',
        s.date || '',
        s.trust_tier || '',
        s.usage_permission || '',
        new Date(s.created_date).toLocaleDateString()
      ].join(','))
    ].join('\n');

    const blob = new Blob([csv], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `sources-export-${new Date().toISOString().split('T')[0]}.csv`;
    document.body.appendChild(a);
    a.click();
    window.URL.revokeObjectURL(url);
    a.remove();
    toast.success('Exported to CSV ✓');
  };

  return (
    <div className="fixed bottom-6 left-1/2 transform -translate-x-1/2 z-50">
      <div className="bg-slate-900 text-white rounded-lg shadow-2xl px-6 py-4 flex items-center gap-4">
        <span className="font-medium">
          {selectedIds.length} selected
        </span>
        
        <div className="h-6 w-px bg-slate-600" />

        <div className="flex items-center gap-2">
          <Select value={action} onValueChange={setAction}>
            <SelectTrigger className="w-48 bg-slate-800 border-slate-700 text-white">
              <SelectValue placeholder="Change trust tier..." />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="high" onClick={() => handleTrustTierChange('high')}>Set to High</SelectItem>
              <SelectItem value="medium" onClick={() => handleTrustTierChange('medium')}>Set to Medium</SelectItem>
              <SelectItem value="low" onClick={() => handleTrustTierChange('low')}>Set to Low</SelectItem>
            </SelectContent>
          </Select>

          <Button variant="outline" size="sm" onClick={handleExport} className="bg-slate-800 border-slate-700 text-white hover:bg-slate-700">
            <Download className="w-4 h-4 mr-2" />
            Export
          </Button>

          <Button variant="outline" size="sm" onClick={handleArchive} className="bg-slate-800 border-slate-700 text-white hover:bg-slate-700">
            <Archive className="w-4 h-4 mr-2" />
            Archive
          </Button>

          <Button variant="outline" size="sm" onClick={handleDelete} className="bg-red-900 border-red-800 text-white hover:bg-red-800">
            <Trash2 className="w-4 h-4 mr-2" />
            Delete
          </Button>
        </div>

        <div className="h-6 w-px bg-slate-600" />

        <Button variant="ghost" size="sm" onClick={onClear} className="text-white hover:bg-slate-800">
          <X className="w-4 h-4" />
        </Button>
      </div>
    </div>
  );
}