import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { X, Shield, Tag, Archive } from 'lucide-react';
import { toast } from 'sonner';

export default function BulkEditKnowledgePanel({ selectedIds, onClearSelection }) {
  const queryClient = useQueryClient();
  const [action, setAction] = useState('');

  const bulkUpdateMutation = useMutation({
    mutationFn: async (updateData) => {
      const promises = selectedIds.map(id =>
        base44.entities.Source.update(id, updateData)
      );
      await Promise.all(promises);
    },
    onSuccess: () => {
      queryClient.invalidateQueries(['knowledgeSources']);
      toast.success(`Updated ${selectedIds.length} sources`);
      onClearSelection();
      setAction('');
    },
    onError: (error) => {
      toast.error('Bulk update failed: ' + error.message);
    }
  });

  const handleAction = () => {
    if (!action) return;

    if (action === 'archive') {
      if (confirm(`Archive ${selectedIds.length} selected sources?`)) {
        bulkUpdateMutation.mutate({ is_archived: true });
      }
    }
  };

  const handleTrustTierChange = (value) => {
    bulkUpdateMutation.mutate({ trust_tier: value });
  };

  const handleSubtypeChange = (value) => {
    bulkUpdateMutation.mutate({ knowledge_subtype: value });
  };

  return (
    <Card className="fixed bottom-0 left-0 right-0 z-50 border-t-4 border-blue-600 shadow-2xl">
      <CardContent className="p-4">
        <div className="max-w-[1600px] mx-auto flex items-center gap-4">
          <div className="flex items-center gap-2">
            <div className="w-10 h-10 bg-blue-600 text-white rounded-full flex items-center justify-center font-bold">
              {selectedIds.length}
            </div>
            <span className="text-sm font-medium text-slate-900">
              {selectedIds.length} selected
            </span>
          </div>

          <div className="h-8 w-px bg-slate-300" />

          {/* Trust Tier */}
          <div className="flex items-center gap-2">
            <Shield className="w-4 h-4 text-slate-600" />
            <Select onValueChange={handleTrustTierChange}>
              <SelectTrigger className="h-8 w-40 text-xs">
                <SelectValue placeholder="Set Trust Tier" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="approved">Approved</SelectItem>
                <SelectItem value="draft">Draft</SelectItem>
                <SelectItem value="external_reference">External Reference</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Subtype */}
          <div className="flex items-center gap-2">
            <Tag className="w-4 h-4 text-slate-600" />
            <Select onValueChange={handleSubtypeChange}>
              <SelectTrigger className="h-8 w-48 text-xs">
                <SelectValue placeholder="Set Subtype" />
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

          {/* Archive */}
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              setAction('archive');
              handleAction();
            }}
            className="h-8 text-xs"
          >
            <Archive className="w-3 h-3 mr-1" />
            Archive
          </Button>

          <div className="flex-1" />

          <Button
            variant="ghost"
            size="sm"
            onClick={onClearSelection}
            className="h-8 text-xs"
          >
            <X className="w-3 h-3 mr-1" />
            Clear Selection
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}