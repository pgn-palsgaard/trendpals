import React from 'react';
import { getCommercialLabel } from '@/lib/regions';

// Phase 6 — Compact coverage hint for the Generate Report CTA.
// Surfaces which commercial regions have NO source coverage for this trend's
// category ("not searched"), so the user knows the report will have blind spots.
// assessments = output of computeRegionalAssessment (already computed by RegionalEvidence
// via the same queries; here we recompute cheaply from the passed coverage map).
export default function CoverageHint({ assessments = [] }) {
  if (!assessments.length) return null;

  const notSearched = assessments.filter(a => a.label === 'no_data').map(a => getCommercialLabel(a.region));
  const thin = assessments.filter(a => a.coverage === 'thin').map(a => getCommercialLabel(a.region));

  if (notSearched.length === 0 && thin.length === 0) {
    return (
      <p style={{ fontSize: 12, color: '#4A6040', margin: '6px 0 0' }}>
        ✓ All commercial regions have source coverage for this category.
      </p>
    );
  }

  return (
    <div style={{ marginTop: 6, display: 'flex', flexDirection: 'column', gap: 2 }}>
      {notSearched.length > 0 && (
        <p style={{ fontSize: 12, color: '#92600A', margin: 0 }}>
          △ Not searched: {notSearched.join(', ')} — report will show no signal, not absence.
        </p>
      )}
      {thin.length > 0 && (
        <p style={{ fontSize: 12, color: '#92600A', margin: 0 }}>
          △ Thin coverage: {thin.join(', ')} — interpret with care.
        </p>
      )}
    </div>
  );
}