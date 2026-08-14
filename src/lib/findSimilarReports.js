import { base44 } from '@/api/base44Client';

const CANONICAL_CATEGORIES = [
  'bakery', 'condiments', 'chocolate_confectionery', 'dairy', 'ice_cream',
  'meat', 'oils_fats', 'plant_based', 'rutf_rusf',
];

const REGION_CODES = ['ASPAC', 'AMERICAS', 'EMEC', 'IMEA', 'Global'];

// Pulls canonical category keys out of whatever the caller passes (a key,
// a joined list of keys, or free text mentioning a category).
function resolveCategories(raw) {
  const text = String(raw || '').toLowerCase();
  return CANONICAL_CATEGORIES.filter(c => text.includes(c));
}

function resolveRegion(raw) {
  const upper = String(raw || '').toUpperCase();
  return REGION_CODES.find(r => upper.includes(r)) || null;
}

/**
 * Finds already-existing reports that genuinely cover a new request, so the
 * same report is not produced twice.
 *
 * Two stages:
 * 1. Hard category filter (+ soft region filter) — a report in a different
 *    canonical category is never a candidate.
 * 2. LLM judgment — the surviving candidates are assessed against the
 *    request's objective; only reports the model judges to actually cover
 *    the need are returned, each with a short reason.
 *
 * Returns [{ report, reason }] best-first. Empty array when nothing truly covers it.
 */
export async function findSimilarReports({ category, region, objective, audience } = {}) {
  const categories = resolveCategories(category);
  const need = [objective, audience].filter(Boolean).join(' — ').trim();
  // Without a resolved category and a stated objective we cannot judge
  // relevance reliably — show nothing rather than noise.
  if (categories.length === 0 || need.length < 15) return [];

  const regionCode = resolveRegion(region);

  const reports = await base44.entities.Report.list('-created_date', 200);

  // Stage 1: hard category filter, soft region filter.
  const candidates = reports
    .filter(r => categories.includes(String(r.category || '').toLowerCase()))
    .filter(r => {
      if (!regionCode || regionCode === 'Global') return true;
      const rr = String(r.region || '').toUpperCase();
      return !rr || rr === 'GLOBAL' || rr === regionCode;
    })
    .slice(0, 10);

  if (candidates.length === 0) return [];

  // Stage 2: LLM relevance judgment on the shortlist.
  const candidateBlocks = candidates.map((r, i) => {
    const summary = (r.executive_summary || '').slice(0, 400);
    const trends = (r.selected_trends || []).slice(0, 6).join('; ');
    return `[${i}] Title: ${r.title}\nCategory: ${r.category} | Region: ${r.region || 'unknown'}\n${trends ? `Trends covered: ${trends}\n` : ''}${summary ? `Summary: ${summary}` : ''}`;
  }).join('\n\n');

  const result = await base44.integrations.Core.InvokeLLM({
    prompt: `You are checking whether any EXISTING market-intelligence reports already cover a NEW report request, to avoid producing duplicate work.

NEW REQUEST:
Categories: ${categories.join(', ')}
Region: ${regionCode || 'unspecified'}
Need: ${need}

EXISTING REPORTS:
${candidateBlocks}

For each existing report, decide whether it GENUINELY covers the substance of the new request — same topic and angle, not merely the same food category. Be strict: a report only counts as covering the request if a person could reuse it instead of commissioning the new one. Sharing a category or a few generic trend words is NOT enough.

Return only reports that truly cover the request (often none do — an empty list is a good answer). For each, give a one-sentence reason in plain English.`,
    response_json_schema: {
      type: 'object',
      properties: {
        covering_reports: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              index: { type: 'number' },
              reason: { type: 'string' },
            },
          },
        },
      },
    },
  });

  const picks = Array.isArray(result?.covering_reports) ? result.covering_reports : [];
  return picks
    .filter(p => Number.isInteger(p.index) && candidates[p.index])
    .map(p => ({ report: candidates[p.index], reason: p.reason || '' }));
}