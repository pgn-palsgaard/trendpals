/**
 * Global processing status bar — shown at the top of the page while processSourceQueue is running.
 */
import React from 'react';
import { Zap, X, Loader2 } from 'lucide-react';

export default function ProcessingStatusBar({ processing, onStop }) {
  if (!processing.active) return null;

  const { batchDone, batchTotal } = processing;
  const pct = batchTotal > 0 ? Math.round((batchDone / batchTotal) * 100) : 0;

  return (
    <div className="bg-blue-600 text-white px-6 py-2.5 flex items-center justify-between">
      <div className="flex items-center gap-3">
        <Loader2 className="w-4 h-4 animate-spin shrink-0" />
        <span className="text-sm font-medium">
          Processing sources…
          {batchTotal > 0 && (
            <span className="ml-1 opacity-80">
              Batch {batchDone} of {batchTotal}
            </span>
          )}
        </span>
        {batchTotal > 0 && (
          <div className="flex items-center gap-2 ml-2">
            <div className="w-32 h-1.5 bg-blue-400/50 rounded-full overflow-hidden">
              <div
                className="h-full bg-white rounded-full transition-all duration-500"
                style={{ width: `${pct}%` }}
              />
            </div>
            <span className="text-xs opacity-70">{pct}%</span>
          </div>
        )}
      </div>
      <button
        onClick={onStop}
        className="flex items-center gap-1.5 text-xs bg-blue-500 hover:bg-blue-400 px-3 py-1 rounded-lg transition-colors"
      >
        <X className="w-3.5 h-3.5" />
        Stop
      </button>
    </div>
  );
}