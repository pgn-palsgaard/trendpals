import React from 'react';
import { CheckCircle, MinusCircle, HelpCircle } from 'lucide-react';

// Phase 5 — Coverage context for the trend report.
// Distinguishes "no signal" (searched, nothing found) from "not searched"
// (no source coverage for this category in that region).
const STATUS_STYLES = {
  signal:       { bg: '#eaf2e8', text: '#3a6b2e', icon: CheckCircle, dot: '#3a6b2e' },
  no_signal:    { bg: '#f1f5f9', text: '#64748b', icon: MinusCircle, dot: '#94a3b8' },
  not_searched: { bg: '#fef3c7', text: '#92400e', icon: HelpCircle, dot: '#d97706' },
};

export default function CoverageBanner({ coverage }) {
  if (!coverage || !Array.isArray(coverage.regions) || coverage.regions.length === 0) return null;

  return (
    <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm">
      <div className="flex items-center justify-between mb-3">
        <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Evidence coverage</h4>
        <span className="text-xs text-slate-400">
          {coverage.scope === 'all' ? 'All regions' : (coverage.regions[0]?.region_label || coverage.scope)}
        </span>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5">
        {coverage.regions.map(r => {
          const st = STATUS_STYLES[r.status] || STATUS_STYLES.not_searched;
          const Icon = st.icon;
          return (
            <div key={r.key} className="rounded-lg px-3 py-2.5" style={{ backgroundColor: st.bg }}>
              <div className="flex items-center gap-1.5 mb-1">
                <Icon className="w-3.5 h-3.5" style={{ color: st.text }} />
                <span className="text-xs font-bold" style={{ color: st.text }}>{r.region_label}</span>
              </div>
              <p className="text-xs leading-snug" style={{ color: st.text }}>{r.label}</p>
            </div>
          );
        })}
      </div>
      <p className="text-xs text-slate-400 italic mt-3">
        "Not searched" means no source covers this category in that region — absence of signal is not evidence of absence.
      </p>
    </div>
  );
}