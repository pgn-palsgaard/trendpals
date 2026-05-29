import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { CheckCircle2, AlertCircle, Loader2, Zap, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';

export default function RAGProcessingPanel({ sources, selectedIds, onRefresh }) {
  const [processing, setProcessing] = useState(false);
  const [progress, setProgress] = useState({ current: 0, total: 0, currentTitle: '' });
  const [errors, setErrors] = useState([]);

  const processedSources = sources.filter(s => s.excerpts && s.excerpts.length > 0);
  const unprocessedSources = sources.filter(s => !s.excerpts || s.excerpts.length === 0);
  const processedCount = processedSources.length;
  const totalCount = sources.length;

  const runProcessing = async (sourcesToProcess) => {
    if (sourcesToProcess.length === 0) {
      toast.info('No sources to process');
      return;
    }
    setProcessing(true);
    setErrors([]);
    setProgress({ current: 0, total: sourcesToProcess.length, currentTitle: '' });

    const errs = [];
    for (let i = 0; i < sourcesToProcess.length; i++) {
      const source = sourcesToProcess[i];
      setProgress({ current: i + 1, total: sourcesToProcess.length, currentTitle: source.title });
      try {
        await base44.functions.invoke('processKnowledgeSource', { source_id: source.id });
      } catch (err) {
        errs.push({ title: source.title, error: err.message || 'Unknown error' });
      }
    }

    setProcessing(false);
    setErrors(errs);
    onRefresh();

    if (errs.length === 0) {
      toast.success(`Successfully processed ${sourcesToProcess.length} source(s)`);
    } else {
      toast.warning(`Processed ${sourcesToProcess.length - errs.length} sources, ${errs.length} failed`);
    }
  };

  const handleProcessUnprocessed = () => runProcessing(unprocessedSources);

  const handleReprocessSelected = () => {
    const selected = sources.filter(s => selectedIds.includes(s.id));
    if (selected.length === 0) {
      toast.info('Select sources from the table below first');
      return;
    }
    runProcessing(selected);
  };

  const pct = totalCount > 0 ? Math.round((processedCount / totalCount) * 100) : 0;

  return (
    <Card className="border-purple-200 bg-purple-50/30">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base font-semibold flex items-center gap-2">
            <Zap className="w-4 h-4 text-purple-600" />
            RAG Knowledge Processing
          </CardTitle>
          <Badge
            className={processedCount === totalCount && totalCount > 0
              ? 'bg-green-100 text-green-700'
              : 'bg-orange-100 text-orange-700'}
          >
            {processedCount} / {totalCount} processed
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Progress bar */}
        <div>
          <div className="flex justify-between text-xs text-slate-600 mb-1">
            <span>{processedCount} sources with extracted knowledge</span>
            <span>{pct}%</span>
          </div>
          <Progress value={pct} className="h-2" />
        </div>

        {/* Active progress */}
        {processing && (
          <div className="p-3 bg-white rounded-lg border border-purple-200 space-y-2">
            <div className="flex items-center gap-2 text-sm text-slate-700">
              <Loader2 className="w-4 h-4 animate-spin text-purple-600 flex-shrink-0" />
              <span className="truncate">Processing: <strong>{progress.currentTitle}</strong></span>
            </div>
            <div className="flex justify-between text-xs text-slate-500">
              <span>{progress.current} of {progress.total}</span>
              <span>{Math.round((progress.current / progress.total) * 100)}%</span>
            </div>
            <Progress value={(progress.current / progress.total) * 100} className="h-1.5" />
          </div>
        )}

        {/* Error summary */}
        {errors.length > 0 && !processing && (
          <div className="p-3 bg-red-50 rounded-lg border border-red-200">
            <p className="text-xs font-medium text-red-700 mb-1">{errors.length} source(s) failed:</p>
            <ul className="space-y-0.5">
              {errors.slice(0, 5).map((e, i) => (
                <li key={i} className="text-xs text-red-600 truncate">• {e.title}: {e.error}</li>
              ))}
              {errors.length > 5 && <li className="text-xs text-red-500">...and {errors.length - 5} more</li>}
            </ul>
          </div>
        )}

        {/* Action buttons */}
        <div className="flex gap-2 flex-wrap">
          <Button
            size="sm"
            onClick={handleProcessUnprocessed}
            disabled={processing || unprocessedSources.length === 0}
            className="bg-purple-600 hover:bg-purple-700"
          >
            {processing ? (
              <><Loader2 className="w-3 h-3 mr-1.5 animate-spin" />Processing...</>
            ) : (
              <><Zap className="w-3 h-3 mr-1.5" />Process {unprocessedSources.length} unprocessed</>
            )}
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={handleReprocessSelected}
            disabled={processing || selectedIds.length === 0}
          >
            <RefreshCw className="w-3 h-3 mr-1.5" />
            Re-process selected ({selectedIds.length})
          </Button>
        </div>

        {unprocessedSources.length === 0 && totalCount > 0 && (
          <div className="flex items-center gap-2 text-sm text-green-700">
            <CheckCircle2 className="w-4 h-4" />
            All sources have been processed — knowledge base is ready for report generation.
          </div>
        )}
      </CardContent>
    </Card>
  );
}