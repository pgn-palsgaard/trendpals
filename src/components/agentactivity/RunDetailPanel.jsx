import React from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { toast } from 'sonner';
import { X, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { format, parseISO } from 'date-fns';

const ACTION_TYPE_LABELS = {
  excerpt_extracted: 'Excerpt extracted',
  trend_linked_auto: 'Auto-linked to trend',
  trend_link_proposed: 'Link proposed (pending)',
  trend_link_rejected: 'Link rejected',
  new_trend_proposed: 'New trend proposed',
  skip_rule_applied: 'Skipped',
};

const ACTION_COLORS = {
  trend_linked_auto: 'bg-green-50 border-green-200 text-green-700',
  trend_link_proposed: 'bg-amber-50 border-amber-200 text-amber-700',
  trend_link_rejected: 'bg-slate-100 border-slate-200 text-slate-500',
  new_trend_proposed: 'bg-violet-50 border-violet-200 text-violet-700',
  excerpt_extracted: 'bg-blue-50 border-blue-200 text-blue-700',
  skip_rule_applied: 'bg-slate-100 border-slate-200 text-slate-500',
};

function formatDate(dt) {
  if (!dt) return '—';
  try { return format(parseISO(dt), 'dd MMM yyyy HH:mm'); } catch { return dt; }
}

export default function RunDetailPanel({ run, onClose }) {
  const queryClient = useQueryClient();

  const revertMutation = useMutation({
    mutationFn: async ({ action }) => {
      // Remove source entry from GlobalTrend.sources[] where auto_linked=true and linked_via_run_id matches
      const trends = await base44.entities.GlobalTrend.filter({ id: action.target_globaltrend_id });
      const trend = trends[0];
      if (!trend) throw new Error('Trend not found');
      const updatedSources = (trend.sources || []).map(s => {
        if (s.linked_via_run_id === run.id && s.review_status === 'auto_applied' && s.title === action.target_globaltrend_name) {
          return null; // mark for removal
        }
        // Match by run_id
        if (s.auto_linked && s.linked_via_run_id === run.id) {
          return null;
        }
        return s;
      }).filter(Boolean);
      await base44.entities.GlobalTrend.update(trend.id, { sources: updatedSources });

      // Update action review_status to "reverted"
      const updatedActions = (run.actions || []).map(a => {
        if (a === action || (a.action_type === action.action_type && a.target_globaltrend_id === action.target_globaltrend_id && a.excerpt_id === action.excerpt_id)) {
          return { ...a, review_status: 'reverted' };
        }
        return a;
      });
      await base44.entities.ProcessingRun.update(run.id, { actions: updatedActions });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['processingRuns'] });
      queryClient.invalidateQueries({ queryKey: ['globalTrends'] });
      toast.success('Action reverted');
    },
    onError: (err) => toast.error(err.message),
  });

  const actions = run.actions || [];

  return (
    <>
      <div className="fixed inset-0 bg-black/30 z-40" onClick={onClose} />
      <div className="fixed inset-y-0 right-0 z-50 w-full md:w-[520px] bg-white shadow-2xl flex flex-col overflow-hidden">
        {/* Header */}
        <div className="px-5 py-4 border-b border-slate-200 flex items-start justify-between gap-3">
          <div>
            <h2 className="font-bold text-slate-900 text-lg">Run detail</h2>
            <p className="text-sm text-slate-500 mt-0.5 truncate">{run.source_title}</p>
            <div className="flex items-center gap-2 mt-1">
              <span className={`text-xs px-2 py-0.5 rounded-full border font-medium capitalize ${
                run.status === 'completed' ? 'bg-green-100 text-green-700 border-green-200' :
                run.status === 'failed' ? 'bg-red-100 text-red-700 border-red-200' :
                'bg-slate-100 text-slate-600 border-slate-200'
              }`}>{run.status}</span>
              <span className="text-xs text-slate-400">{formatDate(run.started_at)}</span>
              {run.duration_seconds != null && <span className="text-xs text-slate-400">{run.duration_seconds}s</span>}
              <span className="text-xs text-slate-400 capitalize">{run.triggered_by?.replace(/_/g, ' ')}</span>
            </div>
          </div>
          <button onClick={onClose} className="p-1 rounded hover:bg-slate-100 text-slate-500 shrink-0">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Summary chips */}
        <div className="px-5 py-3 border-b border-slate-100 flex flex-wrap gap-2">
          {run.excerpts_extracted > 0 && <span className="text-xs px-2 py-0.5 rounded-full bg-blue-50 text-blue-600 border border-blue-100">{run.excerpts_extracted} excerpts</span>}
          {run.high_confidence_links > 0 && <span className="text-xs px-2 py-0.5 rounded-full bg-green-50 text-green-700 border border-green-200">{run.high_confidence_links} auto-linked</span>}
          {run.medium_confidence_links > 0 && <span className="text-xs px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-200">{run.medium_confidence_links} pending review</span>}
          {run.low_confidence_rejects > 0 && <span className="text-xs px-2 py-0.5 rounded-full bg-slate-100 text-slate-500 border border-slate-200">{run.low_confidence_rejects} rejected</span>}
          {run.new_trend_proposals > 0 && <span className="text-xs px-2 py-0.5 rounded-full bg-violet-50 text-violet-700 border border-violet-200">{run.new_trend_proposals} new trend</span>}
        </div>

        {/* Fatal error */}
        {run.fatal_error && (
          <div className="px-5 py-3 border-b border-red-100 bg-red-50">
            <p className="text-xs text-red-700 font-medium">Fatal error</p>
            <p className="text-xs text-red-600 mt-0.5">{run.fatal_error}</p>
          </div>
        )}

        {/* Actions list */}
        <div className="flex-1 overflow-y-auto px-5 py-4">
          {actions.length === 0 ? (
            <p className="text-sm text-slate-400 italic text-center py-12">No actions logged</p>
          ) : (
            <div className="space-y-3">
              {actions.map((action, i) => {
                const canRevert = action.review_status === 'auto_applied' && action.action_type === 'trend_linked_auto';
                return (
                  <div key={i} className={`rounded-lg border p-3 ${ACTION_COLORS[action.action_type] || 'bg-slate-50 border-slate-200'}`}>
                    <div className="flex items-start justify-between gap-2 mb-1">
                      <span className="text-xs font-semibold uppercase tracking-wide">
                        {ACTION_TYPE_LABELS[action.action_type] || action.action_type}
                      </span>
                      {action.review_status === 'reverted' && (
                        <span className="text-xs px-1.5 py-0.5 bg-slate-200 text-slate-500 rounded border border-slate-300">reverted</span>
                      )}
                      {canRevert && action.review_status !== 'reverted' && (
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-5 text-xs py-0 px-2 text-slate-600"
                          onClick={() => revertMutation.mutate({ action })}
                          disabled={revertMutation.isPending}
                        >
                          <RotateCcw className="w-2.5 h-2.5 mr-1" /> Revert
                        </Button>
                      )}
                    </div>

                    {action.target_globaltrend_name && (
                      <p className="text-xs font-medium text-slate-700 mb-1">
                        Trend: <span className="font-semibold">{action.target_globaltrend_name}</span>
                      </p>
                    )}

                    {action.link_confidence && (
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-xs text-slate-500">Confidence:</span>
                        <span className={`text-xs font-bold px-1.5 py-0 rounded ${
                          action.link_confidence === 'high' ? 'bg-green-100 text-green-700' :
                          action.link_confidence === 'medium' ? 'bg-amber-100 text-amber-700' :
                          'bg-slate-100 text-slate-500'
                        }`}>{action.link_confidence?.toUpperCase()} {action.confidence_score != null ? `(${action.confidence_score})` : ''}</span>
                      </div>
                    )}

                    {action.confidence_reasoning && (
                      <p className="text-xs italic text-slate-500 mt-1">{action.confidence_reasoning}</p>
                    )}

                    {action.keyword_overlap?.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-1">
                        {action.keyword_overlap.map((kw, ki) => (
                          <span key={ki} className="text-xs px-1.5 py-0 rounded-full bg-white/60 border border-current opacity-70">{kw}</span>
                        ))}
                      </div>
                    )}

                    {action.timestamp && (
                      <p className="text-xs text-slate-400 mt-1">{formatDate(action.timestamp)}</p>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </>
  );
}