import React from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ArrowLeft } from 'lucide-react';
import { Link } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import { toast } from 'sonner';
import DownloadReportButton from '@/components/project/DownloadReportButton';
import FinalReportSection from '@/components/report/FinalReportSection';
import ExecutiveSummaryCard from '@/components/report/ExecutiveSummaryCard';

export default function ReportView() {
  const urlParams = new URLSearchParams(window.location.search);
  const reportId = urlParams.get('id');

  const { data: report, isLoading } = useQuery({
    queryKey: ['report', reportId],
    queryFn: async () => {
      const reports = await base44.entities.Report.filter({ id: reportId });
      return reports[0];
    },
    enabled: !!reportId
  });

  const { data: sources = [] } = useQuery({
    queryKey: ['reportSources', report?.project_id],
    queryFn: () => base44.entities.Source.filter({ project_id: report.project_id }),
    enabled: !!report?.project_id
  });


  if (isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 flex items-center justify-center">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-purple-600 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-slate-600">Loading report...</p>
        </div>
      </div>
    );
  }

  if (!report) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 flex items-center justify-center">
        <Card className="max-w-md">
          <CardContent className="pt-6 text-center">
            <p className="text-slate-600 mb-4">Report not found</p>
            <Link to={createPageUrl('ReportsLibrary')}>
              <Button>Back to Library</Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  const freshnessColors = {
    fresh: 'bg-green-100 text-green-700',
    use_with_caution: 'bg-yellow-100 text-yellow-700',
    outdated: 'bg-red-100 text-red-700'
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 py-8">
      <div className="max-w-5xl mx-auto px-4">
        <Link to={createPageUrl('ReportsLibrary')}>
          <Button variant="ghost" className="mb-4">
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to Library
          </Button>
        </Link>

        {/* Report Header */}
        <Card className="mb-6">
          <CardHeader>
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <CardTitle className="text-2xl mb-3">{report.title}</CardTitle>
                <div className="flex flex-wrap gap-2 text-sm text-slate-600">
                  <span>{report.category}</span>
                  <span>•</span>
                  <span>{report.region}</span>
                  <span>•</span>
                  <span>{report.slides?.length || 0} slides</span>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Badge className={`${freshnessColors[report.freshness || 'fresh']}`}>
                  {report.freshness?.replace('_', ' ') || 'fresh'}
                </Badge>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between flex-wrap gap-2">
              {report.selected_trends && report.selected_trends.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {report.selected_trends.map((trend, idx) => (
                    <Badge key={idx} variant="secondary">{trend}</Badge>
                  ))}
                </div>
              )}
              <DownloadReportButton report={report} size="sm" variant="secondary" label="Export prompt" />
            </div>
          </CardContent>
        </Card>

        {/* Final Report Files */}
        <FinalReportSection report={report} />

        {/* Executive Summary */}
        <ExecutiveSummaryCard report={report} />


      </div>
    </div>
  );
}