import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { ChevronDown, ChevronRight, Lightbulb, Flag, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

export default function PotentialNewTrends({ project, candidates }) {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [flaggingId, setFlaggingId] = useState(null);
  const [flagged, setFlagged] = useState({});

  const handleFlag = async (candidate, idx) => {
    setFlaggingId(idx);
    try {
      const words = String(candidate.excerpt.market_signal || '').split(/\s+/).slice(0, 8).join(' ');
      const today = new Date().toISOString().split('T')[0];
      // The ONLY write: a new inactive GlobalTrend awaiting human review.
      await base44.entities.GlobalTrend.create({
        trend_name: `${words}...`,
        is_active: false,
        category: project.category,
        market_signal: candidate.excerpt.market_signal,
        confidence: 'low',
        description: `Flagged from project ${project.name} on ${today}. Awaiting human review before activation.`,
      });
      setFlagged(prev => ({ ...prev, [idx]: true }));
      toast.success('Flagged for library review — visible in Trend Library under inactive trends.');
      queryClient.invalidateQueries({ queryKey: ['globalTrendsForPicker'] });
    } catch (e) {
      toast.error(e.message || 'Failed to flag trend');
    } finally {
      setFlaggingId(null);
    }
  };

  return (
    <div className="rounded-[10px] border-2 border-amber-300 bg-amber-50/40">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-4 py-3 text-left"
      >
        <span className="flex items-center gap-2 font-medium text-amber-900">
          <Lightbulb className="w-4 h-4 text-amber-600" />
          Potential new trends
          {candidates.length > 0 && (
            <span className="ml-1 px-2 py-0.5 rounded-full bg-amber-200 text-amber-900 text-xs font-semibold">
              {candidates.length}
            </span>
          )}
        </span>
        {open ? <ChevronDown className="w-4 h-4 text-amber-700" /> : <ChevronRight className="w-4 h-4 text-amber-700" />}
      </button>

      {open && (
        <div className="px-4 pb-4 space-y-3">
          <p className="text-xs text-amber-800">
            Strong signals from project sources that don't match any existing library trend. Flag one to queue it for human review — it is created inactive and never appears in project suggestions until a person activates it.
          </p>
          {candidates.length === 0 && (
            <p className="text-sm text-amber-700/70">No unmatched strong signals found.</p>
          )}
          {candidates.map((c, idx) => (
            <div key={idx} className="p-3 bg-white rounded-lg border border-amber-200">
              <p className="text-sm text-slate-800">{c.excerpt.market_signal}</p>
              <p className="text-xs text-slate-500 mt-1">From: {c.sourceTitle}</p>
              <div className="mt-2">
                {flagged[idx] ? (
                  <span className="text-xs font-medium text-green-700 inline-flex items-center gap-1">
                    <Flag className="w-3 h-3" /> Flagged for review
                  </span>
                ) : (
                  <Button
                    size="sm"
                    variant="outline"
                    className="border-amber-300 text-amber-800 hover:bg-amber-100"
                    disabled={flaggingId === idx}
                    onClick={() => handleFlag(c, idx)}
                  >
                    {flaggingId === idx ? (
                      <><Loader2 className="w-3 h-3 mr-1 animate-spin" /> Flagging...</>
                    ) : (
                      <><Flag className="w-3 h-3 mr-1" /> Flag for library review</>
                    )}
                  </Button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}