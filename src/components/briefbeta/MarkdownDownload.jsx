import React from 'react';
import { Download } from 'lucide-react';
import { buildReportMarkdown } from '@/components/briefbeta/reportMarkdown';

export default function MarkdownDownload({ report }) {
  function download() {
    const url = URL.createObjectURL(new Blob([buildReportMarkdown(report)], { type: 'text/markdown;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `${(report.title || 'report').replace(/[<>:"/\\|?*\u0000-\u001f]/g, '-').slice(0, 120)}.md`;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  return <button onClick={download} disabled={!report?.slides?.length} className="inline-flex items-center justify-center gap-2 rounded-lg bg-primary text-primary-foreground px-4 py-3 text-sm font-semibold hover:bg-primary/90 disabled:opacity-50"><Download className="w-4 h-4" />Download Markdown (.md)</button>;
}