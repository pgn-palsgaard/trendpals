import React from 'react';
import { AlertTriangle } from 'lucide-react';

// Shows why the evidence gate refused to produce a pool. A thin report or no
// report is a correct outcome — the gates are never widened to fill output.
export default function GateNotice({ notice }) {
  if (!notice) return null;

  const isRegion = notice.type === 'region_unresolved';
  const g = notice.gate;

  return (
    <div className="pal-card p-4" style={{ background: '#FAE9E5' }}>
      <div className="flex items-start gap-2">
        <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" style={{ color: '#C15338' }} />
        <div className="min-w-0">
          <p className="text-sm font-semibold" style={{ color: '#A33B24' }}>
            {isRegion ? 'Region could not be resolved' : 'Insufficient regional evidence'}
          </p>
          <p className="text-xs mt-1" style={{ color: '#A33B24' }}>{notice.message}</p>
          {g && (
            <p className="text-xs mt-2" style={{ color: '#A33B24' }}>
              Pool after region gate: {g.after_region_gate} · after format gate: {g.after_category_gate}
              {Object.keys(g.per_subregion_counts || {}).length
                ? ` · ${Object.entries(g.per_subregion_counts).map(([k, v]) => `${k}: ${v}`).join(', ')}`
                : ''}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}