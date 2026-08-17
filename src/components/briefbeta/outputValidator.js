// Write-time validator for every LLM-generated string in a beta deck.
//
// DUPLICATED BY DESIGN — the banned-pattern intent is mirrored in the architect
// prompt (src/components/briefbeta/architectPrompt.js). The prompt asks; this
// validator enforces. A change to one must be reflected in the other.
//
// Pure functions only. No I/O.

import { BUDGETS } from './contentBudgets';

const FIGURE_RULES = [
  { id: 'FIG-1', re: /(USD|EUR|GBP|€|\$|£)\s?[\d.,]+\s?(m|bn|k|million|billion|trillion)\b/i, why: 'currency plus magnitude (market sizing)' },
  { id: 'FIG-2', re: /\bCAGR\b/i, why: 'CAGR figure' },
  { id: 'FIG-3', re: /market (is )?valued at|market size|market worth|projected to reach|market to surpass/i, why: 'market sizing language' },
];

const ADJACENCY_RULES = [
  { id: 'ADJ-1', re: /-adjacent proposition|EMEC-adjacent|adjacent to the region|regionally adjacent|read-across from/i, why: 'region-adjacency claim' },
  { id: 'ADJ-2', re: /\b(evidences?|demonstrates?|signals?|proves?)\b[^.]{0,60}\bfor (the )?(EMEC|European|Europe|regional)\b/i, why: 'asserts a record evidences a region it is not in' },
];

const PRESCRIPTION_RULES = [
  { id: 'PRE-1', re: /\byou should\b|\bmanufacturers should\b|\bbrands should\b|\bmust launch\b|\bwe recommend\b/i, why: 'prescriptive instruction' },
  { id: 'PRE-2', re: /will define the next generation|best positioned to capture|act first will/i, why: 'prescriptive / promotional framing' },
];

// Competitor and ingredient-supplier content — rejected outright.
// Extends the Market Scout exclusion list with bakery ingredient and improver suppliers.
export const SUPPRESSED_PUBLISHERS = [
  'IFF', 'Kerry', 'dsm-firmenich', 'DSM', 'Firmenich', 'Corbion', 'Cargill', 'ADM',
  'Ingredion', 'Puratos', 'Délifrance', 'Delifrance', 'Lesaffre', 'Zeelandia',
  'CSM', 'Bakels', 'AB Mauri', 'Glanbia',
];

// Consultancy and market-report vendors — permitted only with an inline scope label,
// and never as the sole support for a quantified claim.
export const LABEL_REQUIRED_PUBLISHERS = [
  'GreyB', 'Future Market Insights', 'Grand View', 'MarketsandMarkets', 'Mordor',
  'AMF', 'Technavio', 'Research and Markets', 'Fact.MR',
];

const OTHER_CATEGORY_TERMS = {
  bakery: ['ice cream', 'confectionery', 'chocolate', 'dairy', 'meat', 'mayonnaise', 'margarine'],
  ice_cream: ['bakery', 'bread', 'biscuit', 'meat'],
  dairy: ['ice cream', 'bakery', 'meat'],
};

const NON_REGIONAL_GEO = /\bFDA\b|\bUS(A)? \w+ market\b|\bUS Bread\b|\bU\.S\.\b|\bAmerican\b|\bglobal\b/i;
const SCOPE_LABEL = /\(Note: source data is [^)]+\)/i;

function has(text, re) { return re.test(String(text || '')); }

// Rule 5.5 — implausible absolute cohort figures are flagged, never auto-rejected.
function plausibilityFlags(text) {
  const flags = [];
  const s = String(text || '');
  if (!/users|consumers|population|cohort|segment|shoppers/i.test(s)) return flags;
  for (const m of s.matchAll(/\b(\d{1,3}(?:[,.]\d{3})+|\d{4,6})\b/g)) {
    const n = Number(String(m[1]).replace(/[.,]/g, ''));
    if (n > 0 && n < 1_000_000) {
      flags.push({ rule: 'NUM-1', why: `absolute cohort figure ${m[1]} is below 1,000,000 — verify before use`, text: s.slice(0, 200) });
      break;
    }
  }
  return flags;
}

// Validates a single free-text field. Returns { ok, rule, why, flags }.
export function validateText(text, field = 'text') {
  const s = String(text || '');
  if (!s.trim()) return { ok: true, flags: [] };

  for (const r of [...FIGURE_RULES, ...ADJACENCY_RULES, ...PRESCRIPTION_RULES]) {
    if (has(s, r.re)) return { ok: false, rule: r.id, why: r.why, field, text: s.slice(0, 300), flags: [] };
  }
  return { ok: true, flags: plausibilityFlags(s) };
}

// Validates one supporting_data citation string against the publisher rules.
export function validateCitation(citation, briefCategory) {
  const s = String(citation?.source || '');
  const stat = String(citation?.stat || '');
  if (!s.trim()) return { ok: true, flags: [] };

  const hit = SUPPRESSED_PUBLISHERS.find(p => new RegExp(`\\b${p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i').test(s));
  if (hit) return { ok: false, rule: 'PUB-1', why: `${hit} is competitor / ingredient-supplier content — never customer-facing evidence`, text: s, flags: [] };

  const otherCats = OTHER_CATEGORY_TERMS[briefCategory] || [];
  const catHit = otherCats.find(t => new RegExp(t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i').test(s));
  if (catHit) return { ok: false, rule: 'PUB-3', why: `citation is about ${catHit}, not ${briefCategory} — cannot support this claim`, text: s, flags: [] };

  const flags = [];
  const vendor = LABEL_REQUIRED_PUBLISHERS.find(p => new RegExp(p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i').test(s));
  if (vendor && !SCOPE_LABEL.test(stat)) {
    flags.push({ rule: 'PUB-2', why: `${vendor} is a consultancy / market-report vendor — needs an inline scope label and a second source`, text: s });
  }
  if (NON_REGIONAL_GEO.test(s) && !SCOPE_LABEL.test(stat)) {
    flags.push({ rule: 'PUB-4', why: 'source geography differs from the brief region — needs "(Note: source data is …)" inline flag', text: s });
  }
  return { ok: true, flags: [...flags, ...plausibilityFlags(stat)] };
}

// Phase 6 — the publisher and scope rules also apply to PROSE, not just to the
// supporting_data citation list. A competitor named inside market_signal is as
// customer-facing as one named in a citation, and an unlabelled US figure in
// prose misrepresents the region just as badly.
export function validateNarrative(text, field, briefCategory) {
  const s = String(text || '');
  if (!s.trim()) return { ok: true, flags: [] };

  const hit = SUPPRESSED_PUBLISHERS.find(p => new RegExp(`\\b${p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i').test(s));
  if (hit) return { ok: false, rule: 'PUB-1', why: `${hit} is competitor / ingredient-supplier content — never named as evidence in report prose`, field, text: s.slice(0, 300), flags: [] };

  const flags = [];
  const vendor = LABEL_REQUIRED_PUBLISHERS.find(p => new RegExp(p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i').test(s));
  if (vendor && !SCOPE_LABEL.test(s)) {
    flags.push({ rule: 'PUB-2', field, why: `${vendor} is cited in prose without an inline scope label`, text: s.slice(0, 200) });
  }
  if (NON_REGIONAL_GEO.test(s) && !SCOPE_LABEL.test(s)) {
    flags.push({ rule: 'PUB-4', field, why: 'prose carries a geography outside the brief region without a "(Note: source data is …)" label', text: s.slice(0, 200) });
  }
  // Cross-category mentions are legitimate context, so PUB-3 only flags prose —
  // it rejects only in the citation layer, where the claim's support is at stake.
  const catHit = (OTHER_CATEGORY_TERMS[briefCategory] || []).find(t => new RegExp(t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i').test(s));
  if (catHit) {
    flags.push({ rule: 'PUB-3', field, why: `prose leans on ${catHit}, outside the ${briefCategory} brief — confirm it is framed as read-across, not as ${briefCategory} evidence`, text: s.slice(0, 200) });
  }
  return { ok: true, flags };
}

// LEN-* rules — calibrated character budgets from contentBudgets.js.
// Overflow is a build failure, not a formatting choice: the template never
// autofits, so an over-budget string renders clipped or collides.
function len(s) { return String(s || '').trim().length; }

function budgetRejections(slides, reportTitle) {
  const rejections = [];

  if (reportTitle != null && len(reportTitle) > BUDGETS.FRONT_PAGE_TITLE) {
    rejections.push({
      rule: 'LEN-1', field: 'report.title',
      why: `front page title must be ≤ ${BUDGETS.FRONT_PAGE_TITLE} characters (currently ${len(reportTitle)}) — the placeholder holds exactly 2 lines at 36pt and never autofits`,
      text: String(reportTitle).slice(0, 300),
    });
  }

  (slides || []).forEach((slide, i) => {
    const where = `slide ${slide.slide_number ?? i + 1}`;
    const isSection = slide.slide_type === 'section_header';

    const titleBudget = isSection ? BUDGETS.BREAKING_HEADLINE : BUDGETS.CONTENT_TITLE;
    if (len(slide.title) > titleBudget) {
      rejections.push({
        rule: 'LEN-2', field: `${where}.title`,
        why: `${isSection ? 'section divider headline' : 'slide title'} must be ≤ ${titleBudget} characters on a single line (currently ${len(slide.title)})`,
        text: String(slide.title).slice(0, 300),
      });
    }

    const subBudget = isSection ? BUDGETS.BREAKING_SUBLINE : BUDGETS.PRE_HEADER;
    if (len(slide.subtitle) > subBudget) {
      rejections.push({
        rule: 'LEN-4', field: `${where}.subtitle`,
        why: `${isSection ? 'section divider subtitle' : 'slide subtitle (pre-header)'} must be ≤ ${subBudget} characters on one line (currently ${len(slide.subtitle)})`,
        text: String(slide.subtitle).slice(0, 300),
      });
    }

    if (isSection) return;

    // Body budget depends on layout: slides carrying packshots use the
    // narrower text column beside the image slots.
    const bodyParts = [
      slide.market_signal, slide.why_it_may_matter,
      ...(slide.formulation_questions || []),
      ...(slide.conversation_openers || []),
      ...(slide.gnpd_examples || []),
      ...((slide.supporting_data || []).map(d => `${d.stat || ''} ${d.source || ''}`)),
      ...((slide.customer_pains || []).map(p => p.pain || p)),
    ];
    const total = bodyParts.reduce((n, t) => n + len(t), 0);
    const bodyBudget = (slide.gnpd_examples || []).length > 0 ? BUDGETS.BODY_BESIDE_IMAGES : BUDGETS.BODY_FULL;
    if (total > bodyBudget) {
      rejections.push({
        rule: 'LEN-3', field: `${where}.body`,
        why: `total body content must be ≤ ${bodyBudget} characters for this layout (currently ${total}) — shorten the content or split the trend across two slides`,
        text: `(${total} chars across ${bodyParts.length} body elements)`,
      });
    }
  });

  return rejections;
}

const TEXT_FIELDS = ['title', 'subtitle', 'market_signal', 'why_it_may_matter'];
const ARRAY_FIELDS = ['formulation_questions', 'conversation_openers', 'gnpd_examples'];

// Validates a whole deck. Returns { ok, rejections[], flags[] }.
export function validateSlides(slides, briefCategory, reportTitle = null) {
  const rejections = [...budgetRejections(slides, reportTitle)];
  const flags = [];

  (slides || []).forEach((slide, i) => {
    const where = `slide ${slide.slide_number ?? i + 1}`;
    const checkProse = (value, path) => {
      const r = validateText(value, path);
      if (!r.ok) { rejections.push(r); return; }
      flags.push(...r.flags.map(x => ({ ...x, field: path })));
      const n = validateNarrative(value, path, briefCategory);
      if (!n.ok) rejections.push(n); else flags.push(...n.flags);
    };
    for (const f of TEXT_FIELDS) checkProse(slide[f], `${where}.${f}`);
    for (const f of ARRAY_FIELDS) {
      (slide[f] || []).forEach((v, j) => checkProse(v, `${where}.${f}[${j}]`));
    }
    (slide.supporting_data || []).forEach((c, j) => {
      const t = validateText(c.stat, `${where}.supporting_data[${j}].stat`);
      if (!t.ok) { rejections.push(t); return; }
      flags.push(...t.flags.map(x => ({ ...x, field: `${where}.supporting_data[${j}].stat` })));
      const r = validateCitation(c, briefCategory);
      if (!r.ok) rejections.push({ ...r, field: `${where}.supporting_data[${j}].source` });
      else flags.push(...r.flags.map(x => ({ ...x, field: `${where}.supporting_data[${j}].source` })));
    });
  });

  return { ok: rejections.length === 0, rejections, flags };
}