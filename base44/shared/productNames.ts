// Shared parsing of a slide's gnpd_examples string.
// The architect writes them as "<GNPD Record ID> | Product name — Brand (Country): why".
// The Record ID is the authoritative key — names are only a fallback for older
// decks written before the ID prefix existed.

// "14535734 | Boterkoek — Bakerij (Netherlands): …" → "14535734"
export function recordIdFromExample(example) {
  const text = String(example || '');
  const prefixed = text.match(/^\s*(?:\[[^\]]*\]\s*)?(\d{6,})\s*\|/);
  if (prefixed) return prefixed[1];
  const anywhere = text.match(/\b(\d{7,})\b/);
  return anywhere ? anywhere[1] : null;
}

// The product name only — the Record ID prefix is stripped FIRST, otherwise the
// name resolves to the ID itself and no product is ever found.
export function productNameFromExample(example) {
  return String(example || '')
    .replace(/^\[Expert pick\]\s*/i, '')
    .replace(/^\s*(?:\[[^\]]*\]\s*)?\d{6,}\s*\|\s*/, '')
    .split('|')[0]
    .split('—')[0]
    .split(' - ')[0]
    .trim();
}