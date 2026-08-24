// Build-time self-validation loop — Build D: SURGICAL.
//
// The deck is validated the moment the architect emits it, not at save. If it
// breaks a rule, only the OFFENDING STRINGS are sent back for a minimal
// correction (never the whole deck), and the corrected deck is re-validated —
// up to MAX_BUILD_ATTEMPTS validations total (1 first pass + 2 surgical rewrites).
//
// Why surgical: the old loop re-rolled the entire deck, which reintroduced fresh
// overruns and fresh fabrications on slides that were already clean, so the rewrite
// budget was burned without converging and the analyst was hard-blocked over a
// three-character title. Budgets are still never relaxed to make a deck pass.
import { validateSlides, buildCitationAllowList, allowListFromBindings } from './outputValidator';
import { resolveCitation } from './citationMap';
import { buildSurgicalPayload, applyCorrections, splitVerdict } from './surgicalRewrite';
import { pruneCitations } from './pruneCitations';

export const MAX_BUILD_ATTEMPTS = 3;      // 1 first pass + 2 surgical rewrites
export const MAX_SURGICAL_REWRITES = MAX_BUILD_ATTEMPTS - 1;

const PHASES = ['first_pass', 'after_rewrite_1', 'after_rewrite_2'];

function logEntries(rejections, phase) {
  const timestamp = new Date().toISOString();
  return rejections.map(r => ({
    rule: r.rule, field: r.field, why: r.why, text: r.text, phase, timestamp,
  }));
}

// Phase 2 — measure what the READER gets. The architect emits source_id and no
// source string, so counting the emitted deck undercounts every slide's body by
// the length of its resolved citations, and a slide within ~70 chars of the
// ceiling passed the build loop only to be caught at the save wall.
//
// An UNRESOLVABLE id keeps its original entry here rather than being dropped:
// dropping it would count zero characters AND hide the CITE-1 the drop implies.
// Resolution at this point is for counting only — the authoritative, persisted
// resolution still happens at save (A's rule).
function resolvedForCounting(slides, bindings) {
  if (!bindings) return slides;
  return (slides || []).map(s => (Array.isArray(s.supporting_data)
    ? { ...s, supporting_data: s.supporting_data.map(e => resolveCitation(e, bindings) || e) }
    : s));
}

// rewrite(surgicalPayload) → [{ slide_number, field, corrected }] | null
// onAttempt(attempt, total) → progress indicator hook
export async function runBuildWithValidation({
  slides, evidence, bindings, category, title, rewrite, onAttempt,
}) {
  // The frozen binding map IS the allow-list: keyed by resolvable id, strictly
  // stronger than the legacy title/publisher list (which stays for legacy decks).
  const allowList = bindings ? allowListFromBindings(bindings) : buildCitationAllowList(evidence);
  // Citations that do not belong on their slide are DROPPED here, before any
  // validation runs — a single bad reference must never hard-block the build.
  const firstPrune = pruneCitations(slides, bindings);
  let deck = firstPrune.slides;
  const droppedCitations = [...firstPrune.dropped];
  let currentTitle = title;
  let contractPatch = null;
  let rewriteAttempts = 0;

  const validate = () => validateSlides(resolvedForCounting(deck, bindings), category, currentTitle, allowList);

  let verdict = validate();
  const log = logEntries(verdict.rejections, PHASES[0]);

  while (!verdict.ok && rewriteAttempts < MAX_SURGICAL_REWRITES) {
    // 4.3 — a rewrite can only shorten strings. If nothing rewritable is left
    // (integrity violations, or a whole-slide LEN-3 body total), the loop stops
    // immediately instead of spending an attempt that cannot change anything.
    const payload = buildSurgicalPayload(verdict.rejections, deck, currentTitle);
    if (payload.length === 0) break;

    rewriteAttempts++;
    onAttempt?.(rewriteAttempts + 1, MAX_BUILD_ATTEMPTS);
    const corrections = await rewrite(payload);
    // No response, or nothing usable: the deck stands as-is with its violations.
    if (!corrections || corrections.length === 0) break;

    const applied = applyCorrections(deck, currentTitle, corrections);
    const pruned = pruneCitations(applied.slides, bindings);
    deck = pruned.slides;
    droppedCitations.push(...pruned.dropped);
    if (applied.title !== currentTitle) {
      currentTitle = applied.title;
      contractPatch = { ...(contractPatch || {}), report_title: currentTitle };
    }
    // 3.4 — the FULL validator runs again, not just the corrected fields: a
    // shortened string can introduce a brand-new violation.
    verdict = validate();
    log.push(...logEntries(verdict.rejections, PHASES[rewriteAttempts]));
  }

  const split = splitVerdict(verdict.rejections);

  return {
    slides: deck,
    title: currentTitle,
    contractPatch,
    ok: verdict.ok,
    // Build D two-layer state: 'passed' | 'warnings_only' | 'blocked'
    verdict: split.verdict,
    rejections: verdict.rejections,
    len_warnings: split.len_warnings,
    integrity_rejections: split.integrity_rejections,
    flags: verdict.flags || [],
    dropped_citations: droppedCitations,
    rewrite_attempts: rewriteAttempts,
    attempts: rewriteAttempts + 1,
    log,
  };
}