import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

// ── Inline category validator ──────────────────────────────────────────────
const VALID_CATEGORY_VALUES = ['bakery','condiments','chocolate_confectionery','dairy','ice_cream','meat','oils_fats','plant_based','rutf_rusf','out_of_scope','needs_human_review'];
const BRIEF_NORM = {'confectionery':'chocolate_confectionery','chocolate':'chocolate_confectionery','chocolate confectionery':'chocolate_confectionery','chocolate & confectionery':'chocolate_confectionery','bakery':'bakery','cake':'bakery','cake gels':'bakery','baking':'bakery','dairy':'dairy','ice cream':'ice_cream','ice-cream':'ice_cream','soft serve ice cream':'ice_cream','soft serve':'ice_cream','meat':'meat','processed meat':'meat','oils':'oils_fats','oils & fats':'oils_fats','fats':'oils_fats','margarine':'oils_fats','plant based':'plant_based','plant-based':'plant_based','plant based products':'plant_based','plant based dairy alternatives':'plant_based','plant-based dairy alternatives':'plant_based','plant based beverages and dairy alternatives':'plant_based','rutf':'rutf_rusf','rusf':'rutf_rusf','rutf and rusf':'rutf_rusf','condiments':'condiments','condiments & sauces':'condiments','sauces':'condiments','dressings':'condiments','spreads':'condiments','sweet spreads':'condiments','coffee creamer':'dairy','creamer':'dairy','creamers':'dairy'};

function validateLLMCategoryArray(arr, sourceId, svc, fnName) {
  if (!Array.isArray(arr)) return [];
  const canonical = [];
  for (const raw of arr) {
    if (!raw) continue;
    if (VALID_CATEGORY_VALUES.includes(raw)) { canonical.push(raw); continue; }
    const normalized = BRIEF_NORM[raw.trim().toLowerCase()];
    if (normalized) {
      canonical.push(normalized);
      console.warn(`[${fnName}] Non-canonical category_relevance: "${raw}" → ${normalized}`);
      if (svc && sourceId) svc.entities.LLMCategoryDeviation.create({ source_id: sourceId, function_name: fnName, field_name: 'category_relevance', raw_llm_value: raw, normalized_to: normalized, normalization_succeeded: true, detected_at: new Date().toISOString() }).catch(() => {});
    } else {
      console.warn(`[${fnName}] Dropping unknown category_relevance: "${raw}"`);
      if (svc && sourceId) svc.entities.LLMCategoryDeviation.create({ source_id: sourceId, function_name: fnName, field_name: 'category_relevance', raw_llm_value: raw, normalized_to: null, normalization_succeeded: false, detected_at: new Date().toISOString() }).catch(() => {});
    }
  }
  return [...new Set(canonical)];
}

/**
 * Intelligent upload screening — LLM classification with confidence gating.
 * - Extracts text via readSourceContent
 * - Classifies: knowledge | mintel | market_intel | url
 * - confidence >= 85: auto-apply source_type + invoke autoExtractMetadata (which handles
 *   knowledge auto-verify/approve vs mintel/market_intel awaiting verification)
 * - confidence < 85: pipeline_stage=needs_classification, human decides
 * - failure: pipeline_stage=failed with reason
 */

const CONFIDENCE_THRESHOLD = 85;

Deno.serve(async (req) => {
  let base44 = null;
  let sourceId = null;
  try {
    base44 = createClientFromRequest(req);
    const isAuthenticated = await base44.auth.isAuthenticated();
    if (!isAuthenticated) {
      return Response.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
    }

    const { source_id } = await req.json();
    if (!source_id) return Response.json({ ok: false, error: 'source_id required' }, { status: 400 });
    sourceId = source_id;

    const sources = await base44.asServiceRole.entities.Source.filter({ id: source_id });
    const source = sources?.[0];
    if (!source) return Response.json({ ok: false, error: 'Source not found' }, { status: 404 });

    if (source.source_type === 'gnpd') {
      return Response.json({ ok: false, error: 'GNPD sources are not classified — they use the locked template pipeline' });
    }

    // 1. Extract text
    const readRes = await base44.asServiceRole.functions.invoke('readSourceContent', { source_id });
    const readData = readRes.data;
    if (!readData?.ok || !readData.content?.trim()) {
      // No silent defaults: surface for human classification instead of failing with a guessed type
      await base44.asServiceRole.entities.Source.update(source_id, {
        pipeline_stage: 'needs_classification',
        review_status: 'pending',
        failure_reason: `classification: could not read content — ${readData?.error || 'empty content'}`,
        classification: { ...(source.classification || {}), status: 'failed', confidence: null, classified_at: new Date().toISOString() },
      });
      return Response.json({ ok: false, error: `Could not read content: ${readData?.error || 'empty'}` });
    }

    const sample = readData.content.slice(0, 30_000);

    // 2. LLM classification (Claude Sonnet — same family as Source Processor)
    const result = await base44.asServiceRole.integrations.Core.InvokeLLM({
      model: 'claude_sonnet_4_6',
      prompt: `You are a document classification system for Palsgaard (a Danish emulsifier/stabiliser manufacturer). Classify this uploaded document into exactly one source type.

SOURCE TYPES:
- "knowledge" — Palsgaard-internal material: product sheets, recipe suggestions, application notes, technical docs, capability overviews, certifications, sustainability docs. Signals: Palsgaard product names (Emulpals, Palsgaard SE, ArtisanIce, Einar, etc.), "FOR DISTRIBUTOR USE ONLY", internal template layout, recipe/dosage tables.
- "mintel" — Mintel-authored analyst reports. Signals: Mintel branding/layout markers ("© Mintel", "Mintel Group Ltd", GNPD references, "What you need to know", "The market — what you need to know", analyst attributions, Mintel consumer survey citations as primary content).
- "market_intel" — third-party external market/trend reports, trade press articles, industry whitepapers, competitor publications (e.g. Barry Callebaut, WGSN, Innova, FoodNavigator, IDFA). NOT authored by Mintel or Palsgaard.
- "url" — a captured webpage/article snapshot (trade press URL patterns, web article structure).

Note: a document merely CITING Mintel data is NOT "mintel" — only documents authored/published by Mintel are.

FILENAME: ${source.title || source.relative_path || 'unknown'}

DOCUMENT TEXT (truncated):
${sample}

Return your classification. document_type must be one of: product_sheet, recipe_suggestion, technical_doc, capability_overview, case_study, certification, sustainability, application_note, consumer_insight, market_report, trend_report, trade_press_article, whitepaper, presentation, webinar, other.
category_relevance values from canonical Palsgaard solution keys: bakery, condiments, chocolate_confectionery, dairy, ice_cream, meat, oils_fats, plant_based, rutf_rusf, out_of_scope, needs_human_review.
Use multiple keys when the document covers several solution areas. For cross-category sources, populate category_relevance with all relevant keys — do NOT default to needs_human_review when the document legitimately spans multiple categories.
region_signal from: ASPAC, AMERICAS, EMEC, IMEA, Global (or empty if unclear).
classification_confidence: 0-100 — how certain you are about proposed_source_type. Be conservative: only score >=85 when markers are unambiguous.
classification_reasoning: ONE sentence explaining the decision.`,
      response_json_schema: {
        type: 'object',
        properties: {
          proposed_source_type: { type: 'string', enum: ['knowledge', 'mintel', 'market_intel', 'url'] },
          document_type: { type: 'string' },
          category_relevance: { type: 'array', items: { type: 'string' } },
          region_signal: { type: 'string' },
          classification_confidence: { type: 'number' },
          classification_reasoning: { type: 'string' },
        },
        required: ['proposed_source_type', 'classification_confidence', 'classification_reasoning'],
      },
    });

    const rawConfidence = Number(result.classification_confidence);
    const confidence = (!isNaN(rawConfidence) && rawConfidence >= 0) ? Math.min(100, rawConfidence) : null;

    if (confidence === null) {
      await base44.asServiceRole.entities.Source.update(source_id, {
        pipeline_stage: 'needs_classification',
        review_status: 'pending',
        failure_reason: 'classification: LLM did not return a numeric confidence',
        classification: {
          proposed_source_type: result.proposed_source_type || null,
          document_type: result.document_type || '',
          category_relevance: [],
          region_signal: result.region_signal || '',
          confidence: null,
          reasoning: result.classification_reasoning || 'No confidence value returned',
          status: 'failed',
          classified_at: new Date().toISOString(),
        },
      });
      return Response.json({ ok: false, error: 'LLM returned null/NaN confidence — routed to needs_classification' });
    }
    // EN-1: validate category_relevance before storing
    const rawCategoryRelevance = result.category_relevance || [];
    const validatedCategoryRelevance = validateLLMCategoryArray(rawCategoryRelevance, source_id, base44.asServiceRole, 'classifySource');

    const classification = {
      proposed_source_type: result.proposed_source_type,
      document_type: result.document_type || '',
      category_relevance: validatedCategoryRelevance,
      region_signal: result.region_signal || '',
      confidence,
      reasoning: result.classification_reasoning || '',
      classified_at: new Date().toISOString(),
    };

    if (confidence >= CONFIDENCE_THRESHOLD) {
      // HIGH — auto-apply and route into the normal flow
      await base44.asServiceRole.entities.Source.update(source_id, {
        source_type: result.proposed_source_type,
        pipeline_stage: 'uploaded',
        review_status: 'pending',
        classification: { ...classification, status: 'auto_applied' },
      });
      // autoExtractMetadata handles routing: knowledge → auto-verify/approve; mintel/market_intel → verified=false
      await base44.asServiceRole.functions.invoke('autoExtractMetadata', { source_id });
      return Response.json({ ok: true, applied: true, classification });
    }

    // LOW — never silently guess; human decides
    await base44.asServiceRole.entities.Source.update(source_id, {
      pipeline_stage: 'needs_classification',
      review_status: 'pending',
      classification: { ...classification, status: 'pending' },
    });
    return Response.json({ ok: true, applied: false, classification });

  } catch (error) {
    if (base44 && sourceId) {
      try {
        // No silent defaults: an error must never leave a plausible-looking type — human decides
        await base44.asServiceRole.entities.Source.update(sourceId, {
          pipeline_stage: 'needs_classification',
          review_status: 'pending',
          failure_reason: `classification: ${error.message}`,
          classification: { status: 'failed', confidence: null, classified_at: new Date().toISOString(), reasoning: error.message },
        });
      } catch (_) { /* best effort */ }
    }
    return Response.json({ ok: false, error: error.message }, { status: 500 });
  }
});