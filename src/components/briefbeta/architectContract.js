const BINDING_FIELDS = [
  'categories', 'sub_categories', 'sub_categories_by_category',
  'region', 'excluded_countries', 'read_across',
];

const SNAPSHOT_FIELDS = [
  'audience', 'categories', 'sub_categories', 'sub_categories_by_category',
  'region', 'excluded_countries', 'read_across', 'intended_use', 'objective',
  'core_hypothesis', 'report_title', 'slide_count',
];

export function parseArchitectResponse(rawText, previous = {}) {
  const match = String(rawText || '').match(/<contract>\s*([\s\S]*?)\s*<\/contract>/);
  let contract = previous;
  if (match) {
    try {
      const parsed = JSON.parse(match[1].trim());
      contract = Object.fromEntries(SNAPSHOT_FIELDS.map(key => [
        key,
        Object.prototype.hasOwnProperty.call(parsed, key) ? parsed[key] : null,
      ]));
    } catch { /* the next turn will re-emit the full snapshot */ }
  }
  return {
    contract,
    buildRequested: /<build_request>\s*true\s*<\/build_request>/i.test(String(rawText || '')),
    visible: String(rawText || '')
      .replace(/<contract>[\s\S]*?<\/contract>/, '')
      .replace(/<build_request>[\s\S]*?<\/build_request>/, '')
      .replace(/<slides>[\s\S]*?<\/slides>/, '')
      .trim(),
  };
}

export function bindingChanged(before = {}, after = {}) {
  return BINDING_FIELDS.some(key => JSON.stringify(before[key] ?? null) !== JSON.stringify(after[key] ?? null));
}