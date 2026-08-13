import React from 'react';
import { Search } from 'lucide-react';
import { Input } from '@/components/ui/input';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';

export default function SessionFilters({ filters, setFilters, owners, categories, regions, showOwner }) {
  const set = (key, value) => setFilters(prev => ({ ...prev, [key]: value }));

  return (
    <div className="pal-card p-4 mb-4 flex flex-col md:flex-row gap-3 md:items-center">
      <div className="relative flex-1 min-w-0">
        <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={filters.search}
          onChange={e => set('search', e.target.value)}
          placeholder="Search title or message text…"
          className="pl-9"
        />
      </div>

      {showOwner && (
        <Select value={filters.owner} onValueChange={v => set('owner', v)}>
          <SelectTrigger className="md:w-48"><SelectValue placeholder="Owner" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All owners</SelectItem>
            {owners.map(o => <SelectItem key={o} value={o}>{o}</SelectItem>)}
          </SelectContent>
        </Select>
      )}

      <Select value={filters.category} onValueChange={v => set('category', v)}>
        <SelectTrigger className="md:w-44"><SelectValue placeholder="Category" /></SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All categories</SelectItem>
          {categories.map(c => <SelectItem key={c} value={c}>{c.replace(/_/g, ' ')}</SelectItem>)}
        </SelectContent>
      </Select>

      <Select value={filters.region} onValueChange={v => set('region', v)}>
        <SelectTrigger className="md:w-36"><SelectValue placeholder="Region" /></SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All regions</SelectItem>
          {regions.map(r => <SelectItem key={r} value={r}>{r}</SelectItem>)}
        </SelectContent>
      </Select>

      <Select value={filters.status} onValueChange={v => set('status', v)}>
        <SelectTrigger className="md:w-40"><SelectValue placeholder="Status" /></SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All statuses</SelectItem>
          <SelectItem value="active">Active</SelectItem>
          <SelectItem value="converted">Converted</SelectItem>
        </SelectContent>
      </Select>
    </div>
  );
}