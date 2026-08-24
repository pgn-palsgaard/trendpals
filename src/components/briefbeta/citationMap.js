// ONE pass over the evidence produces BOTH the text the architect sees and the
// citation map the deck is resolved against (AM-1). Building them separately let
// the two sets drift — in particular the synthetic inline index, which is derived
// from a position in a filtered array.
//
// Everything downstream reads collectCitations(): suppression is applied exactly
// once, ids are materialized onto the objects, and the shown set and the mapped
// set are identical by construction.
import { SUPPRESSED_PUBLISHERS } from './outputValidator';
import { citationKey, resolveBinding } from './citationKey';

const MAX_WEB_SIGNALS = 12;

// A citation the output validator would reject outright (competitor / ingredient
// supplier) must never reach the architect — it would build a deck guaranteed to
// fail. Matched on publisher AND title, because is_competitor_content is not
// reliably set on older records.
export function isSuppressed(...parts) {
  const s = parts.filter(Boolean).join(' ');
  return SUPPRESSED_PUBLISHERS.some(p =>
    new RegExp(`\\b${p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i').test(s)
  );
}

// The emitted, post-suppression evidence set with every id materialized.
export function collectCitations(evidence) {
  const trends = (evidence?.trends || []).map(t => {
    const sources = (t.sources || [])
      .filter(s => s.id && !isSuppressed(s.publisher, s.title));
    const inline = (t.inline_citations || [])
      .filter(c => !isSuppressed(c.publisher, c.title))
      // The backend mints INLINE:<trend>:<idx>. If an older payload lacks it, it is
      // minted here from the position in THIS emitted array — never re-derived later.
      .map((c, i) => ({ ...c, id: c.id || `INLINE:${t.trend_id}:${i}` }));
    return { ...t, sources, inline_citations: inline };
  });

  const webSignals = (evidence?.web_signals || [])
    .filter(s => s.id && s.is_competitor_content !== true && !isSuppressed(s.publisher, s.title))
    .slice(0, MAX_WEB_SIGNALS);

  return { trends, webSignals };
}

function canonicalSource(title, publisher) {
  const t = String(title || '').trim();
  const p = String(publisher || '').trim();
  return p ? `${t} (${p})` : t;
}

function canonicalProduct(p) {
  return `${p.gnpd_record_id} | ${p.product_name}${p.brand ? ` — ${p.brand}` : ''}${p.country ? ` (${p.country})` : ''}`;
}

// { <key>: { canonical_string, trend_id, kind } } over exactly the emitted set.
// Pure function of the frozen snapshot — no I/O, no retrieval.
export function buildCitationMap(evidence) {
  const { trends, webSignals } = collectCitations(evidence);
  const map = {};

  for (const t of trends) {
    for (const s of t.sources) {
      map[citationKey(`[SRC:${s.id}]`)] = {
        canonical_string: canonicalSource(s.title, s.publisher),
        trend_id: t.trend_id || '',
        kind: 'source',
      };
    }
    for (const c of t.inline_citations) {
      map[citationKey(`[SRC:${c.id}]`)] = {
        canonical_string: canonicalSource(c.title, c.publisher),
        trend_id: t.trend_id || '',
        kind: 'inline',
      };
    }
    for (const p of t.products || []) {
      if (!p.gnpd_record_id) continue;
      map[p.gnpd_record_id] = {
        canonical_string: canonicalProduct(p),
        trend_id: t.trend_id || '',
        kind: 'gnpd',
      };
    }
  }

  for (const w of webSignals) {
    map[`[WEB:${w.id}]`] = {
      canonical_string: canonicalSource(w.title, w.publisher),
      trend_id: '',
      kind: 'web',
    };
  }

  return map;
}

// Resolves ONE supporting_data entry. Returns the entry with a resolved `source`
// string, or null when the cited id is not in the map — an unresolvable citation
// produces nothing rather than a rendered string.
// Legacy decks (a stored `source`, no `source_id`) keep their stored string.
export function resolveCitation(entry, bindings) {
  if (!entry || typeof entry !== 'object') return null;
  const rawId = String(entry.source_id || '').trim();
  if (!rawId) return String(entry.source || '').trim() ? entry : { ...entry, source: '' };
  const hit = resolveBinding(rawId, bindings);
  if (!hit) return null;
  return { ...entry, source: hit.canonical_string };
}

export function resolveSupportingData(list, bindings) {
  return (list || []).map(e => resolveCitation(e, bindings)).filter(Boolean);
}