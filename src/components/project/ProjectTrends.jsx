import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Sparkles, TrendingUp, CheckCircle2, XCircle, AlertCircle, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

export default function ProjectTrends({ project, trendCandidates, sources }) {
  const queryClient = useQueryClient();
  const [generating, setGenerating] = useState(false);

  const generateTrendsMutation = useMutation({
    mutationFn: async () => {
      setGenerating(true);
      const response = await base44.functions.invoke('generateTrends', {
        project_id: project.id
      });
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['trendCandidates', project.id] });
      queryClient.invalidateQueries({ queryKey: ['project', project.id] });
      toast.success('Trend candidates generated');
      setGenerating(false);
    },
    onError: (error) => {
      toast.error(error.message || 'Failed to generate trends');
      setGenerating(false);
    }
  });

  const toggleTrendMutation = useMutation({
    mutationFn: async ({ trendId, isSelected }) => {
      await base44.entities.TrendCandidate.update(trendId, { is_selected: isSelected });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['trendCandidates', project.id] });
    }
  });

  const confidenceColors = {
    high: 'bg-green-100 text-green-700 border-green-200',
    medium: 'bg-yellow-100 text-yellow-700 border-yellow-200',
    low: 'bg-red-100 text-red-700 border-red-200'
  };

  const selectedCount = trendCandidates.filter(t => t.is_selected).length;
  const canGenerate = sources.length > 0 && !generating;

  return (
    <div className="space-y-6">
      {/* Generate Section */}
      <Card>
        <CardHeader>
          <CardTitle>Trend Generation</CardTitle>
        </CardHeader>
        <CardContent>
          {trendCandidates.length === 0 ? (
            <div className="text-center py-8">
              <Sparkles className="w-12 h-12 mx-auto mb-4 text-purple-400" />
              <p className="text-slate-600 mb-4">
                Generate 5-7 trend candidates from your uploaded sources
              </p>
              <Button
                onClick={() => generateTrendsMutation.mutate()}
                disabled={!canGenerate}
                className="bg-purple-600 hover:bg-purple-700"
              >
                {generating ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Generating...
                  </>
                ) : (
                  <>
                    <Sparkles className="w-4 h-4 mr-2" />
                    Generate Trend Candidates
                  </>
                )}
              </Button>
              {sources.length === 0 && (
                <p className="text-sm text-slate-500 mt-4">
                  Upload sources first to enable trend generation
                </p>
              )}
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <p className="text-sm text-slate-600">
                  {selectedCount} of {trendCandidates.length} trends selected (select 3-5 for final report)
                </p>
                <Button
                  variant="outline"
                  onClick={() => generateTrendsMutation.mutate()}
                  disabled={generating}
                  size="sm"
                >
                  Regenerate
                </Button>
              </div>
              {selectedCount < 3 && (
                <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg text-sm text-blue-800">
                  ℹ️ Select at least 3 trends to proceed to report generation
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Trend Candidates */}
      {trendCandidates.length > 0 && (
        <div className="space-y-4">
          {trendCandidates.map(trend => (
            <Card 
              key={trend.id} 
              className={`transition-all ${
                trend.is_selected 
                  ? 'border-2 border-blue-500 shadow-md' 
                  : 'border-slate-200 hover:border-slate-300'
              }`}
            >
              <CardContent className="p-6">
                <div className="flex items-start gap-4">
                  <button
                    onClick={() => toggleTrendMutation.mutate({ 
                      trendId: trend.id, 
                      isSelected: !trend.is_selected 
                    })}
                    className={`mt-1 flex-shrink-0 w-6 h-6 rounded-full border-2 flex items-center justify-center transition-all ${
                      trend.is_selected
                        ? 'bg-blue-600 border-blue-600'
                        : 'border-slate-300 hover:border-blue-400'
                    }`}
                  >
                    {trend.is_selected && <CheckCircle2 className="w-4 h-4 text-white" />}
                  </button>

                  <div className="flex-1">
                    <div className="flex items-start justify-between mb-3">
                      <h3 className="text-xl font-semibold text-slate-900">{trend.trend_name}</h3>
                      <Badge className={`${confidenceColors[trend.confidence]} border`}>
                        {trend.confidence} confidence
                      </Badge>
                    </div>

                    {trend.whats_changing && trend.whats_changing.length > 0 && (
                      <div className="mb-3">
                        <h4 className="text-sm font-medium text-slate-700 mb-2">What's Changing</h4>
                        <ul className="space-y-1">
                          {trend.whats_changing.map((item, idx) => (
                            <li key={idx} className="text-sm text-slate-600 flex items-start gap-2">
                              <span className="text-blue-600 mt-1">•</span>
                              <span>{item}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {trend.why_now && trend.why_now.length > 0 && (
                      <div className="mb-3">
                        <h4 className="text-sm font-medium text-slate-700 mb-2">Why Now</h4>
                        <ul className="space-y-1">
                          {trend.why_now.map((item, idx) => (
                            <li key={idx} className="text-sm text-slate-600 flex items-start gap-2">
                              <span className="text-purple-600 mt-1">•</span>
                              <span>{item}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {trend.evidence_anchors && (
                      <div className="mb-3 p-3 bg-slate-50 rounded-lg">
                        <h4 className="text-sm font-medium text-slate-700 mb-2">Evidence</h4>
                        <div className="space-y-1 text-xs">
                          {trend.evidence_anchors.mintel_excerpts?.length > 0 && (
                            <p className="text-slate-600">
                              Mintel: {trend.evidence_anchors.mintel_excerpts.length} excerpts
                            </p>
                          )}
                          {trend.evidence_anchors.gnpd_product_ids?.length > 0 && (
                            <p className="text-slate-600">
                              GNPD: {trend.evidence_anchors.gnpd_product_ids.length} products
                            </p>
                          )}
                        </div>
                      </div>
                    )}

                    {trend.what_could_be_wrong && (
                      <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg">
                        <div className="flex items-start gap-2">
                          <AlertCircle className="w-4 h-4 text-amber-600 mt-0.5 flex-shrink-0" />
                          <div>
                            <p className="text-xs font-medium text-amber-900 mb-1">Self-Critique</p>
                            <p className="text-sm text-amber-800">{trend.what_could_be_wrong}</p>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}