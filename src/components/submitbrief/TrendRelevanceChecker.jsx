import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { Check, TrendingUp, Loader2, ArrowRight } from 'lucide-react';

/**
 * Trend Relevance Check — an optional step in the brief flow.
 * Ranks active trends against the brief, pre-selects the top defaults,
 * and lets the user toggle which trends to include. Selections are
 * lifted up via onConfirm({ ids, names }).
 */
export default function TrendRelevanceChecker({ fields, onConfirm, onSkip, onBack }) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [trends, setTrends] = useState([]);
  const [selected, setSelected] = useState(() => new Set());

  useEffect(() => {
    let cancelled = false;
    async function run() {
      setLoading(true);
      setError('');
      try {
        const res = await base44.functions.invoke('analyzeBriefRelevance', {
          category: fields.category || '',
          objective: fields.objective || '',
          purpose: fields.objective || '',
          topics: fields.customer_audience || '',
        });
        if (cancelled) return;
        const list = res?.data?.trends || [];
        setTrends(list);
        setSelected(new Set(list.filter(t => t.preselected).map(t => t.id)));
      } catch (e) {
        if (!cancelled) setError('Could not load relevant trends. You can skip this step.');
      }
      if (!cancelled) setLoading(false);
    }
    run();
    return () => { cancelled = true; };
  }, [fields.category, fields.objective, fields.customer_audience]);

  function toggle(id) {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function confirm() {
    const chosen = trends.filter(t => selected.has(t.id));
    onConfirm({ ids: chosen.map(t => t.id), names: chosen.map(t => t.trend_name) });
  }

  return (
    <div className="max-w-3xl mx-auto">
      <div className="text-center mb-6">
        <h2 className="text-lg font-semibold text-stone-800">Which trends should we focus on?</h2>
        <p className="text-sm text-stone-500 mt-1">
          Based on your brief, these market trends look most relevant. We&apos;ve pre-selected a starting point — adjust as you like.
        </p>
      </div>

      {loading && (
        <div className="flex flex-col items-center justify-center py-16 text-stone-400">
          <Loader2 className="w-6 h-6 animate-spin mb-3" />
          <p className="text-sm">Finding relevant trends…</p>
        </div>
      )}

      {!loading && error && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 mb-4">
          {error}
        </div>
      )}

      {!loading && !error && trends.length === 0 && (
        <div className="rounded-xl border border-stone-200 bg-white px-4 py-8 text-center text-sm text-stone-500 mb-4">
          No matching trends found yet. You can continue without selecting any.
        </div>
      )}

      {!loading && trends.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {trends.map(t => {
            const isSelected = selected.has(t.id);
            return (
              <button
                key={t.id}
                onClick={() => toggle(t.id)}
                aria-pressed={isSelected}
                className={`relative text-left rounded-xl p-4 border transition-colors cursor-pointer ${
                  isSelected ? 'border-[#1D428A] bg-blue-50' : 'border-stone-200 bg-white hover:border-[#1D428A] hover:bg-blue-50'
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <TrendingUp className="w-4 h-4 text-[#1D428A] shrink-0" />
                    <p className="text-sm font-semibold text-stone-800 truncate">{t.trend_name}</p>
                  </div>
                  <span
                    className={`shrink-0 w-5 h-5 rounded-md border flex items-center justify-center ${
                      isSelected ? 'bg-[#1D428A] border-[#1D428A]' : 'border-stone-300 bg-white'
                    }`}
                  >
                    {isSelected && <Check className="w-3.5 h-3.5 text-white" />}
                  </span>
                </div>
                {t.market_signal && (
                  <p className="text-xs text-stone-500 mt-2 leading-relaxed line-clamp-3">{t.market_signal}</p>
                )}
                <p className="text-xs text-[#1D428A] mt-2 font-medium">{t.reason}</p>
              </button>
            );
          })}
        </div>
      )}

      {!loading && (
        <div className="flex items-center justify-between mt-6">
          <button onClick={onBack} className="text-sm text-stone-500 hover:text-stone-800">
            ← Back
          </button>
          <div className="flex items-center gap-3">
            <button onClick={onSkip} className="text-sm text-stone-500 hover:text-stone-800">
              Skip this step
            </button>
            <button
              onClick={confirm}
              className="inline-flex items-center gap-2 rounded-lg px-5 py-2.5 text-sm font-semibold text-white transition-colors"
              style={{ background: '#1D428A' }}
              onMouseEnter={e => { e.currentTarget.style.background = '#1E3A8A'; }}
              onMouseLeave={e => { e.currentTarget.style.background = '#1D428A'; }}
            >
              Continue to review
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}