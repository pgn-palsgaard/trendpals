import React, { useState, useRef } from 'react';
import { base44 } from '@/api/base44Client';
import { Link } from 'react-router-dom';
import { FlaskConical, CheckCircle2 } from 'lucide-react';
import ArchitectChat from '@/components/briefbeta/ArchitectChat';
import ContractPanel from '@/components/briefbeta/ContractPanel';
import SimilarReportsPanel from '@/components/reports/SimilarReportsPanel';
import DeckPreview from '@/components/briefbeta/DeckPreview';
import GammaExportPanel from '@/components/briefbeta/GammaExportPanel';
import ClaudePptxPanel from '@/components/briefbeta/ClaudePptxPanel';
import { buildArchitectPrompt, CANONICAL_CATEGORIES } from '@/components/briefbeta/architectPrompt';
import { buildEvidenceContext, extractRecordIds } from '@/components/briefbeta/evidenceContext';
import { AI_DISCLAIMER_FULL } from '@/lib/aiDisclaimer';
import { useAuth } from '@/lib/AuthContext';
import useArchitectSession from '@/hooks/useArchitectSession';

const OPENER = {
  role: 'assistant',
  content: "I'm the Report Architect (BETA). Tell me what report you need — paste an email, a meeting note, or just describe it. I'll structure the brief with you, then build the full slide deck for your review before anything is saved.",
};

const REGION_CODES = ['ASPAC', 'AMERICAS', 'EMEC', 'IMEA', 'Global'];

function toRegionCode(raw) {
  const upper = String(raw || '').toUpperCase();
  return REGION_CODES.find(r => upper.includes(r)) || 'Global';
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

  // Retrieval works exactly like the manual workflow: verified trends first, then
  // the Source records behind them and the real GNPD products that support them.
  async function loadEvidenceFor(categories, region) {
    const valid = (Array.isArray(categories) ? categories : [categories])
      .filter(c => CANONICAL_CATEGORIES.includes(c));
    if (valid.length === 0) return null;
    try {
      const res = await base44.functions.invoke('getArchitectEvidence', {
        categories: valid,
        region: toRegionCode(region),
      });
      const data = res?.data;
      if (!data?.trends) return null;
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
            // Lazy-load trends + their sources and GNPD evidence once the categories resolve
            if (next.categories && JSON.stringify(next.categories) !== JSON.stringify(prev.categories)) {
              loadEvidenceFor(next.categories, next.region);
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
      const regionCode = toRegionCode(contract.region);
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
      const finalSlides = [disclaimerSlide, ...slides.map((s, i) => ({ ...s, slide_number: i + 1 }))];

      // The deck cites products by their exact GNPD Record ID, so the shortlist is
      // built straight from the retrieved evidence — no name guessing.
      const recordIds = extractRecordIds(slides);
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