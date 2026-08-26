import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { summariseSmeForTrend } from '@/lib/smeAnnotation';

// Advisory only — informational badge summarising SME field verification for a
// trend. Renders nothing when no SME has responded, and never affects whether a
// report can be built, saved or published.
export default function SMEAnnotationBadge({ trendId, className = '' }) {
  const { data: assignments = [] } = useQuery({
    queryKey: ['smeAnnotationAssignments'],
    queryFn: () => base44.entities.ReviewAssignment.filter({ status: 'responded' }),
    staleTime: 5 * 60 * 1000,
    enabled: !!trendId,
  });

  const summary = summariseSmeForTrend(assignments, trendId);
  if (!summary) return null;

  const notSeen = summary.signal === 'not_seeing_it';

  return (
    <span
      title="Field verification from subject-matter experts — advisory only"
      className={`inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium ${className}`}
      style={{
        background: notSeen ? '#FAE9E5' : '#EEF1EC',
        color: notSeen ? '#A33B24' : '#4A6040',
      }}
    >
      {summary.label}
    </span>
  );
}