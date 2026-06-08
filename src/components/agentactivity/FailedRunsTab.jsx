import React, { useState } from 'react';
import { format, parseISO } from 'date-fns';
import { ChevronRight, RotateCcw } from 'lucide-react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import RunDetailPanel from './RunDetailPanel';

function formatDate(dt) {
  if (!dt) return '—';
  try { return format(parseISO(dt), 'dd MMM yyyy HH:mm'); } catch { return dt; }
}

export default function FailedRunsTab({ runs, isLoading }) {
  const queryClient = useQueryClient();
  const [selectedRun, setSelectedRun] = useState(null);

  const retryMutation = useMutation({
    mutationFn: async ({ source_id }) => {
      const resp = await base44.functions.invoke('triggerSourceProcessor', {
        source_id,
        triggered_by: 'retry',
      });
      return resp.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['processingRuns'] });
      toast.success('Retry queued');
    },
    onError: (err) => toast.error(err.message),
  });

  if (isLoading) {
    return <div className="flex items-center justify-center py-24"><div className="w-8 h-8 border-4 border-slate-200 border-t-slate-700 rounded-full animate-spin" /></div>;
  }

  if (runs.length === 0) {
    return (
      <div className="text-center py-24 text-slate-400">
        <p className="text-lg font-medium">No failed runs</p>
        <p className="text-sm mt-1">Any failed Source Processor runs will appear here</p>
      </div>
    );
  }

  return (
    <div>
      <div className="text-sm text-slate-500 mb-3">{runs.length} failed run{runs.length !== 1 ? 's' : ''}</div>
      <div className="space-y-2">
        {runs.map(run => (
          <div key={run.id} className="bg-white border border-red-200 rounded-lg p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="flex-1 min-w-0 cursor-pointer" onClick={() => setSelectedRun(run)}>
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-xs px-2 py-0.5 rounded-full border font-medium bg-red-100 text-red-700 border-red-200">
                    failed
                  </span>
                  <span className="text-xs text-slate-400 capitalize">{run.triggered_by?.replace(/_/g, ' ')}</span>
                  <span className="text-xs text-slate-400">{formatDate(run.started_at)}</span>
                </div>
                <p className="font-medium text-slate-800 text-sm truncate">{run.source_title || run.source_id}</p>
                {run.source_publisher && <p className="text-xs text-slate-500">{run.source_publisher}</p>}
                {run.fatal_error && (
                  <p className="text-xs text-red-600 mt-1 bg-red-50 border border-red-100 rounded px-2 py-1 truncate">
                    {run.fatal_error}
                  </p>
                )}
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 text-xs"
                  onClick={() => retryMutation.mutate({ source_id: run.source_id })}
                  disabled={retryMutation.isPending}
                >
                  <RotateCcw className="w-3 h-3 mr-1" /> Retry
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 text-xs text-slate-500"
                  onClick={() => setSelectedRun(run)}
                >
                  <ChevronRight className="w-4 h-4" />
                </Button>
              </div>
            </div>
          </div>
        ))}
      </div>

      {selectedRun && (
        <RunDetailPanel run={selectedRun} onClose={() => setSelectedRun(null)} />
      )}
    </div>
  );
}