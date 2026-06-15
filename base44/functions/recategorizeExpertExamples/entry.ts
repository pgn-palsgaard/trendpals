/**
 * Step E — ExpertExample LLM Re-categorization (Phase 3)
 *
 * Runs only on ExpertExamples where category = 'needs_human_review'.
 * Uses LLM to propose a canonical Palsgaard solution key based on product_name,
 * analyst_framing, and report_title.
 *
 * Does NOT auto-apply — sets category_ai_proposed to the LLM suggestion and
 * leaves category as 'needs_human_review' for human confirmation.
 *
 * Admin-only. Returns list of IDs with proposed categories for Peter to review.
 */

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

const VALID_CANONICAL = ['bakery', 'condiments', 'chocolate_confectionery', 'dairy', 'ice_cream', 'meat', 'oils_fats', 'plant_based', 'rutf_rusf', 'out_of_scope', 'needs_human_review'];

const DISPLAY_LABELS = {
  bakery: 'Bakery', condiments: 'Condiments', chocolate_confectionery: 'Chocolate & Confectionery',
  dairy: 'Dairy', ice_cream: 'Ice Cream', meat: 'Processed meat', oils_fats: 'Oils & Fats',
  plant_based: 'Plant-based products', rutf_rusf: 'RUTF and RUSF',
  out_of_scope: 'Out of scope', needs_human_review: 'Needs review',
};

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (user?.role !== 'admin') return Response.json({ error: 'Forbidden' }, { status: 403 });

    const { dry_run = true } = await req.json().catch(() => ({}));

    const svc = base44.asServiceRole;

    // Fetch all needs_human_review ExpertExamples
    const records = await svc.entities.ExpertExample.filter({ category: 'needs_human_review' }, '-extracted_at', 200);
    
    if (records.length === 0) {
      return Response.json({ success: true, total: 0, message: 'No records need re-categorization' });
    }

    const results = [];
    const apiKey = Deno.env.get('ANTHROPIC_API_KEY');

    for (const ex of records) {
      const prompt = `You are a product categorization specialist for Palsgaard (emulsifiers & stabilisers for food manufacturers).

Classify this product example into exactly ONE Palsgaard solution category.

Product: ${ex.product_name || ''}
Brand: ${ex.brand || ''}
Country: ${ex.country || ''}
Analyst framing: ${ex.analyst_framing || ''}
Report title: ${ex.report_title || ''}
Claims: ${(ex.claims || []).join(', ') || 'none'}

Valid categories (return the KEY, not the label):
- bakery (bread, cakes, pastries, biscuits, cookies, muffins)
- chocolate_confectionery (chocolate, candy, confectionery, sweet spreads)
- dairy (yogurt, cheese, cream, milk products, cultured dairy)
- ice_cream (ice cream, frozen desserts, gelato, sorbet)
- meat (processed meat, sausages, cold cuts, poultry)
- oils_fats (margarine, spreads, shortening, cooking oils)
- plant_based (plant-based dairy alternatives, vegan products, oat/soy/almond based)
- condiments (sauces, dressings, mayonnaise, dips)
- rutf_rusf (therapeutic food, nutritional supplements for malnutrition)
- out_of_scope (snacks, breakfast cereals, beverages, pet food — not a Palsgaard category)
- needs_human_review (genuinely ambiguous — requires human decision)

Return ONLY the key string, nothing else.`;

      let proposed = 'needs_human_review';
      try {
        const response = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
          body: JSON.stringify({
            model: 'claude-haiku-4-5',
            max_tokens: 20,
            messages: [{ role: 'user', content: prompt }],
          }),
        });
        const data = await response.json();
        const raw = (data.content?.[0]?.text || '').trim().toLowerCase().replace(/[^a-z_]/g, '');
        if (VALID_CANONICAL.includes(raw)) proposed = raw;
      } catch (e) {
        console.warn(`LLM failed for ${ex.id}: ${e.message}`);
      }

      results.push({
        id: ex.id,
        product_name: ex.product_name,
        analyst_framing: ex.analyst_framing,
        report_title: ex.report_title,
        current_category: ex.category,
        proposed_category: proposed,
        proposed_label: DISPLAY_LABELS[proposed],
        changed: proposed !== 'needs_human_review',
      });

      // In non-dry-run mode, write proposed value as category_ai_proposed only (not auto-apply)
      if (!dry_run && proposed !== 'needs_human_review') {
        await svc.entities.ExpertExample.update(ex.id, {
          category_ai_proposed: proposed,
          // category remains needs_human_review — human confirms
        });
      }
    }

    const summary = {
      total: records.length,
      proposed_changes: results.filter(r => r.changed).length,
      still_needs_review: results.filter(r => !r.changed).length,
      dry_run,
      results,
    };

    console.log(`[recategorizeExpertExamples] ${summary.total} records, ${summary.proposed_changes} proposed, dry_run=${dry_run}`);
    return Response.json({ success: true, summary });

  } catch (error) {
    console.error('[recategorizeExpertExamples] Fatal:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});