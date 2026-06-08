import React, { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { toast } from 'sonner';
import { 
  X, FileText, ExternalLink, CheckCircle2, AlertCircle, Clock, 
  Zap, Edit2, Save, Tag, Calendar, Building2, Globe, BookOpen, Trash2
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

const CATEGORIES = ['Bakery','Confectionery','Dairy','Feed','Fine Food','Ice Cream','Lipid','Meat','Other Food Applications','PCI','Polymer','Tech'];
const REGIONS = ['ASPAC','AMERICAS','EMEC','IMEA','Global'];

export default function KnowledgeSourceDetailDrawer({ source, onClose, onRefresh }) {
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [edits, setEdits] = useState({});
  const [confirmDelete, setConfirmDelete] = useState(false);

  const me = source?.metadata_extraction || {};
  const extracted = me.extracted_data || {};

  const displayPublisher = edits.publisher ?? source?.publisher ?? extracted.publisher ?? '';
  const displayCategory = edits.category ?? source?.category ?? extracted.category ?? '';
  const displayRegion = edits.region_code ?? source?.region_code ?? extracted.region_code ?? '';
  const displayDate = edits.date_published ?? source?.date_published ?? extracted.date_published ?? '';

  const verifyMutation = useMutation({
    mutationFn: async () => {
      const updates = {
        metadata_extraction: {
          ...me,
          verified: true,
        }
      };
      // Apply any edits to the source fields too
      if (edits.publisher) updates.publisher = edits.publisher;
      if (edits.category) updates.category = edits.category;
      if (edits.region_code) updates.region_code = edits.region_code;
      if (edits.date_published) updates.date_published = edits.date_published;
      await base44.entities.Source.update(source.id, updates);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['knowledgeSources'] });
      toast.success('Source verified — Source Processor will run automatically');
      setEditing(false);
      onRefresh();
      onClose();
    },
    onError: (e) => toast.error(e.message),
  });

  const deleteMutation = useMutation({
    mutationFn: async () => {
      await base44.entities.Source.delete(source.id);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['knowledgeSources'] });
      toast.success('Source deleted');
      onClose();
    },
    onError: (e) => toast.error(e.message),
  });

  const processNowMutation = useMutation({
    mutationFn: async () => {
      const res = await base44.functions.invoke('triggerSourceProcessor', {
        source_id: source.id,
        triggered_by: 'manual_button',
      });
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['processingRuns'] });
      toast.success('Source Processor queued');
      onRefresh();
    },
    onError: (e) => toast.error(e.message),
  });

  const getStatusBadge = () => {
    if (me.status === 'failed') return <span className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded-full bg-red-100 text-red-700 font-medium"><AlertCircle className="w-3 h-3" /> Failed extraction</span>;
    if (me.status === 'extracted' && !me.verified) return <span className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded-full bg-amber-100 text-amber-700 font-medium"><Clock className="w-3 h-3" /> Needs verification</span>;
    if (me.status === 'extracted' && me.verified && source.rag_processed) return <span className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded-full bg-blue-100 text-blue-700 font-medium"><CheckCircle2 className="w-3 h-3" /> Processed</span>;
    if (me.status === 'extracted' && me.verified) return <span className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded-full bg-green-100 text-green-700 font-medium"><CheckCircle2 className="w-3 h-3" /> Verified</span>;
    return null;
  };

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />
      <div className="relative w-full max-w-xl bg-white shadow-xl flex flex-col h-full overflow-hidden">
        {/* Header */}
        <div className="flex items-start justify-between p-5 border-b border-slate-200">
          <div className="flex-1 min-w-0 pr-3">
            <div className="flex items-center gap-2 mb-1">
              <FileText className="w-4 h-4 text-slate-400 shrink-0" />
              <h2 className="text-base font-semibold text-slate-900 truncate">{source.title}</h2>
            </div>
            {source.relative_path && (
              <p className="text-xs text-slate-500 truncate">{source.relative_path}</p>
            )}
            <div className="flex items-center gap-2 mt-2">
              {getStatusBadge()}
              {source.source_type && <Badge variant="outline" className="text-xs">{source.source_type}</Badge>}
              {source.knowledge_subtype && <Badge variant="outline" className="text-xs">{source.knowledge_subtype}</Badge>}
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 hover:bg-slate-100 rounded-lg shrink-0">
            <X className="w-4 h-4 text-slate-500" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-5">

          {/* AI Suggestion banner */}
          {extracted.source_type && extracted.source_type !== source.source_type && (
            <div className="text-sm px-3 py-2 bg-blue-50 text-blue-800 rounded-lg border border-blue-100">
              💡 AI suggests type: <strong>{extracted.source_type}</strong> — verify or keep current ({source.source_type})
            </div>
          )}

          {/* Metadata fields */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-slate-700">Metadata</h3>
              {!editing && (
                <button onClick={() => setEditing(true)} className="flex items-center gap-1 text-xs text-blue-600 hover:underline">
                  <Edit2 className="w-3 h-3" /> Edit
                </button>
              )}
            </div>
            <div className="space-y-3">
              {/* Publisher */}
              <div className="flex items-center gap-3">
                <Building2 className="w-4 h-4 text-slate-400 shrink-0" />
                <div className="flex-1">
                  <p className="text-xs text-slate-500 mb-0.5">Publisher</p>
                  {editing ? (
                    <Input
                      value={displayPublisher}
                      onChange={e => setEdits(p => ({ ...p, publisher: e.target.value }))}
                      className="h-7 text-sm"
                    />
                  ) : (
                    <p className="text-sm text-slate-800">{displayPublisher || <span className="text-slate-400 italic">Not set</span>}</p>
                  )}
                </div>
              </div>

              {/* Category */}
              <div className="flex items-center gap-3">
                <BookOpen className="w-4 h-4 text-slate-400 shrink-0" />
                <div className="flex-1">
                  <p className="text-xs text-slate-500 mb-0.5">Category</p>
                  {editing ? (
                    <Select value={displayCategory} onValueChange={v => setEdits(p => ({ ...p, category: v }))}>
                      <SelectTrigger className="h-7 text-sm"><SelectValue placeholder="Select category" /></SelectTrigger>
                      <SelectContent>{CATEGORIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
                    </Select>
                  ) : (
                    <p className="text-sm text-slate-800">{displayCategory || <span className="text-slate-400 italic">Not set</span>}</p>
                  )}
                </div>
              </div>

              {/* Region */}
              <div className="flex items-center gap-3">
                <Globe className="w-4 h-4 text-slate-400 shrink-0" />
                <div className="flex-1">
                  <p className="text-xs text-slate-500 mb-0.5">Region</p>
                  {editing ? (
                    <Select value={displayRegion} onValueChange={v => setEdits(p => ({ ...p, region_code: v }))}>
                      <SelectTrigger className="h-7 text-sm"><SelectValue placeholder="Select region" /></SelectTrigger>
                      <SelectContent>{REGIONS.map(r => <SelectItem key={r} value={r}>{r}</SelectItem>)}</SelectContent>
                    </Select>
                  ) : (
                    <p className="text-sm text-slate-800">{displayRegion || <span className="text-slate-400 italic">Not set</span>}</p>
                  )}
                </div>
              </div>

              {/* Date */}
              <div className="flex items-center gap-3">
                <Calendar className="w-4 h-4 text-slate-400 shrink-0" />
                <div className="flex-1">
                  <p className="text-xs text-slate-500 mb-0.5">Published date</p>
                  {editing ? (
                    <Input
                      type="date"
                      value={displayDate}
                      onChange={e => setEdits(p => ({ ...p, date_published: e.target.value }))}
                      className="h-7 text-sm"
                    />
                  ) : (
                    <p className="text-sm text-slate-800">{displayDate || <span className="text-slate-400 italic">Not set</span>}</p>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Extracted data from AI */}
          {Object.keys(extracted).length > 0 && (
            <div>
              <h3 className="text-sm font-semibold text-slate-700 mb-3">AI Extracted Data</h3>
              <div className="bg-slate-50 rounded-lg border border-slate-200 p-3 space-y-2">
                {Object.entries(extracted).map(([key, val]) => {
                  if (!val || key === 'source_type') return null;
                  return (
                    <div key={key} className="flex gap-2 text-xs">
                      <span className="text-slate-500 shrink-0 w-28">{key.replace(/_/g, ' ')}</span>
                      <span className="text-slate-800 font-medium">{typeof val === 'object' ? JSON.stringify(val) : String(val)}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Tags */}
          {source.tags?.length > 0 && (
            <div>
              <h3 className="text-sm font-semibold text-slate-700 mb-2">Tags</h3>
              <div className="flex flex-wrap gap-1.5">
                {source.tags.map(tag => (
                  <span key={tag} className="inline-flex items-center gap-1 text-xs px-2 py-0.5 bg-slate-100 text-slate-600 rounded-full">
                    <Tag className="w-2.5 h-2.5" />{tag}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* File link */}
          {source.file_url && (
            <div>
              <h3 className="text-sm font-semibold text-slate-700 mb-2">File</h3>
              <a
                href={source.file_url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 text-sm text-blue-600 hover:underline"
              >
                <ExternalLink className="w-3.5 h-3.5" />
                Open file
              </a>
            </div>
          )}
        </div>

        {/* Footer actions */}
        <div className="border-t border-slate-200 p-4 space-y-2">
          {confirmDelete && (
            <div className="flex items-center justify-between gap-2 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
              <span className="text-xs text-red-700 font-medium">Delete permanently?</span>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => setConfirmDelete(false)}>Cancel</Button>
                <Button size="sm" className="h-7 text-xs bg-red-600 hover:bg-red-700 text-white" onClick={() => deleteMutation.mutate()} disabled={deleteMutation.isPending}>
                  {deleteMutation.isPending ? 'Deleting...' : 'Delete'}
                </Button>
              </div>
            </div>
          )}
          <div className="flex items-center justify-between gap-3">
            {editing ? (
              <>
                <Button variant="outline" size="sm" onClick={() => { setEditing(false); setEdits({}); }}>Cancel</Button>
                <Button
                  size="sm"
                  className="bg-green-600 hover:bg-green-700"
                  onClick={() => verifyMutation.mutate()}
                  disabled={verifyMutation.isPending}
                >
                  <Save className="w-3.5 h-3.5 mr-1" />
                  {verifyMutation.isPending ? 'Saving...' : 'Save & Verify'}
                </Button>
              </>
            ) : me.status === 'extracted' && !me.verified ? (
              <>
                <Button variant="ghost" size="sm" className="text-red-500 hover:text-red-700 hover:bg-red-50" onClick={() => setConfirmDelete(true)}>
                  <Trash2 className="w-3.5 h-3.5 mr-1" /> Delete
                </Button>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={onClose}>Close</Button>
                  <Button size="sm" className="bg-green-600 hover:bg-green-700" onClick={() => verifyMutation.mutate()} disabled={verifyMutation.isPending}>
                    <CheckCircle2 className="w-3.5 h-3.5 mr-1" />
                    {verifyMutation.isPending ? 'Verifying...' : 'Verify & Process'}
                  </Button>
                </div>
              </>
            ) : me.verified && !source.rag_processed ? (
              <>
                <Button variant="ghost" size="sm" className="text-red-500 hover:text-red-700 hover:bg-red-50" onClick={() => setConfirmDelete(true)}>
                  <Trash2 className="w-3.5 h-3.5 mr-1" /> Delete
                </Button>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={onClose}>Close</Button>
                  <Button size="sm" className="bg-blue-600 hover:bg-blue-700" onClick={() => processNowMutation.mutate()} disabled={processNowMutation.isPending}>
                    <Zap className="w-3.5 h-3.5 mr-1" />
                    {processNowMutation.isPending ? 'Queuing...' : 'Process now'}
                  </Button>
                </div>
              </>
            ) : (
              <>
                <Button variant="ghost" size="sm" className="text-red-500 hover:text-red-700 hover:bg-red-50" onClick={() => setConfirmDelete(true)}>
                  <Trash2 className="w-3.5 h-3.5 mr-1" /> Delete
                </Button>
                <Button variant="outline" size="sm" onClick={onClose}>Close</Button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}