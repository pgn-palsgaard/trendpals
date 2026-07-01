import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Loader2, Sparkles, Copy, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import { AI_DISCLAIMER_SHORT } from '@/lib/aiDisclaimer';

export default function ExecutiveSummaryCard({ report }) {
  const queryClient = useQueryClient();
  const [generating, setGenerating] = useState(false);

  const handleGenerate = async () => {
    setGenerating(true);
    try {
      const slidesSummary = (report.slides || []).map((s, i) =>
        `Slide ${i + 1}: ${s.title}\n${s.market_signal || ''}\nPains: ${(s.customer_pains || []).map(p => p.pain).join('; ')}`
      ).join('\n\n');

      const trendsList = (report.selected_trends || []).join(', ');

      const summary = await base44.integrations.Core.InvokeLLM({
        prompt: `You are a B2B food industry expert writing for Palsgaard sales teams.

Write a concise executive summary (3-4 short paragraphs) for a customer trend presentation titled "${report.title}".
Category: ${report.category}, Region: ${report.region}.
Trends covered: ${trendsList || 'various market trends'}.

Slide content:
${slidesSummary}

The summary should:
- Open with the key market opportunity
- Highlight 2-3 most critical trends and why they matter now
- Close with a sentence on how Palsgaard expertise is relevant
- Be written in confident, professional B2B tone
- NOT mention specific product names or dosage figures`,
      });

      await base44.entities.Report.update(report.id, { executive_summary: summary });
      queryClient.invalidateQueries({ queryKey: ['report', report.id] });
      toast.success('Executive summary generated');
    } catch (err) {
      toast.error('Failed to generate summary');
    } finally {
      setGenerating(false);
    }
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(`${report.executive_summary}\n\n— ${AI_DISCLAIMER_SHORT}`);
    toast.success('Copied to clipboard');
  };

  return (
    <Card className="mb-6">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base">Executive Summary</CardTitle>
          <div className="flex gap-2">
            {report.executive_summary && (
              <>
                <Button variant="ghost" size="sm" onClick={handleCopy}>
                  <Copy className="w-3 h-3 mr-1" /> Copy
                </Button>
                <Button variant="ghost" size="sm" onClick={handleGenerate} disabled={generating}>
                  {generating ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
                </Button>
              </>
            )}
            {!report.executive_summary && (
              <Button size="sm" onClick={handleGenerate} disabled={generating}>
                {generating ? (
                  <><Loader2 className="w-3 h-3 mr-1 animate-spin" />Generating…</>
                ) : (
                  <><Sparkles className="w-3 h-3 mr-1" />Generate</>
                )}
              </Button>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {report.executive_summary ? (
          <>
            <p className="text-sm text-slate-700 leading-relaxed whitespace-pre-line">{report.executive_summary}</p>
            <p className="text-xs text-slate-400 italic mt-3 pt-3 border-t border-slate-100">{AI_DISCLAIMER_SHORT}</p>
          </>
        ) : (
          <p className="text-sm text-slate-400 italic">
            No executive summary yet. Click "Generate" to create one from the slide content.
          </p>
        )}
      </CardContent>
    </Card>
  );
}