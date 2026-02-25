import React from 'react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { X } from 'lucide-react';

export default function KnowledgeFilters({ filters, onChange, folderPaths, availableTags }) {
  const handleTagToggle = (tag) => {
    const newTags = filters.tags.includes(tag)
      ? filters.tags.filter(t => t !== tag)
      : [...filters.tags, tag];
    onChange({ ...filters, tags: newTags });
  };

  return (
    <div className="space-y-3 p-3 border-t">
      <div className="grid grid-cols-3 gap-3">
        {/* Subtype Filter */}
        <div>
          <label className="text-xs font-medium text-slate-700 mb-1 block">Subtype</label>
          <Select
            value={filters.subtype}
            onValueChange={(value) => onChange({ ...filters, subtype: value })}
          >
            <SelectTrigger className="h-9 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Subtypes</SelectItem>
              <SelectItem value="product_sheet">Product Sheet</SelectItem>
              <SelectItem value="technical_doc">Technical Doc</SelectItem>
              <SelectItem value="capability_overview">Capability Overview</SelectItem>
              <SelectItem value="case_study">Case Study</SelectItem>
              <SelectItem value="certification">Certification</SelectItem>
              <SelectItem value="sustainability">Sustainability</SelectItem>
              <SelectItem value="application_note">Application Note</SelectItem>
              <SelectItem value="other">Other</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Trust Tier Filter */}
        <div>
          <label className="text-xs font-medium text-slate-700 mb-1 block">Trust Tier</label>
          <Select
            value={filters.trust_tier}
            onValueChange={(value) => onChange({ ...filters, trust_tier: value })}
          >
            <SelectTrigger className="h-9 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Tiers</SelectItem>
              <SelectItem value="approved">Approved</SelectItem>
              <SelectItem value="draft">Draft</SelectItem>
              <SelectItem value="external_reference">External Reference</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Folder Path Filter */}
        <div>
          <label className="text-xs font-medium text-slate-700 mb-1 block">Folder</label>
          <Select
            value={filters.folder_path}
            onValueChange={(value) => onChange({ ...filters, folder_path: value })}
          >
            <SelectTrigger className="h-9 text-xs">
              <SelectValue placeholder="All Folders" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={null}>All Folders</SelectItem>
              {folderPaths.map(path => (
                <SelectItem key={path} value={path}>{path}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Tag Filter */}
      {availableTags.length > 0 && (
        <div>
          <label className="text-xs font-medium text-slate-700 mb-2 block">Tags</label>
          <div className="flex flex-wrap gap-2">
            {availableTags.slice(0, 20).map(tag => (
              <Badge
                key={tag}
                variant={filters.tags.includes(tag) ? 'default' : 'outline'}
                className="cursor-pointer hover:bg-slate-100 text-xs"
                onClick={() => handleTagToggle(tag)}
              >
                {tag}
                {filters.tags.includes(tag) && (
                  <X className="w-3 h-3 ml-1" />
                )}
              </Badge>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}