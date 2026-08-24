// The one place that knows how a cited id maps to a key in the frozen citation
// map. Deliberately tiny and dependency-free so both the resolver and the
// write-time validator can use it without an import cycle.

// The architect copies a tag verbatim, e.g. "[SRC:6a8c1311…]" or "[WEB:abc]".
// A bare id (no brackets) is tolerated and treated as a source id.
export function citationKey(raw) {
  const s = String(raw || '').trim();
  if (!s) return '';
  return s.startsWith('[') ? s : `[SRC:${s}]`;
}

// Resolves a cited id against a frozen binding map.
// Returns { canonical_string, trend_id, kind } or null. Null means "not in the
// evidence" — the caller drops the datapoint (renderer) or rejects (validator).
export function resolveBinding(raw, bindings) {
  const s = String(raw || '').trim();
  if (!s || !bindings || typeof bindings !== 'object') return null;
  return bindings[citationKey(s)] || bindings[s] || null;
}