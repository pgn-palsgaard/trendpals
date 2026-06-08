import React, { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { toast } from 'sonner';
import { AlertTriangle, AlertCircle, Clock, Zap, ChevronDown, ChevronUp, CheckCircle2 } from 'lucide-react';
import { Button } from '@/components/ui/button';

export default function NeedsAttentionWidget({ sources, onRefresh }) {
  const queryClient = useQueryClient();
  const [expandedFailed, setExpandedFailed] = useState(false);
  const [expandedVerify, setExpandedVerify] = useState(false);

  const failedSources = sources.filter(s => s.metadata_extraction?.status === 'failed');
  const awaitingVerification = sources.filter(
    s => s.metadata_extraction?.status === 'extracted' && !s.metadata_extraction?.verified
  );
  const readyUnprocessed = sources.filter(
    s => s.status === 'ready' && s.rag_processed !== true && s.metadata_extraction?.verified === true
  );

  const totalIssues = failedSources.length + awaitingVerification.length + readyUnprocessed.length;

  const verifyMutation = useMutation({
    mutationFn: async ({ sourceId }) => {
      const sources = await base44.entities.Source.filter({ id: sourceId });
      const src = sources[0];
      await base44.entities.Source.update(sourceId, {
        metadata_extraction: {
          ...src.metadata_extraction,
          verified: true,
        }
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['knowledgeSources'] });
      toast.success('Source verified — Source Processor will run automatically');
    },
    onError: (e) => toast.error(e.message),
  });

  const processNowMutation = useMutation({
    mutationFn: async ({ sourceId }) => {
      const res = await base44.functions.invoke('triggerSourceProcessor', {
        source_id: sourceId,
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

  const bulkProcessMutation = useMutation({
    mutationFn: async () => {
      for (const src of readyUnprocessed) {
        await base44.functions.invoke('triggerSourceProcessor', {
          source_id: src.id,
          triggered_by: 'manual_button',
        });
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['processingRuns'] });
      toast.success(`Queued ${readyUnprocessed.length} sources for processing`);
      onRefresh();
    },
    onError: (e) => toast.error(e.message),
  });

  if (totalIssues === 0) return null;

  return (
    <div className="border border-amber-200 bg-amber-50 rounded-xl p-4 space-y-3">
      <div className="flex items-center gap-2 mb-1">
        <AlertTriangle className="w-4 h-4 text-amber-600" />
        <span className="text-sm font-semibold text-amber-900">Needs your attention ({totalIssues})</span>
      </div>

      {/* Failed extraction */}
      {failedSources.length > 0 && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-red-700">
              <AlertCircle className="w-4 h-4" />
              <span className="text-sm font-medium">{failedSources.length} source{failedSources.length > 1 ? 's' : ''} with failed extraction</span>
            </div>
            <button onClick={() => setExpandedFailed(v => !v)} className="p-1 hover:opacity-70 text-red-500">
              {expandedFailed ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
            </button>
          </div>
          {expandedFailed && (
            <div className="mt-3 space-y-2">
              {failedSources.map(src => (
                <div key={src.id} className="bg-white rounded border border-red-100 p-3">
                  <p className="text-sm font-medium text-slate-800 truncate">{src.title}</p>
                  {src.metadata_extraction?.missing_fields?.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-1">
                      <span className="text-xs text-slate-500">Missing:</span>
                      {src.metadata_extraction.missing_fields.map(f => (
                        <span key={f} className="text-xs px-1.5 py-0.5 bg-red-100 text-red-700 rounded">{f}</span>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Awaiting verification */}
      {awaitingVerification.length > 0 && (
        <div className="rounded-lg border border-amber-200 bg-amber-50/70 px-4 py-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-amber-800">
              <Clock className="w-4 h-4" />
              <span className="text-sm font-medium">{awaitingVerification.length} source{awaitingVerification.length > 1 ? 's' : ''} awaiting verification</span>
            </div>
            <button onClick={() => setExpandedVerify(v => !v)} className="p-1 hover:opacity-70 text-amber-600">
              {expandedVerify ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
            </button>
          </div>
          {expandedVerify && (
            <div className="mt-3 space-y-2">
              {awaitingVerification.map(src => {
                const extracted = src.metadata_extraction?.extracted_data || {};
                return (
                  <div key={src.id} className="bg-white rounded border border-amber-100 p-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-slate-800 truncate">{src.title}</p>
                        <div className="flex flex-wrap gap-2 mt-1 text-xs text-slate-500">
                          {extracted.publisher && <span>Publisher: <strong>{extracted.publisher}</strong></span>}
                          {extracted.category && <span>Category: <strong>{extracted.category}</strong></span>}
                          {extracted.region_code && <span>Region: <strong>{extracted.region_code}</strong></span>}
                          {extracted.date_published && <span>Date: <strong>{extracted.date_published}</strong></span>}
                        </div>
                        {extracted.source_type && extracted.source_type !== src.source_type && (
                          <div className="mt-1 text-xs px-2 py-1 bg-blue-50 text-blue-700 rounded border border-blue-100 inline-block">
                            AI suggests type: <strong>{extracted.source_type}</strong> — confirm or keep current
                          </div>
                        )}
                      </div>
                      <Button
                        size="sm"
                        className="h-7 text-xs bg-green-600 hover:bg-green-700 shrink-0"
                        onClick={() => verifyMutation.mutate({ sourceId: src.id })}
                        disabled={verifyMutation.isPending}
                      >
                        <CheckCircle2 className="w-3 h-3 mr-1" /> Verify
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Ready but unprocessed */}
      {readyUnprocessed.length > 0 && (
        <div className="rounded-lg border border-blue-200 bg-blue-50/60 px-4 py-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-blue-800">
              <Zap className="w-4 h-4" />
              <span className="text-sm font-medium">{readyUnprocessed.length} source{readyUnprocessed.length > 1 ? 's' : ''} ready but unprocessed</span>
            </div>
            <Button
              size="sm"
              className="h-7 text-xs bg-blue-600 hover:bg-blue-700"
              onClick={() => bulkProcessMutation.mutate()}
              disabled={bulkProcessMutation.isPending}
            >
              <Zap className="w-3 h-3 mr-1" />
              Process all {readyUnprocessed.length}
            </Button>
          </div>
          <div className="mt-2 space-y-1.5">
            {readyUnprocessed.map(src => (
              <div key={src.id} className="flex items-center justify-between bg-white rounded border border-blue-100 px-3 py-1.5">
                <span className="text-xs text-slate-700 truncate flex-1">{src.title}</span>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-6 text-xs text-blue-600 shrink-0"
                  onClick={() => processNowMutation.mutate({ sourceId: src.id })}
                  disabled={processNowMutation.isPending}
                >
                  Process now
                </Button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}