// Client-side ranking + new-trend detection for the Project Trends tab (Fix 4).
// Pure functions — no LLM calls.

// Tokenize a keyword/phrase into lowercased significant words (len > 3).
function tokenize(text) {
  return String(text || '')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(w => w.length > 3);
}

// Does an excerpt overlap a trend's keywords? Overlap if any trend keyword
// (or a significant word within it) appears in the excerpt's searchable text.
function excerptText(excerpt) {
  return [
    excerpt.market_signal,
    excerpt.customer_pain,
    excerpt.source_quote,
    ...(excerpt.trend_keywords || []),
  ].join(' ').toLowerCase();
}

// Count how many distinct trend keywords an excerpt matches.
export function countKeywordMatches(excerpt, trendKeywords) {
  const text = excerptText(excerpt);
  let matches = 0;
  for (const kw of trendKeywords || []) {
    const k = String(kw || '').toLowerCase().trim();
    if (!k) continue;
    if (text.includes(k)) { matches++; continue; }
    // fall back to significant-word overlap
    const words = tokenize(k);
    if (words.length && words.some(w => text.includes(w))) matches++;
  }
  return matches;
}

// 4B — relevanceScore (0–100) for one library trend.
export function computeRelevanceScore(trend, projectExcerpts, gnpdProducts, projectCategory) {
  let score = 0;

  // Excerpt overlap: each matching excerpt +10, cap 60.
  const trendKeywords = trend.trend_keywords || [];
  let matchingExcerpts = 0;
  for (const ex of projectExcerpts) {
    if (countKeywordMatches(ex, trendKeywords) > 0) matchingExcerpts++;
  }
  score += Math.min(60, matchingExcerpts * 10);

  // GNPD evidence: any approved/auto_applied trend_link for this trend sharing the category → +20.
  const hasGnpdEvidence = (gnpdProducts || []).some(p =>
    (p.category === projectCategory || p.palsgaard_category === projectCategory) &&
    (p.trend_links || []).some(l =>
      l.trend_id === trend.id &&
      (l.review_status === 'approved' || l.review_status === 'auto_applied')
    )
  );
  if (hasGnpdEvidence) score += 20;

  // Confidence.
  if (trend.confidence === 'high') score += 20;
  else if (trend.confidence === 'medium') score += 10;

  return { score: Math.min(100, score), matchingExcerpts };
}

// 4D — find strong project excerpts that do NOT overlap any existing library trend
// by more than 1 keyword. Returns [{ excerpt, sourceTitle }].
export function findPotentialNewTrends(sources, libraryTrends) {
  const out = [];
  for (const source of sources || []) {
    for (const ex of source.excerpts || []) {
      if (ex.confidence !== 'high') continue;
      if (!ex.market_signal) continue;
      // max overlap against any library trend
      let maxOverlap = 0;
      for (const t of libraryTrends || []) {
        const n = countKeywordMatches(ex, t.trend_keywords || []);
        if (n > maxOverlap) maxOverlap = n;
        if (maxOverlap > 1) break;
      }
      if (maxOverlap <= 1) {
        out.push({ excerpt: ex, sourceTitle: source.title || 'Untitled source' });
      }
    }
  }
  return out;
}