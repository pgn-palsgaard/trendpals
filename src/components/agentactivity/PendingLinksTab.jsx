import React, { useState, useMemo } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { toast } from 'sonner';
import { CheckCircle, XCircle, ExternalLink } from 'lucide-react';
import { Button } from '@/components/ui/button';

function ConfidenceBar({ score }) {
  const pct = Math.min(100, Math.max(0, score || 0));
  const color = pct >= 70 ? 'bg-green-500' : pct >= 40 ? 'bg-amber-500' : 'bg-red-400';
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1.5 bg-slate-100 rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs font-mono font-bold text-slate-600 w-6">{pct}</span>
    </div>
  );
}

export default function PendingLinksTab({ pendingLinks, globalTrends, isLoading }) {
  const queryClient = useQueryClient();
  const [bulkPublisher, setBulkPublisher] = useState('');

  const updateLinkOnTrend = async (trendId, sourceTitle, publisher, newStatus) => {
    const trends = await base44.entities.GlobalTrend.filter({ id: trendId });
    const trend = trends[0];
    if (!trend) return;
    const updatedSources = (trend.sources || []).map(s => {
      if (s.title === sourceTitle && s.publisher === publisher && s.review_status === 'pending') {
        return { ...s, review_status: newStatus };
      }
      return s;
    });
    await base44.entities.GlobalTrend.update(trendId, { sources: updatedSources });
  };

  const approveMutation = useMutation({
    mutationFn: async ({ link }) => {
      await updateLinkOnTrend(link._trend_id, link.title, link.publisher, 'approved');
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['globalTrends'] });
      toast.success('Link approved');
    },
  });

  const rejectMutation = useMutation({
    mutationFn: async ({ link }) => {
      await updateLinkOnTrend(link._trend_id, link.title, link.publisher, 'rejected');
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['globalTrends'] });
      toast.success('Link rejected');
    },
  });

  const bulkApproveMutation = useMutation({
    mutationFn: async ({ publisher }) => {
      const byTrend = {};
      pendingLinks.filter(l => l.publisher === publisher).forEach(l => {
        if (!byTrend[l._trend_id]) byTrend[l._trend_id] = [];
        byTrend[l._trend_id].push(l);
      });
      for (const [trendId, links] of Object.entries(byTrend)) {
        const trends = await base44.entities.GlobalTrend.filter({ id: trendId });
        const trend = trends[0];
        if (!trend) continue;
        const updatedSources = (trend.sources || []).map(s => {
          const match = links.find(l => l.title === s.title && l.publisher === s.publisher && s.review_status === 'pending');
          if (match) return { ...s, review_status: 'approved' };
          return s;
        });
        await base44.entities.GlobalTrend.update(trendId, { sources: updatedSources });
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['globalTrends'] });
      toast.success(`Bulk approved all from ${bulkPublisher}`);
      setBulkPublisher('');
    },
  });

  const publishers = useMemo(() => [...new Set(pendingLinks.map(l => l.publisher).filter(Boolean))], [pendingLinks]);

  if (isLoading) {
    return <div className="flex items-center justify-center py-24"><div className="w-8 h-8 border-4 border-slate-200 border-t-slate-700 rounded-full animate-spin" /></div>;
  }

  if (pendingLinks.length === 0) {
    return (
      <div className="text-center py-24 text-slate-400">
        <CheckCircle className="w-10 h-10 mx-auto mb-3 text-green-400" />
        <p className="text-lg font-medium">All clear</p>
        <p className="text-sm mt-1">No pending source links to review</p>
      </div>
    );
  }

  return (
    <div>
      {/* Bulk action bar */}
      {publishers.length > 0 && (
        <div className="flex items-center gap-3 mb-5 p-3 bg-amber-50 border border-amber-200 rounded-lg">
          <span className="text-sm text-amber-800 font-medium">Bulk approve from:</span>
          <select
            value={bulkPublisher}
            onChange={e => setBulkPublisher(e.target.value)}
            className="border border-amber-300 bg-white rounded px-2 py-1 text-sm text-slate-700 focus:outline-none"
          >
            <option value="">Select publisher…</option>
            {publishers.map(p => (
              <option key={p} value={p}>{p} ({pendingLinks.filter(l => l.publisher === p).length})</option>
            ))}
          </select>
          <Button
            size="sm"
            className="bg-amber-600 hover:bg-amber-700 text-white"
            disabled={!bulkPublisher || bulkApproveMutation.isPending}
            onClick={() => bulkApproveMutation.mutate({ publisher: bulkPublisher })}
          >
            Approve all
          </Button>
        </div>
      )}

      <div className="text-sm text-slate-500 mb-3">{pendingLinks.length} pending link{pendingLinks.length !== 1 ? 's' : ''}</div>

      <div className="space-y-3">
        {pendingLinks.map((link, i) => (
          <div key={i} className="bg-white border border-amber-200 rounded-lg p-4">
            <div className="flex items-start justify-between gap-3 mb-3">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-xs font-medium px-1.5 py-0.5 bg-amber-100 text-amber-800 rounded border border-amber-200 uppercase tracking-wide">
                    PENDING
                  </span>
                  {link.publisher && <span className="text-xs text-slate-500 font-medium">{link.publisher}</span>}
                  {link.date && <span className="text-xs text-slate-400">{link.date}</span>}
                </div>
                <p className="font-semibold text-slate-800 text-sm leading-snug">{link.title}</p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <Button
                  size="sm"
                  className="h-7 bg-green-600 hover:bg-green-700 text-white text-xs"
                  onClick={() => approveMutation.mutate({ link })}
                  disabled={approveMutation.isPending}
                >
                  <CheckCircle className="w-3 h-3 mr-1" /> Approve
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 text-xs text-red-600 border-red-200 hover:bg-red-50"
                  onClick={() => rejectMutation.mutate({ link })}
                  disabled={rejectMutation.isPending}
                >
                  <XCircle className="w-3 h-3 mr-1" /> Reject
                </Button>
              </div>
            </div>

            <div className="flex items-center gap-2 mb-3 flex-wrap">
              <span className="text-xs text-slate-500">→ Trend:</span>
              <span className="text-xs font-semibold text-slate-800 bg-slate-100 px-2 py-0.5 rounded border border-slate-200">
                {link._trend?.trend_name}
              </span>
              <span className="text-xs text-slate-400">{link._trend?.category}</span>
            </div>

            <div className="mb-3">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-xs text-slate-500">Confidence score</span>
                <span className={`text-xs font-bold px-1.5 py-0.5 rounded ${
                  (link.confidence_score || 0) >= 70 ? 'bg-green-100 text-green-700' :
                  (link.confidence_score || 0) >= 40 ? 'bg-amber-100 text-amber-700' :
                  'bg-red-100 text-red-600'
                }`}>
                  {link.link_confidence?.toUpperCase() || 'MEDIUM'}
                </span>
              </div>
              <ConfidenceBar score={link.confidence_score} />
            </div>

            {link.confidence_reasoning && (
              <p className="text-xs text-slate-500 bg-slate-50 border border-slate-100 rounded p-2 mb-3 italic">
                {link.confidence_reasoning}
              </p>
            )}

            {link.keyword_overlap?.length > 0 && (
              <div className="flex flex-wrap gap-1">
                <span className="text-xs text-slate-400 mr-1">Keywords:</span>
                {link.keyword_overlap.map((kw, ki) => (
                  <span key={ki} className="text-xs px-1.5 py-0.5 bg-blue-50 text-blue-700 rounded-full border border-blue-100">
                    {kw}
                  </span>
                ))}
              </div>
            )}

            {link.key_finding && (
              <p className="text-xs text-slate-500 mt-2 italic">"{link.key_finding}"</p>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}