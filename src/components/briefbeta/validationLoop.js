// Build-time self-validation loop.
//
// The deck is validated the moment the architect emits it — not at save. If it
// breaks a rule, the architect is asked to rewrite and the deck is re-validated,
// up to MAX_BUILD_ATTEMPTS total (1 original + 2 rewrites). The analyst only
// ever sees a deck that either passed, or that carries an explicit warning of
// what is still wrong. Budgets are never relaxed to make a deck pass.
import { validateSlides, buildCitationAllowList } from './outputValidator';

export const MAX_BUILD_ATTEMPTS = 3;

function logEntries(rejections, attempt) {
  const timestamp = new Date().toISOString();
  return rejections.map(r => ({
    rule: r.rule, field: r.field, why: r.why, text: r.text,
    phase: `attempt_${attempt}`, timestamp,
  }));
}

// rewrite(rejections) → { slides, contract } | null
// onAttempt(attempt, total) → progress indicator hook
export async function runBuildWithValidation({
  slides, evidence, category, title, rewrite, onAttempt,
}) {
  const allowList = buildCitationAllowList(evidence);
  let deck = slides;
  let currentTitle = title;
  let contractPatch = null;
  let attempt = 1;

  let verdict = validateSlides(deck, category, currentTitle, allowList);
  const log = logEntries(verdict.rejections, attempt);

  while (!verdict.ok && attempt < MAX_BUILD_ATTEMPTS) {
    attempt++;
    onAttempt?.(attempt, MAX_BUILD_ATTEMPTS);
    const rewritten = await rewrite(verdict.rejections);
    if (!rewritten) break;
    if (rewritten.slides) deck = rewritten.slides;
    if (rewritten.contract?.report_title) {
      currentTitle = String(rewritten.contract.report_title).slice(0, 120);
      contractPatch = rewritten.contract;
    }
    verdict = validateSlides(deck, category, currentTitle, allowList);
    log.push(...logEntries(verdict.rejections, attempt));
  }

  return {
    slides: deck,
    title: currentTitle,
    contractPatch,
    ok: verdict.ok,
    rejections: verdict.rejections,
    flags: verdict.flags || [],
    attempts: attempt,
    log,
  };
}