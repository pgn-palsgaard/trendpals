/**
 * Single derived attention state for a Source — used by BOTH the tab filters
 * and the Notes badge so tabs are mutually exclusive by construction.
 * Every source maps to exactly ONE state.
 */

export function isMetadataExtracted(s) {
  return ['extracted', 'partial'].includes(s.metadata_extraction?.status) ||
    ['metadata_extracted', 'extracted', 'gnpd_ready'].includes(s.pipeline_stage);
}

export function getSourceAttentionState(s) {
  if (s.pipeline_stage === 'failed') return 'failed';
  if (s.pipeline_stage === 'skipped') return 'skipped';
  if (s.review_status === 'rejected') return 'rejected';
  if (s.review_status === 'approved') return 'approved';
  // Only flag needs_classification if the human hasn't already approved/rejected
  if (s.pipeline_stage === 'needs_classification' && !s.review_status) return 'needs_classification';
  // machine is working or about to (uploaded / extracting, metadata not yet extracted)
  if (!isMetadataExtracted(s)) return 'queue';
  // metadata extracted — waiting on human
  if (!s.metadata_extraction?.verified) return 'awaiting_verification';
  return 'awaiting_approval';
}

// Which tab a state belongs to (tabs are disjoint: sum of tabs = All)
export const STATE_TO_TAB = {
  needs_classification: 'awaiting_review',
  awaiting_verification: 'awaiting_review',
  awaiting_approval: 'awaiting_review',
  queue: 'uploaded',
  approved: 'approved',
  rejected: 'rejected',
  failed: 'failed',
  skipped: 'skipped',
};

// Human-facing note per state (Notes column)
export function attentionNote(s) {
  const state = getSourceAttentionState(s);
  switch (state) {
    case 'needs_classification': return 'Awaiting classification decision';
    case 'queue':
      if (s.pipeline_stage === 'extracting') return 'Extracting metadata…';
      if (s.classification?.status === 'classifying') return 'Classifying…';
      if (s.metadata_extraction?.status === 'failed') return 'Metadata extraction missing';
      return 'Queued for extraction';
    case 'awaiting_verification': return 'Awaiting metadata verification';
    case 'awaiting_approval': return 'Awaiting approval';
    default: return null;
  }
}

// Dev invariant: every source must land in exactly one tab; sum of tabs = All
export function checkTabInvariant(sources, counts) {
  const coreTabs = ['awaiting_review', 'approved', 'rejected', 'failed', 'uploaded', 'skipped'];
  const sum = coreTabs.reduce((acc, t) => acc + (counts[t] || 0), 0);
  if (sum !== sources.length) {
    console.warn(`[sourceAttentionState] TAB INVARIANT VIOLATION: tabs sum to ${sum} but All=${sources.length}`);
    return false;
  }
  return true;
}