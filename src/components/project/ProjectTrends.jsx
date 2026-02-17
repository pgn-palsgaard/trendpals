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

    setUploading(true);
    try {
      // Upload both files
      const htmlUpload = await base44.integrations.Core.UploadFile({ file: gnpdHtmlFile });
      const xlsxUpload = await base44.integrations.Core.UploadFile({ file: gnpdXlsxFile });

      // Create extraction job
      const extraction = await base44.entities.GNPDImageExtraction.create({
        project_id: project.id,
        html_file_url: htmlUpload.file_url,
        xlsx_file_url: xlsxUpload.file_url,
        status: 'pending',
        extracted_images: []
      });

      toast.success(`Files uploaded! Use Zapier to process extraction job ID: ${extraction.id}`);
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

      {/* GNPD Image Extraction - Only show if trends selected */}
      {selectedCount >= 3 && (
        <Card className="border-blue-200 bg-blue-50/30">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <span>📷 Extract & Match Product Images</span>
              <span className="text-xs font-normal text-slate-600 bg-white px-2 py-1 rounded">Next: Align with Trends</span>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
              <p className="text-sm text-blue-900 font-medium mb-2">Match product images to your selected trends</p>
              <p className="text-xs text-blue-700">Upload GNPD HTML (with images) and Excel files to automatically extract and match product images to your data.</p>
            </div>
            
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="font-medium">HTML File <span className="text-slate-500 text-xs">(with images)</span></Label>
                <Input
                  type="file"
                  accept=".html,.htm"
                  onChange={(e) => setGnpdHtmlFile(e.target.files?.[0] || null)}
                  disabled={uploading}
                  className="cursor-pointer"
                />
                {gnpdHtmlFile && (
                  <p className="text-xs text-green-600 font-medium">✓ {gnpdHtmlFile.name}</p>
                )}
              </div>
              
              <div className="space-y-2">
                <Label className="font-medium">Excel File <span className="text-slate-500 text-xs">(with product data)</span></Label>
                <Input
                  type="file"
                  accept=".xlsx,.xls,.csv"
                  onChange={(e) => setGnpdXlsxFile(e.target.files?.[0] || null)}
                  disabled={uploading}
                  className="cursor-pointer"
                />
                {gnpdXlsxFile && (
                  <p className="text-xs text-green-600 font-medium">✓ {gnpdXlsxFile.name}</p>
                )}
              </div>
            </div>
            
            <div className="flex gap-3">
              <Button 
                onClick={handleMergeGNPD}
                disabled={!gnpdHtmlFile || !gnpdXlsxFile || uploading}
                className="flex-1 bg-blue-600 hover:bg-blue-700"
                size="lg"
              >
                {uploading ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Processing & Matching...
                  </>
                ) : (
                  <>
                    🔗 Merge & Extract Images
                  </>
                )}
              </Button>
              {project.state !== 'published' && imageExtractions.length > 0 && (
                <Button 
                  onClick={() => {
                    if (confirm('This will delete all image extraction attempts and remove extracted images from sources. Continue?')) {
                      resetExtractionMutation.mutate();
                    }
                  }}
                  disabled={resetExtractionMutation.isPending}
                  variant="outline"
                  size="lg"
                >
                  {resetExtractionMutation.isPending ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Resetting...
                    </>
                  ) : (
                    <>🔄 Reset</>
                  )}
                </Button>
              )}
            </div>

            {/* Image Extraction Jobs Status & Gallery */}
            {imageExtractions.length > 0 && (
              <div className="space-y-3 pt-4 border-t">
                <p className="text-sm font-medium text-slate-700">Extraction Jobs ({imageExtractions.length})</p>
                {imageExtractions.map(job => (
                  <div key={job.id} className={`p-4 rounded-lg border ${
                    job.status === 'completed' ? 'border-green-300 bg-green-50' :
                    job.status === 'failed' ? 'border-red-300 bg-red-50' :
                    job.status === 'processing' ? 'border-blue-300 bg-blue-50' :
                    'border-slate-300 bg-slate-50'
                  }`}>
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-2">
                        <span className={`text-xs font-medium px-2 py-1 rounded ${
                          job.status === 'completed' ? 'bg-green-600 text-white' :
                          job.status === 'failed' ? 'bg-red-600 text-white' :
                          job.status === 'processing' ? 'bg-blue-600 text-white' :
                          'bg-slate-600 text-white'
                        }`}>
                          {job.status.toUpperCase()}
                        </span>
                        {job.status === 'completed' && job.extracted_images?.length > 0 && (
                          <span className="text-xs text-green-700 font-medium">
                            ✓ {job.extracted_images.length} images
                          </span>
                        )}
                      </div>
                    </div>
                    
                    {/* Image Gallery */}
                    {job.status === 'completed' && job.extracted_images?.length > 0 && (
                      <div className="grid grid-cols-4 gap-2">
                        {job.extracted_images.map((img, idx) => (
                          <a 
                            key={idx}
                            href={img.image_url} 
                            target="_blank" 
                            rel="noopener noreferrer"
                            className="group relative overflow-hidden rounded-lg bg-white border border-slate-200 hover:border-blue-400 transition-all"
                          >
                            <img 
                              src={img.image_url} 
                              alt={`Product ${img.record_id}`}
                              className="w-full h-20 object-cover group-hover:opacity-75 transition-opacity"
                              onError={(e) => {
                                e.target.src = 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="80" height="80"%3E%3Crect fill="%23f3f4f6" width="80" height="80"/%3E%3Ctext x="50%25" y="50%25" text-anchor="middle" dy=".3em" fill="%239ca3af" font-size="12"%3E{img.record_id}%3C/text%3E%3C/svg%3E';
                              }}
                            />
                            <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors flex items-center justify-center">
                              <span className="text-white text-xs font-medium opacity-0 group-hover:opacity-100 transition-opacity">
                                {img.record_id}
                              </span>
                            </div>
                          </a>
                        ))}
                      </div>
                    )}
                    
                    {job.error_message && (
                      <p className="text-xs text-red-700 mt-2">{job.error_message}</p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Trend Analysis */}
      {selectedCount >= 3 && !showAnalysis && (
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
      {showAnalysis && trendAnalysis && (
        <Card className="border-indigo-300 bg-indigo-50">
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2">
                <Brain className="w-5 h-5 text-indigo-600" />
                Trend Analysis Results
              </CardTitle>
              <div className="flex gap-2">
                <Button 
                  variant="default"
                  size="sm"
                  onClick={() => addAnalysisToReportMutation.mutate()}
                  disabled={addAnalysisToReportMutation.isPending || project.include_trend_analysis_in_report}
                  className="bg-green-600 hover:bg-green-700"
                >
                  {project.include_trend_analysis_in_report ? '✓ Added to Report' : 'Add to Report'}
                </Button>
                <Button 
                  variant="outline" 
                  size="sm"
                  onClick={() => setShowAnalysis(false)}
                >
                  Hide
                </Button>
              </div>
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

            {/* Key Insights */}
            {trendAnalysis.key_insights && (
              <div>
                <h3 className="font-semibold text-slate-900 mb-3 flex items-center gap-2">
                  <span className="text-xl">💡</span>
                  Key Insights
                </h3>
                <div className="space-y-2">
                  {trendAnalysis.key_insights.map((insight, idx) => (
                    <div key={idx} className="p-3 bg-white rounded-lg border border-indigo-200">
                      <p className="text-sm text-slate-700">{insight}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Product Opportunities */}
            {trendAnalysis.product_opportunities && (
              <div>
                <h3 className="font-semibold text-slate-900 mb-3 flex items-center gap-2">
                  <Lightbulb className="w-5 h-5 text-yellow-500" />
                  Product Ideas & Market Opportunities
                </h3>
                <div className="space-y-3">
                  {trendAnalysis.product_opportunities.map((opp, idx) => (
                    <div key={idx} className="p-4 bg-white rounded-lg border border-yellow-200">
                      <div className="flex items-start justify-between mb-2">
                        <h4 className="font-semibold text-slate-900">{opp.idea}</h4>
                        <Badge className={`${
                          opp.market_potential === 'high' ? 'bg-green-100 text-green-800' :
                          opp.market_potential === 'medium' ? 'bg-yellow-100 text-yellow-800' :
                          'bg-blue-100 text-blue-800'
                        } border-0`}>
                          {opp.market_potential} potential
                        </Badge>
                      </div>
                      <p className="text-sm text-slate-700 mb-2">{opp.description}</p>
                      {opp.connected_trends && opp.connected_trends.length > 0 && (
                        <div className="flex flex-wrap gap-1">
                          {opp.connected_trends.map((trend, tidx) => (
                            <Badge key={tidx} variant="outline" className="text-xs">
                              {trend}
                            </Badge>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
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