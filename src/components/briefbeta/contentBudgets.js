// Calibrated content budgets — measured against Palsgaard_PP_Template.potx
// (Carlito/Calibri glyph metrics, verified by LibreOffice render), 2026-08.
// These are the 'safe' (worst-case) values; the skill's SKILL.md Content Budgets
// section and this file must stay identical — the calibrated numbers are the
// single source of truth for both.
//
// Key template facts the budgets encode:
// - Front page title (L1 idx0) carries <a:noAutofit/> — text NEVER shrinks.
//   6.18" × 1.67" at 36pt = exactly 2 lines; a 3rd line buries the byline.
// - Content titles (L17/L18 idx0, 0.79" tall) hold ONE line at 24pt, not two.
// - Every run must set its font size explicitly — template defaults differ
//   (front page 52pt, breaking 54pt) and would halve these budgets.

export const BUDGETS = {
  FRONT_PAGE_TITLE: 47,      // L1 idx0, 36pt bold, 2 lines max
  FRONT_PAGE_SUBTITLE: 96,   // L1 idx1, 11pt, 1 line
  CONTENT_TITLE: 75,         // L17/L18 idx0, 24pt, SINGLE line
  PRE_HEADER: 172,           // idx16/idx29, 11pt, 1 line
  BODY_FULL: 3019,           // L17 idx18, 12pt, 23 lines
  BODY_BESIDE_IMAGES: 2629,  // text column W=8.60" beside packshot column
  BREAKING_HEADLINE: 38,     // L54 idx29, 32pt bold, 1 line
  BREAKING_SUBLINE: 50,      // L54 idx30, 18pt, 1 line
  // Strategic-implications slide: the title placeholder is repositioned by the
  // renderer to 1.45" and set at 26pt, so it holds exactly 2 lines.
  IMPLICATIONS_TITLE: 110,
  IMPLICATION_LINE: 130,     // one arrow / tick line, 11pt, single line in the box
};