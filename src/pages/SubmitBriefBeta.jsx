import React, { useState, useRef } from 'react';
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
import { validateSlides } from '@/components/briefbeta/outputValidator';
import { buildMethodologySlide } from '@/components/briefbeta/methodologyAppendix';
import GateNotice from '@/components/briefbeta/GateNotice';
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
const GROUP_TO_CODE = { europe: 'EMEC', turkey: 'EMEC', cis: 'EMEC', aspac: 'ASPAC', americas: 'AMERICAS', imea: 'IMEA' };

function regionLabelFor(scope) {
  if (!scope?.ok) return null;
  if (scope.scope === 'global') return 'Global';
  const codes = [...new Set(Object.keys(scope.subregions || {}).map(g => GROUP_TO_CODE[g]).filter(Boolean))];
  return codes.length === 1 ? codes[0] : 'Global';
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
  const rewriteAttempted = useRef(false);
  const sessionStart = useRef(new Date().toISOString());
  const { user } = useAuth();

  // Every session is auto-saved to the Architect history as the conversation runs.
  const { markConverted } = useArchitectSession({
    messages,
    contract,
    slides,
    sessionStart: sessionStart.current,
    user,
  });

  // Retrieval applies the brief's region and format constraints as HARD GATES
  // before any narrative exists. An unresolvable region fails loudly — it never
  // falls back to global scope.
  async function loadEvidenceFor(categories, regionText, subCategories) {
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

      const reply = await base44.integrations.Core.InvokeLLM({
        prompt: buildArchitectPrompt(transcript, buildEvidenceContext(evidence)),
        model: 'claude_sonnet_4_6',
      });
      const rawText = typeof reply === 'string' ? reply : (reply?.content || '');

      // Parse contract block
      const contractMatch = rawText.match(/<contract>\s*([\s\S]*?)\s*<\/contract>/);
      if (contractMatch) {
        try {
          const parsed = JSON.parse(contractMatch[1].trim());
          setContract(prev => {
            const next = { ...prev };
            for (const [k, v] of Object.entries(parsed)) {
              if (v !== null && v !== 'null' && String(v).trim()) next[k] = v;
            }
            // Re-run the gates whenever the binding constraints change — categories,
            // formats or region text. Evidence is never retrieved without them.
            const bindingChanged =
              JSON.stringify(next.categories) !== JSON.stringify(prev.categories) ||
              JSON.stringify(next.sub_categories) !== JSON.stringify(prev.sub_categories) ||
              next.region !== prev.region;
            if (next.categories && next.region && bindingChanged) {
              loadEvidenceFor(next.categories, next.region, next.sub_categories);
            }
            return next;
          });
        } catch { /* malformed contract — ignore, next turn re-emits */ }
      }

      // Parse slides block
      const slidesMatch = rawText.match(/<slides>\s*([\s\S]*?)\s*<\/slides>/);
      if (slidesMatch) {
        try {
          const parsedSlides = JSON.parse(slidesMatch[1].trim());
          if (Array.isArray(parsedSlides) && parsedSlides.length > 0) setSlides(parsedSlides);
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

  // One rewrite attempt when the deck fails validation — the architect is told
  // exactly which rule each string broke.
  async function requestRewrite(rejections) {
    const log = rejections.slice(0, 10).map(r => `- [${r.rule}] ${r.field}: ${r.why} → "${r.text}"`).join('\n');
    const transcript = messages.map(m => `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.content}`).join('\n\n')
      + `\n\nUser: The deck was rejected by evidence-integrity validation. Rewrite the offending strings and re-emit the COMPLETE deck in a <slides> block. Change nothing else.\n${log}`;
    try {
      const reply = await base44.integrations.Core.InvokeLLM({
        prompt: buildArchitectPrompt(transcript, buildEvidenceContext(evidence)),
        model: 'claude_sonnet_4_6',
      });
      const raw = typeof reply === 'string' ? reply : (reply?.content || '');
      const m = raw.match(/<slides>\s*([\s\S]*?)\s*<\/slides>/);
      if (!m) return null;
      const parsed = JSON.parse(m[1].trim());
      return Array.isArray(parsed) && parsed.length > 0 ? parsed : null;
    } catch {
      return null;
    }
  }

  function updateSlide(index, updated) {
    setSlides(prev => prev.map((s, i) => (i === index ? updated : s)));
  }

  async function saveAsReport() {
    if (!slides || saving) return;
    setSaving(true);
    try {
      const cats = (Array.isArray(contract.categories) ? contract.categories : [contract.categories])
        .filter(c => CANONICAL_CATEGORIES.includes(c));
      const category = cats[0] || 'needs_human_review';
      const scope = resolveRegionScope(contract.region);
      if (!scope.ok) {
        setMessages(prev => [...prev, { role: 'assistant', content: `Cannot save: ${scope.error}` }]);
        setSaving(false);
        return;
      }
      const regionCode = regionLabelFor(scope);

      // Write-time validation. One rewrite attempt, then a loud failure.
      let deck = slides;
      let verdict = validateSlides(deck, category);
      if (!verdict.ok && !rewriteAttempted.current) {
        rewriteAttempted.current = true;
        const rewritten = await requestRewrite(verdict.rejections);
        if (rewritten) {
          deck = rewritten;
          setSlides(rewritten);
          verdict = validateSlides(deck, category);
        }
      }
      if (!verdict.ok) {
        const log = verdict.rejections.slice(0, 8)
          .map(r => `• [${r.rule}] ${r.field}: ${r.why}\n  "${r.text}"`).join('\n');
        setMessages(prev => [...prev, {
          role: 'assistant',
          content: `Nothing was saved — the deck failed evidence-integrity validation ${rewriteAttempted.current ? 'twice' : ''}:\n\n${log}`,
        }]);
        setSaving(false);
        return;
      }
      const title = `[BETA] ${contract.core_hypothesis || contract.objective || 'Architect draft'}`.slice(0, 120);

      // The trends the architect worked from carry the market-intel sources behind
      // the deck — attach them to the project so the evidence chain stays traceable.
      const usedTrends = (evidence?.trends || []).filter(t => cats.includes(t.category));
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

      const disclaimerSlide = {
        slide_number: 0,
        slide_name: 'AI Disclaimer',
        title: 'About this report',
        market_signal: AI_DISCLAIMER_FULL,
      };
      const methodologySlide = buildMethodologySlide({
        gate: evidence?.gate,
        contract,
        exclusions: evidence?.exclusions,
        validatorFlags: verdict.flags,
      });
      const finalSlides = [disclaimerSlide, ...deck.map((s, i) => ({ ...s, slide_number: i + 1 }))];
      if (methodologySlide) finalSlides.push({ ...methodologySlide, slide_number: finalSlides.length });

      // The deck cites products by their exact GNPD Record ID, so the shortlist is
      // built straight from the retrieved evidence — no name guessing.
      const recordIds = extractRecordIds(deck);
      const evidenceById = {};
      for (const p of evidence?.products || []) evidenceById[p.gnpd_record_id] = p;
      const shortlist = recordIds
        .map(id => evidenceById[id])
        .filter(Boolean)
        .map(p => ({
          ...p,
          supporting_trends: usedTrends
            .filter(t => (t.products || []).some(tp => tp.gnpd_record_id === p.gnpd_record_id))
            .map(t => t.trend_name),
        }));
      if (recordIds.length > 0) {
        finalSlides.push({
          slide_number: finalSlides.length,
          slide_name: 'Product Export IDs',
          title: 'GNPD Product Record IDs',
          subtitle: 'All products referenced in this report — paste into Mintel GNPD search',
          market_signal: [...new Set(recordIds)].join(' OR '),
        });
      }

      const report = await base44.entities.Report.create({
        project_id: project.id,
        title,
        category,
        region: regionCode,
        analysis_mode: 'standard',
        generated_by: 'architect',
        slides: finalSlides,
        product_shortlist: shortlist,
        selected_trends: usedTrends.map(t => t.trend_name),
        evidence_gate: evidence?.gate || null,
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

        {messages.filter(m => m.role === 'user').length === 0 && <ScopeIntro />}

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

            {!savedReport && (
              <SimilarReportsPanel query={{
                category: Array.isArray(contract?.categories) ? contract.categories.join(' ') : contract?.categories,
                region: contract?.region,
                objective: contract?.objective || contract?.core_hypothesis,
                audience: contract?.audience,
              }} />
            )}

            {slides && !savedReport && (
              <DeckPreview
                slides={slides}
                onSlideChange={updateSlide}
                onSave={saveAsReport}
                saving={saving}
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