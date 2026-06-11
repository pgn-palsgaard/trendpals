/**
 * Shared RAG source table used by KnowledgeLibrary and MarketIntelLibrary.
 * Handles: fetch, tabs, stats, search, bulk actions, detail panel, delete dialog.
 * Callers pass `sourceTypeFilter`, `title`, `subtitle`, and optional `extraFilters` + `extraColumns`.
 */
import React, { useState, useMemo, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { toast } from 'sonner';
import {
  Upload, Search, Trash2, CheckCircle2, XCircle, Clock, AlertCircle,
  FileText, SkipForward, Loader2, Eye
} from 'lucide-react';
import DeleteSourcesDialog from './DeleteSourcesDialog';
import SourceDetailPanel from './SourceDetailPanel';
import KnowledgeUploadModal from '../knowledge/KnowledgeUploadModal';
import ProcessQueueControls, { RetryRowButton } from './ProcessQueueControls';
import ProcessingStatusBar from './ProcessingStatusBar';
import NeedsClassificationSection from './NeedsClassificationSection';
import { getSourceAttentionState, STATE_TO_TAB, attentionNote, checkTabInvariant } from './sourceAttentionState';

// Back-compat: some panels import this from here
export { attentionNote as queueBlockedReason };

// ─── helpers ──────────────────────────────────────────────────────────────────
export const PIPELINE_BADGE = {
  uploaded:   { label: 'Uploaded',   cls: 'bg-slate-100 text-slate-600' },
  needs_classification: { label: 'Needs Classification', cls: 'bg-purple-100 text-purple-700' },
  extracting: { label: 'Extracting', cls: 'bg-blue-100 text-blue-700' },
  metadata_extracted: { label: 'Metadata Ready', cls: 'bg-teal-100 text-teal-700' },
  extracted:  { label: 'Extracted',  cls: 'bg-green-100 text-green-700' },
  gnpd_ready: { label: 'GNPD Ready', cls: 'bg-blue-100 text-blue-700' },
  skipped:    { label: 'Skipped',    cls: 'bg-slate-100 text-slate-400' },
  failed:     { label: 'Failed',     cls: 'bg-red-100 text-red-700' },
};

export const REVIEW_BADGE = {
  pending:  { label: 'Pending',  cls: 'bg-amber-100 text-amber-700' },
  approved: { label: 'Approved', cls: 'bg-green-100 text-green-700' },
  rejected: { label: 'Rejected', cls: 'bg-red-100 text-red-700' },
};

export function PBadge({ stage }) {
  const cfg = PIPELINE_BADGE[stage] || { label: stage || '—', cls: 'bg-slate-100 text-slate-600' };
  return <span className={`inline-flex text-xs font-medium px-2 py-0.5 rounded-full ${cfg.cls}`}>{cfg.label}</span>;
}

export function RBadge({ status }) {
  const cfg = REVIEW_BADGE[status] || { label: status || '—', cls: 'bg-slate-100 text-slate-600' };
  return <span className={`inline-flex text-xs font-medium px-2 py-0.5 rounded-full ${cfg.cls}`}>{cfg.label}</span>;
}

// Tabs are derived from ONE shared attention state — mutually exclusive by construction.
function tabFilter(tab, s) {
  if (tab === 'all') return true;
  if (tab === 'deletion_pending') return Array.isArray(s.tags) && s.tags.includes('deletion_pending');
  return STATE_TO_TAB[getSourceAttentionState(s)] === tab;
}

// ─── main ─────────────────────────────────────────────────────────────────────
export default function RagSourceTable({
  sourceTypeFilter,   // string | string[]
  title,
  subtitle,
  // optional: ({ sources, filters }) => filtered sources (caller applies extra filters)
  applyExtraFilters,
  // optional: React node rendered between search bar and table (extra filter dropdowns)
  ExtraFilterBar,
  // optional: array of { key, header, render(s) } added after Review Status column
  extraColumns = [],
}) {
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState('awaiting_review');
  const [search, setSearch] = useState('');
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [bulkAction, setBulkAction] = useState('');
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [applying, setApplying] = useState(false);
  const [openSourceId, setOpenSourceId] = useState(null);
  const [processing, setProcessing] = useState({ active: false, batchDone: 0, batchTotal: 0, stopped: false });

  const queryKey = ['ragSources', JSON.stringify(sourceTypeFilter)];

  const { data: sources = [], isLoading, refetch } = useQuery({
    queryKey,
    queryFn: async () => {
      const FETCH_LIMIT = 2000;
      if (Array.isArray(sourceTypeFilter)) {
        const results = await Promise.all(
          sourceTypeFilter.map(t => base44.entities.Source.filter({ source_type: t }, '-created_date', FETCH_LIMIT))
        );
        return results.flat();
      }
      const q = sourceTypeFilter ? { source_type: sourceTypeFilter } : {};
      return await base44.entities.Source.filter(q, '-created_date', FETCH_LIMIT);
    },
    refetchInterval: processing.active ? 15000 : false,
  });

  const handleRefresh = () => queryClient.invalidateQueries({ queryKey });

  const updateProcessing = (update) => setProcessing(prev => ({ ...prev, ...update }));

  useEffect(() => { setSelectedIds(new Set()); }, [activeTab]);

  const counts = useMemo(() => ({
    awaiting_review:  sources.filter(s => tabFilter('awaiting_review', s)).length,
    approved:         sources.filter(s => tabFilter('approved', s)).length,
    rejected:         sources.filter(s => tabFilter('rejected', s)).length,
    failed:           sources.filter(s => tabFilter('failed', s)).length,
    uploaded:         sources.filter(s => tabFilter('uploaded', s)).length,
    skipped:          sources.filter(s => tabFilter('skipped', s)).length,
    deletion_pending: sources.filter(s => tabFilter('deletion_pending', s)).length,
    all:              sources.length,
  }), [sources]);

  // Invariant: tabs are disjoint — sum must always equal All
  useEffect(() => { checkTabInvariant(sources, counts); }, [sources, counts]);

  const visibleRows = useMemo(() => {
    let rows = sources.filter(s => tabFilter(activeTab, s));
    if (search.trim()) {
      const q = search.toLowerCase();
      rows = rows.filter(s =>
        s.title?.toLowerCase().includes(q) ||
        s.folder_path?.toLowerCase().includes(q) ||
        s.publisher?.toLowerCase().includes(q) ||
        s.tags?.some(t => t.toLowerCase().includes(q))
      );
    }
    if (applyExtraFilters) rows = applyExtraFilters(rows);
    return rows;
  }, [sources, activeTab, search, applyExtraFilters]);

  const allSelected = visibleRows.length > 0 && visibleRows.every(r => selectedIds.has(r.id));
  const toggleAll = () => setSelectedIds(allSelected ? new Set() : new Set(visibleRows.map(r => r.id)));
  const toggleOne = (id) => {
    const next = new Set(selectedIds);
    next.has(id) ? next.delete(id) : next.add(id);
    setSelectedIds(next);
  };

  const handleApply = async () => {
    if (!bulkAction || selectedIds.size === 0) return;
    if (bulkAction === 'delete') { setShowDeleteDialog(true); return; }
    setApplying(true);
    const ids = [...selectedIds];
    try {
      if (bulkAction === 'approve') {
        // Approval is the human verification gate — it also marks metadata as verified
        const selectedRows = sources.filter(s => ids.includes(s.id));
        await Promise.all(selectedRows.map(s => base44.entities.Source.update(s.id, {
          review_status: 'approved',
          reviewed_at: new Date().toISOString(),
          metadata_extraction: { ...(s.metadata_extraction || {}), verified: true },
        })));
        toast.success(`${ids.length} source(s) approved`);
      } else if (bulkAction === 'reject') {
        await Promise.all(ids.map(id => base44.entities.Source.update(id, { review_status: 'rejected', reviewed_at: new Date().toISOString() })));
        toast.success(`${ids.length} source(s) rejected`);
      } else if (bulkAction === 'retry') {
        await Promise.all(ids.map(id => base44.entities.Source.update(id, { pipeline_stage: 'uploaded', failure_reason: null, retry_count: 0, last_retry_at: new Date().toISOString() })));
        toast.success(`${ids.length} source(s) reset to queue`);
      } else if (bulkAction === 'mark_deletion') {
        const selected = sources.filter(s => ids.includes(s.id));
        await Promise.all(selected.map(s => base44.entities.Source.update(s.id, { tags: Array.from(new Set([...(s.tags || []), 'deletion_pending'])) })));
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

  const colSpan = 6 + extraColumns.length;

  return (
    <div className="min-h-screen bg-slate-50">
      <ProcessingStatusBar
        processing={processing}
        onStop={() => updateProcessing({ stopped: true, active: false })}
      />
      <div className="max-w-[1600px] mx-auto p-6 space-y-5">

        {/* Header */}
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

        {/* Awaiting review banner */}
        {counts.awaiting_review > 0 && activeTab !== 'awaiting_review' && (
          <div className="flex items-center justify-between bg-amber-50 border border-amber-200 rounded-xl px-5 py-4">
            <div className="flex items-center gap-3">
              <Eye className="w-5 h-5 text-amber-600 shrink-0" />
              <div>
                <p className="text-sm font-semibold text-amber-900">{counts.awaiting_review} sources awaiting review</p>
                <p className="text-xs text-amber-700">Excerpts extracted — approve or reject them</p>
              </div>
            </div>
            <Button size="sm" className="bg-amber-600 hover:bg-amber-700 text-white" onClick={() => setActiveTab('awaiting_review')}>
              Review now
            </Button>
          </div>
        )}

        {/* Stat cards */}
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
              className={`text-left p-4 rounded-xl border transition-all bg-white ${
                activeTab === tab ? 'ring-2 ring-blue-500 border-blue-300' : 'border-slate-200 hover:border-slate-300'
              }`}
            >
              <div className={`inline-flex p-2 rounded-lg mb-2 ${bg}`}>
                <Icon className={`w-4 h-4 ${color}`} />
              </div>
              <p className={`text-xl font-bold ${color}`}>{count}</p>
              <p className="text-xs text-slate-500 mt-0.5">{label}</p>
            </button>
          ))}
        </div>

        {/* Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="flex-wrap h-auto gap-1 bg-slate-100 p-1">
            <TabsTrigger value="awaiting_review">Awaiting Review ({counts.awaiting_review})</TabsTrigger>
            <TabsTrigger value="approved">Approved ({counts.approved})</TabsTrigger>
            <TabsTrigger value="rejected">Rejected ({counts.rejected})</TabsTrigger>
            <TabsTrigger value="failed">Failed ({counts.failed})</TabsTrigger>
            <TabsTrigger value="uploaded">Queue ({counts.uploaded})</TabsTrigger>
            <TabsTrigger value="skipped">Skipped ({counts.skipped})</TabsTrigger>
            {counts.deletion_pending > 0 && (
              <TabsTrigger value="deletion_pending" className="text-red-600">
                <Trash2 className="w-3.5 h-3.5 mr-1" />
                Deletion ({counts.deletion_pending})
              </TabsTrigger>
            )}
            <TabsTrigger value="all">All ({counts.all})</TabsTrigger>
          </TabsList>
        </Tabs>

        {/* Needs classification — human-in-the-loop on low-confidence auto-classification */}
        {activeTab === 'awaiting_review' && (
          <NeedsClassificationSection
            sources={visibleRows.filter(s => s.pipeline_stage === 'needs_classification')}
            onRefresh={handleRefresh}
          />
        )}

        {/* Extra filters */}
        {ExtraFilterBar}

        {/* Process queue / retry failed controls */}
        <ProcessQueueControls
          activeTab={activeTab}
          visibleRows={visibleRows}
          selectedIds={selectedIds}
          allQueueCount={counts.uploaded}
          allFailedCount={counts.failed}
          processing={processing}
          onProcessingChange={updateProcessing}
          onRefresh={handleRefresh}
        />

        {/* Search + bulk */}
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
              <span className="text-sm font-medium bg-blue-100 text-blue-700 px-3 py-1.5 rounded-full">
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
                {applying && <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" />}
                Apply
              </Button>
            </div>
          )}
        </div>

        {/* Table */}
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
                    <th className="text-left px-4 py-3 font-semibold text-slate-700 whitespace-nowrap">Pipeline</th>
                    <th className="text-left px-4 py-3 font-semibold text-slate-700 whitespace-nowrap">Review</th>
                    <th className="text-right px-4 py-3 font-semibold text-slate-700 whitespace-nowrap">Excerpts</th>
                    {extraColumns.map(col => (
                      <th key={col.key} className="text-left px-4 py-3 font-semibold text-slate-700 whitespace-nowrap">{col.header}</th>
                    ))}
                    <th className="text-left px-4 py-3 font-semibold text-slate-700">Notes</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {visibleRows.length === 0 ? (
                    <tr>
                      <td colSpan={colSpan} className="text-center py-12 text-slate-400">
                        No sources match the current filter.
                      </td>
                    </tr>
                  ) : visibleRows.map(s => {
                    const isSelected = selectedIds.has(s.id);
                    const isDeletionPending = s.tags?.includes('deletion_pending');
                    const visibleTags = (s.tags || []).filter(t => t !== 'deletion_pending').slice(0, 2);
                    const extraTagCount = (s.tags || []).filter(t => t !== 'deletion_pending').length - visibleTags.length;

                    return (
                      <tr
                        key={s.id}
                        className={`cursor-pointer transition-colors ${isSelected ? 'bg-blue-50' : 'hover:bg-slate-50'} ${openSourceId === s.id ? 'border-l-4 border-l-blue-500' : ''}`}
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
                              {s.folder_path && <p className="text-xs text-slate-400 truncate">{s.folder_path}</p>}
                              <div className="flex flex-wrap gap-1 mt-1">
                                {isDeletionPending && (
                                  <span className="text-xs px-1.5 py-0.5 rounded bg-red-100 text-red-600 font-medium">deletion pending</span>
                                )}
                                {visibleTags.map(t => (
                                  <span key={t} className="text-xs px-1.5 py-0.5 rounded bg-slate-100 text-slate-500">{t}</span>
                                ))}
                                {extraTagCount > 0 && <span className="text-xs text-slate-400">+{extraTagCount}</span>}
                              </div>
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          <PBadge stage={s.pipeline_stage} />
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          <RBadge status={s.review_status} />
                        </td>
                        <td className="px-4 py-3 text-right text-slate-600">
                          {(s.excerpts || []).length}
                        </td>
                        {extraColumns.map(col => (
                          <td key={col.key} className="px-4 py-3">
                            {col.render(s)}
                          </td>
                        ))}
                        <td className="px-4 py-3 max-w-[200px]">
                          {['uploaded', 'awaiting_review', 'all'].includes(activeTab) && attentionNote(s) && (
                            <span className="inline-flex items-center gap-1 text-xs px-1.5 py-0.5 rounded bg-amber-50 text-amber-700 border border-amber-200 font-medium mb-1">
                              <AlertCircle className="w-3 h-3" />
                              {attentionNote(s)}
                            </span>
                          )}
                          {s.failure_reason && <p className="text-xs text-red-600 font-medium">{s.failure_reason}</p>}
                          {s.skip_reason && <p className="text-xs text-slate-500">{s.skip_reason}</p>}
                          {s.review_notes && (
                            <p className="text-xs text-slate-500 italic truncate">{s.review_notes.slice(0, 40)}{s.review_notes.length > 40 ? '…' : ''}</p>
                          )}
                          {s.pipeline_stage === 'failed' && (
                            <div className="mt-1" onClick={e => e.stopPropagation()}>
                              <RetryRowButton sourceId={s.id} onDone={handleRefresh} />
                            </div>
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

      <DeleteSourcesDialog
        open={showDeleteDialog}
        onClose={() => setShowDeleteDialog(false)}
        onConfirm={handleDeleteConfirm}
        count={selectedIds.size}
        sources={selectedSources}
      />

      {showUploadModal && <KnowledgeUploadModal onClose={() => setShowUploadModal(false)} />}

      <SourceDetailPanel
        sourceId={openSourceId}
        onClose={() => setOpenSourceId(null)}
        onRefresh={() => queryClient.invalidateQueries({ queryKey })}
      />
    </div>
  );
}