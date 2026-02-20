import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Sparkles, TrendingUp, CheckCircle2, XCircle, AlertCircle, Loader2, Brain, Lightbulb, TrendingUpIcon } from 'lucide-react';
import { toast } from 'sonner';
import PackshotManager from './ProductImageManager';
import ProductProofPanel from './ProductProofPanel';

export default function ProjectTrends({ project, trendCandidates, sources, imageExtractions = [] }) {
  const queryClient = useQueryClient();
  const [generating, setGenerating] = useState(false);
  const [gnpdHtmlFile, setGnpdHtmlFile] = useState(null);
  const [gnpdXlsxFile, setGnpdXlsxFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [trendAnalysis, setTrendAnalysis] = useState(null);
  const [showAnalysis, setShowAnalysis] = useState(false);

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

  const handleMergeGNPD = async () => {
    if (!gnpdHtmlFile || !gnpdXlsxFile) {
      toast.error('Please select both HTML and Excel files');
      return;
    }

    // Get unique product IDs from selected trends only
    const selectedTrends = trendCandidates.filter(t => t.is_selected);
    const productIds = new Set();
    selectedTrends.forEach(trend => {
      if (trend.evidence_anchors?.gnpd_products) {
        trend.evidence_anchors.gnpd_products.forEach(product => {
          if (product.record_id) {
            productIds.add(product.record_id);
          }
        });
      }
    });

    const productIdsArray = Array.from(productIds);
    
    if (productIdsArray.length === 0) {
      toast.error('No products found in selected trends. Select trends with GNPD products first.');
      return;
    }

    setUploading(true);
    try {
      // Upload both files
      const htmlUpload = await base44.integrations.Core.UploadFile({ file: gnpdHtmlFile });
      const xlsxUpload = await base44.integrations.Core.UploadFile({ file: gnpdXlsxFile });

      // Create extraction job with specific product IDs
      const extraction = await base44.entities.GNPDImageExtraction.create({
        project_id: project.id,
        html_file_url: htmlUpload.file_url,
        xlsx_file_url: xlsxUpload.file_url,
        product_ids_to_extract: productIdsArray,
        status: 'pending',
        extracted_images: []
      });

      toast.success(`Files uploaded! Processing ${productIdsArray.length} products from selected trends. Job ID: ${extraction.id}`);
      queryClient.invalidateQueries({ queryKey: ['imageExtractions', project.id] });
      setGnpdHtmlFile(null);
      setGnpdXlsxFile(null);
    } catch (error) {
      toast.error(error.message || 'Failed to upload files');
    } finally {
      setUploading(false);
    }
  };

  const resetExtractionMutation = useMutation({
    mutationFn: async () => {
      const response = await base44.functions.invoke('resetImageExtraction', { project_id: project.id });
      return response.data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['imageExtractions', project.id] });
      queryClient.invalidateQueries({ queryKey: ['sources', project.id] });
      toast.success(`Image extraction reset: removed ${data.deleted_extractions} jobs, cleared images from ${data.reset_sources} sources`);
    },
    onError: (error) => {
      toast.error(error.message || 'Failed to reset image extraction');
    }
  });

  const analyzeTrendsMutation = useMutation({
    mutationFn: async () => {
      const selectedTrends = trendCandidates.filter(t => t.is_selected);
      const response = await base44.functions.invoke('analyzeTrends', {
        project_id: project.id,
        selected_trends: selectedTrends.map(t => t.trend_name)
      });
      return response.data;
    },
    onSuccess: (data) => {
      setTrendAnalysis(data.analysis);
      setShowAnalysis(true);
      toast.success('Trend analysis complete');
    },
    onError: (error) => {
      toast.error(error.message || 'Failed to analyze trends');
    }
  });

  const addAnalysisToReportMutation = useMutation({
    mutationFn: async () => {
      await base44.entities.Project.update(project.id, {
        trend_analysis: trendAnalysis,
        include_trend_analysis_in_report: true
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['project', project.id] });
      toast.success('Trend analysis added to report - it will be included in report generation');
    },
    onError: (error) => {
      toast.error('Failed to add analysis to report');
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
              <div className="text-5xl mb-4">✨</div>
              <p className="text-slate-900 font-medium mb-2">Generate trends from sources</p>
              <p className="text-slate-600 text-sm mb-4">
                AI will analyze your uploaded sources to identify 5-7 key trend candidates
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
                  💡 Upload sources in the Sources tab first
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

      {/* Product Image Collection - New Workflow */}
      {selectedCount >= 3 && (
        <ProductImageManager project={project} trendCandidates={trendCandidates} />
      )}

      {/* Trend Analysis */}
      {selectedCount >= 3 && !trendAnalysis && (
        <Card className="border-indigo-200 bg-indigo-50/30">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Brain className="w-5 h-5 text-indigo-600" />
              AI-Powered Trend Analysis
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-slate-700">
              Analyze your selected trends to identify overarching themes, key insights, and new product opportunities.
            </p>
            <Button 
              onClick={() => analyzeTrendsMutation.mutate()}
              disabled={analyzeTrendsMutation.isPending || selectedCount < 3}
              className="bg-indigo-600 hover:bg-indigo-700"
            >
              {analyzeTrendsMutation.isPending ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Analyzing Trends...
                </>
              ) : (
                <>
                  <Brain className="w-4 h-4 mr-2" />
                  Run Trend Analysis
                </>
              )}
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Analysis Results */}
      {trendAnalysis && (
        <Card className="border-indigo-300 bg-indigo-50">
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2">
                <Brain className="w-5 h-5 text-indigo-600" />
                Trend Analysis Results
              </CardTitle>
              <Button 
                variant="default"
                size="sm"
                onClick={() => addAnalysisToReportMutation.mutate()}
                disabled={addAnalysisToReportMutation.isPending || project.include_trend_analysis_in_report}
                className="bg-green-600 hover:bg-green-700"
              >
                {project.include_trend_analysis_in_report ? '✓ Added to Report' : 'Add to Report'}
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Overarching Themes */}
            {trendAnalysis.overarching_themes && (
              <div>
                <h3 className="font-semibold text-slate-900 mb-3 flex items-center gap-2">
                  <span className="text-xl">🎯</span>
                  Overarching Themes
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                  {trendAnalysis.overarching_themes.map((theme, idx) => (
                    <div key={idx} className="p-3 bg-white rounded-lg border border-indigo-200">
                      <p className="text-sm font-medium text-slate-900">{theme}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Connections */}
            {trendAnalysis.connections && (
              <div>
                <h3 className="font-semibold text-slate-900 mb-3 flex items-center gap-2">
                  <span className="text-xl">🔗</span>
                  Trend Connections
                </h3>
                <div className="space-y-2">
                  {trendAnalysis.connections.map((connection, idx) => (
                    <div key={idx} className="p-3 bg-white rounded-lg border border-indigo-200">
                      <p className="text-sm text-slate-700">{connection}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Customer Perspective */}
            {trendAnalysis.perspective_customers && (
              <div className="border-l-4 border-blue-400 pl-4 py-2">
                <h3 className="font-semibold text-slate-900 mb-3 flex items-center gap-2">
                  <span className="text-xl">👥</span>
                  What Customers Are Seeking (Inspiration for CPG Portfolio)
                </h3>
                <div className="space-y-3">
                  {trendAnalysis.perspective_customers.what_consumers_want && (
                    <div>
                      <h4 className="text-sm font-medium text-slate-700 mb-2">Consumer Desires:</h4>
                      <ul className="space-y-1">
                        {trendAnalysis.perspective_customers.what_consumers_want.map((item, idx) => (
                          <li key={idx} className="text-sm text-slate-700 flex gap-2">
                            <span className="text-blue-500">•</span>
                            <span>{item}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {trendAnalysis.perspective_customers.portfolio_directions && (
                    <div>
                      <h4 className="text-sm font-medium text-slate-700 mb-2">Possible Portfolio Directions:</h4>
                      <ul className="space-y-1">
                        {trendAnalysis.perspective_customers.portfolio_directions.map((item, idx) => (
                          <li key={idx} className="text-sm text-slate-700 flex gap-2">
                            <span className="text-blue-500">→</span>
                            <span>{item}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {trendAnalysis.perspective_customers.market_gaps && (
                    <div>
                      <h4 className="text-sm font-medium text-slate-700 mb-2">Unmet Needs:</h4>
                      <ul className="space-y-1">
                        {trendAnalysis.perspective_customers.market_gaps.map((item, idx) => (
                          <li key={idx} className="text-sm text-slate-700 flex gap-2">
                            <span className="text-blue-500">◆</span>
                            <span>{item}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Palsgaard Perspective */}
            {trendAnalysis.perspective_palsgaard && (
              <div className="border-l-4 border-amber-400 pl-4 py-2 bg-amber-50">
                <h3 className="font-semibold text-slate-900 mb-3 flex items-center gap-2">
                  <span className="text-xl">🧪</span>
                  Palsgaard's Role & Value
                </h3>
                <div className="space-y-3">
                  {trendAnalysis.perspective_palsgaard.capability_alignment && (
                    <div>
                      <h4 className="text-sm font-medium text-slate-700 mb-2">Our Capabilities Aligned with These Trends:</h4>
                      <ul className="space-y-1">
                        {trendAnalysis.perspective_palsgaard.capability_alignment.map((item, idx) => (
                          <li key={idx} className="text-sm text-slate-700 flex gap-2">
                            <span className="text-amber-600">✓</span>
                            <span>{item}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {trendAnalysis.perspective_palsgaard.value_propositions && (
                    <div>
                      <h4 className="text-sm font-medium text-slate-700 mb-2">How We Help You Win:</h4>
                      <ul className="space-y-1">
                        {trendAnalysis.perspective_palsgaard.value_propositions.map((item, idx) => (
                          <li key={idx} className="text-sm text-slate-700 flex gap-2">
                            <span className="text-amber-600">★</span>
                            <span>{item}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {trendAnalysis.perspective_palsgaard.innovation_support && (
                    <div>
                      <h4 className="text-sm font-medium text-slate-700 mb-2">Where We Can Partner:</h4>
                      <ul className="space-y-1">
                        {trendAnalysis.perspective_palsgaard.innovation_support.map((item, idx) => (
                          <li key={idx} className="text-sm text-slate-700 flex gap-2">
                            <span className="text-amber-600">⚡</span>
                            <span>{item}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Risk Factors */}
            {trendAnalysis.risk_factors && (
              <div>
                <h3 className="font-semibold text-slate-900 mb-3 flex items-center gap-2">
                  <span className="text-xl">⚠️</span>
                  Risk Factors to Monitor
                </h3>
                <div className="space-y-2">
                  {trendAnalysis.risk_factors.map((risk, idx) => (
                    <div key={idx} className="p-3 bg-amber-50 rounded-lg border border-amber-200">
                      <p className="text-sm text-amber-800">{risk}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

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
                          {trend.evidence_anchors.gnpd_products?.length > 0 && (
                            <p className="text-slate-600">
                              GNPD: {trend.evidence_anchors.gnpd_products.length} products
                              ({trend.evidence_anchors.gnpd_products.filter(p => p.has_image).length} with images 📷)
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

                    {/* Product Proof Panel - only show for selected trends */}
                    {trend.is_selected && (
                      <div className="mt-4">
                        <ProductProofPanel trend={trend} projectId={project.id} />
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