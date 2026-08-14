import React, { useState, useEffect } from 'react';
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
import { AI_DISCLAIMER_FULL } from '@/lib/aiDisclaimer';
import FinalReportSection from '@/components/report/FinalReportSection';
import ExecutiveSummaryCard from '@/components/report/ExecutiveSummaryCard';
import BriefingContextSlide from '@/components/report/BriefingContextSlide';
import AIDisclaimer from '@/components/report/AIDisclaimer';
import ProductShortlistSection from '@/components/report/ProductShortlistSection';
import SlidesSection from '@/components/report/SlidesSection';

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


  const [project, setProject] = useState(null);

  useEffect(() => {
    if (report?.project_id) {
      base44.entities.Project.get(report.project_id)
        .then(setProject)
        .catch(() => setProject(null));
    } else {
      setProject(null);
    }
  }, [report?.project_id]);

  const [copied, setCopied] = useState(false);

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

  const buildPromptText = () => {
    const date = format(new Date(), 'MMMM yyyy');
    const lines = [];

    lines.push(`TRENDPALS REPORT: ${report.title}`);
    lines.push(`Category: ${report.category} | Region: ${report.region} | Date: ${date}`);
    lines.push('');
    lines.push(AI_DISCLAIMER_FULL);
    lines.push('');

    const briefing = (report.slides || []).find(s => s.slide_type === 'briefing_context');
    if (briefing) {
      lines.push('SLIDE 1 — BRIEFING CONTEXT');
      lines.push(briefing.title || '');
      if (briefing.prepared_for) lines.push(`Prepared for: ${briefing.prepared_for}`);
      (briefing.commercial_questions || []).forEach((cq, i) => {
        lines.push(`Question ${i + 1}: ${cq.question}${cq.markets_in_scope ? ` (Markets in scope: ${cq.markets_in_scope})` : ''}`);
      });
      (briefing.trends_under_microscope || []).forEach(t => lines.push(t));
      lines.push('');
    }

    (report.slides || []).filter(s => s.slide_type !== 'briefing_context').forEach((slide, idx) => {
      lines.push(`TREND ${idx + 1}: ${slide.title || slide.slide_name || `Slide ${idx + 1}`}`);
      if (slide.market_signal) {
        lines.push(`Market signal: ${slide.market_signal}`);
      }
      if (slide.customer_pains?.length) {
        lines.push('Customer challenges:');
        slide.customer_pains.forEach(cp => {
          const angle = cp.palsgaard_angle ? ` -> How we can help: ${cp.palsgaard_angle}` : '';
          lines.push(`- ${cp.pain}${angle}`);
        });
      }
      if (slide.conversation_openers?.length) {
        lines.push(`Conversation opener: ${slide.conversation_openers[0]}`);
      }
      if (slide.gnpd_examples?.length) {
        lines.push(`Recent launches: ${slide.gnpd_examples.join(', ')}`);
      }
      if (slide.supporting_data?.length) {
        lines.push('Supporting data:');
        slide.supporting_data.forEach(d => {
          lines.push(`- ${d.stat}${d.source ? ` (${d.source})` : ''}`);
        });
      }
      lines.push('');
    });

    if (report.evidence_pack?.length) {
      lines.push('EVIDENCE SOURCES:');
      report.evidence_pack.forEach(e => {
        lines.push(`- ${e.signal} (${e.source_type || 'source'}, confidence: ${e.confidence || 'n/a'})`);
      });
      lines.push('');
    }

    return lines.join('\n');
  };

  const handleExportPrompt = () => {
    if (!report.slides?.length) {
      alert('No report content to export. Generate the report first.');
      return;
    }

    const text = buildPromptText();
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }).catch(() => {
      // Fallback: download as .txt
      const blob = new Blob([text], { type: 'text/plain' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${report.title || 'report'}-prompt.txt`;
      a.click();
      URL.revokeObjectURL(url);
    });
  };

  const freshnessColors = {
    fresh: 'bg-green-100 text-green-700',
    use_with_caution: 'bg-yellow-100 text-yellow-700',
    outdated: 'bg-red-100 text-red-700'
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 py-8">
      <div className="max-w-5xl mx-auto px-4">
        <div className="flex items-center gap-4 mb-4">
          <Link to={createPageUrl('ReportsLibrary')}>
            <Button variant="ghost">
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back to Library
            </Button>
          </Link>
          {project && (
            <a
              href={createPageUrl(`ProjectDetail?id=${report.project_id}`)}
              className="text-sm text-blue-600 hover:text-blue-800 flex items-center gap-1"
            >
              ↗ Open project
            </a>
          )}
        </div>

        {/* Zone 1 — Commercial Context */}
        {project && (
          <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 mb-6">
            <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Commercial Context</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-2 text-sm">
              {project.customer_name && (
                <div><span className="font-medium text-gray-600">Customer</span><span className="ml-2 text-gray-900">{project.customer_name}</span></div>
              )}
              {project.meeting_context && (
                <div><span className="font-medium text-gray-600">Meeting type</span><span className="ml-2 text-gray-900">{
                  { discovery: 'Discovery', innovation_day: 'Innovation Day', technical_workshop: 'Technical Workshop', other: 'Other' }[project.meeting_context] || project.meeting_context
                }</span></div>
              )}
              {project.requester_name && (
                <div><span className="font-medium text-gray-600">Requested by</span><span className="ml-2 text-gray-900">{project.requester_name}</span></div>
              )}
              {project.objective && (
                <div className="sm:col-span-2"><span className="font-medium text-gray-600">Objective</span><span className="ml-2 text-gray-900">{project.objective}</span></div>
              )}
              {project.specific_focus && (
                <div className="sm:col-span-2"><span className="font-medium text-gray-600">Specific focus</span><span className="ml-2 text-gray-900">{project.specific_focus}</span></div>
              )}
              {project.customer_priorities?.length > 0 && (
                <div className="sm:col-span-2">
                  <span className="font-medium text-gray-600 mr-2">Customer priorities</span>
                  <span className="inline-flex flex-wrap gap-1">
                    {project.customer_priorities.map((p, i) => (
                      <span key={i} className="inline-block bg-blue-50 text-blue-700 text-xs px-2 py-0.5 rounded-full border border-blue-100">{p}</span>
                    ))}
                  </span>
                </div>
              )}
            </div>
          </div>
        )}

        {/* AI disclaimer — applies to everything below */}
        <AIDisclaimer className="mb-4" />

        {/* Report Header */}
        <Card className="mb-6">
          <CardHeader>
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <CardTitle className="text-2xl mb-3">{report.title}</CardTitle>
                <div className="flex flex-wrap gap-2 text-sm text-slate-600">
                  <span>{report.category}</span>
                  <span>•</span>
                  {/* Display label only. A mixed-scope report has region = null on
                      purpose — it is never labelled "Global". */}
                  <span>{report.region_display_label || report.region || 'Mixed scope — see methodology'}</span>
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
              <Button size="sm" variant="secondary" onClick={handleExportPrompt}>
                <Copy className="w-4 h-4 mr-2" />
                {copied ? 'Copied!' : 'Export full report prompt'}
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Briefing Context cover slide */}
        <BriefingContextSlide slide={(report.slides || []).find(s => s.slide_type === 'briefing_context')} />

        {/* Final Report Files */}
        <FinalReportSection report={report} />

        {/* Executive Summary */}
        <ExecutiveSummaryCard report={report} />

        {/* Product Shortlist with images */}
        <ProductShortlistSection report={report} />

        {/* Full deck content — why it may matter, formulation questions, SIGNAL
            section and the methodology slide, all rendered inline in deck order. */}
        <SlidesSection slides={report.slides} />


      </div>
    </div>
  );
}