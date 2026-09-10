import { resolveSupportingData } from '@/components/briefbeta/citationMap';

export function presentSlide(slide, bindings) {
  return { ...slide, supporting_data: bindings ? resolveSupportingData(slide.supporting_data, bindings) : (slide.supporting_data || []) };
}

// Ignore database defaults when comparing a saved deck with its session snapshot.
export function deckSignature(slides) {
  const normalize = value => {
    if (Array.isArray(value)) return value.map(normalize);
    if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().filter(k => value[k] != null && value[k] !== '' && !(Array.isArray(value[k]) && !value[k].length)).map(k => [k, normalize(value[k])]));
    return value;
  };
  return JSON.stringify(normalize(slides || []));
}

export const narrativeSections = [
  ['agenda_items', 'In this report'], ['bullets', null],
  ['formulation_questions', 'Formulation questions'], ['conversation_openers', 'Conversation openers'],
  ['commercial_questions', 'Commercial questions'], ['trends_under_microscope', 'Trends under the microscope'],
];
export function itemText(item) {
  if (typeof item === 'string' || typeof item === 'number') return String(item);
  return [item?.question, item?.markets_in_scope, item?.title, item?.text].filter(Boolean).join(' — ');
}