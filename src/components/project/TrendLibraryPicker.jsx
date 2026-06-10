import React from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { CheckCircle2, Loader2, Library } from 'lucide-react';
import { toast } from 'sonner';

export default function TrendLibraryPicker({ project, trendCandidates }) {
  const queryClient = useQueryClient();

  const { data: trends = [], isLoading } = useQuery({
    queryKey: ['globalTrendsForPicker'],
    queryFn: () => base44.entities.GlobalTrend.filter({ is_active: true }, '-updated_date', 200),
  });

  const categoryTrends = trends.filter(t =>
    !project.category || (t.category || '').toLowerCase() === project.category.toLowerCase()
  );
  const visible = categoryTrends.length > 0 ? categoryTrends : trends;
  const fallbackToAll = categoryTrends.length === 0 && trends.length > 0;

  const byGlobalId = {};
  trendCandidates.forEach(tc => { if (tc.global_trend_id) byGlobalId[tc.global_trend_id] = tc; });

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

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Library className="w-5 h-5 text-blue-600" />
          Select trends from the Trend Library
        </CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-slate-600 mb-4">
          {selectedCount} selected (select 3–5). Showing active {project.category} trends
          {fallbackToAll ? ' — no category match, showing all categories' : ''}.
        </p>
        {isLoading ? (
          <Loader2 className="w-5 h-5 animate-spin text-slate-400" />
        ) : (
          <div className="space-y-2 max-h-96 overflow-y-auto">
            {visible.map(gt => {
              const candidate = byGlobalId[gt.id];
              const isSelected = candidate?.is_selected;
              const manifestation = (gt.regional_manifestations || []).find(m => m.region === project.region_code);
              return (
                <button
                  key={gt.id}
                  onClick={() => toggleMutation.mutate(gt)}
                  disabled={toggleMutation.isPending}
                  className={`w-full text-left p-3 rounded-lg border flex items-start gap-3 transition-all ${
                    isSelected ? 'border-blue-500 bg-blue-50' : 'border-slate-200 hover:border-slate-300'
                  }`}
                >
                  <span className={`mt-0.5 w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 ${
                    isSelected ? 'bg-blue-600 border-blue-600' : 'border-slate-300'
                  }`}>
                    {isSelected && <CheckCircle2 className="w-3.5 h-3.5 text-white" />}
                  </span>
                  <span className="min-w-0">
                    <span className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium text-slate-900">{gt.trend_name}</span>
                      {gt.mega_trend && <Badge variant="outline" className="text-xs">{gt.mega_trend}</Badge>}
                      {manifestation && (
                        <Badge className="bg-green-100 text-green-700 text-xs">{project.region_code} signal</Badge>
                      )}
                    </span>
                    {gt.market_signal && (
                      <span className="block text-xs text-slate-500 mt-1">{gt.market_signal}</span>
                    )}
                  </span>
                </button>
              );
            })}
            {visible.length === 0 && (
              <p className="text-sm text-slate-400">No active trends in the library yet.</p>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}