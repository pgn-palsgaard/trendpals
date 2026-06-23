import React from 'react';
import { CANONICAL_REGIONS } from '@/lib/regions';

// Phase 7 — Shows existing SME review coverage per region for the trends being
// dispatched, so the dispatcher can see which regions still have no reviewer.
// assignments = all ReviewAssignment records; trendIds = trends in this dispatch.
export default function SMECoverageRow({ assignments = [], trendIds = [] }) {
  const idSet = new Set(trendIds.filter(Boolean));
  const relevant = assignments.filter(a => a.global_trend_id && idSet.has(a.global_trend_id));

  // region key -> { sent, responded }
  const byRegion = {};
  for (const a of relevant) {
    const key = a.reviewer_region || 'unknown';
    if (!byRegion[key]) byRegion[key] = { sent: 0, responded: 0 };
    if (a.status === 'responded') byRegion[key].responded += 1;
    else byRegion[key].sent += 1;
  }

  if (idSet.size === 0) return null;

  return (
    <div className="mb-5 rounded-xl p-3" style={{ background: '#F7F4EE', border: '1px solid #e8e4da' }}>
      <p className="text-xs font-semibold mb-2" style={{ color: '#1D2B47' }}>Existing SME coverage for these trends</p>
      <div className="grid grid-cols-2 gap-2">
        {CANONICAL_REGIONS.map(r => {
          const c = byRegion[r.key];
          const has = c && (c.sent + c.responded) > 0;
          return (
            <div
              key={r.key}
              className="flex items-center justify-between rounded-lg px-2.5 py-1.5"
              style={{ background: has ? '#EEF1EC' : '#fff', border: `1px solid ${has ? '#C8D4C0' : '#e8e4da'}` }}
            >
              <span className="text-xs font-medium" style={{ color: has ? '#4A6040' : '#9CA3AF' }}>{r.label}</span>
              <span className="text-xs" style={{ color: has ? '#4A6040' : '#C15338' }}>
                {has ? `${c.responded} done · ${c.sent} open` : 'No reviewer'}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}