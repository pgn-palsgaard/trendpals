import React, { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Input } from '@/components/ui/input';
import { Search } from 'lucide-react';
import { toast } from 'sonner';
import TrendCard from '@/components/trendlibrary/TrendCard';
import TrendDetailPanel from '@/components/trendlibrary/TrendDetailPanel';
import TrendEditModal from '@/components/trendlibrary/TrendEditModal';
import DriverFilterPills from '@/components/trendlibrary/DriverFilterPills';
import MegaTrendDetailPanel from '@/components/trendlibrary/MegaTrendDetailPanel';

const CATEGORIES = [
  { value: 'bakery',                  label: 'Bakery' },
  { value: 'condiments',              label: 'Condiments' },
  { value: 'chocolate_confectionery', label: 'Chocolate & Confectionery' },
  { value: 'dairy',                   label: 'Dairy' },
  { value: 'ice_cream',               label: 'Ice Cream' },
  { value: 'meat',                    label: 'Processed meat' },
  { value: 'oils_fats',               label: 'Oils & Fats' },
  { value: 'plant_based',             label: 'Plant-based products' },
  { value: 'rutf_rusf',               label: 'RUTF and RUSF' },
  { value: 'needs_human_review',      label: 'Needs review' },
];
const TABS = [
  { key: 'pending', label: 'Pending review' },
  { key: 'active', label: 'Active' },
  { key: 'all', label: 'All' },
];

export default function TrendLibrary() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [tab, setTab] = useState('pending');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [search, setSearch] = useState('');
  const [megaTrendFilter, setMegaTrendFilter] = useState(null);
  const [selectedTrend, setSelectedTrend] = useState(null);
  const [editingTrend, setEditingTrend] = useState(null);
  const [selectedMegaTrend, setSelectedMegaTrend] = useState(null);

  const { data: trends = [], isLoading } = useQuery({
    queryKey: ['globalTrends'],
    queryFn: () => base44.entities.GlobalTrend.list(),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }) => base44.entities.GlobalTrend.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['globalTrends'] });
    },
  });

  const handleActivate = async (trend) => {
    await updateMutation.mutateAsync({ id: trend.id, data: { is_active: true } });
    if (selectedTrend?.id === trend.id) setSelectedTrend({ ...selectedTrend, is_active: true });
    toast.success(`"${trend.trend_name}" is now Active`);
  };

  const handleDeactivate = async (trend) => {
    await updateMutation.mutateAsync({ id: trend.id, data: { is_active: false } });
    if (selectedTrend?.id === trend.id) setSelectedTrend({ ...selectedTrend, is_active: false });
    toast.success(`"${trend.trend_name}" moved to Pending review`);
  };

  const handleArchive = async (trend) => {
    await updateMutation.mutateAsync({ id: trend.id, data: { is_active: false } });
    if (selectedTrend?.id === trend.id) setSelectedTrend(null);
    toast.warning(`"${trend.trend_name}" set to Pending review (no archive state in schema)`);
  };

  const handleEdit = (trend) => {
    setEditingTrend(trend);
  };

  const handleSaveEdit = async (payload) => {
    await updateMutation.mutateAsync({ id: editingTrend.id, data: payload });
    if (selectedTrend?.id === editingTrend.id) {
      setSelectedTrend({ ...selectedTrend, ...payload });
    }
    setEditingTrend(null);
    toast.success('Trend updated');
  };

  const filtered = useMemo(() => {
    return trends.filter(t => {
      if (tab === 'pending' && t.is_active !== false) return false;
      if (tab === 'active' && t.is_active !== true) return false;
      if (categoryFilter && t.category !== categoryFilter) return false;
      if (megaTrendFilter && t.mega_trend !== megaTrendFilter) return false;
      if (search) {
        const q = search.toLowerCase();
        const nameMatch = t.trend_name?.toLowerCase().includes(q);
        const kwMatch = t.trend_keywords?.some(k => k.toLowerCase().includes(q));
        if (!nameMatch && !kwMatch) return false;
      }
      return true;
    });
  }, [trends, tab, categoryFilter, search, megaTrendFilter]);

  // Group by category
  const grouped = useMemo(() => {
    const map = {};
    filtered.forEach(t => {
      const cat = t.category || 'Other';
      if (!map[cat]) map[cat] = [];
      map[cat].push(t);
    });
    return map;
  }, [filtered]);

  const CATEGORY_LABELS = Object.fromEntries(CATEGORIES.map(c => [c.value, c.label]));
  const categoryOrder = CATEGORIES.map(c => c.value).filter(v => grouped[v]);

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="max-w-6xl mx-auto px-4 md:px-6 py-8">
        {/* Page header */}
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-slate-900">Library</h1>
          <p className="text-sm text-slate-500 mt-1">Review and manage the GlobalTrend taxonomy used across TrendPals</p>
        </div>

        {/* Driver filter pills */}
        <DriverFilterPills
          trends={trends}
          activeMegaTrend={megaTrendFilter}
          onSelect={setMegaTrendFilter}
          onOpenDetail={setSelectedMegaTrend}
        />

        {/* Filters row */}
        <div className="flex flex-col md:flex-row md:items-center gap-3 mb-6">
          {/* Segmented tabs */}
          <div className="flex items-center bg-white border border-slate-200 rounded-lg p-1 gap-1 shrink-0">
            {TABS.map(t => (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                  tab === t.key
                    ? 'bg-slate-900 text-white'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>

          {/* Category filter */}
          <select
            value={categoryFilter}
            onChange={e => setCategoryFilter(e.target.value)}
            className="border border-slate-200 bg-white rounded-lg px-3 py-2 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="">All categories</option>
            {CATEGORIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
          </select>

          {/* Search */}
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <Input
              placeholder="Search by name or keyword…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="pl-9 bg-white"
            />
          </div>

          {/* Clear mega-trend filter */}
          {megaTrendFilter && (
            <button
              onClick={() => setMegaTrendFilter(null)}
              className="flex items-center gap-1 text-xs font-medium text-blue-600 hover:text-blue-800 bg-blue-50 border border-blue-200 px-2.5 py-1.5 rounded-lg shrink-0"
            >
              ✕ Clear: {megaTrendFilter}
            </button>
          )}

          {/* Count */}
          <span className="text-sm text-slate-500 shrink-0">
            Showing <span className="font-medium text-slate-700">{filtered.length}</span> of <span className="font-medium text-slate-700">{trends.length}</span> trends
          </span>
        </div>

        {/* Content */}
        {isLoading ? (
          <div className="flex items-center justify-center py-24">
            <div className="w-8 h-8 border-4 border-slate-200 border-t-slate-700 rounded-full animate-spin" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-24 text-slate-400">
            <p className="text-lg font-medium">No trends found</p>
            <p className="text-sm mt-1">Try adjusting your filters or search</p>
          </div>
        ) : (
          <div className="space-y-8">
            {categoryOrder.map(cat => (
              <div key={cat}>
                <div className="flex items-center gap-3 mb-3">
                  <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wider">{CATEGORY_LABELS[cat] || cat}</h2>
                  <div className="flex-1 h-px bg-slate-200" />
                  <span className="text-xs text-slate-400">{grouped[cat].length}</span>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
                  {grouped[cat].map(trend => (
                    <TrendCard
                      key={trend.id}
                      trend={trend}
                      onActivate={handleActivate}
                      onDeactivate={handleDeactivate}
                      onArchive={handleArchive}
                      onEdit={handleEdit}
                      onViewDetails={(trend) => navigate(`/TrendHub/${trend.id}`)}
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Detail panel */}
      {selectedTrend && (
        <TrendDetailPanel
          trend={selectedTrend}
          onClose={() => setSelectedTrend(null)}
          onActivate={handleActivate}
          onDeactivate={handleDeactivate}
          onArchive={handleArchive}
          onEdit={handleEdit}
        />
      )}

      {/* Mega-trend detail panel */}
      {selectedMegaTrend && (
        <MegaTrendDetailPanel
          megaTrend={selectedMegaTrend}
          linkedTrends={trends.filter(t => t.mega_trend === selectedMegaTrend.mega_trend_name)}
          onClose={() => setSelectedMegaTrend(null)}
          onSelectTrend={(t) => { setSelectedMegaTrend(null); setSelectedTrend(t); }}
        />
      )}

      {/* Edit modal */}
      {editingTrend && (
        <TrendEditModal
          trend={editingTrend}
          onSave={handleSaveEdit}
          onClose={() => setEditingTrend(null)}
          saving={updateMutation.isPending}
        />
      )}
    </div>
  );
}