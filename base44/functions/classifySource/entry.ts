import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

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

    const confidence = Math.max(0, Math.min(100, Number(result.classification_confidence) || 0));
    const classification = {
      proposed_source_type: result.proposed_source_type,
      document_type: result.document_type || '',
      category_relevance: result.category_relevance || [],
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