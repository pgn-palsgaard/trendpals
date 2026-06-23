import React, { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import {
  COMMERCIAL_REGIONS,
  getCommercialRegion,
  normalizeEditorialRegion,
} from '@/lib/regions';

// Phase 4 — Regional evidence: distribution of GNPD products linked to this trend
// across the 4 commercial (Palsgaard sales) regions. Underlying GNPDProduct.region
// is canonical; it's folded to commercial here via getCommercialRegion().
// Editorial regional_manifestations are matched in via normalizeEditorialRegion();
// a "Global" editorial entry is shown as a cross-regional note, not a region card.
export default function RegionalEvidence({ trendId, trend }) {
  const { data: products = [], isLoading } = useQuery({
    queryKey: ['gnpdForTrend', trendId],
    queryFn: () => base44.entities.GNPDProduct.filter({ linked_trend_ids: trendId }, '-launch_date', 1000),
    enabled: !!trendId,
  });

  const byRegion = useMemo(() => {
    const counts = {};
    let unknown = 0;
    for (const p of products) {
      const commercialKey = p.region && p.region !== 'unknown'
        ? getCommercialRegion(p.region, p.country)
        : null;
      if (commercialKey) counts[commercialKey] = (counts[commercialKey] || 0) + 1;
      else unknown++;
    }
    return { counts, unknown };
  }, [products]);

  // Editorial manifestations folded to commercial keys (for signal hints + Global note)
  const editorial = useMemo(() => {
    const signalsByRegion = {};
    let globalNote = null;
    for (const rm of (trend?.regional_manifestations || [])) {
      const commercialKey = normalizeEditorialRegion(rm.region);
      if (commercialKey === 'global') {
        if (rm.signal && !globalNote) globalNote = rm.signal;
      } else if (commercialKey) {
        if (!signalsByRegion[commercialKey]) signalsByRegion[commercialKey] = rm;
      }
    }
    return { signalsByRegion, globalNote };
  }, [trend]);

  if (isLoading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', padding: 24 }}>
        <div className="w-6 h-6 border-4 border-slate-200 border-t-[#1D428A] rounded-full animate-spin" />
      </div>
    );
  }

  const hasEditorial = Object.keys(editorial.signalsByRegion).length > 0 || editorial.globalNote;

  if (products.length === 0 && !hasEditorial) {
    return (
      <p style={{ fontSize: 14, color: 'hsl(var(--muted-foreground))', fontStyle: 'italic', margin: 0 }}>
        No GNPD product evidence linked to this trend yet.
      </p>
    );
  }

  const max = Math.max(1, ...Object.values(byRegion.counts));

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {COMMERCIAL_REGIONS.map(region => {
        const count = byRegion.counts[region.key] || 0;
        const sig = editorial.signalsByRegion[region.key];
        return (
          <div key={region.key} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <span style={{ width: 100, flexShrink: 0, fontSize: 13, fontWeight: 600, color: count > 0 ? '#1D2B47' : 'hsl(var(--muted-foreground))' }}>
              {region.label}
              {sig?.intensity && (
                <span style={{ display: 'block', fontSize: 10, fontWeight: 500, textTransform: 'capitalize', color: 'hsl(var(--muted-foreground))' }}>
                  {sig.intensity}
                </span>
              )}
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
      {editorial.globalNote && (
        <div style={{ marginTop: 6, padding: '8px 12px', background: 'hsl(var(--muted))', borderRadius: 8, border: '1px solid hsl(var(--border))' }}>
          <span style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'hsl(var(--muted-foreground))' }}>
            Global
          </span>
          <p style={{ fontSize: 13, color: '#475569', margin: '2px 0 0' }}>{editorial.globalNote}</p>
        </div>
      )}
    </div>
  );
}