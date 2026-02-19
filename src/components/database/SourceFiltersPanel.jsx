import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Filter } from 'lucide-react';

export default function SourceFiltersPanel({ filters, setFilters, categories, regions, allTags, clearFilters, sourceCounts }) {
  const updateFilter = (key, value) => {
    setFilters(prev => ({ ...prev, [key]: value }));
  };

  const toggleArrayFilter = (key, value) => {
    setFilters(prev => ({
      ...prev,
      [key]: prev[key].includes(value)
        ? prev[key].filter(v => v !== value)
        : [...prev[key], value]
    }));
  };

  return (
    <div className="w-64 bg-white border-r border-slate-200 p-4 space-y-6 overflow-y-auto" style={{ height: 'calc(100vh - 128px)' }}>
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-slate-900 flex items-center gap-2">
          <Filter className="w-4 h-4" />
          Filters
        </h3>
      </div>

      {/* Type */}
      <div className="space-y-2">
        <Label className="text-sm font-medium text-slate-700">Type</Label>
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <Checkbox
              checked={filters.types.includes('mintel')}
              onCheckedChange={() => toggleArrayFilter('types', 'mintel')}
            />
            <span className="text-sm text-slate-700">Mintel ({sourceCounts.mintel})</span>
          </div>
          <div className="flex items-center gap-2">
            <Checkbox
              checked={filters.types.includes('gnpd')}
              onCheckedChange={() => toggleArrayFilter('types', 'gnpd')}
            />
            <span className="text-sm text-slate-700">GNPD ({sourceCounts.gnpd})</span>
          </div>
          <div className="flex items-center gap-2">
            <Checkbox
              checked={filters.types.includes('report')}
              onCheckedChange={() => toggleArrayFilter('types', 'report')}
            />
            <span className="text-sm text-slate-700">Report ({sourceCounts.report})</span>
          </div>
          <div className="flex items-center gap-2">
            <Checkbox
              checked={filters.types.includes('url')}
              onCheckedChange={() => toggleArrayFilter('types', 'url')}
            />
            <span className="text-sm text-slate-700">URL ({sourceCounts.url})</span>
          </div>
        </div>
      </div>

      {/* Region */}
      <div className="space-y-2">
        <Label className="text-sm font-medium text-slate-700">Region</Label>
        <Select value={filters.region} onValueChange={(value) => updateFilter('region', value)}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All regions</SelectItem>
            {regions.map(region => (
              <SelectItem key={region} value={region}>{region}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Category */}
      <div className="space-y-2">
        <Label className="text-sm font-medium text-slate-700">Category</Label>
        <Select value={filters.category} onValueChange={(value) => updateFilter('category', value)}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All categories</SelectItem>
            {categories.map(cat => (
              <SelectItem key={cat} value={cat}>{cat}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Freshness */}
      <div className="space-y-2">
        <Label className="text-sm font-medium text-slate-700">Freshness</Label>
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <input
              type="radio"
              checked={filters.freshness === 'recent'}
              onChange={() => updateFilter('freshness', 'recent')}
              className="w-4 h-4"
            />
            <span className="text-sm text-slate-700">● Recent (&lt; 6 months)</span>
          </div>
          <div className="flex items-center gap-2">
            <input
              type="radio"
              checked={filters.freshness === 'aging'}
              onChange={() => updateFilter('freshness', 'aging')}
              className="w-4 h-4"
            />
            <span className="text-sm text-slate-700">○ Aging (6-18 months)</span>
          </div>
          <div className="flex items-center gap-2">
            <input
              type="radio"
              checked={filters.freshness === 'outdated'}
              onChange={() => updateFilter('freshness', 'outdated')}
              className="w-4 h-4"
            />
            <span className="text-sm text-slate-700">○ Outdated (&gt; 18 months)</span>
          </div>
          <div className="flex items-center gap-2">
            <input
              type="radio"
              checked={filters.freshness === 'all'}
              onChange={() => updateFilter('freshness', 'all')}
              className="w-4 h-4"
            />
            <span className="text-sm text-slate-700">○ All</span>
          </div>
        </div>
      </div>

      {/* Trust Tier */}
      <div className="space-y-2">
        <Label className="text-sm font-medium text-slate-700">Trust Tier</Label>
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <Checkbox
              checked={filters.trustTier.includes('high')}
              onCheckedChange={() => toggleArrayFilter('trustTier', 'high')}
            />
            <span className="text-sm text-slate-700">High ({sourceCounts.high})</span>
          </div>
          <div className="flex items-center gap-2">
            <Checkbox
              checked={filters.trustTier.includes('medium')}
              onCheckedChange={() => toggleArrayFilter('trustTier', 'medium')}
            />
            <span className="text-sm text-slate-700">Medium ({sourceCounts.medium})</span>
          </div>
          <div className="flex items-center gap-2">
            <Checkbox
              checked={filters.trustTier.includes('low')}
              onCheckedChange={() => toggleArrayFilter('trustTier', 'low')}
            />
            <span className="text-sm text-slate-700">Low ({sourceCounts.low})</span>
          </div>
        </div>
      </div>

      {/* Usage Status */}
      <div className="space-y-2">
        <Label className="text-sm font-medium text-slate-700">Usage Status</Label>
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <input
              type="radio"
              checked={filters.usageStatus === 'all'}
              onChange={() => updateFilter('usageStatus', 'all')}
              className="w-4 h-4"
            />
            <span className="text-sm text-slate-700">All sources</span>
          </div>
          <div className="flex items-center gap-2">
            <input
              type="radio"
              checked={filters.usageStatus === 'active'}
              onChange={() => updateFilter('usageStatus', 'active')}
              className="w-4 h-4"
            />
            <span className="text-sm text-slate-700">Active ({sourceCounts.active})</span>
          </div>
          <div className="flex items-center gap-2">
            <input
              type="radio"
              checked={filters.usageStatus === 'unused'}
              onChange={() => updateFilter('usageStatus', 'unused')}
              className="w-4 h-4"
            />
            <span className="text-sm text-slate-700">Unused ({sourceCounts.unused})</span>
          </div>
        </div>
      </div>

      {/* Uploaded Within */}
      <div className="space-y-2">
        <Label className="text-sm font-medium text-slate-700">Uploaded</Label>
        <Select value={filters.uploadedWithin} onValueChange={(value) => updateFilter('uploadedWithin', value)}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All time</SelectItem>
            <SelectItem value="30">Last 30 days</SelectItem>
            <SelectItem value="90">Last 90 days</SelectItem>
            <SelectItem value="365">Last year</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Show Archived */}
      <div className="flex items-center gap-2">
        <Checkbox
          checked={filters.showArchived}
          onCheckedChange={(checked) => updateFilter('showArchived', checked)}
        />
        <span className="text-sm text-slate-700">Show archived</span>
      </div>

      {/* Clear All */}
      <Button
        variant="outline"
        size="sm"
        onClick={clearFilters}
        className="w-full"
      >
        Clear all filters
      </Button>
    </div>
  );
}