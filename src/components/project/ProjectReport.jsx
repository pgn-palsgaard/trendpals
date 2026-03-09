import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { FileText, Download, ExternalLink, Loader2, AlertCircle, Sparkles } from 'lucide-react';
import { toast } from 'sonner';
import { Link } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import DownloadReportButton from '@/components/project/DownloadReportButton';

export default function ProjectReport({ project, reports, trendCandidates }) {
  const queryClient = useQueryClient();
  const [generatingGamma, setGeneratingGamma] = useState(false);
  const [publishing, setPublishing] = useState(false);

  const selectedTrends = trendCandidates.filter(t => t.is_selected);
  const canGenerateReport = selectedTrends.length >= 3 && selectedTrends.length <= 5;

  const generateReportMutation = useMutation({
    mutationFn: async () => {
      const response = await base44.functions.invoke('generateReport', {
        project_id: project.id
      });
      return response.data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['reports', project.id] });
      toast.success(`Report v${data.version || 'new'} generated successfully`);
    },
    onError: (error) => {
      const errorMsg = error.response?.data?.error || error.message || 'Failed to generate report';
      toast.error(errorMsg);
    }
  });

  const generateGammaMutation = useMutation({
    mutationFn: async (reportId) => {
      setGeneratingGamma(true);
      const response = await base44.functions.invoke('generateGammaReport', {
        report_id: reportId
      });
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['reports', project.id] });
      toast.success('Gamma deck created');
      setGeneratingGamma(false);
    },
    onError: (error) => {
      toast.error(error.message || 'Failed to create Gamma deck');
      setGeneratingGamma(false);
    }
  });

  const publishReportMutation = useMutation({
    mutationFn: async (reportId) => {
      setPublishing(true);
      const response = await base44.functions.invoke('publishReport', {
        report_id: reportId
      });
      return response.data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['reports', project.id] });
      queryClient.invalidateQueries({ queryKey: ['project', project.id] });
      if (data.warnings && data.warnings.length > 0) {
        toast.success('Report published with warnings');
      } else {
        toast.success('Report published successfully');
      }
      setPublishing(false);
    },
    onError: (error) => {
      const errorData = error.response?.data;
      if (errorData?.blocked) {
        toast.error('Cannot publish: ' + errorData.errors.join(', '));
      } else {
        toast.error(error.message || 'Failed to publish report');
      }
      setPublishing(false);
    }
  });

  const latestReport = reports.sort((a, b) => b.version - a.version)[0];

  return (
    <div className="space-y-6">
      {/* Generate Report Section */}
      <Card>
        <CardHeader>
          <CardTitle>Report Generation</CardTitle>
        </CardHeader>
        <CardContent>
          {!canGenerateReport ? (
            <div className="text-center py-8">
              <AlertCircle className="w-12 h-12 mx-auto mb-4 text-slate-400" />
              <p className="text-slate-600 mb-2">
                Select 3-5 trends to generate a report
              </p>
              <p className="text-sm text-slate-500">
                Currently selected: {selectedTrends.length} trends
              </p>
            </div>
          ) : !latestReport ? (
            <div className="text-center py-8">
              <FileText className="w-12 h-12 mx-auto mb-4 text-blue-400" />
              <p className="text-slate-600 mb-4">
                Ready to generate a 5-10 slide report pack
              </p>
              <Button
                onClick={() => generateReportMutation.mutate()}
                disabled={generateReportMutation.isPending}
                className="bg-blue-600 hover:bg-blue-700"
              >
                {generateReportMutation.isPending ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Generating...
                  </>
                ) : (
                  <>
                    <FileText className="w-4 h-4 mr-2" />
                    Generate Report Pack
                  </>
                )}
              </Button>
            </div>
          ) : (
            <div className="space-y-4 p-4 bg-blue-50 rounded-lg border border-blue-200">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-slate-900">
                    Current Version: <span className="text-lg font-bold text-blue-600">v{latestReport.version}</span>
                  </p>
                  <p className="text-xs text-slate-600 mt-1">
                    Updated {latestReport.updated_date ? new Date(latestReport.updated_date).toLocaleDateString() : 'recently'}
                  </p>
                </div>
                <Button
                  variant="outline"
                  onClick={() => generateReportMutation.mutate()}
                  disabled={generateReportMutation.isPending}
                  size="sm"
                >
                  {generateReportMutation.isPending ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Creating v{latestReport.version + 1}...
                    </>
                  ) : (
                    <>Create v{latestReport.version + 1}</>
                  )}
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Report Details */}
      {latestReport && (
        <Card>
          <CardHeader>
            <div className="flex items-start justify-between">
              <div>
                <CardTitle>{latestReport.title}</CardTitle>
                <p className="text-sm text-slate-600 mt-1">
                  {latestReport.category} • {latestReport.region}
                </p>
              </div>
              <div className="flex gap-2">
                <Badge className={
                  latestReport.freshness === 'fresh' ? 'bg-green-100 text-green-700' :
                  latestReport.freshness === 'use_with_caution' ? 'bg-yellow-100 text-yellow-700' :
                  'bg-red-100 text-red-700'
                }>
                  {latestReport.freshness}
                </Badge>
                <Badge variant="outline">v{latestReport.version}</Badge>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Report Stats */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="p-4 bg-slate-50 rounded-lg">
                <p className="text-sm text-slate-600 mb-1">Slides</p>
                <p className="text-2xl font-bold text-slate-900">{latestReport.slides?.length || 0}</p>
              </div>
              <div className="p-4 bg-slate-50 rounded-lg">
                <p className="text-sm text-slate-600 mb-1">Evidence</p>
                <p className="text-2xl font-bold text-slate-900">{latestReport.evidence_pack?.length || 0}</p>
              </div>
              <div className="p-4 bg-slate-50 rounded-lg">
                <p className="text-sm text-slate-600 mb-1">Products</p>
                <p className="text-2xl font-bold text-slate-900">{latestReport.product_shortlist?.length || 0}</p>
              </div>
              <div className="p-4 bg-slate-50 rounded-lg">
                <p className="text-sm text-slate-600 mb-1">Trends</p>
                <p className="text-2xl font-bold text-slate-900">{latestReport.selected_trends?.length || 0}</p>
              </div>
            </div>

            {/* Gamma Integration */}
            <div className="border-t pt-6">
              <h3 className="font-semibold text-slate-900 mb-4">Gamma Deck</h3>
              {!latestReport.gamma_url ? (
                <div className="text-center py-6 bg-purple-50 rounded-lg border border-purple-200">
                  <Sparkles className="w-10 h-10 mx-auto mb-3 text-purple-500" />
                  <p className="text-slate-700 mb-4">Create a beautiful Gamma presentation</p>
                  <Button
                    onClick={() => generateGammaMutation.mutate(latestReport.id)}
                    disabled={generatingGamma}
                    className="bg-purple-600 hover:bg-purple-700"
                  >
                    {generatingGamma ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        Creating Gamma Deck...
                      </>
                    ) : (
                      <>
                        <Sparkles className="w-4 h-4 mr-2" />
                        Create Gamma Deck
                      </>
                    )}
                  </Button>
                </div>
              ) : (
                <div className="space-y-3">
                  <a 
                    href={latestReport.gamma_url} 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="flex items-center justify-between p-4 bg-slate-50 rounded-lg hover:bg-slate-100 transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 bg-purple-100 rounded-lg flex items-center justify-center">
                        <ExternalLink className="w-5 h-5 text-purple-600" />
                      </div>
                      <div>
                        <p className="font-medium text-slate-900">View in Gamma</p>
                        <p className="text-sm text-slate-600">Open presentation</p>
                      </div>
                    </div>
                    <ExternalLink className="w-5 h-5 text-slate-400" />
                  </a>

                  {latestReport.gamma_pptx_url && (
                    <a 
                      href={latestReport.gamma_pptx_url} 
                      target="_blank" 
                      rel="noopener noreferrer"
                      className="flex items-center justify-between p-4 bg-slate-50 rounded-lg hover:bg-slate-100 transition-colors"
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
                          <Download className="w-5 h-5 text-blue-600" />
                        </div>
                        <div>
                          <p className="font-medium text-slate-900">Download PPTX</p>
                          <p className="text-sm text-slate-600">PowerPoint export</p>
                        </div>
                      </div>
                      <Download className="w-5 h-5 text-slate-400" />
                    </a>
                  )}

                  {latestReport.gamma_pdf_url && (
                    <a 
                      href={latestReport.gamma_pdf_url} 
                      target="_blank" 
                      rel="noopener noreferrer"
                      className="flex items-center justify-between p-4 bg-slate-50 rounded-lg hover:bg-slate-100 transition-colors"
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-red-100 rounded-lg flex items-center justify-center">
                          <Download className="w-5 h-5 text-red-600" />
                        </div>
                        <div>
                          <p className="font-medium text-slate-900">Download PDF</p>
                          <p className="text-sm text-slate-600">PDF export</p>
                        </div>
                      </div>
                      <Download className="w-5 h-5 text-slate-400" />
                    </a>
                  )}
                </div>
              )}
            </div>

            {/* Publish Section */}
            {latestReport.status === 'draft' && (
              <div className="border-t pt-6">
                <div className="flex items-start gap-3 p-4 bg-blue-50 rounded-lg border border-blue-200 mb-4">
                  <AlertCircle className="w-5 h-5 text-blue-600 mt-0.5 flex-shrink-0" />
                  <div className="flex-1">
                    <p className="text-sm font-medium text-blue-900 mb-1">Ready to Publish?</p>
                    <p className="text-sm text-blue-800">
                      Publishing will make this report immutable and add it to the library. 
                      All validation checks will be run.
                    </p>
                  </div>
                </div>
                <Button
                  onClick={() => publishReportMutation.mutate(latestReport.id)}
                  disabled={publishing}
                  className="w-full bg-green-600 hover:bg-green-700"
                >
                  {publishing ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Publishing...
                    </>
                  ) : (
                    'Publish Report'
                  )}
                </Button>
              </div>
            )}

            {/* View Full Report + Download */}
            <div className="border-t pt-6 flex flex-col sm:flex-row gap-3">
              <Link to={createPageUrl(`ReportView?id=${latestReport.id}`)} className="flex-1">
                <Button variant="outline" className="w-full">
                  <FileText className="w-4 h-4 mr-2" />
                  View Full Report Details
                </Button>
              </Link>
              <div className="flex-1">
                <DownloadReportButton report={latestReport} variant="outline" />
              </div>
            </div>

            {/* Warnings */}
            {latestReport.warnings && latestReport.warnings.length > 0 && (
              <div className="border-t pt-6">
                <h3 className="font-semibold text-slate-900 mb-3">Quality Warnings</h3>
                <div className="space-y-2">
                  {latestReport.warnings.map((warning, idx) => (
                    <div key={idx} className="flex items-start gap-2 p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
                      <AlertCircle className="w-4 h-4 text-yellow-600 mt-0.5 flex-shrink-0" />
                      <p className="text-sm text-yellow-800">{warning.message || JSON.stringify(warning)}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}