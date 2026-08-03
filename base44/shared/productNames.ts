// Shared normalisation of a slide's gnpd_examples string into a product name
// usable for GNPDProduct lookups. Used by the Gamma export and the image
// coverage check so both resolve products identically.
export function productNameFromExample(example) {
  return String(example)
    .replace(/^\[Expert pick\]\s*/i, '')
    .split('—')[0]
    .split('|')[0]
    .split(' - ')[0]
    .trim();
}