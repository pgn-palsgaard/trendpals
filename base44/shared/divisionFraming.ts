/**
 * Division framing for the source pipeline.
 *
 * The pipeline is identical for both divisions — pre-gate, extraction, classification.
 * Only the INDUSTRY the model is told to judge relevance against differs. Without this,
 * every Personal Care source is rejected as "no relevance to the food ingredients
 * industry", which is exactly what happened to the first BSA uploads.
 *
 * A missing main_group means Food — sources predating the split carry no value.
 */

export type MainGroup = 'Food' | 'BSA';

export function divisionOf(source: any): MainGroup {
  return source?.main_group === 'BSA' ? 'BSA' : 'Food';
}

const FOOD = {
  industry: 'food ingredients industry',
  manufacturers: 'food manufacturers',
  signalScope:
    'category movements, consumer drivers, regional expressions, and competitive activity in food and beverage categories',
  offScopeExamples:
    'internal HR documents, equipment manuals, off-topic press releases, pure advertising, finance reports unrelated to category, regulatory filings without market content',
  categoryKeys: [
    'bakery', 'condiments', 'chocolate_confectionery', 'dairy', 'ice_cream',
    'meat', 'oils_fats', 'plant_based', 'rutf_rusf', 'out_of_scope', 'needs_human_review',
  ],
  angle:
    'a specific application area where deep emulsifier/stabiliser expertise is plausibly relevant',
};

const BSA = {
  industry: 'personal care and cosmetics ingredients industry (Palsgaard BSA)',
  manufacturers: 'personal care and cosmetics manufacturers',
  signalScope:
    'category movements, consumer drivers, regional expressions, and competitive activity in beauty and personal care — skin care, sun care, hair care, body care, colour cosmetics, deodorants, baby care — including claim trends (natural/clean, biodegradable, microbiome, SPF, fragrance-free), formulation and texture innovation, packaging and sustainability shifts, and regulatory pressure on ingredients',
  offScopeExamples:
    'internal HR documents, equipment manuals, off-topic press releases, pure advertising, finance reports unrelated to category, regulatory filings without market content',
  categoryKeys: ['personal_care', 'out_of_scope', 'needs_human_review'],
  angle:
    'a specific formulation area where deep emulsifier/emulsion-stabiliser expertise is plausibly relevant (creams, lotions, emulsion stability, sensory feel, plant-based/RSPO-based emulsifiers)',
};

export function framing(mainGroup: MainGroup) {
  return mainGroup === 'BSA' ? BSA : FOOD;
}

/**
 * A beauty & personal care product-launch database extract IS market intelligence for
 * BSA — the food-framed gate read those same files as irrelevant and skipped them.
 */
export function categoryKeysFor(mainGroup: MainGroup) {
  return framing(mainGroup).categoryKeys;
}