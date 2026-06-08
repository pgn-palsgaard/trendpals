import React, { useState } from 'react';
import { format, parseISO } from 'date-fns';
import { ChevronRight, X, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import RunDetailPanel from './RunDetailPanel';

function StatusBadge({ status }) {
  const styles = {
    completed: 'bg-green-100 text-green-700 border-green-200',
    running: 'bg-blue-100 text-blue-700 border-blue-200',
    queued: 'bg-slate-100 text-slate-600 border-slate-200',
    failed: 'bg-red-100 text-red-700 border-red-200',
    skipped: 'bg-slate-100 text-slate-500 border-slate-200',
  };
  return (
    <span className={`text-xs px-2 py-0.5 rounded-full border font-medium capitalize ${styles[status] || styles.queued}`}>
      {status}
    </span>
  );
}

function SummaryChips({ run }) {
  return (
    <div className="flex gap-1.5 flex-wrap">
      {run.high_confidence_links > 0 && (
        <span className="text-xs px-2 py-0.5 rounded-full bg-green-50 text-green-700 border border-green-200 font-medium">
          {run.high_confidence_links} high
        </span>
      )}
      {run.medium_confidence_links > 0 && (
        <span className="text-xs px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-200 font-medium">
          {run.medium_confidence_links} pending
        </span>
      )}
      {run.low_confidence_rejects > 0 && (
        <span className="text-xs px-2 py-0.5 rounded-full bg-slate-100 text-slate-500 border border-slate-200">
          {run.low_confidence_rejects} rejected
        </span>
      )}
      {run.new_trend_proposals > 0 && (
        <span className="text-xs px-2 py-0.5 rounded-full bg-violet-50 text-violet-700 border border-violet-200 font-medium">
          {run.new_trend_proposals} new trend
        </span>
      )}
      {run.excerpts_extracted > 0 && (
        <span className="text-xs px-2 py-0.5 rounded-full bg-blue-50 text-blue-600 border border-blue-100">
          {run.excerpts_extracted} excerpts
        </span>
      )}
    </div>
  );
}

function formatDate(dt) {
  if (!dt) return '—';
  try { return format(parseISO(dt), 'dd MMM yyyy HH:mm'); } catch { return dt; }
}

export default function RecentRunsTab({ runs, isLoading }) {
  const [selectedRun, setSelectedRun] = useState(null);

  if (isLoading) {
    return <div className="flex items-center justify-center py-24"><div className="w-8 h-8 border-4 border-slate-200 border-t-slate-700 rounded-full animate-spin" /></div>;
  }

  if (runs.length === 0) {
    return (
      <div className="text-center py-24 text-slate-400">
        <p className="text-lg font-medium">No runs yet</p>
        <p className="text-sm mt-1">Source Processor runs will appear here</p>
      </div>
    );
  }

  return (
    <div>
      <div className="text-sm text-slate-500 mb-3">{runs.length} run{runs.length !== 1 ? 's' : ''}</div>
      <div className="space-y-2">
        {runs.map(run => (
          <button
            key={run.id}
            onClick={() => setSelectedRun(run)}
            className="w-full text-left bg-white border border-slate-200 rounded-lg p-4 hover:shadow-md transition-shadow"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <StatusBadge status={run.status} />
                  <span className="text-xs text-slate-400 capitalize">{run.triggered_by?.replace(/_/g, ' ')}</span>
                  <span className="text-xs text-slate-400">{formatDate(run.started_at)}</span>
                  {run.duration_seconds != null && (
                    <span className="text-xs text-slate-400">{run.duration_seconds}s</span>
                  )}
                </div>
                <p className="font-medium text-slate-800 text-sm truncate">{run.source_title || run.source_id}</p>
                {run.source_publisher && <p className="text-xs text-slate-500">{run.source_publisher}</p>}
              </div>
              <ChevronRight className="w-4 h-4 text-slate-400 shrink-0 mt-1" />
            </div>
            <div className="mt-2">
              <SummaryChips run={run} />
            </div>
            {run.skip_reason && (
              <p className="text-xs text-slate-400 mt-1 italic">Skipped: {run.skip_reason}</p>
            )}
          </button>
        ))}
      </div>

      {selectedRun && (
        <RunDetailPanel run={selectedRun} onClose={() => setSelectedRun(null)} />
      )}
    </div>
  );
}