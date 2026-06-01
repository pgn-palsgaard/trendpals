import React from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ArrowLeft, Copy } from 'lucide-react';
import { Link } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import { toast } from 'sonner';
import { format } from 'date-fns';
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

  const handleExportToClaude = () => {
    const date = format(new Date(), 'MMMM yyyy');
    const lines = [];

    lines.push(`TRENDPALS REPORT — ${report.title}`);
    lines.push(`Category: ${report.category} | Region: ${report.region} | Date: ${date}`);
    lines.push('');

    if (report.slides?.length) {
      lines.push('TRENDS:');
      report.slides.forEach((slide, idx) => {
        lines.push(`${idx + 1}. ${slide.title || slide.slide_name || `Slide ${idx + 1}`}`);
        if (slide.market_signal) lines.push(`   Market signal: ${slide.market_signal}`);
        if (slide.customer_pains?.length) {
          lines.push('   Customer pains:');
          slide.customer_pains.forEach(cp => {
            const angle = cp.palsgaard_angle ? ` → ${cp.palsgaard_angle}` : '';
            lines.push(`   - ${cp.pain}${angle}`);
          });
        }
        if (slide.conversation_openers?.length) {
          lines.push(`   Conversation opener: ${slide.conversation_openers[0]}`);
        }
        if (slide.gnpd_examples?.length) {
          lines.push(`   GNPD examples: ${slide.gnpd_examples.join('; ')}`);
        }
        lines.push('');
      });
    }

    // Evidence pack as strategic imperatives / sources
    if (report.evidence_pack?.length) {
      const strategicItems = report.evidence_pack.filter(e => e.capability_area);
      if (strategicItems.length) {
        lines.push('STRATEGIC IMPERATIVES:');
        strategicItems.forEach(e => {
          lines.push(`- [${e.capability_area}] ${e.signal}`);
        });
        lines.push('');
      }

      lines.push('EVIDENCE SOURCES:');
      report.evidence_pack.forEach(e => {
        lines.push(`- ${e.signal} (${e.source_type || 'source'}, confidence: ${e.confidence || 'n/a'})`);
      });
      lines.push('');
    }

    if (report.warnings?.length) {
      lines.push('HEADWINDS:');
      report.warnings.forEach(w => lines.push(`- ${w.message || JSON.stringify(w)}`));
      lines.push('');
    }

    navigator.clipboard.writeText(lines.join('\n'));
    toast.success('Copied to clipboard — ready to paste into Claude.ai');
  };

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
              <Button size="sm" variant="secondary" onClick={handleExportToClaude}>
                <Copy className="w-4 h-4 mr-2" />
                Export to Claude.ai
              </Button>
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