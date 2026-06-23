import React, { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { COMMERCIAL_REGIONS, getCommercialLabel } from '@/lib/regions';
import { computeRegionalAssessment } from '@/lib/coverageModel';

// Phase 3 — Coverage-aware regional evidence. Combines signal (GNPD launches,
// source excerpts, SME verdicts) with COVERAGE (did we even search this region
// for this category?) via computeRegionalAssessment. Distinguishes "no signal"
// from "not searched".

const BADGE_STYLES = {
  green: { background: '#EEF1EC', color: '#4A6040', border: '1px solid #C8D4C0' },
  amber: { background: '#FDF6E7', color: '#92600A', border: '1px solid #F0E0B8' },
  gray:  { background: 'hsl(var(--muted))', color: 'hsl(var(--muted-foreground))', border: '1px solid hsl(var(--border))' },
};

function AssessmentBadge({ a }) {
  if (a.badgeColor === 'none') {
    return (
      <span style={{ fontSize: 11, fontWeight: 600, color: 'hsl(var(--muted-foreground))', fontStyle: 'italic' }}>
        {a.displayLabel}
      </span>
    );
  }
  const style = BADGE_STYLES[a.badgeColor] || BADGE_STYLES.gray;
  const muted = a.badgeVariant === 'muted';
  return (
    <span style={{
      ...style,
      opacity: muted ? 0.8 : 1,
      fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 6,
      display: 'inline-flex', alignItems: 'center', whiteSpace: 'nowrap',
    }}>
      {a.displayLabel}
    </span>
  );
}

export default function RegionalEvidence({ trendId, trend }) {
  const trendCategory = trend?.category;

  // GNPD products linked to this trend
  const { data: products = [], isLoading: loadingProducts } = useQuery({
    queryKey: ['gnpdForTrend', trendId],
    queryFn: () => base44.entities.GNPDProduct.filter({ linked_trend_ids: trendId }, '-launch_date', 1000),
    enabled: !!trendId,
  });

  // Sources with excerpts linked to this trend (via category relevance) — used for signal
  const { data: linkedSources = [] } = useQuery({
    queryKey: ['sourcesForTrendSignal', trendCategory],
    queryFn: () => base44.entities.Source.filter(
      { source_type: { $in: ['mintel', 'market_intel'] } }, '-created_date', 500
    ),
    enabled: !!trendCategory,
  });

  // Review assignments for this trend (SME signals)
  const { data: reviewAssignments = [] } = useQuery({
    queryKey: ['reviewAssignmentsForTrend', trendId],
    queryFn: () => base44.entities.ReviewAssignment.filter({ global_trend_id: trendId }, '-created_date', 500),
    enabled: !!trendId,
  });

  // ALL category-relevant sources — for the COVERAGE map (did we search here at all?)
  const { data: coverageSources = [], isLoading: loadingCoverage } = useQuery({
    queryKey: ['sourceCoverage', trendCategory],
    queryFn: () => base44.entities.Source.filter(
      { source_type: { $in: ['gnpd', 'mintel', 'market_intel'] } }, '-created_date', 1000
    ),
    enabled: !!trendCategory,
  });

  const assessments = useMemo(() => {
    return computeRegionalAssessment({
      gnpdProducts: products,
      sources: linkedSources,
      reviewAssignments,
      allSources: coverageSources,
      trendCategory,
      regionalManifestations: trend?.regional_manifestations || [],
    });
  }, [products, linkedSources, reviewAssignments, coverageSources, trendCategory, trend]);

  const isLoading = loadingProducts || loadingCoverage;

  if (isLoading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', padding: 24 }}>
        <div className="w-6 h-6 border-4 border-slate-200 border-t-[#1D428A] rounded-full animate-spin" />
      </div>
    );
  }

  // Global editorial note (region === 'global' manifestation)
  const globalNote = (trend?.regional_manifestations || [])
    .find(rm => (rm.region || '').toLowerCase().trim() === 'global' && rm.signal)?.signal || null;

  const hasAnyData = assessments.some(a => a.label !== 'no_data') || globalNote;

  if (!hasAnyData) {
    return (
      <p style={{ fontSize: 14, color: 'hsl(var(--muted-foreground))', fontStyle: 'italic', margin: 0 }}>
        No regional data uploaded yet. As sources and GNPD data are added, regional patterns will emerge here.
      </p>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {assessments.map(a => {
        const sme = a.smeSignals;
        return (
          <div key={a.region} style={{
            padding: '10px 12px', borderRadius: 8,
            border: '1px solid hsl(var(--border))', background: 'hsl(var(--card))',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
              <span style={{ fontSize: 13, fontWeight: 700, color: '#1D2B47' }}>
                {getCommercialLabel(a.region)}
              </span>
              <AssessmentBadge a={a} />
            </div>

            {/* Signal breakdown */}
            {(a.gnpdLaunches > 0 || a.sourceExcerpts > 0 || sme.count > 0) && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, marginTop: 6, fontSize: 12, color: 'hsl(var(--muted-foreground))' }}>
                {a.sourceExcerpts > 0 && <span>Sources: {a.sourceExcerpts} excerpt{a.sourceExcerpts !== 1 ? 's' : ''}</span>}
                {sme.count > 0 && <span>SME: {sme.count} verdict{sme.count !== 1 ? 's' : ''}{sme.consensus ? ` (${sme.consensus})` : ''}</span>}
                {a.gnpdLaunches > 0 && <span>GNPD: {a.gnpdLaunches} launch{a.gnpdLaunches !== 1 ? 'es' : ''}</span>}
              </div>
            )}

            {/* Coverage indicator */}
            {a.coverage === 'good' && (
              <p style={{ fontSize: 11, color: '#4A6040', margin: '5px 0 0' }}>✓ Multiple sources cover this region</p>
            )}
            {a.coverage === 'thin' && (
              <p style={{ fontSize: 11, color: '#92600A', margin: '5px 0 0' }}>△ Single source — interpret with care</p>
            )}

            {/* Caveat */}
            {a.caveat && (
              <p style={{ fontSize: 11, color: 'hsl(var(--muted-foreground))', margin: '3px 0 0', fontStyle: 'italic' }}>
                {a.caveat}
              </p>
            )}
          </div>
        );
      })}

      {/* Global editorial note */}
      {globalNote && (
        <div style={{ marginTop: 2, padding: '8px 12px', background: 'hsl(var(--muted))', borderRadius: 8, border: '1px solid hsl(var(--border))' }}>
          <span style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'hsl(var(--muted-foreground))' }}>
            Global
          </span>
          <p style={{ fontSize: 13, color: '#475569', margin: '2px 0 0' }}>{globalNote}</p>
        </div>
      )}

      {/* Section footer — permanent framing device */}
      <p style={{ fontSize: 11, color: 'hsl(var(--muted-foreground))', margin: '4px 0 0', fontStyle: 'italic' }}>
        Regional picture reflects uploaded evidence only — regions without data may still be active.
      </p>
    </div>
  );
}