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

export const OTHER_CATEGORY_TERMS = {
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

  // PUB-3 — a citation about another category cannot support this claim. This is
  // handled by DROPPING the citation in pruneCitations (before validation), so it
  // never hard-blocks a build. If one still reaches here (legacy deck, or a save
  // of a hand-edited deck), it is a non-blocking flag, not a wall.
  const offCategory = (OTHER_CATEGORY_TERMS[briefCategory] || [])
    .find(t => new RegExp(t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i').test(s));

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
  if (offCategory) {
    flags.push({ rule: 'PUB-3', why: `citation is about ${offCategory}, not ${briefCategory} — treat as read-across context, not ${briefCategory} evidence`, text: s });
  }
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
    const isImplications = slide.slide_type === 'implications';

    // Overview / synthesis table slide — a fixed grid, so the cells are what
    // overflow, not a body budget.
    if (slide.slide_type === 'table') {
      const cols = slide.columns || [];
      if (cols.length > BUDGETS.MAX_TABLE_COLUMNS) {
        rejections.push({
          rule: 'LEN-7', field: `${where}.columns`,
          why: `max ${BUDGETS.MAX_TABLE_COLUMNS} columns (currently ${cols.length}) — the table runs off the slide beyond that`,
          text: cols.join(' | ').slice(0, 300),
        });
      }
      const rows = slide.rows || [];
      if (rows.length > BUDGETS.MAX_TABLE_ROWS) {
        rejections.push({
          rule: 'LEN-7', field: `${where}.rows`,
          why: `max ${BUDGETS.MAX_TABLE_ROWS} rows (currently ${rows.length})`,
          text: `(${rows.length} rows)`,
        });
      }
      rows.forEach((row, r) => {
        (row || []).forEach((cell, c) => {
          if (len(cell) > BUDGETS.TABLE_CELL) {
            rejections.push({
              rule: 'LEN-7', field: `${where}.rows[${r}][${c}]`,
              why: `each table cell must be ≤ ${BUDGETS.TABLE_CELL} characters (currently ${len(cell)})`,
              text: String(cell).slice(0, 300),
            });
          }
        });
      });
      if (len(slide.so_what) > BUDGETS.BULLET_LINE) {
        rejections.push({
          rule: 'LEN-7', field: `${where}.so_what`,
          why: `the "so what" line must be ≤ ${BUDGETS.BULLET_LINE} characters (currently ${len(slide.so_what)})`,
          text: String(slide.so_what).slice(0, 300),
        });
      }
      return;
    }

    // Strategic-imperatives slide — three numbered columns.
    if (slide.slide_type === 'imperatives') {
      const items = slide.items || [];
      if (items.length > BUDGETS.MAX_IMPERATIVES) {
        rejections.push({
          rule: 'LEN-8', field: `${where}.items`,
          why: `max ${BUDGETS.MAX_IMPERATIVES} imperatives (currently ${items.length}) — the three columns are fixed`,
          text: `(${items.length} items)`,
        });
      }
      items.forEach((item, j) => {
        if (len(item?.title) > BUDGETS.IMPERATIVE_TITLE) {
          rejections.push({
            rule: 'LEN-8', field: `${where}.items[${j}].title`,
            why: `imperative heading must be ≤ ${BUDGETS.IMPERATIVE_TITLE} characters (currently ${len(item?.title)})`,
            text: String(item?.title).slice(0, 300),
          });
        }
        if (len(item?.text) > BUDGETS.IMPERATIVE_TEXT) {
          rejections.push({
            rule: 'LEN-8', field: `${where}.items[${j}].text`,
            why: `imperative body must be ≤ ${BUDGETS.IMPERATIVE_TEXT} characters (currently ${len(item?.text)})`,
            text: String(item?.text).slice(0, 300),
          });
        }
      });
      return;
    }

    // Strategic-implications slide: its own budgets. Two boxed lists, no body text.
    if (isImplications) {
      if (len(slide.title) > BUDGETS.IMPLICATIONS_TITLE) {
        rejections.push({
          rule: 'LEN-2', field: `${where}.title`,
          why: `implications title must be ≤ ${BUDGETS.IMPLICATIONS_TITLE} characters (currently ${len(slide.title)}) — it holds exactly 2 lines at 26pt`,
          text: String(slide.title).slice(0, 300),
        });
      }
      if (len(slide.preheader) > BUDGETS.PRE_HEADER) {
        rejections.push({
          rule: 'LEN-4', field: `${where}.preheader`,
          why: `pre-header must be ≤ ${BUDGETS.PRE_HEADER} characters on one line (currently ${len(slide.preheader)})`,
          text: String(slide.preheader).slice(0, 300),
        });
      }
      [['strategic_implications', 4], ['palsgaard_support', 3]].forEach(([field, max]) => {
        const rows = slide[field] || [];
        if (rows.length > max) {
          rejections.push({
            rule: 'LEN-5', field: `${where}.${field}`,
            why: `max ${max} lines in this box (currently ${rows.length}) — the box overflows the slide beyond that`,
            text: `(${rows.length} lines)`,
          });
        }
        rows.forEach((row, j) => {
          if (len(row) > BUDGETS.IMPLICATION_LINE) {
            rejections.push({
              rule: 'LEN-5', field: `${where}.${field}[${j}]`,
              why: `each line must be ≤ ${BUDGETS.IMPLICATION_LINE} characters (currently ${len(row)}) — it renders on a single line`,
              text: String(row).slice(0, 300),
            });
          }
        });
      });
      return;
    }

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

    // LEN-6 — one-line fields rendered on a single line (same metric as an
    // implications line): the hypothesis tie-back and each agenda item.
    if (len(slide.hypothesis_tieback) > BUDGETS.IMPLICATION_LINE) {
      rejections.push({
        rule: 'LEN-6', field: `${where}.hypothesis_tieback`,
        why: `hypothesis tie-back must be ≤ ${BUDGETS.IMPLICATION_LINE} characters on one line (currently ${len(slide.hypothesis_tieback)})`,
        text: String(slide.hypothesis_tieback).slice(0, 300),
      });
    }
    // Simplified trend slide: a short bullet list, each bullet at most 2 lines.
    const bullets = slide.bullets || [];
    if (bullets.length > BUDGETS.MAX_BULLETS) {
      rejections.push({
        rule: 'LEN-9', field: `${where}.bullets`,
        why: `max ${BUDGETS.MAX_BULLETS} bullets on a slide (currently ${bullets.length}) — the slide is meant to stay readable at a glance`,
        text: `(${bullets.length} bullets)`,
      });
    }
    bullets.forEach((row, j) => {
      if (len(row) > BUDGETS.BULLET_LINE) {
        rejections.push({
          rule: 'LEN-9', field: `${where}.bullets[${j}]`,
          why: `each bullet must be ≤ ${BUDGETS.BULLET_LINE} characters (currently ${len(row)})`,
          text: String(row).slice(0, 300),
        });
      }
    });

    (slide.agenda_items || []).forEach((row, j) => {
      if (len(row) > BUDGETS.IMPLICATION_LINE) {
        rejections.push({
          rule: 'LEN-6', field: `${where}.agenda_items[${j}]`,
          why: `each agenda item must be ≤ ${BUDGETS.IMPLICATION_LINE} characters on one line (currently ${len(row)})`,
          text: String(row).slice(0, 300),
        });
      }
    });

    // Body budget depends on layout: slides carrying packshots use the
    // narrower text column beside the image slots.
    const bodyParts = [
      slide.market_signal, slide.why_it_may_matter, slide.hypothesis_tieback,
      ...(slide.bullets || []),
      ...(slide.agenda_items || []),
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
// Every id a slide cites, with the field path it sits in. Shared by TIER-1,
// XTREND-1 and the UNRES-1 gate so the three can never disagree about what
// counts as a cited datapoint.
export function citedIds(slide, index = 0) {
  const where = `slide ${slide?.slide_number ?? index + 1}`;
  const cited = [];
  (slide?.gnpd_examples || []).forEach((ex, j) => {
    const m = String(ex || '').match(/^\s*([A-Za-z0-9._-]{4,})\s*\|/);
    if (m) cited.push({ id: m[1], field: `${where}.gnpd_examples[${j}]`, text: String(ex).slice(0, 300) });
  });
  (slide?.supporting_data || []).forEach((d, j) => {
    const raw = String(d?.source_id || '').trim();
    if (raw) cited.push({ id: raw, field: `${where}.supporting_data[${j}].source`, text: raw });
  });
  return cited;
}

function isContentSlide(slide) {
  return slide?.slide_type !== 'section_header' && slide?.slide_type !== 'methodology';
}

function tierRejections(slides, bindings) {
  const map = bindings && typeof bindings === 'object' ? bindings : null;
  if (!map || Object.keys(map).length === 0) return [];
  const rejections = [];

  (slides || []).forEach((slide, i) => {
    if (!isContentSlide(slide)) return;
    const slideClass = String(slide.evidence_class || 'regional') === 'read_across' ? 'read_across' : 'regional';

    for (const c of citedIds(slide, i)) {
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

// XTREND-1 — trend containment at the save wall (Build B).
//
// A slide is built on ONE verified trend. Every source, inline citation and GNPD
// record it cites must be bound to that same trend, otherwise the slide borrows
// another trend's evidence to support its own claim. Decided from the frozen
// bindings, so it is deterministic and cannot be argued away in prose.
//
// BM-1: web-signal bindings carry no trend_id (a web signal is linked to a
// category, not a trend), so they are exempt — comparing them would reject every
// deck that cites a web signal.
function xtrendRejections(slides, bindings) {
  const map = bindings && typeof bindings === 'object' ? bindings : null;
  if (!map || Object.keys(map).length === 0) return [];
  const rejections = [];

  (slides || []).forEach((slide, i) => {
    if (!isContentSlide(slide)) return;
    const slideTrend = String(slide.trend_id || '').trim();
    if (!slideTrend) return;

    for (const c of citedIds(slide, i)) {
      const hit = resolveBinding(c.id, map);
      if (!hit || hit.kind === 'web') continue;
      const boundTrend = String(hit.trend_id || '').trim();
      if (!boundTrend || boundTrend === slideTrend) continue;
      rejections.push({
        rule: 'XTREND-1', field: c.field,
        why: `this slide cites ${c.id}, which is bound to trend ${boundTrend}, but the slide is built on trend ${slideTrend} — a slide may only cite its own trend's evidence`,
        text: c.text,
      });
    }
  });

  return rejections;
}

// UNRES-1 — the global unresolvable gate (Build B).
//
// A's per-datapoint drop keeps a single bad id from rendering a fabricated
// citation, but it is silent: a deck can lose most of its evidence and still look
// complete. Measured over the deck AS EMITTED (before resolution drops anything),
// because the dropped datapoints are exactly what is being counted.
export const UNRESOLVABLE_THRESHOLD = 0.40;

export function unresolvableGate(slides, bindings, threshold = UNRESOLVABLE_THRESHOLD) {
  const map = bindings && typeof bindings === 'object' ? bindings : {};
  let total = 0;
  const unresolved = [];

  (slides || []).forEach((slide, i) => {
    if (!isContentSlide(slide)) return;
    for (const c of citedIds(slide, i)) {
      total++;
      if (!resolveBinding(c.id, map)) unresolved.push(c);
    }
  });

  const ratio = total > 0 ? unresolved.length / total : 0;
  const over = total > 0 && ratio > threshold;
  return {
    total,
    unresolved_count: unresolved.length,
    ratio: Number(ratio.toFixed(4)),
    threshold,
    ok: !over,
    rejection: over ? {
      rule: 'UNRES-1',
      field: 'deck.citations',
      why: `${unresolved.length} of ${total} cited datapoints (${Math.round(ratio * 100)}%) resolve to nothing in the evidence this deck was built from — above the ${Math.round(threshold * 100)}% ceiling. This is not an honestly thin deck, it is a deck not built on the evidence.`,
      text: unresolved.slice(0, 8).map(c => `${c.field}: ${c.id}`).join(' | '),
    } : null,
  };
}

// NARR-1 retired with the simplified (PDF-pattern) deck: a trend is now told over
// a global-context slide and a region-in-focus slide, and the red thread lives on
// the opening slide and the per-trend implications slide instead of a tie-back
// line on every slide.

const TEXT_FIELDS = ['title', 'subtitle', 'preheader', 'market_signal', 'why_it_may_matter', 'hypothesis_tieback', 'so_what'];
const ARRAY_FIELDS = ['bullets', 'formulation_questions', 'conversation_openers', 'gnpd_examples', 'strategic_implications', 'palsgaard_support', 'agenda_items'];

// Validates a whole deck. Returns { ok, rejections[], flags[] }.
export function validateSlides(slides, briefCategory, reportTitle = null, allowList = null) {
  const rejections = [
    ...budgetRejections(slides, reportTitle),
    ...tierRejections(slides, allowList?.bindings || null),
    ...xtrendRejections(slides, allowList?.bindings || null),
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
    (slide.rows || []).forEach((row, r) => {
      (row || []).forEach((cell, c) => checkProse(cell, `${where}.rows[${r}][${c}]`));
    });
    (slide.items || []).forEach((item, j) => {
      checkProse(item?.title, `${where}.items[${j}].title`);
      checkProse(item?.text, `${where}.items[${j}].text`);
    });
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