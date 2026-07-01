import React, { useState, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { toast } from 'sonner';
import { Sparkles } from 'lucide-react';
import SignalClusterCard from '@/components/emerging/SignalClusterCard';
import PromoteSignalModal from '@/components/emerging/PromoteSignalModal';

const STRENGTH_RANK = { strong: 0, moderate: 1, none: 2 };

export default function EmergingSignals() {
  const queryClient = useQueryClient();
  const [promoting, setPromoting] = useState(null);
  const [busyId, setBusyId] = useState(null);

  const { data: clusters = [], isLoading } = useQuery({
    queryKey: ['emergingSignals'],
    queryFn: async () => {
      const [emerging, snoozed] = await Promise.all([
        base44.entities.EmergingSignalCluster.filter({ status: 'emerging' }, '-detected_at', 500),
        base44.entities.EmergingSignalCluster.filter({ status: 'snoozed' }, '-detected_at', 500),
      ]);
      const now = Date.now();
      // Snoozed clusters re-appear only once snoozed_until has passed.
      const wokenSnoozed = snoozed.filter(c => c.snoozed_until && new Date(c.snoozed_until).getTime() < now);
      return [...emerging, ...wokenSnoozed];
    },
  });

  const sorted = useMemo(() => {
    return [...clusters].sort((a, b) => {
      const s = (STRENGTH_RANK[a.gnpd_evidence_strength] ?? 3) - (STRENGTH_RANK[b.gnpd_evidence_strength] ?? 3);
      if (s !== 0) return s;
      const d = (b.source_diversity_count || 0) - (a.source_diversity_count || 0);
      if (d !== 0) return d;
      return new Date(b.detected_at || 0) - new Date(a.detected_at || 0);
    });
  }, [clusters]);

  const refresh = () => queryClient.invalidateQueries({ queryKey: ['emergingSignals'] });

  const handlePromoteClick = async (cluster) => {
    // Aggregate + dedupe keywords from the cluster's excerpt_refs' source excerpts.
    setBusyId(cluster.id);
    try {
      const bySource = {};
      for (const r of (cluster.excerpt_refs || [])) {
        if (!bySource[r.source_id]) bySource[r.source_id] = [];
        bySource[r.source_id].push(r.excerpt_index);
      }
      const kw = new Set();
      const sources = await Promise.all(Object.keys(bySource).map(id => base44.entities.Source.get(id).catch(() => null)));
      for (const s of sources) {
        if (!s) continue;
        for (const idx of bySource[s.id]) {
          const ex = s.excerpts?.[idx];
          (ex?.trend_keywords || []).forEach(k => kw.add(k));
        }
      }
      setPromoting({ ...cluster, _aggregatedKeywords: [...kw] });
    } finally {
      setBusyId(null);
    }
  };

  const handleDismiss = async (cluster) => {
    const reason = window.prompt('Optional — why is this being dismissed?') ?? '';
    setBusyId(cluster.id);
    try {
      await base44.entities.EmergingSignalCluster.update(cluster.id, { status: 'dismissed', dismiss_reason: reason || null });
      toast.success('Signal dismissed');
      refresh();
    } finally {
      setBusyId(null);
    }
  };

  const handleSnooze = async (cluster) => {
    setBusyId(cluster.id);
    try {
      const until = new Date(Date.now() + 30 * 86400000).toISOString();
      await base44.entities.EmergingSignalCluster.update(cluster.id, { status: 'snoozed', snoozed_until: until });
      toast.success('Snoozed for 30 days');
      refresh();
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-6xl mx-auto px-4 md:px-6 py-8">
        <div className="mb-6">
          <h1 className="page-title flex items-center gap-2"><Sparkles className="w-6 h-6 text-pal-blue" />Emerging signals</h1>
          <p className="page-subtitle mt-1">Clusters of report-worthy evidence with no home in the active trend library yet. Promote, dismiss, or snooze each.</p>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-24">
            <div className="w-8 h-8 border-4 border-muted border-t-pal-blue rounded-full animate-spin" />
          </div>
        ) : sorted.length === 0 ? (
          <div className="text-center py-24 text-muted-foreground">
            <Sparkles className="w-10 h-10 mx-auto mb-3 opacity-40" />
            <p className="text-lg font-medium">No emerging signals detected yet</p>
            <p className="text-sm mt-1">The next detection run is scheduled for the 1st of each month at 06:00 UTC.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {sorted.map(cluster => (
              <SignalClusterCard
                key={cluster.id}
                cluster={cluster}
                onPromote={handlePromoteClick}
                onDismiss={handleDismiss}
                onSnooze={handleSnooze}
                busy={busyId === cluster.id}
              />
            ))}
          </div>
        )}
      </div>

      {promoting && (
        <PromoteSignalModal
          cluster={promoting}
          onClose={() => setPromoting(null)}
          onPromoted={(trend) => {
            setPromoting(null);
            toast.success(`"${trend.trend_name}" created and activated`);
            refresh();
            queryClient.invalidateQueries({ queryKey: ['globalTrends'] });
          }}
        />
      )}
    </div>
  );
}