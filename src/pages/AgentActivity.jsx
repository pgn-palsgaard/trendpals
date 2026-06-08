import React, { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { toast } from 'sonner';
import PendingLinksTab from '@/components/agentactivity/PendingLinksTab';
import RecentRunsTab from '@/components/agentactivity/RecentRunsTab';
import FailedRunsTab from '@/components/agentactivity/FailedRunsTab';

const TABS = [
  { key: 'pending', label: 'Pending links' },
  { key: 'recent', label: 'Recent runs' },
  { key: 'failed', label: 'Failed runs' },
];

export default function AgentActivity() {
  const [tab, setTab] = useState('pending');

  const { data: globalTrends = [], isLoading: trendsLoading } = useQuery({
    queryKey: ['globalTrends'],
    queryFn: () => base44.entities.GlobalTrend.list(),
  });

  const { data: runs = [], isLoading: runsLoading } = useQuery({
    queryKey: ['processingRuns'],
    queryFn: () => base44.entities.ProcessingRun.list('-started_at', 50),
  });

  // Flatten all pending source links across all active GlobalTrends
  const pendingLinks = useMemo(() => {
    const links = [];
    globalTrends.filter(t => t.is_active).forEach(trend => {
      (trend.sources || []).forEach(src => {
        if (src.review_status === 'pending') {
          links.push({ ...src, _trend: trend, _trend_id: trend.id });
        }
      });
    });
    // Sort by linked_via_run_id (most recent run first — string sort ok for ISO ids)
    return links.sort((a, b) => {
      const aDate = a.linked_at || a.date || '';
      const bDate = b.linked_at || b.date || '';
      return bDate.localeCompare(aDate);
    });
  }, [globalTrends]);

  const pendingCount = pendingLinks.length;
  const recentRuns = useMemo(() => runs.filter(r => r.status !== 'failed'), [runs]);
  const failedRuns = useMemo(() => runs.filter(r => r.status === 'failed'), [runs]);

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="max-w-6xl mx-auto px-4 md:px-6 py-8">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-slate-900">Agent Activity</h1>
          <p className="text-sm text-slate-500 mt-1">
            Source Processor runs, confidence-scored trend links, and review queue
          </p>
        </div>

        {/* Tabs */}
        <div className="flex items-center bg-white border border-slate-200 rounded-lg p-1 gap-1 mb-6 w-fit">
          {TABS.map(t => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`relative px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${
                tab === t.key
                  ? 'bg-slate-900 text-white'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
              }`}
            >
              {t.label}
              {t.key === 'pending' && pendingCount > 0 && (
                <span className="ml-1.5 inline-flex items-center justify-center w-4 h-4 rounded-full bg-amber-500 text-white text-xs font-bold">
                  {pendingCount > 9 ? '9+' : pendingCount}
                </span>
              )}
              {t.key === 'failed' && failedRuns.length > 0 && (
                <span className="ml-1.5 inline-flex items-center justify-center w-4 h-4 rounded-full bg-red-500 text-white text-xs font-bold">
                  {failedRuns.length > 9 ? '9+' : failedRuns.length}
                </span>
              )}
            </button>
          ))}
        </div>

        {tab === 'pending' && (
          <PendingLinksTab
            pendingLinks={pendingLinks}
            globalTrends={globalTrends}
            isLoading={trendsLoading}
          />
        )}
        {tab === 'recent' && (
          <RecentRunsTab
            runs={recentRuns}
            isLoading={runsLoading}
          />
        )}
        {tab === 'failed' && (
          <FailedRunsTab
            runs={failedRuns}
            isLoading={runsLoading}
          />
        )}
      </div>
    </div>
  );
}