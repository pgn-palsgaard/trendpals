/**
 * Process Queue Controls — shown on the Queue tab (uploaded/extracting) and Failed tab.
 * Handles "Process Queue" and "Reset to Queue" actions with confirmation modal + progress bar.
 */
import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { base44 } from '@/api/base44Client';
import { toast } from 'sonner';
import { Zap, RotateCcw, Loader2, X, AlertTriangle } from 'lucide-react';

function ConfirmProcessModal({ count, onConfirm, onCancel }) {
  const batches = Math.ceil(count / 5);
  const estSeconds = batches * 45;
  const estMinutes = Math.ceil(estSeconds / 60);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={onCancel} />
      <div className="relative bg-white rounded-2xl shadow-xl p-6 max-w-md w-full mx-4">
        <div className="flex items-start gap-3 mb-4">
          <div className="p-2 bg-amber-100 rounded-lg">
            <AlertTriangle className="w-5 h-5 text-amber-600" />
          </div>
          <div>
            <h3 className="font-semibold text-slate-900">Process {count} source{count !== 1 ? 's' : ''}?</h3>
            <p className="text-sm text-slate-500 mt-0.5">This will trigger RAG extraction via Claude AI</p>
          </div>
        </div>
        <div className="bg-slate-50 rounded-xl p-4 space-y-2 text-sm text-slate-700 mb-5">
          <p>• <strong>{batches} batch{batches !== 1 ? 'es' : ''}</strong> of up to 5 sources each</p>
          <p>• <strong>45 seconds delay</strong> between batches (rate limit protection)</p>
          <p>• Estimated time: <strong>~{estMinutes} minute{estMinutes !== 1 ? 's' : ''}</strong></p>
          <p className="text-slate-500 text-xs pt-1">Large Mintel PDFs (50+ pages) may still hit rate limits. Consider processing 1–2 at a time for those.</p>
        </div>
        <div className="flex gap-3 justify-end">
          <Button variant="outline" onClick={onCancel}>Cancel</Button>
          <Button className="bg-blue-600 hover:bg-blue-700" onClick={onConfirm}>
            <Zap className="w-4 h-4 mr-1.5" />
            Start Processing
          </Button>
        </div>
      </div>
    </div>
  );
}

/**
 * props:
 *   activeTab: string
 *   visibleRows: Source[]
 *   selectedIds: Set<string>
 *   allQueueCount: number     — total queue count (for "process all" when nothing selected)
 *   allFailedCount: number    — total failed count
 *   processing: { active, batchDone, batchTotal, stopped }
 *   onProcessingChange: (update) => void   — merges into processing state
 *   onRefresh: () => void
 *   onSingleRetry: (sourceId) => void     — resets a single source; called from per-row button
 */
export default function ProcessQueueControls({
  activeTab,
  visibleRows,
  selectedIds,
  allQueueCount,
  allFailedCount,
  processing,
  onProcessingChange,
  onRefresh,
}) {
  const [showConfirm, setShowConfirm] = useState(false);
  const [pendingIds, setPendingIds] = useState(null); // null = all

  // ── Queue tab — "Process" button ──────────────────────────────────────────
  const handleProcessClick = () => {
    const ids = selectedIds.size > 0 ? [...selectedIds] : null;
    setPendingIds(ids);
    setShowConfirm(true);
  };

  const handleConfirmProcess = async () => {
    setShowConfirm(false);
    const ids = pendingIds;
    const count = ids ? ids.length : allQueueCount;
    const batches = Math.ceil(count / 5);

    onProcessingChange({ active: true, batchDone: 0, batchTotal: batches, stopped: false });

    // Poll-update progress while the function runs
    // The function is synchronous server-side; we track local progress by polling.
    // We start a polling interval that refreshes the list and estimates batch progress.
    let done = 0;
    const pollInterval = setInterval(() => {
      if (done < batches) {
        done++;
        onProcessingChange({ batchDone: done });
      }
      onRefresh();
    }, 15000);

    try {
      const res = await base44.functions.invoke('processSourceQueue', {
        ...(ids ? { sourceIds: ids } : {}),
        batchSize: 5,
        delaySeconds: 45,
      });
      clearInterval(pollInterval);
      const data = res.data;
      onProcessingChange({ active: false, batchDone: batches, batchTotal: batches });
      toast.success(
        `Processing complete — ${data.succeeded} succeeded, ${data.failed} failed${data.skipped ? `, ${data.skipped} skipped` : ''}`
      );
      onRefresh();
    } catch (err) {
      clearInterval(pollInterval);
      onProcessingChange({ active: false });
      toast.error(`Processing error: ${err.message}`);
      onRefresh();
    }
  };

  // ── Failed tab — "Reset to Queue" button ─────────────────────────────────
  const handleResetFailed = async () => {
    const ids = selectedIds.size > 0 ? [...selectedIds] : undefined;
    const count = ids ? ids.length : allFailedCount;
    try {
      const res = await base44.functions.invoke('retryFailedSources', ids ? { sourceIds: ids } : {});
      const data = res.data;
      toast.success(`${data.reset} source${data.reset !== 1 ? 's' : ''} reset to queue`);
      onRefresh();
    } catch (err) {
      toast.error(`Reset failed: ${err.message}`);
    }
  };

  const processCount = selectedIds.size > 0 ? selectedIds.size : allQueueCount;
  const resetCount = selectedIds.size > 0 ? selectedIds.size : allFailedCount;

  return (
    <>
      {/* Queue tab action */}
      {activeTab === 'uploaded' && allQueueCount > 0 && (
        <div className="flex items-center gap-3">
          <Button
            className="bg-blue-600 hover:bg-blue-700 gap-2"
            disabled={processing.active}
            onClick={handleProcessClick}
          >
            {processing.active ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Zap className="w-4 h-4" />
            )}
            Process {processCount} source{processCount !== 1 ? 's' : ''}
          </Button>
          {processing.active && (
            <span className="text-sm text-slate-500">
              Batch {processing.batchDone} of {processing.batchTotal} running…
            </span>
          )}
        </div>
      )}

      {/* Failed tab action */}
      {activeTab === 'failed' && allFailedCount > 0 && (
        <Button variant="outline" className="gap-2 border-amber-300 text-amber-700 hover:bg-amber-50" onClick={handleResetFailed}>
          <RotateCcw className="w-4 h-4" />
          Reset {resetCount} to queue
        </Button>
      )}

      {showConfirm && (
        <ConfirmProcessModal
          count={processCount}
          onConfirm={handleConfirmProcess}
          onCancel={() => setShowConfirm(false)}
        />
      )}
    </>
  );
}

/**
 * Per-row retry button — shown in the Notes column on Failed tab rows.
 */
export function RetryRowButton({ sourceId, onDone }) {
  const [loading, setLoading] = useState(false);

  const handleClick = async (e) => {
    e.stopPropagation();
    setLoading(true);
    try {
      await base44.functions.invoke('retryFailedSources', { sourceIds: [sourceId] });
      toast.success('Reset to queue');
      onDone();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <button
      onClick={handleClick}
      disabled={loading}
      className="inline-flex items-center gap-1 text-xs text-amber-600 hover:text-amber-800 font-medium px-2 py-0.5 rounded border border-amber-200 hover:bg-amber-50 transition-colors disabled:opacity-50"
    >
      {loading ? <Loader2 className="w-3 h-3 animate-spin" /> : <RotateCcw className="w-3 h-3" />}
      Retry
    </button>
  );
}