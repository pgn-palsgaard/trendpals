// Two-level Mintel → Palsgaard canonical category resolver, shared by both GNPD
// parsers (parseGNPDToDatabase and runGNPDBatchParse). Mirrors
// src/lib/palsgaardCategoryMapping.js — functions cannot import from src/.

export function normTop(raw: string): string {
  const s = String(raw || '').trim().toLowerCase();
  if (s === 'confectionery' || s === 'chocolate confectionery' || s === 'chocolate & confectionery') return 'chocolate_confectionery_top';
  return s;
}

export const MAPPING: Record<string, Record<string, string>> = {
  'baby food': { '*': 'out_of_scope' },
  'bakery': { '*': 'bakery' },
  'breakfast cereals': { '*': 'out_of_scope' },
  'chocolate_confectionery_top': { '*': 'chocolate_confectionery' },
  'dairy': { 'margarine & other blends': 'oils_fats', 'shortening & lard': 'oils_fats', 'plant based drinks (dairy alternatives)': 'plant_based', 'plant based spoonable yogurts (dairy alternatives)': 'plant_based', 'butter': 'dairy', 'cream': 'dairy', 'creamers': 'dairy', 'fresh cheese & cream cheese': 'dairy', 'liquid dairy other': 'dairy', 'curd & quark': 'dairy', 'hard cheese & semi-hard cheese': 'dairy', 'soft cheese & semi-soft cheese': 'dairy', 'soft cheese desserts': 'dairy', 'processed cheese': 'dairy', 'evaporated milk': 'dairy', 'flavoured milk': 'dairy', 'sweetened condensed milk': 'dairy', 'white milk': 'dairy', 'drinking yogurt & liquid cultured milk': 'dairy', 'spoonable yogurt': 'dairy', '*': 'needs_human_review' },
  'desserts & ice cream': { 'dairy based ice cream & frozen yogurt': 'ice_cream', 'plant based ice cream & frozen yogurt (dairy alternatives)': 'plant_based', 'water based ice lollies, pops & sorbets': 'ice_cream', 'frozen desserts': 'ice_cream', 'dessert toppings': 'dairy', 'chilled desserts': 'dairy', 'shelf-stable desserts': 'dairy', '*': 'needs_human_review' },
  'fruit & vegetables': { '*': 'out_of_scope' },
  'meals & meal centers': { '*': 'out_of_scope' },
  'processed fish, meat & egg products': { 'processed/cured meat': 'meat', 'fresh meat': 'meat', 'canned/ambient meat': 'meat', 'chilled/smoked meat products': 'meat', 'dried/cured meat': 'meat', 'poultry': 'meat', 'processed fish': 'out_of_scope', 'canned/ambient fish': 'out_of_scope', 'chilled/fresh fish': 'out_of_scope', 'smoked fish': 'out_of_scope', 'egg products': 'out_of_scope', 'other processed fish, meat & egg products': 'needs_human_review', '*': 'needs_human_review' },
  'sauces & seasonings': { 'oils': 'oils_fats', '*': 'condiments' },
  'savoury spreads': { '*': 'out_of_scope' },
  'side dishes': { '*': 'out_of_scope' },
  'snacks': { '*': 'out_of_scope' },
  'soup': { '*': 'out_of_scope' },
  'sugar & gum confectionery': { '*': 'chocolate_confectionery' },
  'sweet spreads': { '*': 'chocolate_confectionery' },
  'sweeteners & sugar': { '*': 'out_of_scope' },
};

export function resolvePalsgaardCategory(cat: string, sub: string): string {
  if (!cat) return 'needs_human_review';
  const topMap = MAPPING[normTop(cat)];
  if (!topMap) return 'needs_human_review';
  if (sub) { const sn = String(sub).trim().toLowerCase(); if (topMap[sn] !== undefined) return topMap[sn]; }
  return topMap['*'] ?? 'needs_human_review';
}