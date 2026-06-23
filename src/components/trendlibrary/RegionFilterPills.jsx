import React from 'react';
import { COMMERCIAL_REGIONS } from '@/lib/regions';

// Phase 2/4 — Region filter pills (commercial Palsgaard sales regions).
// Single-select; null = all regions. Pills: [Alle] [ASPAC (n)] ...
// pillData (Phase 4): { aspac: { signalCount, thin }, ... }
//   signalCount = trends in the current list with signal in this region (primary count)
//   thin        = <50% of listed trends have any source coverage here → show △
export default function RegionFilterPills({ activeRegion, onSelect, pillData = {} }) {
  return (
    <div className="flex flex-wrap items-center gap-2 mb-4">
      <span className="text-xs font-semibold uppercase tracking-wider text-slate-400 mr-1">Region</span>
      <button
        onClick={() => onSelect(null)}
        className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
          !activeRegion
            ? 'bg-[#1D428A] text-white border-[#1D428A]'
            : 'bg-white text-slate-600 border-slate-200 hover:border-[#1D428A]'
        }`}
      >
        Alle
      </button>
      {COMMERCIAL_REGIONS.map(region => {
        const d = pillData[region.key];
        const isActive = activeRegion === region.key;
        return (
          <button
            key={region.key}
            onClick={() => onSelect(region.key)}
            title="Based on uploaded evidence — may not reflect full regional picture."
            className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
              isActive
                ? 'bg-[#1D428A] text-white border-[#1D428A]'
                : 'bg-white text-slate-600 border-slate-200 hover:border-[#1D428A]'
            }`}
          >
            {region.label}
            {d && <span className="ml-1 opacity-75">({d.signalCount})</span>}
            {d?.thin && (
              <span
                className={isActive ? 'ml-1 text-amber-200' : 'ml-1 text-amber-500'}
                title="Thin coverage — most trends in this list have no source coverage for this region."
              >
                △
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}