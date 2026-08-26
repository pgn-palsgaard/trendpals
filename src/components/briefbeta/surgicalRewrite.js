// Build D — the surgical rewrite payload, and the two-layer verdict split.
//
// SURGICAL MEANS SURGICAL. The payload carries ONLY the flagged strings, their
// rule and the budget they must fit. No clean slides, no other fields, no
// evidence context. A full-deck re-roll (what this replaces) reintroduced new
// overruns and new fabrications on slides that were already clean, so the single
// rewrite kept failing and the analyst hit a wall over a 3-character title.
//
// THE TWO-LAYER PRINCIPLE lives here and is absolute:
//   LEN-*        → cosmetic, reversible. Advisory. Save-anyway permitted.
//   everything   → integrity (fabricated citation, competitor source, off-category
//   else           citation, cross-trend, tier mismatch, banned framing). Hard wall
//                  at save AND export. No override, ever.
// If a rule's class is ever in doubt, it is integrity.
import { BUDGETS } from './contentBudgets';

export const isLenRule = (rule) => /^LEN-/.test(String(rule || ''));

// Partitions the surviving violations and names the resulting state.
export function splitVerdict(rejections) {
  const len_warnings = [];
  const integrity_rejections = [];
  for (const r of rejections || []) (isLenRule(r.rule) ? len_warnings : integrity_rejections).push(r);
  return {
    len_warnings,
    integrity_rejections,
    verdict: integrity_rejections.length > 0 ? 'blocked' : (len_warnings.length > 0 ? 'warnings_only' : 'passed'),
  };
}

// Single strings a shortening pass may safely replace.
// Restricted deliberately: a correction must never be able to write an arbitrary
// key onto a slide.
const REWRITABLE_FIELDS = ['title', 'subtitle'];
// One line inside an implications box. Indexed, so ONLY the offending line is
// rewritten — the clean lines beside it keep their exact wording.
const REWRITABLE_LINE_FIELDS = ['strategic_implications', 'palsgaard_support'];

// "slide 3.title" → { slide_number: 3, field: 'title' }
// "slide 4.strategic_implications[0]" → { slide_number: 4, field: '…', index: 0 }
// "report.title" → title
function parseField(field) {
  const s = String(field || '');
  const m = s.match(/^slide (\d+)\.(.+)$/);
  if (m) {
    const idx = m[2].match(/^([a-z_]+)\[(\d+)\]$/);
    if (idx) return { slide_number: Number(m[1]), field: idx[1], index: Number(idx[2]) };
    return { slide_number: Number(m[1]), field: m[2], index: null };
  }
  if (s === 'report.title') return { slide_number: null, field: 'report.title', index: null };
  return null;
}

// The budget the corrected string must fit. Identical to the values the validator
// measures against — read from contentBudgets, never restated here.
// LEN-3 is a WHOLE-SLIDE total across many strings, so it has no single string to
// hand back: it is never surgically rewritten, it becomes an advisory warning.
function budgetFor(rule, slide, index = null) {
  const isSection = slide?.slide_type === 'section_header';
  if (rule === 'LEN-5') return index === null ? null : BUDGETS.IMPLICATION_LINE;
  if (rule === 'LEN-1') return BUDGETS.FRONT_PAGE_TITLE;
  if (rule === 'LEN-2') {
    if (slide?.slide_type === 'implications') return BUDGETS.IMPLICATIONS_TITLE;
    return isSection ? BUDGETS.BREAKING_HEADLINE : BUDGETS.CONTENT_TITLE;
  }
  if (rule === 'LEN-4') return isSection ? BUDGETS.BREAKING_SUBLINE : BUDGETS.PRE_HEADER;
  return null;
}

// [{ slide_number, field, current, rule, budget }] — the entire rewrite request.
export function buildSurgicalPayload(rejections, slides, reportTitle) {
  const out = [];
  for (const r of rejections || []) {
    // Integrity violations are NEVER sent: shortening cannot fix a fabricated
    // citation, and asking would invite the model to invent a replacement.
    if (!isLenRule(r.rule)) continue;
    const parsed = parseField(r.field);
    if (!parsed) continue;

    if (parsed.slide_number === null) {
      if (r.rule !== 'LEN-1') continue;
      out.push({ slide_number: null, field: 'report.title', current: String(reportTitle || ''), rule: r.rule, budget: BUDGETS.FRONT_PAGE_TITLE });
      continue;
    }
    const isLine = parsed.index !== null && REWRITABLE_LINE_FIELDS.includes(parsed.field);
    if (!isLine && !REWRITABLE_FIELDS.includes(parsed.field)) continue;
    const slide = (slides || []).find((s, i) => (s.slide_number ?? i + 1) === parsed.slide_number);
    if (!slide) continue;
    const budget = budgetFor(r.rule, slide, parsed.index);
    if (!budget) continue;
    const current = isLine ? (slide[parsed.field] || [])[parsed.index] : slide[parsed.field];
    if (typeof current !== 'string' || !current.trim()) continue;
    out.push({
      slide_number: parsed.slide_number, field: parsed.field,
      ...(isLine ? { index: parsed.index } : {}),
      current, rule: r.rule, budget,
    });
  }
  return out;
}

// Applies [{ slide_number, field, corrected }] and TOUCHES NOTHING ELSE. Every
// untouched slide comes back as the same object reference, so "did the rewrite
// disturb a clean slide" is answerable by identity, not by trust.
export function applyCorrections(slides, title, corrections) {
  let nextTitle = title;
  let next = slides || [];
  for (const c of corrections || []) {
    const text = String(c?.corrected ?? '').trim();
    if (!text) continue;
    if (c.field === 'report.title' || c.slide_number === null || c.slide_number === undefined) {
      nextTitle = text;
      continue;
    }
    const field = String(c.field);
    const n = Number(c.slide_number);
    const hasIndex = c.index !== null && c.index !== undefined && Number.isInteger(Number(c.index));
    if (hasIndex && REWRITABLE_LINE_FIELDS.includes(field)) {
      const j = Number(c.index);
      next = next.map((s, i) => {
        if ((s.slide_number ?? i + 1) !== n) return s;
        const rows = Array.isArray(s[field]) ? [...s[field]] : [];
        if (j < 0 || j >= rows.length) return s;
        rows[j] = text;
        return { ...s, [field]: rows };
      });
      continue;
    }
    if (!REWRITABLE_FIELDS.includes(field)) continue;
    next = next.map((s, i) => ((s.slide_number ?? i + 1) === n ? { ...s, [c.field]: text } : s));
  }
  return { slides: next, title: nextTitle };
}