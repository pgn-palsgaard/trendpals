// Advisory SME annotation layer.
//
// SME review is a VERIFICATION layer, never a gate: nothing here is read by the
// report architect, publishReport, or any save/build path. It only summarises
// what SMEs reported, so the summary can be shown next to a trend.
//
// Aggregation is client-side from ReviewAssignment records (same approach as
// SMECoverageRow) — no backend aggregation needed.
import { getRegionLabel } from '@/lib/regions';

export const SIGNAL_LABELS = {
  strong: 'strong signal',
  emerging: 'emerging',
  not_seeing_it: 'not seen in market',
};

// Strength order — the strongest reported signal wins the headline.
const SIGNAL_RANK = { strong: 3, emerging: 2, not_seeing_it: 1 };

/**
 * Summarise responded SME reviews for one trend.
 * Returns null when no SME has responded — the trend then simply carries no
 * badge, which is a valid state and never blocks anything.
 */
export function summariseSmeForTrend(assignments = [], trendId) {
  if (!trendId) return null;
  const responded = assignments.filter(
    a => a.global_trend_id === trendId && a.status === 'responded'
  );
  if (responded.length === 0) return null;

  const reviewers = new Set(responded.map(a => a.reviewer_email).filter(Boolean));
  const regions = [...new Set(responded.map(a => a.reviewer_region).filter(Boolean))];

  let signal = null;
  for (const a of responded) {
    if (!a.trend_signal) continue;
    if (!signal || (SIGNAL_RANK[a.trend_signal] || 0) > (SIGNAL_RANK[signal] || 0)) {
      signal = a.trend_signal;
    }
  }

  const confirmed = responded.filter(a => a.verdict === 'confirmed').length;
  const rejected = responded.filter(a => a.verdict === 'rejected').length;
  const needsRefinement = responded.filter(a => a.verdict === 'needs_refinement').length;

  const reviewerCount = reviewers.size;
  const parts = [signal ? SIGNAL_LABELS[signal] : 'reviewed'];
  parts.push(`${reviewerCount} reviewer${reviewerCount === 1 ? '' : 's'}`);
  if (regions.length > 0) parts.push(regions.map(getRegionLabel).join(', '));

  return {
    signal,
    reviewerCount,
    regions,
    confirmed,
    rejected,
    needsRefinement,
    label: `SME: ${parts.join(' — ')}`,
  };
}