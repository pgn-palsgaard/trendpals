import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { FileText, Loader2, CheckCircle2, Download } from 'lucide-react';
import { toast } from 'sonner';
import { Link, useNavigate } from 'react-router-dom';
import { createPageUrl } from '@/utils';

export default function ProjectReport({ project, reports, trendCandidates }) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [generating, setGenerating] = useState(false);

  const selectedTrends = trendCandidates.filter(t => t.is_selected);
  const latestReport = reports[0];

  const generateReportMutation = useMutation({
    mutationFn: async () => {
      setGenerating(true);
      const response = await base44.functions.invoke('generateReport', {
        project_id: project.id
      });
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['reports', project.id] });
      queryClient.invalidateQueries({ queryKey: ['project', project.id] });
      toast.success('Report generated successfully');
      setGenerating(false);
    },
    onError: (error) => {
      toast.error(error.message || 'Failed to generate report');
      setGenerating(false);
    }
  });

  const publishReportMutation = useMutation({
    mutationFn: async (reportId) => {
      await base44.entities.Report.update(reportId, { status: 'published' });
      await base44.entities.Project.update(project.id, { state: 'published' });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['reports', project.id] });
      queryClient.invalidateQueries({ queryKey: ['project', project.id] });
      toast.success('Report published to library');
    }
  });

  const canGenerate = selectedTrends.length >= 3 && selectedTrends.length <= 5;

  return (
    <div className="space-y-6">
      {/* Generate Report */}
      <Card>
        <CardHeader>
          <CardTitle>Final Report Generation</CardTitle>
        </CardHeader>
        <CardContent>
          {!latestReport ? (
            <div className="text-center py-8">
              <FileText className="w-12 h-12 mx-auto mb-4 text-emerald-400" />
              <p className="text-slate-600 mb-4">
                Generate a 5-10 slide evidence-backed trend report
              </p>
              <Button
                onClick={() => generateReportMutation.mutate()}
                disabled={!canGenerate || generating}
                className="bg-emerald-600 hover:bg-emerald-700"
              >
                {generating ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Generating Report...
                  </>
                ) : (
                  <>
                    <FileText className="w-4 h-4 mr-2" />
                    Generate Report
                  </>
                )}
              </Button>
              {!canGenerate && (
                <p className="text-sm text-slate-500 mt-4">
                  Select 3-5 trends in the Trends tab to enable report generation
                </p>
              )}
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-semibold text-slate-900 mb-1">{latestReport.title}</h3>
                  <p className="text-sm text-slate-600">
                    {latestReport.slides?.length || 0} slides • Version {latestReport.version}
                  </p>
                </div>
                <Button
                  variant="outline"
                  onClick={() => generateReportMutation.mutate()}
                  disabled={generating}
                  size="sm"
                >
                  Regenerate
                </Button>
              </div>

              {latestReport.status === 'draft' && (
                <Button
                  onClick={() => publishReportMutation.mutate(latestReport.id)}
                  disabled={publishReportMutation.isPending}
                  className="w-full bg-purple-600 hover:bg-purple-700"
                >
                  <CheckCircle2 className="w-4 h-4 mr-2" />
                  Publish to Library
                </Button>
              )}

              <Link to={createPageUrl(`ReportView?id=${latestReport.id}`)}>
                <Button variant="outline" className="w-full">
                  View Full Report
                </Button>
              </Link>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Report Preview */}
      {latestReport && latestReport.slides && (
        <Card>
          <CardHeader>
            <CardTitle>Report Preview</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {latestReport.slides.slice(0, 3).map((slide, idx) => (
                <Card key={idx} className="border-slate-200 bg-slate-50">
                  <CardContent className="p-4">
                    <div className="text-xs text-slate-500 mb-2">Slide {slide.slide_number}</div>
                    <h4 className="font-semibold text-slate-900 mb-2">{slide.title}</h4>
                    {slide.subtitle && (
                      <p className="text-sm text-slate-600 mb-2">{slide.subtitle}</p>
                    )}
                    {slide.bullets && slide.bullets.length > 0 && (
                      <ul className="text-sm text-slate-700 space-y-1">
                        {slide.bullets.slice(0, 3).map((bullet, bidx) => (
                          <li key={bidx}>• {bullet}</li>
                        ))}
                      </ul>
                    )}
                  </CardContent>
                </Card>
              ))}
              {latestReport.slides.length > 3 && (
                <p className="text-center text-sm text-slate-500">
                  +{latestReport.slides.length - 3} more slides
                </p>
              )}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}