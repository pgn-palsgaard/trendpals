import React, { useState, useRef, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { Link } from 'react-router-dom';
import { FlaskConical, CheckCircle2 } from 'lucide-react';
import ArchitectChat from '@/components/briefbeta/ArchitectChat';
import ContractPanel from '@/components/briefbeta/ContractPanel';
import SimilarReportsPanel from '@/components/reports/SimilarReportsPanel';
import ScopeIntro from '@/components/submitbrief/ScopeIntro';
import DeckPreview from '@/components/briefbeta/DeckPreview';
import GammaExportPanel from '@/components/briefbeta/GammaExportPanel';
import ClaudePptxPanel from '@/components/briefbeta/ClaudePptxPanel';
import { buildArchitectPrompt, CANONICAL_CATEGORIES } from '@/components/briefbeta/architectPrompt';
import { buildEvidenceContext, extractRecordIds } from '@/components/briefbeta/evidenceContext';
import { resolveRegionScope } from '@/components/briefbeta/regionScope';
import { coveredRegionLabel } from '@/components/briefbeta/coveredRegion';
import { validateSlides, allowListFromBindings, unresolvableGate } from '@/components/briefbeta/outputValidator';
import { buildTrendStatus } from '@/components/briefbeta/trendStatus';
import { buildCitationMap, resolveSupportingData } from '@/components/briefbeta/citationMap';
import { buildMethodologySlide } from '@/components/briefbeta/methodologyAppendix';
import { computeRenderedSplit } from '@/components/briefbeta/renderedByCountry';
import { stampProvenance } from '@/components/briefbeta/readAcross';
import { runBuildWithValidation, MAX_BUILD_ATTEMPTS } from '@/components/briefbeta/validationLoop';
import { splitVerdict } from '@/components/briefbeta/surgicalRewrite';
import ValidationBanner from '@/components/briefbeta/ValidationBanner';
import ValidationStatus from '@/components/briefbeta/ValidationStatus';
import GateNotice from '@/components/briefbeta/GateNotice';
import SubregionNotice from '@/components/briefbeta/SubregionNotice';
import { AI_DISCLAIMER_FULL } from '@/lib/aiDisclaimer';
import { useAuth } from '@/lib/AuthContext';
import useArchitectSession from '@/hooks/useArchitectSession';

const OPENER = {
  role: 'assistant',
  content: "I'm the Report Architect (BETA). Tell me what report you need — paste an email, a meeting note, or just describe it. I'll structure the brief with you, then build the full slide deck for your review before anything is saved.",
};

// Project.region_code / Report.region are a 4-value commercial enum, far coarser
// than the brief's actual country scope. The authoritative scope is the resolved
// country allow-list, recorded verbatim on the methodology slide and in
// Report.evidence_gate — this code is a display label only, never a filter.
const GROUP_TO_CODE = { europe: 'EMEC', turkey: 'EMEC', cis: 'EMEC', aspac: 'ASPAC', latam: 'AMERICAS', north_america: 'AMERICAS', americas: 'AMERICAS', imea: 'IMEA' };

// Phase 5 — a mixed scope resolves to NULL, never 'Global'. 'Global' reads as
// worldwide coverage, which is the opposite of what a two-region brief has.
function regionCodeFor(scope) {
  if (!scope?.ok) return null;
  if (scope.scope === 'global') return 'Global';
  const codes = [...new Set(Object.keys(scope.subregions || {}).map(g => GROUP_TO_CODE[g]).filter(Boolean))];
  return codes.length === 1 ? codes[0] : null;
}

// Display only — free text for headers and exports. Never parsed, never a filter.
function regionDisplayLabel(scope) {
  if (!scope?.ok) return '';
  if (scope.scope === 'global') return 'Global';
  return `${scope.region_text || 'Selected markets'} (${scope.countries.length} markets)`;
}

export default function SubmitBriefBeta() {
  const [messages, setMessages] = useState([OPENER]);
  const [contract, setContract] = useState({});
  const [slides, setSlides] = useState(null);
  const [trends, setTrends] = useState(null); // verified trends for the contract category
  const [evidence, setEvidence] = useState(null); // sources + real GNPD products per trend
  const [inputText, setInputText] = useState('');
  const [loading, setLoading] = useState(false);
  const [feedbackGiven, setFeedbackGiven] = useState({});
  const [saving, setSaving] = useState(false);
  const [savedReport, setSavedReport] = useState(null);
  const [gateNotice, setGateNotice] = useState(null);
  // The evidence snapshot the CURRENT deck was built from, frozen at build time and
  // never overwritten by a later retrieval. Binding, validation and save read this,
  // never the shared `evidence` state — otherwise a deck could be bound to evidence
  // the architect never saw (TOCTOU). null = the deck is unbound and cannot be saved.
  const [frozenEvidence, setFrozenEvidence] = useState(null);
  const [bindings, setBindings] = useState(null);
  // Build B — per-trend evidence status, frozen beside the bindings. The preview
  // and the export renderer stamp record counts from this; the architect does not
  // write them.
  const [trendStatus, setTrendStatus] = useState(null);
  // Build-loop state: live progress while validating/rewriting, and the outcome
  // of the last build so the deck can be shown with warnings when it still fails.
  const [validationStatus, setValidationStatus] = useState(null);
  const [buildValidation, setBuildValidation] = useState(null);
  const sessionStart = useRef(new Date().toISOString());
  const { user } = useAuth();

  // Resuming a session from the Architect history: ?session=<id>
  const resumeId = new URLSearchParams(window.location.search).get('session');
  const [resuming, setResuming] = useState(!!resumeId);

  useEffect(() => {
    if (!resumeId) return;
    let cancelled = false;
    base44.entities.ArchitectSession.get(resumeId).then(s => {
      if (cancelled || !s) return;
      if (Array.isArray(s.messages) && s.messages.length > 0) setMessages(s.messages);
      if (s.contract) setContract(s.contract);
      // A resumed deck is UNBOUND: the slides come from the saved session while the
      // evidence is retrieved fresh below, so nothing guarantees the two match. It is
      // shown for reading, but must be rebuilt before it can be saved.
      if (Array.isArray(s.slides) && s.slides.length > 0) setSlides(s.slides);
      if (s.session_started_at) sessionStart.current = s.session_started_at;
      // Evidence is not stored on the session — re-run the gates so the architect
      // keeps working from real, verified evidence.
      if (s.contract?.categories && s.contract?.region) {
        loadEvidenceFor(s.contract.categories, s.contract.region, s.contract.sub_categories, s.contract.read_across, s.contract.excluded_countries);
      }
      setResuming(false);
    }).catch(() => setResuming(false));
    return () => { cancelled = true; };
  }, [resumeId]);

  // Every session is auto-saved to the Architect history as the conversation runs.
  const { markConverted } = useArchitectSession({
    messages,
    contract,
    slides,
    sessionStart: sessionStart.current,
    user,
    initialSessionId: resumeId || undefined,
  });

  // Retrieval applies the brief's region and format constraints as HARD GATES
  // before any narrative exists. An unresolvable region fails loudly — it never
  // falls back to global scope.
  // read_across and excluded_countries live in the contract and must REACH retrieval:
  // read-across cannot fire without the first, and cannot honour exclusions without
  // the second (which also revives the regional exclusion list — it never arrived).
  async function loadEvidenceFor(categories, regionText, subCategories, readAcross, excludedCountries) {
    const valid = (Array.isArray(categories) ? categories : [categories])
      .filter(c => CANONICAL_CATEGORIES.includes(c));
    if (valid.length === 0) return null;

    const scope = resolveRegionScope(regionText);
    if (!scope.ok) {
      setGateNotice({ type: 'region_unresolved', message: scope.error });
      setEvidence(null);
      setTrends(null);
      return null;
    }

    try {
      const res = await base44.functions.invoke('getArchitectEvidence', {
        categories: valid,
        region_text: regionText,
        sub_categories: Array.isArray(subCategories) ? subCategories : [],
        read_across: readAcross || 'strict_region',
        excluded_countries: Array.isArray(excludedCountries) ? excludedCountries : [],
      });
      const data = res?.data;
      if (data?.result === 'insufficient_regional_evidence') {
        setGateNotice({ type: 'insufficient_regional_evidence', message: data.message, gate: data.gate });
        setEvidence(null);
        setTrends(null);
        return null;
      }
      if (data?.error) {
        setGateNotice({ type: data.error, message: data.message || data.error });
        return null;
      }
      if (!data?.trends) return null;
      setGateNotice(null);
      setEvidence(data);
      setTrends(data.trends);
      return data;
    } catch {
      return null;
    }
  }

  async function sendMessage() {
    if (!inputText.trim() || loading) return;
    const userMsg = { role: 'user', content: inputText.trim(), timestamp: new Date().toISOString() };
    const newMessages = [...messages, userMsg];
    setMessages(newMessages);
    setInputText('');
    setLoading(true);

    try {
      const transcript = newMessages
        .map(m => `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.content}`)
        .join('\n\n');

      // The architect may NEVER build from an empty evidence block — without it it
      // invents trend names and emits slides with no GNPD examples. If the contract
      // already names categories + region, the gates are resolved (and awaited) here
      // before the prompt is sent, and a failed retrieval stops the turn loudly.
      let ev = evidence;
      if (!ev && contract.categories && contract.region) {
        ev = await loadEvidenceFor(contract.categories, contract.region, contract.sub_categories, contract.read_across, contract.excluded_countries);
        if (!ev) {
          setMessages(prev => [...prev, {
            role: 'assistant',
            content: 'I cannot build without verified evidence — the region/format gates returned nothing usable. See the note on the right, then adjust the region or formats and ask me to build again.',
          }]);
          setLoading(false);
          return;
        }
      }

      const reply = await base44.integrations.Core.InvokeLLM({
        prompt: buildArchitectPrompt(transcript, buildEvidenceContext(ev)),
        model: 'claude_sonnet_4_6',
      });
      const rawText = typeof reply === 'string' ? reply : (reply?.content || '');

      // Parse contract block
      let merged = contract;
      const contractMatch = rawText.match(/<contract>\s*([\s\S]*?)\s*<\/contract>/);
      if (contractMatch) {
        try {
          const parsed = JSON.parse(contractMatch[1].trim());
          const next = { ...contract };
          for (const [k, v] of Object.entries(parsed)) {
            if (v !== null && v !== 'null' && String(v).trim()) next[k] = v;
          }
          merged = next;
          setContract(next);
          // Re-run the gates whenever the binding constraints change — categories,
          // formats or region text. Evidence is never retrieved without them.
          const bindingChanged =
            JSON.stringify(next.categories) !== JSON.stringify(contract.categories) ||
            JSON.stringify(next.sub_categories) !== JSON.stringify(contract.sub_categories) ||
            JSON.stringify(next.excluded_countries) !== JSON.stringify(contract.excluded_countries) ||
            next.read_across !== contract.read_across ||
            next.region !== contract.region;
          if (next.categories && next.region && bindingChanged) {
            loadEvidenceFor(next.categories, next.region, next.sub_categories, next.read_across, next.excluded_countries);
          }
          // A binding field changed after a deck was built: the built slides were
          // grounded in the previous evidence, so the deck is stale and must be
          // rebuilt — exactly as a manual slide edit invalidates the build verdict.
          if (bindingChanged && slides) {
            setSlides(null);
            setFrozenEvidence(null);
            setBindings(null);
            setTrendStatus(null);
            setBuildValidation(null);
            setMessages(prev => [...prev, {
              role: 'assistant',
              content: 'The brief scope changed, so the deck built on the previous evidence has been discarded. Ask me to build again and it will be grounded in the new evidence.',
            }]);
          }
        } catch { /* malformed contract — ignore, next turn re-emits */ }
      }

      // Parse slides block — validated (and rewritten if needed) BEFORE it is shown.
      const slidesMatch = rawText.match(/<slides>\s*([\s\S]*?)\s*<\/slides>/);
      if (slidesMatch) {
        try {
          const parsedSlides = JSON.parse(slidesMatch[1].trim());
          if (Array.isArray(parsedSlides) && parsedSlides.length > 0) {
            await validateAndSetDeck(parsedSlides, merged, ev, transcript);
          }
        } catch { /* malformed slides — user can ask to rebuild */ }
      }

      const visible = rawText
        .replace(/<contract>[\s\S]*?<\/contract>/, '')
        .replace(/<slides>[\s\S]*?<\/slides>/, '')
        .trim();
      setMessages(prev => [...prev, { role: 'assistant', content: visible || 'Deck built — review the slides on the right.', timestamp: new Date().toISOString() }]);
    } catch {
      setMessages(prev => [...prev, { role: 'assistant', content: 'Something went wrong reaching the architect. Please try again.' }]);
    }
    setLoading(false);
  }

  function handleFeedback(messageIndex, verdict) {
    setFeedbackGiven(prev => ({ ...prev, [messageIndex]: verdict }));
    base44.entities.BetaFeedback.create({
      verdict,
      message_index: messageIndex,
      message_snippet: (messages[messageIndex]?.content || '').slice(0, 300),
      session_started_at: sessionStart.current,
    }).catch(() => {});
  }

  // Build D — the SURGICAL rewrite. A short, stateless string-shortening call: it
  // carries only the offending strings and their budgets, never the conversation,
  // never the evidence context, never the rest of the deck. The old full-deck
  // re-roll is gone — it reintroduced new overruns and new fabrications on slides
  // that were already clean, so the rewrite budget never converged.
  async function requestSurgicalRewrite(payload) {
    const items = payload
      .map((p, i) => `${i}. rule=${p.rule} budget=${p.budget} current_length=${p.current.length}\n   "${p.current}"`)
      .join('\n');
    try {
      const reply = await base44.integrations.Core.InvokeLLM({
        prompt: `These strings exceed their hard character budgets in a PowerPoint template that never autofits text — anything over the budget renders clipped.

Rewrite each one to fit its stated budget. Keep the same meaning and the same language. Do not add new content, new figures, new claims, new sources or new place names. Do not truncate mid-word. Do not add ellipses. Return the corrected string for every item, referenced by its index.

${items}`,
        response_json_schema: {
          type: 'object',
          properties: {
            corrections: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  index: { type: 'number' },
                  corrected: { type: 'string' },
                },
                required: ['index', 'corrected'],
              },
            },
          },
          required: ['corrections'],
        },
        model: 'gpt_5_mini',
      });
      const list = Array.isArray(reply?.corrections) ? reply.corrections : [];
      // The correction is bound back to the payload entry by index, so the model
      // cannot choose which slide or field gets written.
      return list
        .map(c => {
          const p = payload[Number(c?.index)];
          if (!p || !String(c?.corrected || '').trim()) return null;
          return { slide_number: p.slide_number, field: p.field, corrected: String(c.corrected).trim() };
        })
        .filter(Boolean);
    } catch {
      return null;
    }
  }

  function updateSlide(index, updated) {
    setSlides(prev => prev.map((s, i) => (i === index ? updated : s)));
    // A manual edit invalidates the build verdict — save re-validates it anyway.
    setBuildValidation(null);
  }

  // The deck is validated (and rewritten up to MAX_BUILD_ATTEMPTS) before it is
  // ever rendered. If it still fails, it is shown with a warning banner rather
  // than hidden — the analyst can fix the fields by hand.
  async function validateAndSetDeck(parsedSlides, activeContract, ev, transcript) {
    const cats = (Array.isArray(activeContract.categories) ? activeContract.categories : [activeContract.categories])
      .filter(c => CANONICAL_CATEGORIES.includes(c));
    const category = cats[0] || 'needs_human_review';
    const title = String(activeContract.report_title || activeContract.core_hypothesis || activeContract.objective || 'Architect draft').slice(0, 120);

    // Freeze the snapshot the moment the deck is built, beside the slides.
    const snapshot = ev || evidence;
    const bindingMap = buildCitationMap(snapshot);
    setFrozenEvidence(snapshot);
    setBindings(bindingMap);
    setTrendStatus(buildTrendStatus(snapshot));

    setValidationStatus({ attempt: 1, total: MAX_BUILD_ATTEMPTS });
    const result = await runBuildWithValidation({
      slides: parsedSlides,
      evidence: snapshot,
      bindings: bindingMap,
      category,
      title,
      rewrite: payload => requestSurgicalRewrite(payload),
      onAttempt: (attempt, total) => setValidationStatus({ attempt, total }),
    });
    setValidationStatus(null);

    // The provenance line is stamped by the renderer, at build and again at save —
    // never authored by the architect. Stamping here means the preview shows exactly
    // what the export will.
    setSlides(stampProvenance(result.slides, coveredRegionLabel(snapshot?.gate) || ''));
    if (result.contractPatch?.report_title) {
      setContract(prev => ({ ...prev, report_title: result.contractPatch.report_title }));
    }
    setBuildValidation({
      ok: result.ok,
      verdict: result.verdict,
      rejections: result.rejections,
      len_warnings: result.len_warnings,
      integrity_rejections: result.integrity_rejections,
      flags: result.flags,
      attempts: result.attempts,
      rewrite_attempts: result.rewrite_attempts,
      log: result.log,
    });
  }

  async function saveAsReport() {
    if (!slides || saving) return;
    setSaving(true);
    try {
      // Save binds the deck to the snapshot it was BUILT from — never to a fresh
      // retrieval. No frozen snapshot means the deck is unbound (resumed session, or
      // scope changed after the build): it must be rebuilt, not saved.
      const snap = frozenEvidence;
      if (!snap) {
        setMessages(prev => [...prev, {
          role: 'assistant',
          content: 'Nothing was saved — this deck is not bound to an evidence snapshot (it was restored from history, or the brief scope changed after it was built). Ask me to build it again and it will be saved with its evidence.',
        }]);
        setSaving(false);
        return;
      }
      const bindingMap = bindings || buildCitationMap(snap);
      const cats = (Array.isArray(contract.categories) ? contract.categories : [contract.categories])
        .filter(c => CANONICAL_CATEGORIES.includes(c));
      const category = cats[0] || 'needs_human_review';
      const scope = resolveRegionScope(contract.region);
      if (!scope.ok) {
        setMessages(prev => [...prev, { role: 'assistant', content: `Cannot save: ${scope.error}` }]);
        setSaving(false);
        return;
      }
      const regionCode = regionCodeFor(scope);
      // Phase 2 — the display label reflects what the evidence actually covers,
      // never the requested scope. The requested-vs-covered gap is stated once,
      // on the methodology slide.
      const displayLabel = coveredRegionLabel(snap.gate) || regionDisplayLabel(scope);

      // Save-time validation is now a CONFIRMATION pass only — the rewrite budget
      // was spent in the build loop, so no rewrite is attempted here. A rejection
      // at this point means the deck was edited by hand after the build.
      const now = new Date().toISOString();
      // [BETA] no longer lives in the title — it renders as a pre-header on the
      // exported deck instead, so the 47-char front-page budget (LEN-1) stays intact.
      let title = String(contract.report_title || contract.core_hypothesis || contract.objective || 'Architect draft').slice(0, 120);
      // ORDER MATTERS: resolve citations BEFORE validating. The character budgets are
      // a hard wall against a template that never autofits, so LEN-3 must measure the
      // strings the reader actually gets — validating the pre-resolution deck measures
      // empty citation strings and lets a deck within ~70 chars of the ceiling through
      // to clip in front of a customer.
      let deck = stampProvenance(slides, displayLabel).map(s => Array.isArray(s.supporting_data)
        ? { ...s, supporting_data: resolveSupportingData(s.supporting_data, bindingMap) }
        : s);
      // Resolution DROPS unresolvable ids, so CITE-1 can no longer be observed by
      // validating the resolved deck — the dropped entries are recovered here and
      // rejected explicitly. A cited id either resolves in the evidence this deck was
      // built from, or the save is blocked.
      const dropped = [];
      slides.forEach((s, i) => {
        const kept = new Set((deck[i].supporting_data || []).map(d => d.source_id).filter(Boolean));
        (s.supporting_data || []).forEach((d, j) => {
          if (d.source_id && !kept.has(d.source_id)) {
            dropped.push({
              rule: 'CITE-1',
              field: `slide ${s.slide_number ?? i + 1}.supporting_data[${j}].source`,
              why: `source_id "${d.source_id}" resolves to nothing in the evidence this deck was built from — the citation cannot be rendered and may be fabricated`,
              text: String(d.source_id),
            });
          }
        });
      });
      // Build B — the global unresolvable gate. Measured on the deck AS EMITTED,
      // because the resolved deck no longer contains the dropped datapoints.
      const unres = unresolvableGate(slides, bindingMap);
      const verdict = validateSlides(deck, category, title, allowListFromBindings(bindingMap));
      verdict.rejections = [...dropped, ...(unres.rejection ? [unres.rejection] : []), ...verdict.rejections];
      verdict.ok = verdict.rejections.length === 0;
      // Build D — the two-layer split at the save wall. A LEN overrun is cosmetic
      // and reversible (the analyst shortens it in preview), so it is advisory and
      // saved with its warning recorded. Everything else is an integrity failure —
      // a citation that traces to nothing, a competitor source, another trend's or
      // another market's evidence — and stays a hard wall with no override.
      const saveSplit = splitVerdict(verdict.rejections);
      // The build loop's per-attempt log is the audit trail; the confirm pass adds
      // its own entries so a hand-edited breakage is distinguishable from a
      // build-time one.
      const logEntries = [
        ...(buildValidation?.log || []),
        ...verdict.rejections.map(r => ({
          rule: r.rule, field: r.field, why: r.why, text: r.text, phase: 'save_confirm', timestamp: now,
        })),
      ];
      const buildAttempts = buildValidation?.attempts || 1;
      const rewriteAttempts = buildValidation?.rewrite_attempts ?? 0;
      const ruleFireCounts = {};
      for (const e of logEntries) ruleFireCounts[e.rule] = (ruleFireCounts[e.rule] || 0) + 1;
      for (const f of verdict.flags || []) ruleFireCounts[f.rule] = (ruleFireCounts[f.rule] || 0) + 1;
      // An empty log is a valid state: it means the deck passed with nothing rejected.
      const validatorLog = {
        validated_at: now,
        unresolvable: {
          total_cited: unres.total,
          unresolved: unres.unresolved_count,
          ratio: unres.ratio,
          threshold: unres.threshold,
        },
        verdict: saveSplit.verdict,
        rewrite_attempts: rewriteAttempts,
        rewrite_attempted: rewriteAttempts > 0,
        rewrite_succeeded: rewriteAttempts > 0 && verdict.ok,
        rejections: logEntries,
        flags: (verdict.flags || []).map(f => ({ rule: f.rule, field: f.field, why: f.why, text: f.text })),
        rule_fire_counts: ruleFireCounts,
      };
      if (saveSplit.integrity_rejections.length > 0) {
        const log = saveSplit.integrity_rejections.slice(0, 8)
          .map(r => `• [${r.rule}] ${r.field}: ${r.why}\n  "${r.text}"`).join('\n');
        setMessages(prev => [...prev, {
          role: 'assistant',
          content: `Nothing was saved — the deck breaks evidence integrity, and that cannot be overridden. Fix the fields below in the deck editor, or ask me to rebuild:\n\n${log}`,
        }]);
        setSaving(false);
        return;
      }
      if (saveSplit.len_warnings.length > 0) {
        const log = saveSplit.len_warnings.slice(0, 8)
          .map(r => `• [${r.rule}] ${r.field}: ${r.why}`).join('\n');
        setMessages(prev => [...prev, {
          role: 'assistant',
          content: `Saving with ${saveSplit.len_warnings.length} text-length warning${saveSplit.len_warnings.length === 1 ? '' : 's'} — the evidence is sound, but this text will be clipped in the export until you shorten it:\n\n${log}`,
        }]);
      }
      // The trends the architect worked from carry the market-intel sources behind
      // the deck — attach them to the project so the evidence chain stays traceable.
      const usedTrends = (snap.trends || []).filter(t => cats.includes(t.category));
      const sourceIds = [...new Set(usedTrends.flatMap(t => (t.sources || []).map(s => s.id)).filter(Boolean))];

      const project = await base44.entities.Project.create({
        name: title,
        category,
        region_code: regionCode,
        objective: contract.objective || contract.core_hypothesis || 'Beta chat-briefed report',
        customer_name: contract.audience || '',
        state: 'draft',
        generated_by: 'architect',
        selected_source_ids: sourceIds,
      });
      if (regionCode === null) {
        setMessages(prev => [...prev, {
          role: 'assistant',
          content: 'Note: this brief spans more than one commercial region, so the report carries no single region code — it is labelled by its actual market scope instead. "Global" would have been wrong.',
        }]);
      }

      const disclaimerSlide = {
        slide_number: 0,
        slide_name: 'AI Disclaimer',
        title: 'About this report',
        market_signal: AI_DISCLAIMER_FULL,
      };
      const methodologySlide = buildMethodologySlide({
        gate: snap.gate,
        contract,
        exclusions: snap.exclusions,
        validatorFlags: verdict.flags,
      });
      // deck is already citation-resolved (above) and was validated in that state,
      // so what is persisted is exactly what LEN measured.
      const finalSlides = [disclaimerSlide, ...deck.map((s, i) => ({ ...s, slide_number: i + 1 }))];
      if (methodologySlide) finalSlides.push({ ...methodologySlide, slide_number: finalSlides.length });

      // The deck cites products by their exact GNPD Record ID, so the shortlist is
      // built straight from the retrieved evidence — no name guessing.
      const recordIds = extractRecordIds(deck);
      const evidenceById = {};
      for (const p of snap.products || []) evidenceById[p.gnpd_record_id] = p;
      // Cross-region records are real retrieved evidence: they must resolve here too,
      // or every read_across id would be reported as an unmatched defect and dropped
      // from the reference list. The per-trend separation is what keeps the tiers
      // apart; this union exists only for resolution.
      for (const p of snap.read_across_products || []) evidenceById[p.gnpd_record_id] = { ...p, read_across: true };
      // Phase 4 — the reference list must be ID-equal to what the deck actually
      // renders. An id cited on a slide that is not in the retrieved evidence is
      // not a reference, it is a defect: it is kept out of the export list and
      // recorded as a flag instead of silently shipping an unresolvable id.
      const resolvedIds = recordIds.filter(id => evidenceById[id]);
      const unresolvedIds = recordIds.filter(id => !evidenceById[id]);
      for (const id of unresolvedIds) {
        validatorLog.flags.push({
          rule: 'REF-1',
          field: 'gnpd_examples',
          why: 'Record ID cited on a slide is not in the retrieved evidence set — excluded from the reference list',
          text: id,
        });
        validatorLog.rule_fire_counts['REF-1'] = (validatorLog.rule_fire_counts['REF-1'] || 0) + 1;
      }
      const shortlist = resolvedIds
        .map(id => evidenceById[id])
        .map(p => ({
          ...p,
          supporting_trends: usedTrends
            .filter(t => [...(t.products || []), ...(t.read_across_products || [])]
              .some(tp => tp.gnpd_record_id === p.gnpd_record_id))
            .map(t => t.trend_name),
        }));
      if (resolvedIds.length > 0) {
        finalSlides.push({
          slide_number: finalSlides.length,
          slide_name: 'Product Export IDs',
          title: 'GNPD Product Record IDs',
          subtitle: `${resolvedIds.length} products referenced in this report — paste into Mintel GNPD search`,
          market_signal: [...new Set(resolvedIds)].join(' OR '),
        });
      }
      if (unresolvedIds.length > 0) {
        setMessages(prev => [...prev, {
          role: 'assistant',
          content: `Note: ${unresolvedIds.length} product record ID${unresolvedIds.length === 1 ? '' : 's'} cited on the slides could not be matched to the retrieved evidence and were left out of the reference list: ${unresolvedIds.join(', ')}.`,
        }]);
      }

      // Phase 5 — rendered coverage is computed from the deck that is being
      // saved (finalSlides), so the field always describes the artefact the
      // reader gets. Counted on the slides, never on the eligibility pool.
      // Build C — split per datapoint against the frozen bindings. Only REGIONAL
      // examples enter the containment field; cross-region ones are recorded in the
      // gate for audit. Fail-closed: an unresolvable id counts as regional.
      const renderedSplit = computeRenderedSplit(finalSlides, bindingMap);
      const renderedByCountry = renderedSplit.regional;
      const gateWithReadAcross = snap.gate
        ? { ...snap.gate, read_across: { ...(snap.gate.read_across || {}), rendered_by_country: renderedSplit.read_across } }
        : null;

      const report = await base44.entities.Report.create({
        project_id: project.id,
        title,
        category,
        region: regionCode,
        region_display_label: displayLabel,
        validator_log: validatorLog,
        analysis_mode: 'standard',
        generated_by: 'architect',
        slides: finalSlides,
        product_shortlist: shortlist,
        selected_trends: usedTrends.map(t => t.trend_name),
        evidence_gate: gateWithReadAcross,
        evidence_bindings: bindingMap,
        trend_status: trendStatus || buildTrendStatus(snap),
        excluded_countries: Array.isArray(contract.excluded_countries) ? contract.excluded_countries : [],
        evidence_gate_rendered_by_country: renderedByCountry,
        status: 'draft',
        version: 1,
      });
      setSavedReport(report);
      markConverted(report.id, project.id);
    } catch (e) {
      setMessages(prev => [...prev, { role: 'assistant', content: `Saving failed: ${e.message}` }]);
    }
    setSaving(false);
  }

  return (
    <div className="page-shell">
      <div className="page-inner">
        <div className="page-header flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="page-title">Report Architect</h1>
              <span className="badge-pending"><FlaskConical className="w-3 h-3 mr-1" />BETA</span>
            </div>
            <p className="page-subtitle">
              Chat your way to a full trend deck. Isolated test environment — saved reports are prefixed [BETA].
            </p>
          </div>
        </div>

        {resuming && (
          <p className="text-sm text-muted-foreground mb-4">Restoring your saved chat…</p>
        )}
        {!resuming && messages.filter(m => m.role === 'user').length === 0 && <ScopeIntro />}

        <div className="flex flex-col lg:flex-row gap-5">
          {/* Chat */}
          <div className={slides ? 'lg:w-2/5' : 'lg:w-3/5'}>
            <ArchitectChat
              messages={messages}
              loading={loading}
              inputText={inputText}
              setInputText={setInputText}
              onSend={sendMessage}
              onFeedback={handleFeedback}
              feedbackGiven={feedbackGiven}
            />
          </div>

          {/* Contract + slides */}
          <div className={`space-y-4 ${slides ? 'lg:w-3/5' : 'lg:w-2/5'}`}>
            <ContractPanel contract={contract} trendCount={trends?.length || 0} />
            <GateNotice notice={gateNotice} />
            <SubregionNotice gate={evidence?.gate} />

            {!savedReport && (
              <SimilarReportsPanel query={{
                category: Array.isArray(contract?.categories) ? contract.categories.join(' ') : contract?.categories,
                region: contract?.region,
                objective: contract?.objective || contract?.core_hypothesis,
                audience: contract?.audience,
              }} />
            )}

            <ValidationStatus status={validationStatus} />

            {slides && !savedReport && buildValidation && !buildValidation.ok && (
              <ValidationBanner
                rejections={buildValidation.verdict === 'blocked'
                  ? buildValidation.integrity_rejections
                  : buildValidation.len_warnings}
                attempts={buildValidation.attempts}
                verdict={buildValidation.verdict}
              />
            )}

            {slides && !savedReport && (
              <DeckPreview
                slides={slides}
                bindings={bindings}
                trendStatus={trendStatus}
                onSlideChange={updateSlide}
                onSave={saveAsReport}
                saving={saving}
                // Build D — one disabling mechanism, two reasons: an unbound deck,
                // or a surviving integrity violation. A LEN overrun never disables
                // save; it turns the button amber instead.
                saveDisabledReason={
                  !frozenEvidence
                    ? 'This deck is not bound to an evidence snapshot (restored from history, or the scope changed after it was built). Ask the architect to build it again before saving.'
                    : buildValidation?.verdict === 'blocked'
                      ? 'This deck breaks evidence integrity — a citation traces to nothing, or belongs to another trend or market. That cannot be overridden: fix the flagged fields or ask the architect to rebuild.'
                      : null
                }
                saveWarning={buildValidation?.verdict === 'warnings_only'
                  ? `${buildValidation.len_warnings.length} field${buildValidation.len_warnings.length === 1 ? '' : 's'} too long for the template — save anyway and shorten later`
                  : null}
              />
            )}

            {savedReport && (
              <div className="pal-card p-5 text-center">
                <CheckCircle2 className="w-10 h-10 mx-auto mb-3" style={{ color: '#6F8263' }} />
                <p className="font-semibold text-foreground">Beta report saved</p>
                <p className="text-xs text-muted-foreground mt-1">{savedReport.title}</p>
                <Link
                  to={`/ReportView?id=${savedReport.id}`}
                  className="inline-block mt-4 rounded-lg px-4 py-2 text-sm font-semibold text-white"
                  style={{ background: '#1D428A' }}
                >
                  Open report
                </Link>
              </div>
            )}

            {savedReport && (
              <>
                <ClaudePptxPanel
                  report={savedReport}
                  slideCount={(savedReport.slides || []).length}
                />
                <GammaExportPanel
                  report={savedReport}
                  slideCount={(savedReport.slides || []).length}
                />
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}