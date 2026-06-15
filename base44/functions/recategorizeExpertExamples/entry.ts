/**
 * ExpertExample LLM Re-categorization
 *
 * Can target a specific source_id or all needs_human_review records.
 * Auto-applies when LLM confidence >= 85. Below threshold: leaves category
 * as needs_human_review and writes LLM reasoning to categorization_notes.
 *
 * BUG FIXES (2026-06-15):
 *   - category_ai_proposed is NEVER overwritten. It preserves whatever value
 *     the record already has (migration audit trail). Only written if empty.
 *   - categorization_notes was being silently stripped because the field was
 *     not declared in the ExpertExample schema. Schema updated to add it.
 *     Writes are now a structured JSON string.
 *
 * Admin-only.
 */

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

const VALID_CANONICAL = [
  'bakery', 'condiments', 'chocolate_confectionery', 'dairy', 'ice_cream',
  'meat', 'oils_fats', 'plant_based', 'rutf_rusf', 'out_of_scope', 'needs_human_review'
];

const DISPLAY_LABELS = {
  bakery: 'Bakery', condiments: 'Condiments', chocolate_confectionery: 'Chocolate & Confectionery',
  dairy: 'Dairy', ice_cream: 'Ice Cream', meat: 'Processed meat', oils_fats: 'Oils & Fats',
  plant_based: 'Plant-based products', rutf_rusf: 'RUTF and RUSF',
  out_of_scope: 'Out of scope', needs_human_review: 'Needs review',
};

const AUTO_APPLY_THRESHOLD = 85;

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (user?.role !== 'admin') return Response.json({ error: 'Forbidden' }, { status: 403 });

    const body = await req.json().catch(() => ({}));
    const { dry_run = true, source_id = null } = body;

    const svc = base44.asServiceRole;

    const filter = source_id
      ? { category: 'needs_human_review', source_id }
      : { category: 'needs_human_review' };

    const records = await svc.entities.ExpertExample.filter(filter, '-extracted_at', 200);

    if (records.length === 0) {
      return Response.json({ success: true, total: 0, message: 'No records need re-categorization' });
    }

    const results = [];
    const apiKey = Deno.env.get('ANTHROPIC_API_KEY');
    const runTimestamp = new Date().toISOString();

    for (const ex of records) {
      const prompt = `You are a product categorization specialist for Palsgaard (emulsifiers & stabilisers for food manufacturers).

Classify this product example into exactly ONE Palsgaard solution category.
Return a JSON object with two fields: "category" (the key string) and "confidence" (integer 0-100).

Product: ${ex.product_name || ''}
Brand: ${ex.brand || ''}
Country: ${ex.country || ''}
Sub-category: ${ex.sub_category || ''}
Analyst framing: ${ex.analyst_framing || ''}
Report title: ${ex.report_title || ''}
Claims: ${(ex.claims || []).join(', ') || 'none'}

Valid categories (return the KEY):
- bakery (bread, cakes, pastries, biscuits, cookies, muffins)
- chocolate_confectionery (chocolate, candy, confectionery, sweet spreads, chocolate bars, wafers)
- dairy (yogurt, cheese, cream, milk products, cultured dairy, kefir)
- ice_cream (ice cream, frozen desserts, gelato, sorbet)
- meat (processed meat, sausages, cold cuts, poultry)
- oils_fats (margarine, spreads, shortening, cooking oils)
- plant_based (plant-based dairy alternatives, vegan products, oat/soy/almond based)
- condiments (sauces, dressings, mayonnaise, dips, hummus, savoury spreads, pates)
- rutf_rusf (therapeutic food, nutritional supplements for malnutrition)
- out_of_scope (snacks/crisps, breakfast cereals, beverages, coffee, pet food, non-food products, GLP-1 drugs, sweeteners, campaigns, tech products)
- needs_human_review (genuinely ambiguous)

Confidence guide: 95+ = unambiguous, 85-94 = clear but minor overlap possible, 70-84 = plausible but uncertain, <70 = very ambiguous.

Return ONLY valid JSON: {"category": "key", "confidence": 90, "reasoning": "one sentence"}`;

      let proposed = 'needs_human_review';
      let confidence = 0;
      let reasoning = '';

      try {
        const response = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
          body: JSON.stringify({
            model: 'claude-haiku-4-5',
            max_tokens: 100,
            messages: [{ role: 'user', content: prompt }],
          }),
        });
        const data = await response.json();
        const raw = (data.content?.[0]?.text || '').trim();
        const jsonText = raw.replace(/^```json?\s*/i, '').replace(/```\s*$/, '').trim();
        const parsed = JSON.parse(jsonText);
        const key = (parsed.category || '').trim().toLowerCase().replace(/[^a-z_]/g, '');
        if (VALID_CANONICAL.includes(key)) proposed = key;
        confidence = parseInt(parsed.confidence) || 0;
        reasoning = parsed.reasoning || '';
      } catch (e) {
        console.warn(`LLM failed for ${ex.id}: ${e.message}`);
      }

      const autoApply = !dry_run && proposed !== 'needs_human_review' && confidence >= AUTO_APPLY_THRESHOLD;
      const keepAtReview = !dry_run && (proposed === 'needs_human_review' || confidence < AUTO_APPLY_THRESHOLD);

      // Build categorization_notes as a structured string (schema field is type: string)
      const notePayload = JSON.stringify({
        llm_proposed_category: proposed,
        confidence,
        reasoning,
        run_timestamp: runTimestamp,
        auto_applied: autoApply,
        threshold: AUTO_APPLY_THRESHOLD,
      });

      results.push({
        id: ex.id,
        product_name: ex.product_name,
        analyst_framing: ex.analyst_framing,
        report_title: ex.report_title,
        existing_category_ai_proposed: ex.category_ai_proposed,
        proposed_category: proposed,
        proposed_label: DISPLAY_LABELS[proposed],
        confidence,
        reasoning,
        applied: autoApply,
      });

      if (!dry_run) {
        if (autoApply) {
          await svc.entities.ExpertExample.update(ex.id, {
            category: proposed,
            // NEVER overwrite category_ai_proposed if it already has a value.
            // Only set it if the field is somehow empty (records without migration history).
            ...(ex.category_ai_proposed ? {} : { category_ai_proposed: proposed }),
            categorization_notes: notePayload,
          });
        } else if (keepAtReview) {
          // Write reasoning as a note but leave category and category_ai_proposed unchanged
          await svc.entities.ExpertExample.update(ex.id, {
            categorization_notes: notePayload,
          });
        }
      }
    }

    const autoApplied = results.filter(r => r.applied);
    const keptAtReview = results.filter(r => !r.applied && r.proposed_category !== 'needs_human_review');
    const stillAmbiguous = results.filter(r => r.proposed_category === 'needs_human_review');

    const summary = {
      total: records.length,
      auto_applied: autoApplied.length,
      kept_at_needs_human_review_low_confidence: keptAtReview.length,
      still_ambiguous: stillAmbiguous.length,
      dry_run,
      source_id_filter: source_id || 'all',
      results,
    };

    console.log(`[recategorizeExpertExamples] ${summary.total} records, auto_applied=${summary.auto_applied}, kept_review=${summary.kept_at_needs_human_review_low_confidence}, dry_run=${dry_run}`);
    return Response.json({ success: true, summary });

  } catch (error) {
    console.error('[recategorizeExpertExamples] Fatal:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});