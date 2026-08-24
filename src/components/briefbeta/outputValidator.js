// Write-time validator for every LLM-generated string in a beta deck.
//
// DUPLICATED BY DESIGN — the banned-pattern intent is mirrored in the architect
// prompt (src/components/briefbeta/architectPrompt.js). The prompt asks; this
// validator enforces. A change to one must be reflected in the other.
//
// Pure functions only. No I/O.

import { BUDGETS } from './contentBudgets';
import { resolveBinding } from './citationKey';

// Normalizes a publisher/title string for allow-list comparison: lowercase,
// strip everything but letters, digits and single spaces.
function normalizeCite(s) {
  return String(s || '')
    .toLowerCase()
    .replace(/[^a-z0-9 ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// Builds the citation allow-list from a getArchitectEvidence result: the titles
// and publishers of every source, inline citation and web signal that actually
// reached this brief. A supporting_data citation that matches none of these is
// not traceable to the retrieved evidence.
//
// available=false means "no evidence in scope" — the caller must then SKIP the
// citation-traceability check, never reject every citation on an empty list.
export function buildCitationAllowList(evidence) {
  const titles = new Set();
  const publishers = new Set();
  const add = (t, p) => {
    const nt = normalizeCite(t); if (nt.length >= 4) titles.add(nt);
    const np = normalizeCite(p); if (np.length >= 2) publishers.add(np);
  };
  for (const tr of (evidence?.trends || [])) {
    for (const s of (tr.sources || [])) add(s.title, s.publisher);
    for (const c of (tr.inline_citations || [])) add(c.title, c.publisher);
  }
  for (const w of (evidence?.web_signals || [])) add(w.title, w.publisher);
  return {
    titles: [...titles],
    publishers: [...publishers],
    available: (titles.size + publishers.size) > 0,
  };
}

// Build A — the frozen citation map used as the allow-list. Keyed by resolvable
// id, so a citation either resolves to real evidence or it does not exist. This
// replaces the title/publisher list for every ID-locked deck; buildCitationAllowList
// above stays in use for legacy decks whose citations are strings.
export function allowListFromBindings(bindings) {
  const b = bindings && typeof bindings === 'object' ? bindings : {};
  return { bindings: b, titles: [], publishers: [], available: Object.keys(b).length > 0 };
}

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
// Build C — the render-owned provenance line is the SYSTEM's own honesty label, so
// the adjacency rules must not fire on it. Exempted by field, not by content, so a
// later re-wording of the label cannot silently start tripping the validator.
const ADJ_EXEMPT_FIELD = /provenance_label$/;

export function validateText(text, field = 'text') {
  const s = String(text || '');
  if (!s.trim()) return { ok: true, flags: [] };

  const adjacency = ADJ_EXEMPT_FIELD.test(String(field)) ? [] : ADJACENCY_RULES;
  for (const r of [...FIGURE_RULES, ...adjacency, ...PRESCRIPTION_RULES]) {
    if (has(s, r.re)) return { ok: false, rule: r.id, why: r.why, field, text: s.slice(0, 300), flags: [] };
  }
  return { ok: true, flags: plausibilityFlags(s) };
}

// Validates one supporting_data citation against the publisher rules and, when an
// allow-list is supplied, against the retrieved evidence.
export function validateCitation(citation, briefCategory, allowList = null) {
  const stat = String(citation?.stat || '');
  const rawId = String(citation?.source_id || '').trim();
  const bindings = allowList?.bindings || null;

  // ID-locked citation (Build A). The id must resolve in the frozen snapshot the
  // deck was built from — otherwise the renderer would drop it and the reader
  // would silently lose the support for a claim. Rejected, and logged.
  let resolved = '';
  if (rawId && bindings) {
    const hit = resolveBinding(rawId, bindings);
    if (!hit) {
      return {
        ok: false, rule: 'CITE-1',
        why: `source_id "${rawId}" resolves to nothing in the evidence this deck was built from — the citation cannot be rendered and may be fabricated`,
        text: rawId, flags: [],
      };
    }
    resolved = String(hit.canonical_string || '');
  }

  // The publisher / category rules run on the resolved string for an ID-locked
  // citation, and on the stored string for a legacy one.
  const s = rawId ? (resolved || String(citation?.source || '')) : String(citation?.source || '');
  if (!s.trim()) return { ok: true, flags: [] };

  // PUB-1 — competitor / ingredient-supplier content, rejected outright.
  const hit = SUPPRESSED_PUBLISHERS.find(p => new RegExp(`\\b${p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i').test(s));
  if (hit) return { ok: false, rule: 'PUB-1', why: `${hit} is competitor / ingredient-supplier content — never customer-facing evidence`, text: s, flags: [] };

  // PUB-3 — a citation about another category cannot support this claim.
  const otherCats = OTHER_CATEGORY_TERMS[briefCategory] || [];
  const catHit = otherCats.find(t => new RegExp(t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i').test(s));
  if (catHit) return { ok: false, rule: 'PUB-3', why: `citation is about ${catHit}, not ${briefCategory} — cannot support this claim`, text: s, flags: [] };

  // CITE-1 — the citation must trace to a source that actually reached this brief.
  // A fabricated citation names a real-sounding publisher or title that is not in
  // the retrieved evidence. This is the failure PUB-3 only catches when the
  // fabrication is off-category; CITE-1 catches the on-category case too.
  // GNPD product evidence is the base layer and is always allowed.
  const norm = normalizeCite(s);
  const isGnpd = /\b(mintel )?gnpd\b/.test(norm);
  let citeFlag = null;
  // Legacy string path only — an ID-locked citation was already resolved above,
  // and its resolved string is evidence by construction.
  if (!rawId && allowList && allowList.available && (allowList.titles || []).length > 0 && !isGnpd) {
    const titleHit = allowList.titles.some(t => t && (norm.includes(t) || t.includes(norm)));
    const pubHit = allowList.publishers.some(p => p && new RegExp(`\\b${p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`).test(norm));
    if (!titleHit && !pubHit) {
      return { ok: false, rule: 'CITE-1', why: `citation traces to no source in the retrieved evidence for this brief — it cannot be verified and may be fabricated`, text: s, flags: [] };
    }
    if (!titleHit && pubHit) {
      citeFlag = { rule: 'CITE-2', why: `publisher appears in the evidence pool but this exact title does not — confirm the citation is real, not reconstructed`, text: s };
    }
  }

  // Non-blocking flags: CITE-2 (above), vendor scope label (PUB-2), geography
  // label (PUB-4), and cohort plausibility (NUM-1).
  const flags = [];
  if (citeFlag) flags.push(citeFlag);
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

// TIER-1 — containment at the save wall (Build C).
//
// Every GNPD id a slide cites must belong to the slide's own evidence class: a
// regional slide may not carry a cross-region record, and a cross-region slide may
// not carry a regional one. Decided from the FROZEN bindings, so it cannot be
// talked around in prose. Source / inline / web citations are class-neutral (a
// trend's sources back both tiers) and are not checked here.
function tierRejections(slides, bindings) {
  const map = bindings && typeof bindings === 'object' ? bindings : null;
  if (!map || Object.keys(map).length === 0) return [];
  const rejections = [];

  (slides || []).forEach((slide, i) => {
    if (slide.slide_type === 'section_header' || slide.slide_type === 'methodology') return;
    const where = `slide ${slide.slide_number ?? i + 1}`;
    const slideClass = String(slide.evidence_class || 'regional') === 'read_across' ? 'read_across' : 'regional';

    const cited = [];
    (slide.gnpd_examples || []).forEach((ex, j) => {
      const m = String(ex || '').match(/^\s*([A-Za-z0-9._-]{4,})\s*\|/);
      if (m) cited.push({ id: m[1], field: `${where}.gnpd_examples[${j}]`, text: String(ex).slice(0, 300) });
    });
    (slide.supporting_data || []).forEach((d, j) => {
      const raw = String(d?.source_id || '').trim();
      if (raw) cited.push({ id: raw, field: `${where}.supporting_data[${j}].source`, text: raw });
    });

    for (const c of cited) {
      const hit = resolveBinding(c.id, map);
      if (!hit || hit.kind !== 'gnpd') continue;
      const recordClass = hit.read_across === true ? 'read_across' : 'regional';
      if (recordClass === slideClass) continue;
      rejections.push({
        rule: 'TIER-1', field: c.field,
        why: recordClass === 'read_across'
          ? `this slide is declared "${slideClass}" but cites cross-region record ${c.id} (${hit.original_country || 'another market'}) — regional and cross-region evidence may never share a slide`
          : `this slide is declared "read_across" but cites regional record ${c.id} — a cross-region slide may carry no in-region examples`,
        text: c.text,
      });
    }
  });

  return rejections;
}

const TEXT_FIELDS = ['title', 'subtitle', 'market_signal', 'why_it_may_matter'];
const ARRAY_FIELDS = ['formulation_questions', 'conversation_openers', 'gnpd_examples'];

// Validates a whole deck. Returns { ok, rejections[], flags[] }.
export function validateSlides(slides, briefCategory, reportTitle = null, allowList = null) {
  const rejections = [
    ...budgetRejections(slides, reportTitle),
    ...tierRejections(slides, allowList?.bindings || null),
  ];
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
      const r = validateCitation(c, briefCategory, allowList);
      if (!r.ok) rejections.push({ ...r, field: `${where}.supporting_data[${j}].source` });
      else flags.push(...r.flags.map(x => ({ ...x, field: `${where}.supporting_data[${j}].source` })));
    });
  });

  return { ok: rejections.length === 0, rejections, flags };
}