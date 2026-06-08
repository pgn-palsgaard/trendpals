import React, { useState, useMemo } from 'react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { format } from 'date-fns';
import RagSourceTable from './RagSourceTable';

const REGIONS = ['ASPAC', 'AMERICAS', 'EMEC', 'IMEA', 'Global'];
const CATEGORIES = ['Bakery', 'Confectionery', 'Dairy', 'Feed', 'Fine Food', 'Ice Cream', 'Lipid', 'Meat', 'Other Food Applications', 'PCI', 'Polymer', 'Tech'];

const SOURCE_TYPE_LABELS = {
  mintel:      'Mintel',
  market_intel:'Trade/External',
  url:         'Web',
  report:      'Report',
};

export default function MarketIntelLibrary() {
  const [regionFilter, setRegionFilter] = useState('all');
  const [categoryFilter, setCategoryFilter] = useState('all');

  const applyExtraFilters = useMemo(() => {
    if (regionFilter === 'all' && categoryFilter === 'all') return undefined;
    return (rows) => rows.filter(s => {
      const matchRegion = regionFilter === 'all' || s.region_code === regionFilter;
      const matchCategory = categoryFilter === 'all' || s.category === categoryFilter;
      return matchRegion && matchCategory;
    });
  }, [regionFilter, categoryFilter]);

  const extraColumns = [
    {
      key: 'source_label',
      header: 'Source',
      render: (s) => (
        <div className="text-xs text-slate-600">
          {s.publisher && <p className="font-medium">{s.publisher}</p>}
          <p className="text-slate-400">{SOURCE_TYPE_LABELS[s.source_type] || s.source_type || '—'}</p>
        </div>
      ),
    },
    {
      key: 'published',
      header: 'Published',
      render: (s) => (
        <span className="text-xs text-slate-600">
          {s.date_published ? format(new Date(s.date_published), 'MMM yyyy') : '—'}
        </span>
      ),
    },
  ];

  const ExtraFilterBar = (
    <div className="flex items-center gap-3">
      <Select value={regionFilter} onValueChange={setRegionFilter}>
        <SelectTrigger className="w-40">
          <SelectValue placeholder="All regions" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All regions</SelectItem>
          {REGIONS.map(r => <SelectItem key={r} value={r}>{r}</SelectItem>)}
        </SelectContent>
      </Select>
      <Select value={categoryFilter} onValueChange={setCategoryFilter}>
        <SelectTrigger className="w-44">
          <SelectValue placeholder="All categories" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All categories</SelectItem>
          {CATEGORIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
        </SelectContent>
      </Select>
    </div>
  );

  return (
    <RagSourceTable
      sourceTypeFilter={['mintel', 'market_intel', 'url', 'report']}
      title="Market Intelligence"
      subtitle="Mintel reports, trade press, consumer research, and external trend data"
      applyExtraFilters={applyExtraFilters}
      ExtraFilterBar={ExtraFilterBar}
      extraColumns={extraColumns}
    />
  );
}