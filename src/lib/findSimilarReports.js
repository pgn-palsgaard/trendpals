import { base44 } from '@/api/base44Client';
import { reportSearchText } from '@/lib/reportSearch';

const STOPWORDS = new Set(['the','and','for','with','from','that','this','into','their','have','what','when','which','about','around','more','than','they','will','your','been','also','other','using','use','not','are','was','how','who','why','all','any','can','our','out','new','has','its','a','an','of','in','on','to','at','by','is','it','as','or','be','we','i']);

function terms(text) {
  return [...new Set(
    String(text || '')
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter(w => w.length > 3 && !STOPWORDS.has(w))
  )];
}

/**
 * Finds already-existing reports that may already answer a request, so the same
 * report is not produced twice. Pure keyword overlap against the report's own
 * slide content — no model call, so it can run while the user is still chatting.
 *
 * Returns [{ report, score, overlap }] sorted best-first (score 0-100).
 */
export async function findSimilarReports({ category, region, objective, audience } = {}) {
  const queryTerms = terms([category, objective, audience].filter(Boolean).join(' '));
  if (queryTerms.length < 2) return [];

  const reports = await base44.entities.Report.list('-created_date', 200);

  const scored = [];
  for (const report of reports) {
    const text = reportSearchText(report);
    const overlap = queryTerms.filter(t => text.includes(t));
    if (!overlap.length) continue;

    let score = (overlap.length / queryTerms.length) * 100;

    // A matching category or region makes a report far more likely to be the
    // same job; a mismatching one is not disqualifying, just weaker.
    const cat = String(category || '').toLowerCase();
    if (cat && report.category && (cat.includes(report.category.toLowerCase()) || text.includes(report.category.toLowerCase()))) score += 12;
    const reg = String(region || '').toLowerCase();
    if (reg && report.region && reg.includes(report.region.toLowerCase())) score += 8;

    scored.push({ report, score: Math.min(100, Math.round(score)), overlap });
  }

  return scored
    .filter(s => s.score >= 40)
    .sort((a, b) => b.score - a.score)
    .slice(0, 4);
}