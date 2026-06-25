import React, { useMemo } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent } from '@/components/ui/card';
import { Loader2, Library } from 'lucide-react';
import { toast } from 'sonner';
import ProductProofPanel from './ProductProofPanel';
import RankedTrendCard from './RankedTrendCard';
import PotentialNewTrends from './PotentialNewTrends';
import { computeRelevanceScore, findPotentialNewTrends } from './trendRanking';

export default function ProjectTrends({ project, trendCandidates, sources }) {
  const queryClient = useQueryClient();

  // 4A — library trends: active + same category as the project.
  const { data: libraryTrends = [], isLoading } = useQuery({
    queryKey: ['globalTrendsForPicker'],
    queryFn: () => base44.entities.GlobalTrend.filter({ is_active: true }, '-updated_date', 300),
  });

  // 4A — GNPD products linked to this project's category (for GNPD evidence scoring).
  const { data: gnpdProducts = [] } = useQuery({
    queryKey: ['gnpdForRanking', project.category],
    queryFn: () => base44.entities.GNPDProduct.filter({ palsgaard_category: project.category }, '-created_date', 500),
    enabled: !!project.category,
  });

  // 4A — project source excerpts.
  const projectExcerpts = useMemo(
    () => (sources || []).flatMap(s => s.excerpts || []),
    [sources]
  );

  const categoryTrends = useMemo(
    () => libraryTrends.filter(t => (t.category || '').toLowerCase() === (project.category || '').toLowerCase()),
    [libraryTrends, project.category]
  );

  // 4B — rank.
  const ranked = useMemo(() => {
    return categoryTrends
      .map(t => {
        const { score, matchingExcerpts } = computeRelevanceScore(t, projectExcerpts, gnpdProducts, project.category);
        return { trend: t, score, matchingExcerpts };
      })
      .sort((a, b) => b.score - a.score);
  }, [categoryTrends, projectExcerpts, gnpdProducts, project.category]);

  // 4D — potential new trends from strong unmatched signals.
  const newTrendCandidates = useMemo(
    () => findPotentialNewTrends(sources, libraryTrends),
    [sources, libraryTrends]
  );

  // Map global_trend_id → TrendCandidate selection record.
  const byGlobalId = useMemo(() => {
    const m = {};
    trendCandidates.forEach(tc => { if (tc.global_trend_id) m[tc.global_trend_id] = tc; });
    return m;
  }, [trendCandidates]);

  const toggleMutation = useMutation({
    mutationFn: async (gt) => {
      const existing = byGlobalId[gt.id];
      if (existing) {
        await base44.entities.TrendCandidate.update(existing.id, { is_selected: !existing.is_selected });
      } else {
        await base44.entities.TrendCandidate.create({
          project_id: project.id,
          global_trend_id: gt.id,
          trend_name: gt.trend_name,
          is_selected: true,
          migration_status: 'mapped',
        });
      }
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['trendCandidates', project.id] }),
    onError: (e) => toast.error(e.message),
  });

  const selectedCount = trendCandidates.filter(t => t.is_selected && t.global_trend_id).length;
  const selectedCandidates = trendCandidates.filter(t => t.is_selected && t.global_trend_id);

  return (
    <div className="space-y-6">
      {/* Library-first ranked list */}
      <div>
        <div className="flex items-center gap-2 mb-1">
          <Library className="w-5 h-5 text-pal-blue" />
          <h2 className="text-lg font-semibold text-slate-900">Select trends from the Trend Library</h2>
        </div>
        <p className="text-sm text-slate-600 mb-4">
          {selectedCount} selected (select 3–5). Ranked by evidence match against this project's sources, GNPD launches, and trend confidence.
        </p>

        {isLoading ? (
          <Loader2 className="w-5 h-5 animate-spin text-slate-400" />
        ) : ranked.length === 0 ? (
          <Card>
            <CardContent className="p-6 text-sm text-slate-500">
              No active {project.category} trends in the library yet.
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {ranked.map(({ trend, score, matchingExcerpts }) => (
              <RankedTrendCard
                key={trend.id}
                trend={trend}
                isSelected={!!byGlobalId[trend.id]?.is_selected}
                relevanceScore={score}
                matchingExcerpts={matchingExcerpts}
                disabled={toggleMutation.isPending}
                onToggle={() => toggleMutation.mutate(trend)}
              />
            ))}
          </div>
        )}
      </div>

      {/* 4D — potential new trends */}
      <PotentialNewTrends project={project} candidates={newTrendCandidates} />

      {selectedCandidates.length > 0 && (
        <div className="space-y-4">
          {selectedCandidates.map(trend => (
            <ProductProofPanel
              key={trend.id}
              trend={trend}
              projectId={project.id}
              project={project}
            />
          ))}
        </div>
      )}
    </div>
  );
}