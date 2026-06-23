import React from 'react';
import { CANONICAL_REGIONS } from '@/lib/regions';

// Phase 3 — Region filter pills. Single-select; null = all regions.
export default function RegionFilterPills({ activeRegion, onSelect }) {
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
        All regions
      </button>
      {CANONICAL_REGIONS.map(region => (
        <button
          key={region.key}
          onClick={() => onSelect(region.key)}
          title={region.description}
          className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
            activeRegion === region.key
              ? 'bg-[#1D428A] text-white border-[#1D428A]'
              : 'bg-white text-slate-600 border-slate-200 hover:border-[#1D428A]'
          }`}
        >
          {region.label}
        </button>
      ))}
    </div>
  );
}