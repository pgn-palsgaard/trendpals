import React, { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { CANONICAL_REGIONS } from '@/lib/regions';

// Phase 2 — Regional evidence: distribution of GNPD products linked to this trend
// across the 6 canonical regions. Read-only, derived from GNPDProduct.region.
export default function RegionalEvidence({ trendId }) {
  const { data: products = [], isLoading } = useQuery({
    queryKey: ['gnpdForTrend', trendId],
    queryFn: () => base44.entities.GNPDProduct.filter({ linked_trend_ids: trendId }, '-launch_date', 1000),
    enabled: !!trendId,
  });

  const byRegion = useMemo(() => {
    const counts = {};
    let unknown = 0;
    for (const p of products) {
      const r = p.region;
      if (r && r !== 'unknown') counts[r] = (counts[r] || 0) + 1;
      else unknown++;
    }
    return { counts, unknown };
  }, [products]);

  if (isLoading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', padding: 24 }}>
        <div className="w-6 h-6 border-4 border-slate-200 border-t-[#1D428A] rounded-full animate-spin" />
      </div>
    );
  }

  if (products.length === 0) {
    return (
      <p style={{ fontSize: 14, color: 'hsl(var(--muted-foreground))', fontStyle: 'italic', margin: 0 }}>
        No GNPD product evidence linked to this trend yet.
      </p>
    );
  }

  const max = Math.max(1, ...Object.values(byRegion.counts));

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {CANONICAL_REGIONS.map(region => {
        const count = byRegion.counts[region.key] || 0;
        return (
          <div key={region.key} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <span style={{ width: 130, flexShrink: 0, fontSize: 13, fontWeight: 600, color: count > 0 ? '#1D2B47' : 'hsl(var(--muted-foreground))' }}>
              {region.label}
            </span>
            <div style={{ flex: 1, height: 8, background: 'hsl(var(--muted))', borderRadius: 9999, overflow: 'hidden' }}>
              <div style={{
                width: `${(count / max) * 100}%`, height: '100%',
                background: count > 0 ? '#1D428A' : 'transparent', borderRadius: 9999,
                transition: 'width 0.3s ease',
              }} />
            </div>
            <span style={{ width: 36, textAlign: 'right', flexShrink: 0, fontSize: 13, fontWeight: 600, color: count > 0 ? '#1D428A' : 'hsl(var(--muted-foreground))' }}>
              {count}
            </span>
          </div>
        );
      })}
      {byRegion.unknown > 0 && (
        <p style={{ fontSize: 12, color: 'hsl(var(--muted-foreground))', margin: '4px 0 0' }}>
          {byRegion.unknown} product{byRegion.unknown !== 1 ? 's' : ''} with an unmapped region.
        </p>
      )}
    </div>
  );
}