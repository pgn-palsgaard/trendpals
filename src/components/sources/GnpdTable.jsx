import React, { useState, useMemo } from 'react';
import { CATEGORY_LABELS } from '@/lib/palsgaardCategoryMapping';
import { base44 } from '@/api/base44Client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { toast } from 'sonner';
import { Upload, Search, Database, CheckCircle2, AlertCircle, Loader2, FileText } from 'lucide-react';
import { format } from 'date-fns';
import GnpdDetailPanel from './GnpdDetailPanel';
import KnowledgeUploadModal from '../knowledge/KnowledgeUploadModal';

const REGIONS = ['ASPAC', 'AMERICAS', 'EMEC', 'IMEA', 'Global'];
// Source.category now uses canonical Palsgaard keys (post Phase-3 migration).
// GNPD source uploads are classified by autoExtractMetadata using canonical keys.
// Filter values must match what is stored in Source.category.
const CATEGORIES = [
  'bakery', 'condiments', 'chocolate_confectionery', 'dairy', 'ice_cream',
  'meat', 'oils_fats', 'plant_based', 'rutf_rusf', 'needs_human_review',
].map(value => ({ value, label: CATEGORY_LABELS[value] }));

const GNPD_STATUS_CFG = {
  pending:    { label: 'Pending',    cls: 'bg-amber-100 text-amber-700' },
  processing: { label: 'Processing', cls: 'bg-blue-100 text-blue-700' },
  ready:      { label: 'Ready',      cls: 'bg-green-100 text-green-700' },
  failed:     { label: 'Failed',     cls: 'bg-red-100 text-red-700' },
};

const MAPPING_STATUS_CFG = {
  not_started: { label: 'Not started', cls: 'bg-slate-100 text-slate-500' },
  detecting:   { label: 'Detecting',   cls: 'bg-blue-100 text-blue-700' },
  complete:    { label: 'Complete',     cls: 'bg-green-100 text-green-700' },
  failed:      { label: 'Failed',       cls: 'bg-red-100 text-red-700' },
};

function StatusBadge({ value, cfg }) {
  const c = cfg[value] || { label: value || '—', cls: 'bg-slate-100 text-slate-600' };
  return <span className={`inline-flex text-xs font-medium px-2 py-0.5 rounded-full ${c.cls}`}>{c.label}</span>;
}

export default function GnpdTable() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [regionFilter, setRegionFilter] = useState('all');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [openSourceId, setOpenSourceId] = useState(null);
  const [showUploadModal, setShowUploadModal] = useState(false);

  const queryKey = ['gnpdSources'];

  const { data: sources = [], isLoading } = useQuery({
    queryKey,
    queryFn: () => base44.entities.Source.filter({ source_type: 'gnpd' }, '-created_date', 300),
  });

  const stats = useMemo(() => ({
    total: sources.length,
    ready: sources.filter(s => s.pipeline_stage === 'gnpd_ready').length,
    failed: sources.filter(s => s.pipeline_stage === 'failed' || s.gnpd_processing_status === 'failed').length,
  }), [sources]);

  const visibleRows = useMemo(() => {
    let rows = [...sources];
    if (search.trim()) {
      const q = search.toLowerCase();
      rows = rows.filter(s =>
        s.title?.toLowerCase().includes(q) ||
        s.tags?.some(t => t.toLowerCase().includes(q))
      );
    }
    if (regionFilter !== 'all') rows = rows.filter(s => s.region_code === regionFilter);
    if (categoryFilter !== 'all') rows = rows.filter(s => s.category === categoryFilter);
    return rows;
  }, [sources, search, regionFilter, categoryFilter]);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-slate-400" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="max-w-[1600px] mx-auto p-6 space-y-5">

        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">GNPD Product Data</h1>
            <p className="text-sm text-slate-500 mt-0.5">Product launch exports from Mintel GNPD — used in account intelligence reports</p>
          </div>
          <Button className="bg-blue-600 hover:bg-blue-700" onClick={() => setShowUploadModal(true)}>
            <Upload className="w-4 h-4 mr-2" />
            Upload GNPD Export
          </Button>
        </div>

        {/* Stat cards */}
        <div className="grid grid-cols-3 gap-3">
          {[
            { label: 'Total Uploads',    icon: Database,      color: 'text-slate-600',  bg: 'bg-slate-100', count: stats.total },
            { label: 'Ready for Use',    icon: CheckCircle2,  color: 'text-green-600',  bg: 'bg-green-50',  count: stats.ready },
            { label: 'Failed Processing',icon: AlertCircle,   color: 'text-red-600',    bg: 'bg-red-50',    count: stats.failed },
          ].map(({ label, icon: Icon, color, bg, count }) => (
            <div key={label} className="bg-white border border-slate-200 rounded-xl p-4">
              <div className={`inline-flex p-2 rounded-lg mb-2 ${bg}`}>
                <Icon className={`w-4 h-4 ${color}`} />
              </div>
              <p className={`text-xl font-bold ${color}`}>{count}</p>
              <p className="text-xs text-slate-500 mt-0.5">{label}</p>
            </div>
          ))}
        </div>

        {/* Filters */}
        <div className="flex items-center gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <Input
              placeholder="Search by title or tag..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>
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
              {CATEGORIES.map(c => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>

        {/* Table */}
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50">
                    <th className="text-left px-4 py-3 font-semibold text-slate-700">Title</th>
                    <th className="text-left px-4 py-3 font-semibold text-slate-700 whitespace-nowrap">Uploaded</th>
                    <th className="text-left px-4 py-3 font-semibold text-slate-700">Region</th>
                    <th className="text-left px-4 py-3 font-semibold text-slate-700">Category</th>
                    <th className="text-right px-4 py-3 font-semibold text-slate-700">Rows</th>
                    <th className="text-left px-4 py-3 font-semibold text-slate-700">Status</th>
                    <th className="text-left px-4 py-3 font-semibold text-slate-700">Mapping</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {visibleRows.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="text-center py-12 text-slate-400">
                        No GNPD exports match the current filter.
                      </td>
                    </tr>
                  ) : visibleRows.map(s => (
                    <tr
                      key={s.id}
                      className={`cursor-pointer hover:bg-slate-50 transition-colors ${openSourceId === s.id ? 'border-l-4 border-l-blue-500' : ''}`}
                      onClick={() => setOpenSourceId(s.id)}
                    >
                      <td className="px-4 py-3 max-w-xs">
                        <div className="flex items-start gap-2">
                          <FileText className="w-4 h-4 text-slate-400 shrink-0 mt-0.5" />
                          <p className="font-medium text-slate-900 truncate">{s.title || 'Untitled'}</p>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-xs text-slate-500 whitespace-nowrap">
                        {s.created_date ? format(new Date(s.created_date), 'MMM d, yyyy') : '—'}
                      </td>
                      <td className="px-4 py-3 text-sm text-slate-600">{s.region_code || '—'}</td>
                      <td className="px-4 py-3 text-sm text-slate-600">{s.category || '—'}</td>
                      <td className="px-4 py-3 text-right text-slate-600 text-sm">
                        {s.gnpd_row_count?.toLocaleString() || '—'}
                      </td>
                      <td className="px-4 py-3">
                        <StatusBadge value={s.gnpd_processing_status} cfg={GNPD_STATUS_CFG} />
                      </td>
                      <td className="px-4 py-3">
                        <StatusBadge value={s.gnpd_mapping_status} cfg={MAPPING_STATUS_CFG} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      </div>

      {showUploadModal && <KnowledgeUploadModal onClose={() => setShowUploadModal(false)} />}

      <GnpdDetailPanel
        sourceId={openSourceId}
        onClose={() => setOpenSourceId(null)}
        onRefresh={() => queryClient.invalidateQueries({ queryKey })}
      />
    </div>
  );
}