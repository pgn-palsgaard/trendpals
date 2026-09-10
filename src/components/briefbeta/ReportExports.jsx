import React from 'react';
import MarkdownDownload from '@/components/briefbeta/MarkdownDownload';
import ClaudePptxPanel from '@/components/briefbeta/ClaudePptxPanel';
import GammaExportPanel from '@/components/briefbeta/GammaExportPanel';
import ImagePackDownload from '@/components/briefbeta/ImagePackDownload';

export default function ReportExports({ report }) {
  if (!report) return null;
  return <section className="pal-card p-4 space-y-4">
    <div className="flex flex-wrap gap-3 items-center justify-between">
      <div><h3 className="text-sm">Download your saved report</h3><p className="text-xs text-muted-foreground">Markdown is ready now — no PowerPoint build needed.</p></div>
      <div className="flex flex-wrap gap-3"><MarkdownDownload report={report} /><ImagePackDownload report={report} /></div>
    </div>
    <details className="border-t pt-3">
      <summary className="cursor-pointer text-sm font-medium text-primary py-2">PowerPoint exports · Palsgaard / Gamma</summary>
      <div className="space-y-3 mt-3">
        <ClaudePptxPanel key={`claude-${report.id}`} report={report} slideCount={report.slides?.length || 0} />
        <GammaExportPanel key={`gamma-${report.id}`} report={report} slideCount={report.slides?.length || 0} />
      </div>
    </details>
  </section>;
}