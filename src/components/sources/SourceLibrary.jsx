import React, { useState, useMemo, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { toast } from 'sonner';
import {
  Upload, Search, Trash2, CheckCircle2, XCircle, Clock, AlertCircle,
  FileText, SkipForward, Loader2, Eye, AlertTriangle, Database
} from 'lucide-react';
import DeleteSourcesDialog from './DeleteSourcesDialog';
import SourceDetailPanel from './SourceDetailPanel';
import KnowledgeUploadModal from '../knowledge/KnowledgeUploadModal';

// ─── helpers ──────────────────────────────────────────────────────────────────
const PIPELINE_BADGE = {
  uploaded:    { label: 'Uploaded',    cls: 'bg-slate-100 text-slate-600' },
  extracting:  { label: 'Extracting',  cls: 'bg-blue-100 text-blue-700' },
  extracted:   { label: 'Extracted',   cls: 'bg-green-100 text-green-700' },
  gnpd_ready:  { label: 'GNPD Ready',  cls: 'bg-blue-100 text-blue-700' },
  skipped:     { label: 'Skipped',     cls: 'bg-slate-100 text-slate-400' },
  failed:      { label: 'Failed',      cls: 'bg-red-100 text-red-700' },
};

const REVIEW_BADGE = {
  pending:  { label: 'Pending',  cls: 'bg-amber-100 text-amber-700' },
  approved: { label: 'Approved', cls: 'bg-green-100 text-green-700' },
  rejected: { label: 'Rejected', cls: 'bg-red-100 text-red-700' },
};

function PBadge({ stage }) {
  const cfg = PIPELINE_BADGE[stage] || { label: stage, cls: 'bg-slate-100 text-slate-600' };
  return <span className={`inline-flex text-xs font-medium px-2 py-0.5 rounded-full ${cfg.cls}`}>{cfg.label}</span>;
}

function RBadge({ status }) {
  const cfg = REVIEW_BADGE[status] || { label: status, cls: 'bg-slate-100 text-slate-600' };
  return <span className={`inline-flex text-xs font-medium px-2 py-0.5 rounded-full ${cfg.cls}`}>{cfg.label}</span>;
}

function tabFilter(tab, s) {
  switch (tab) {
    case 'awaiting_review': return s.pipeline_stage === 'extracted' && s.review_status === 'pending';
    case 'approved':        return s.review_status === 'approved';
    case 'rejected':        return s.review_status === 'rejected';
    case 'failed':          return s.pipeline_stage === 'failed';
    case 'uploaded':        return s.pipeline_stage === 'uploaded';
    case 'skipped':         return s.pipeline_stage === 'skipped';
    case 'gnpd_ready':      return s.pipeline_stage === 'gnpd_ready';
    case 'deletion_pending':return Array.isArray(s.tags) && s.tags.includes('deletion_pending');
    default:                return true;
  }
}

// ─── main component ───────────────────────────────────────────────────────────
export default function SourceLibrary({ sourceTypeFilter, title, subtitle }) {
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState('awaiting_review');
  const [search, setSearch] = useState('');
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [bulkAction, setBulkAction] = useState('');
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [applying, setApplying] = useState(false);
  const [openSourceId, setOpenSourceId] = useState(null);

  const queryKey = ['sourceLibrary', JSON.stringify(sourceTypeFilter)];

  const { data: sources = [], isLoading, refetch } = useQuery({
    queryKey,
    queryFn: async () => {
      let query = {};
      if (Array.isArray(sourceTypeFilter)) {
        // fetch each type and merge
        const results = await Promise.all(
          sourceTypeFilter.map(t => base44.entities.Source.filter({ source_type: t }, '-created_date', 500))
        );
        return results.flat();
      } else if (sourceTypeFilter) {
        query.source_type = sourceTypeFilter;
      }
      return await base44.entities.Source.filter(query, '-created_date', 500);
    }
  });

  // reset selection when tab changes
  useEffect(() => { setSelectedIds(new Set()); }, [activeTab]);

  // ── counts ──
  const counts = useMemo(() => ({
    awaiting_review:  sources.filter(s => tabFilter('awaiting_review', s)).length,
    approved:         sources.filter(s => tabFilter('approved', s)).length,
    rejected:         sources.filter(s => tabFilter('rejected', s)).length,
    failed:           sources.filter(s => tabFilter('failed', s)).length,
    uploaded:         sources.filter(s => tabFilter('uploaded', s)).length,
    skipped:          sources.filter(s => tabFilter('skipped', s)).length,
    gnpd_ready:       sources.filter(s => tabFilter('gnpd_ready', s)).length,
    deletion_pending: sources.filter(s => tabFilter('deletion_pending', s)).length,
    all:              sources.length,
  }), [sources]);

  // ── filtered + searched rows ──
  const visibleRows = useMemo(() => {
    let rows = sources.filter(s => tabFilter(activeTab, s));
    if (search.trim()) {
      const q = search.toLowerCase();
      rows = rows.filter(s =>
        s.title?.toLowerCase().includes(q) ||
        s.folder_path?.toLowerCase().includes(q) ||
        s.tags?.some(t => t.toLowerCase().includes(q))
      );
    }
    return rows;
  }, [sources, activeTab, search]);

  // ── select all ──
  const allSelected = visibleRows.length > 0 && visibleRows.every(r => selectedIds.has(r.id));
  const toggleAll = () => {
    if (allSelected) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(visibleRows.map(r => r.id)));
    }
  };
  const toggleOne = (id) => {
    const next = new Set(selectedIds);
    next.has(id) ? next.delete(id) : next.add(id);
    setSelectedIds(next);
  };

  // ── bulk apply ──
  const handleApply = async () => {
    if (!bulkAction || selectedIds.size === 0) return;
    if (bulkAction === 'delete') {
      setShowDeleteDialog(true);
      return;
    }
    setApplying(true);
    const ids = [...selectedIds];
    try {
      if (bulkAction === 'approve') {
        await Promise.all(ids.map(id => base44.entities.Source.update(id, {
          review_status: 'approved',
          reviewed_at: new Date().toISOString(),
        })));
        toast.success(`${ids.length} source(s) approved`);
      } else if (bulkAction === 'reject') {
        await Promise.all(ids.map(id => base44.entities.Source.update(id, {
          review_status: 'rejected',
          reviewed_at: new Date().toISOString(),
        })));
        toast.success(`${ids.length} source(s) rejected`);
      } else if (bulkAction === 'retry') {
        await Promise.all(ids.map(id => base44.entities.Source.update(id, {
          pipeline_stage: 'uploaded',
          failure_reason: null,
          retry_count: 0,
          last_retry_at: new Date().toISOString(),
        })));
        toast.success(`${ids.length} source(s) reset to queue for retry`);
      } else if (bulkAction === 'mark_deletion') {
        const selected = sources.filter(s => ids.includes(s.id));
        await Promise.all(selected.map(s => {
          const tags = Array.from(new Set([...(s.tags || []), 'deletion_pending']));
          return base44.entities.Source.update(s.id, { tags });
        }));
        toast.success(`${ids.length} source(s) marked for deletion`);
      }
      setSelectedIds(new Set());
      setBulkAction('');
      queryClient.invalidateQueries({ queryKey });
    } catch (e) {
      toast.error(e.message);
    } finally {
      setApplying(false);
    }
  };

  const handleDeleteConfirm = async () => {
    const ids = [...selectedIds];
    const res = await base44.functions.invoke('deleteSourceRecords', { ids });
    const data = res.data;
    if (data.deleted > 0) toast.success(`${data.deleted} source(s) deleted`);
    if (data.failed > 0) toast.error(`${data.failed} failed to delete`);
    setShowDeleteDialog(false);
    setSelectedIds(new Set());
    setBulkAction('');
    queryClient.invalidateQueries({ queryKey });
  };

  const selectedSources = sources.filter(s => selectedIds.has(s.id));

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

        {/* A) Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">{title}</h1>
            {subtitle && <p className="text-sm text-slate-500 mt-0.5">{subtitle}</p>}
          </div>
          <Button className="bg-blue-600 hover:bg-blue-700" onClick={() => setShowUploadModal(true)}>
            <Upload className="w-4 h-4 mr-2" />
            Upload Files
          </Button>
        </div>

        {/* B) Awaiting review action card */}
        {counts.awaiting_review > 0 && activeTab !== 'awaiting_review' && (
          <div className="flex items-center justify-between bg-amber-50 border border-amber-200 rounded-xl px-5 py-4">
            <div className="flex items-center gap-3">
              <Eye className="w-5 h-5 text-amber-600 shrink-0" />
              <div>
                <p className="text-sm font-semibold text-amber-900">{counts.awaiting_review} sources awaiting your review</p>
                <p className="text-xs text-amber-700">Excerpts have been extracted — approve or reject them</p>
              </div>
            </div>
            <Button size="sm" className="bg-amber-600 hover:bg-amber-700 text-white" onClick={() => setActiveTab('awaiting_review')}>
              Review now
            </Button>
          </div>
        )}

        {/* C) Stat cards */}
        <div className="grid grid-cols-5 gap-3">
          {[
            { tab: 'awaiting_review', label: 'Awaiting Review', icon: Eye,          color: 'text-amber-600',  bg: 'bg-amber-50',  count: counts.awaiting_review },
            { tab: 'approved',        label: 'Approved',        icon: CheckCircle2,  color: 'text-green-600',  bg: 'bg-green-50',  count: counts.approved },
            { tab: 'failed',          label: 'Failed',          icon: AlertCircle,   color: 'text-red-600',    bg: 'bg-red-50',    count: counts.failed },
            { tab: 'uploaded',        label: 'Upload Queue',    icon: Clock,         color: 'text-slate-600',  bg: 'bg-slate-100', count: counts.uploaded },
            { tab: 'skipped',         label: 'Skipped',         icon: SkipForward,   color: 'text-slate-500',  bg: 'bg-slate-100', count: counts.skipped },
          ].map(({ tab, label, icon: Icon, color, bg, count }) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`text-left p-4 rounded-xl border transition-all ${
                activeTab === tab ? 'ring-2 ring-blue-500 border-blue-300' : 'border-slate-200 hover:border-slate-300'
              } bg-white`}
            >
              <div className={`inline-flex p-2 rounded-lg mb-2 ${bg}`}>
                <Icon className={`w-4 h-4 ${color}`} />
              </div>
              <p className={`text-xl font-bold ${color}`}>{count}</p>
              <p className="text-xs text-slate-500 mt-0.5">{label}</p>
            </button>
          ))}
        </div>

        {/* D) Tab bar */}
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="flex-wrap h-auto gap-1 bg-slate-100 p-1">
            <TabsTrigger value="awaiting_review">Awaiting Review ({counts.awaiting_review})</TabsTrigger>
            <TabsTrigger value="approved">Approved ({counts.approved})</TabsTrigger>
            <TabsTrigger value="rejected">Rejected ({counts.rejected})</TabsTrigger>
            <TabsTrigger value="failed">Failed ({counts.failed})</TabsTrigger>
            <TabsTrigger value="uploaded">Queue ({counts.uploaded})</TabsTrigger>
            <TabsTrigger value="skipped">Skipped ({counts.skipped})</TabsTrigger>
            {counts.gnpd_ready > 0 && (
              <TabsTrigger value="gnpd_ready">
                <Database className="w-3.5 h-3.5 mr-1" />
                GNPD ({counts.gnpd_ready})
              </TabsTrigger>
            )}
            {counts.deletion_pending > 0 && (
              <TabsTrigger value="deletion_pending" className="text-red-600 data-[state=active]:text-red-700">
                <Trash2 className="w-3.5 h-3.5 mr-1" />
                Deletion Pending ({counts.deletion_pending})
              </TabsTrigger>
            )}
            <TabsTrigger value="all">All ({counts.all})</TabsTrigger>
          </TabsList>
        </Tabs>

        {/* E) Search + bulk action bar */}
        <div className="flex items-center gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <Input
              placeholder="Search by title, folder, or tag..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>
          {selectedIds.size > 0 && (
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium text-slate-700 bg-blue-100 text-blue-700 px-3 py-1.5 rounded-full">
                {selectedIds.size} selected
              </span>
              <Select value={bulkAction} onValueChange={setBulkAction}>
                <SelectTrigger className="w-48">
                  <SelectValue placeholder="Choose action..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="approve">Approve</SelectItem>
                  <SelectItem value="reject">Reject</SelectItem>
                  <SelectItem value="retry">Retry (reset to queue)</SelectItem>
                  <SelectItem value="mark_deletion">Mark for deletion</SelectItem>
                  <SelectItem value="delete" className="text-red-600">Delete permanently</SelectItem>
                </SelectContent>
              </Select>
              <Button
                size="sm"
                variant={bulkAction === 'delete' ? 'destructive' : 'default'}
                disabled={!bulkAction || applying}
                onClick={handleApply}
              >
                {applying ? <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" /> : null}
                Apply
              </Button>
            </div>
          )}
        </div>

        {/* F) Table */}
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50">
                    <th className="w-10 px-4 py-3">
                      <Checkbox checked={allSelected} onCheckedChange={toggleAll} />
                    </th>
                    <th className="text-left px-4 py-3 font-semibold text-slate-700">Title</th>
                    <th className="text-left px-4 py-3 font-semibold text-slate-700 whitespace-nowrap">Type</th>
                    <th className="text-left px-4 py-3 font-semibold text-slate-700 whitespace-nowrap">Pipeline Stage</th>
                    <th className="text-left px-4 py-3 font-semibold text-slate-700 whitespace-nowrap">Review Status</th>
                    <th className="text-right px-4 py-3 font-semibold text-slate-700 whitespace-nowrap">Excerpts</th>
                    <th className="text-left px-4 py-3 font-semibold text-slate-700">Detail</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {visibleRows.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="text-center py-12 text-slate-400">
                        No sources match the current filter.
                      </td>
                    </tr>
                  ) : visibleRows.map(s => {
                    const isSelected = selectedIds.has(s.id);
                    const isDeletionPending = s.tags?.includes('deletion_pending');
                    const visibleTags = (s.tags || []).filter(t => t !== 'deletion_pending').slice(0, 3);
                    const extraTags = (s.tags || []).filter(t => t !== 'deletion_pending').length - visibleTags.length;

                    return (
                      <tr
                        key={s.id}
                        className={`cursor-pointer ${isSelected ? 'bg-blue-50' : 'hover:bg-slate-50'} ${openSourceId === s.id ? 'border-l-4 border-l-blue-500' : ''}`}
                        onClick={() => setOpenSourceId(s.id)}
                      >
                        <td className="px-4 py-3" onClick={e => e.stopPropagation()}>
                          <Checkbox checked={isSelected} onCheckedChange={() => toggleOne(s.id)} />
                        </td>
                        <td className="px-4 py-3 max-w-xs">
                          <div className="flex items-start gap-2">
                            <FileText className="w-4 h-4 text-slate-400 shrink-0 mt-0.5" />
                            <div className="min-w-0">
                              <p className="font-medium text-slate-900 truncate">{s.title || 'Untitled'}</p>
                              {s.folder_path && (
                                <p className="text-xs text-slate-400 truncate">{s.folder_path}</p>
                              )}
                              <div className="flex flex-wrap gap-1 mt-1">
                                {isDeletionPending && (
                                  <span className="text-xs px-1.5 py-0.5 rounded bg-red-100 text-red-600 font-medium">deletion_pending</span>
                                )}
                                {visibleTags.map(t => (
                                  <span key={t} className="text-xs px-1.5 py-0.5 rounded bg-slate-100 text-slate-500">{t}</span>
                                ))}
                                {extraTags > 0 && (
                                  <span className="text-xs text-slate-400">+{extraTags}</span>
                                )}
                              </div>
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          {s.source_type && <Badge variant="outline" className="text-xs">{s.source_type}</Badge>}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          <PBadge stage={s.pipeline_stage} />
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          <RBadge status={s.review_status} />
                        </td>
                        <td className="px-4 py-3 text-right text-slate-600">
                          {s.rag_excerpt_count || 0}
                        </td>
                        <td className="px-4 py-3 max-w-xs">
                          {s.failure_reason && (
                            <p className="text-xs text-red-600 font-medium">{s.failure_reason}</p>
                          )}
                          {s.skip_reason && (
                            <p className="text-xs text-slate-500">{s.skip_reason}</p>
                          )}
                          {s.review_notes && (
                            <p className="text-xs text-slate-600 italic truncate max-w-[160px]">
                              {s.review_notes.slice(0, 40)}{s.review_notes.length > 40 ? '…' : ''}
                            </p>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Delete dialog */}
      <DeleteSourcesDialog
        open={showDeleteDialog}
        onClose={() => setShowDeleteDialog(false)}
        onConfirm={handleDeleteConfirm}
        count={selectedIds.size}
        sources={selectedSources}
      />

      {/* Upload modal */}
      {showUploadModal && (
        <KnowledgeUploadModal onClose={() => setShowUploadModal(false)} />
      )}

      {/* Source detail panel */}
      <SourceDetailPanel
        sourceId={openSourceId}
        onClose={() => setOpenSourceId(null)}
        onRefresh={() => queryClient.invalidateQueries({ queryKey })}
      />
    </div>
  );
}