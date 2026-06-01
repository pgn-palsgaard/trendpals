import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Download, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { jsPDF } from 'jspdf';

export default function DownloadReportButton({ report, project, variant = "outline", size = "default", label = "Download Report PDF" }) {
  const [downloading, setDownloading] = useState(false);

  const handleDownload = async () => {
    setDownloading(true);
    try {
      const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
      const pageW = doc.internal.pageSize.getWidth();
      const margin = 16;
      const contentW = pageW - margin * 2;

      const addText = (text, x, y, opts = {}) => {
        doc.text(text, x, y, { maxWidth: opts.maxWidth || contentW, ...opts });
      };

      const addWrappedLines = (lines, x, startY, lineHeight = 6) => {
        let y = startY;
        for (const line of lines) {
          const wrapped = doc.splitTextToSize(`• ${line}`, contentW - 4);
          wrapped.forEach(wl => {
            if (y > 270) { doc.addPage(); y = margin + 10; }
            doc.text(wl, x, y);
            y += lineHeight;
          });
        }
        return y;
      };

      // Cover page
      doc.setFillColor(30, 58, 138);
      doc.rect(0, 0, pageW, 60, 'F');
      doc.setTextColor(255, 255, 255);
      doc.setFontSize(22);
      doc.setFont('helvetica', 'bold');
      const titleLines = doc.splitTextToSize(report.title || 'Trend Report', contentW);
      addText(titleLines, margin, 28);
      doc.setFontSize(11);
      doc.setFont('helvetica', 'normal');
      addText(`${report.category || ''} • ${report.region || ''} • v${report.version || 1}`, margin, 50);

      doc.setTextColor(100, 116, 139);
      doc.setFontSize(9);
      addText(`Generated ${new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}`, margin, 68);

      if (report.selected_trends?.length) {
        doc.setFontSize(10);
        doc.setTextColor(30, 58, 138);
        addText('Trends covered:', margin, 80);
        doc.setTextColor(51, 65, 85);
        report.selected_trends.forEach((t, i) => {
          addText(`${i + 1}. ${t}`, margin + 4, 88 + i * 7);
        });
      }

      // Slides
      (report.slides || []).forEach((slide) => {
        doc.addPage();
        let y = margin + 6;

        // Slide header bar
        doc.setFillColor(241, 245, 249);
        doc.rect(0, 0, pageW, 14, 'F');
        doc.setFontSize(8);
        doc.setTextColor(100, 116, 139);
        doc.setFont('helvetica', 'normal');
        addText(`Slide ${slide.slide_number}`, margin, 9);

        doc.setFontSize(16);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(15, 23, 42);
        y = 22;
        const titleWrapped = doc.splitTextToSize(slide.title || '', contentW);
        doc.text(titleWrapped, margin, y);
        y += titleWrapped.length * 8;

        if (slide.subtitle) {
          doc.setFontSize(10);
          doc.setFont('helvetica', 'italic');
          doc.setTextColor(100, 116, 139);
          const subWrapped = doc.splitTextToSize(slide.subtitle, contentW);
          doc.text(subWrapped, margin, y);
          y += subWrapped.length * 6 + 2;
        }

        y += 4;

        if (slide.bullets?.length) {
          doc.setFontSize(10);
          doc.setFont('helvetica', 'bold');
          doc.setTextColor(15, 23, 42);
          addText('Key Points', margin, y); y += 6;
          doc.setFont('helvetica', 'normal');
          doc.setTextColor(51, 65, 85);
          y = addWrappedLines(slide.bullets, margin + 2, y) + 4;
        }

        if (slide.so_what?.length) {
          if (y > 260) { doc.addPage(); y = margin + 10; }
          doc.setFontSize(10);
          doc.setFont('helvetica', 'bold');
          doc.setTextColor(29, 78, 216);
          addText('So What for Manufacturers?', margin, y); y += 6;
          doc.setFont('helvetica', 'normal');
          doc.setTextColor(30, 58, 138);
          y = addWrappedLines(slide.so_what, margin + 2, y) + 4;
        }

        if (slide.where_palsgaard_supports?.length) {
          if (y > 260) { doc.addPage(); y = margin + 10; }
          doc.setFontSize(10);
          doc.setFont('helvetica', 'bold');
          doc.setTextColor(5, 150, 105);
          addText('Where Palsgaard Supports', margin, y); y += 6;
          doc.setFont('helvetica', 'normal');
          doc.setTextColor(4, 120, 87);
          y = addWrappedLines(slide.where_palsgaard_supports, margin + 2, y) + 4;
        }

        if (slide.evidence_footer) {
          if (y > 268) { doc.addPage(); y = margin + 10; }
          doc.setFontSize(8);
          doc.setFont('helvetica', 'italic');
          doc.setTextColor(148, 163, 184);
          const efWrapped = doc.splitTextToSize(`Evidence: ${slide.evidence_footer}`, contentW);
          doc.text(efWrapped, margin, y);
        }
      });

      // Gamma Prompt page
      if (report.gamma_prompt) {
        doc.addPage();
        let y = margin + 6;
        doc.setFontSize(14);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(15, 23, 42);
        addText('Gamma Prompt (Full)', margin, y); y += 10;
        doc.setFontSize(8);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(51, 65, 85);
        const promptLines = doc.splitTextToSize(report.gamma_prompt, contentW);
        promptLines.forEach(line => {
          if (y > 270) { doc.addPage(); y = margin + 10; }
          doc.text(line, margin, y);
          y += 5;
        });
      }

      // Evidence Pack page
      if (report.evidence_pack?.length) {
        doc.addPage();
        let y = margin + 6;
        doc.setFontSize(14);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(15, 23, 42);
        addText('Evidence Pack', margin, y); y += 10;
        doc.setFontSize(10);
        doc.setFont('helvetica', 'normal');
        report.evidence_pack.forEach((ev) => {
          if (y > 268) { doc.addPage(); y = margin + 10; }
          doc.setTextColor(51, 65, 85);
          const evWrapped = doc.splitTextToSize(`• ${ev.bullet}`, contentW);
          doc.text(evWrapped, margin, y);
          y += evWrapped.length * 6;
          if (ev.source_type || ev.confidence) {
            doc.setFontSize(8);
            doc.setTextColor(148, 163, 184);
            addText(`  ${[ev.source_type, ev.confidence ? ev.confidence + ' confidence' : ''].filter(Boolean).join(' · ')}`, margin + 4, y);
            y += 5;
            doc.setFontSize(10);
          }
          y += 2;
        });
      }

      const projectName = project?.name || report.title || 'report';
      const filename = `${projectName.replace(/[^a-z0-9]/gi, '_')}_v${report.version || 1}.pdf`;
      doc.save(filename);
      toast.success('Report downloaded');
    } catch (err) {
      console.error(err);
      toast.error('Failed to generate PDF');
    } finally {
      setDownloading(false);
    }
  };

  return (
    <Button variant={variant} size={size} onClick={handleDownload} disabled={downloading}>
      {downloading ? (
        <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Generating PDF...</>
      ) : (
        <><Download className="w-4 h-4 mr-2" />{label}</>
      )}
    </Button>
  );
}