import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Briefcase, BarChart3, Search, FlaskConical, MessageCircle, CheckCircle2 } from 'lucide-react';
import Stepper from '@/components/submitbrief/Stepper';
import ChatPanel from '@/components/submitbrief/ChatPanel';
import BriefReadiness from '@/components/submitbrief/BriefReadiness';
import TrendRelevanceChecker from '@/components/submitbrief/TrendRelevanceChecker';
import ScopeIntro from '@/components/submitbrief/ScopeIntro';
import SimilarReportsPanel from '@/components/reports/SimilarReportsPanel';

const JTBD_OPTIONS = [
  { id: 'prepare_customer_meeting', icon: Briefcase, label: 'Prepare a customer meeting', desc: 'Get insight for an upcoming customer visit.' },
  { id: 'build_trend_deck', icon: BarChart3, label: 'Build a trend deck', desc: 'Shape a trend overview for your team or customer.' },
  { id: 'understand_market', icon: Search, label: 'Understand a market', desc: "Explore what's happening in a category or region." },
  { id: 'support_innovation_pipeline', icon: FlaskConical, label: 'Support innovation', desc: 'Find evidence to back an NPD direction.' },
  { id: 'other', icon: MessageCircle, label: 'Something else', desc: 'Describe what you need — the assistant will help.' },
];

const SUBTEXTS = {
  prepare_customer_meeting: "Paste the meeting email, invite, or any notes you have. I'll identify what's clear and ask only for what's missing.",
  build_trend_deck: 'Tell me the audience, category, region, and purpose if you know them. You can also paste a rough email or meeting note.',
  understand_market: "Describe what you want to understand, and I'll help narrow the scope.",
  support_innovation_pipeline: 'Describe the NPD direction or paste any relevant context.',
  other: 'Tell me what you need — write freely or paste an email.',
};

const OPENERS = {
  prepare_customer_meeting: "Let's prepare for your customer meeting. Paste the email or invite, or just tell me who you're meeting and what they make.",
  build_trend_deck: "Let's shape your trend deck. Tell me the audience, category, and region — or paste any rough context you have.",
  understand_market: "Let's explore the market. Which category or region do you want to understand, and what's the question behind it?",
  support_innovation_pipeline: "Let's back your innovation direction. Describe the NPD idea or application you're working on.",
  other: "Tell me what you need — write freely or paste an email, and I'll structure it into a brief.",
};

const DEFAULT_PLACEHOLDER = 'Paste an email, meeting note, or describe what you need. You can write messy — the assistant will structure it.';

const SYSTEM_PROMPT = (jtbdLabel) => `You are the Market Intelligence Assistant for Palsgaard A/S. Your job is to help a commercial team member turn a rough request into a structured market intelligence brief.

The user has selected this job-to-be-done: ${jtbdLabel}

Your behaviour rules:
1. After the user's first message, always start by showing what you understood. Use this format:
   "I understand this as:
   • [bullet: what you inferred]
   • [bullet: what you inferred]
   Then ask ONE specific follow-up question for the most important missing field."

2. Ask only ONE question per message. Never list multiple questions at once.

3. Accept: "I don't know", "skip this", "use your best judgement", "not relevant". If the user says any of these, note it and move on.

4. After each exchange, return a JSON block at the END of your message (after your conversational text) in this exact format — do not skip any key:
   <brief_fields>
   {
     "customer_audience": "extracted value or null",
     "region": "extracted value or null",
     "category": "extracted value or null",
     "objective": "extracted value or null",
     "deadline": "extracted value or null"
   }
   </brief_fields>

5. Keep messages short and focused. Max 5 sentences of conversation text.
6. This tool is strictly OUTSIDE-IN. You have NO Palsgaard product knowledge and no formulation knowledge. Never mention Palsgaard products, competitor product names, E-numbers, dosages or recipes, and never imply the brief will answer a product or formulation question.
6b. If the user's context names a specific product (theirs, ours or a competitor's), do not treat it as the subject. Acknowledge it once in one short line — "Noted: [name] is the commercial context; this brief covers the market around it, not the product itself." — then reframe the brief around the customer's category, application, region and business objective, and continue asking your one next question.
7. Do not ask for information already provided.
8. When all fields are filled or skipped, end your message with: "I have everything I need. Click 'Continue to review' to see the full brief."`;

const REGION_MAP = {
  aspac: 'ASPAC', asia: 'ASPAC', 'asia pacific': 'ASPAC', apac: 'ASPAC', china: 'ASPAC', japan: 'ASPAC', india: 'ASPAC', 'southeast asia': 'ASPAC',
  americas: 'AMERICAS', america: 'AMERICAS', usa: 'AMERICAS', 'us': 'AMERICAS', 'united states': 'AMERICAS', 'north america': 'AMERICAS', latam: 'AMERICAS', 'latin america': 'AMERICAS', brazil: 'AMERICAS',
  emec: 'EMEC', europe: 'EMEC', eu: 'EMEC', emea: 'EMEC', uk: 'EMEC', germany: 'EMEC', france: 'EMEC', nordic: 'EMEC',
  imea: 'IMEA', 'middle east': 'IMEA', africa: 'IMEA', mena: 'IMEA',
  global: 'Global', worldwide: 'Global', international: 'Global',
};

function mapRegion(raw) {
  if (!raw) return 'Global';
  const lower = String(raw).toLowerCase();
  for (const [key, val] of Object.entries(REGION_MAP)) {
    if (lower.includes(key)) return val;
  }
  return 'Global';
}

function parseDeadline(raw) {
  if (!raw) return null;
  const d = new Date(raw);
  if (!isNaN(d.getTime())) return d.toISOString().split('T')[0];
  return null;
}

export default function SubmitBrief() {
  const [step, setStep] = useState(0); // 0 = jtbd, 1 = chat, 2 = trend check, 3 = review
  const [selectedTrendIds, setSelectedTrendIds] = useState([]);
  const [selectedTrendNames, setSelectedTrendNames] = useState([]);
  const [jtbd, setJtbd] = useState(null);
  const [messages, setMessages] = useState([]);
  const [conversationLog, setConversationLog] = useState([]);
  const [fields, setFields] = useState({}); // extracted brief_fields
  const [inputText, setInputText] = useState('');
  const [placeholder, setPlaceholder] = useState(DEFAULT_PLACEHOLDER);
  const [loading, setLoading] = useState(false);
  const [requesterName, setRequesterName] = useState('');
  const [requesterEmail, setRequesterEmail] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const [nameError, setNameError] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const jtbdLabel = JTBD_OPTIONS.find(o => o.id === jtbd)?.label || '';
  const isFirstMessage = messages.filter(m => m.role === 'user').length === 0;

  function selectJtbd(id) {
    setJtbd(id);
    const opener = { role: 'assistant', content: OPENERS[id], timestamp: new Date().toISOString() };
    setMessages([opener]);
    setConversationLog([opener]);
    setFields({});
    setStep(1);
  }

  async function sendMessage() {
    if (!inputText.trim() || loading) return;
    const userMsg = { role: 'user', content: inputText.trim(), timestamp: new Date().toISOString() };
    const newMessages = [...messages, userMsg];
    setMessages(newMessages);
    setConversationLog(prev => [...prev, userMsg]);
    setInputText('');
    setPlaceholder(DEFAULT_PLACEHOLDER);
    setLoading(true);

    try {
      const transcript = newMessages
        .map(m => `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.content}`)
        .join('\n\n');

      const reply = await base44.integrations.Core.InvokeLLM({
        prompt: `${SYSTEM_PROMPT(jtbdLabel)}\n\n--- Conversation so far ---\n${transcript}\n\n--- Now write your next assistant message, following all behaviour rules, and end with the <brief_fields> JSON block. ---`,
        model: 'claude_sonnet_4_6',
      });

      const rawText = typeof reply === 'string' ? reply : (reply?.content || '');

      // Parse <brief_fields> JSON block, then strip it from the visible message
      let extracted = null;
      const match = rawText.match(/<brief_fields>\s*([\s\S]*?)\s*<\/brief_fields>/);
      if (match) {
        try { extracted = JSON.parse(match[1].trim()); } catch { extracted = null; }
      }
      const visible = rawText.replace(/<brief_fields>[\s\S]*?<\/brief_fields>/, '').trim();

      if (extracted) {
        setFields(prev => {
          const next = { ...prev };
          for (const key of ['customer_audience', 'region', 'category', 'objective', 'deadline']) {
            const v = extracted[key];
            if (v && v !== 'null' && String(v).trim()) next[key] = String(v).trim();
          }
          return next;
        });
      }

      const assistantMsg = { role: 'assistant', content: visible || 'Got it.', timestamp: new Date().toISOString() };
      setMessages(prev => [...prev, assistantMsg]);
      setConversationLog(prev => [...prev, assistantMsg]);
    } catch {
      const errMsg = { role: 'assistant', content: 'Something went wrong reaching the assistant. Please try again.', timestamp: new Date().toISOString() };
      setMessages(prev => [...prev, errMsg]);
    }
    setLoading(false);
  }

  async function submitBrief() {
    if (!requesterName.trim()) { setNameError(true); return; }
    setNameError(false);
    setSubmitError('');
    setSubmitting(true);
    try {
      const lastAssistant = [...conversationLog].reverse().find(m => m.role === 'assistant');
      const summary = lastAssistant?.content?.replace(/I have everything I need\.[\s\S]*$/, '').trim() || '';

      await base44.entities.ReportRequest.create({
        requester_name: requesterName.trim(),
        ...(requesterEmail.trim() ? { requester_email: requesterEmail.trim() } : {}),
        jtbd,
        account: fields.customer_audience || '',
        region: mapRegion(fields.region),
        categories: fields.category || '',
        purpose: fields.objective || '',
        deadline: parseDeadline(fields.deadline),
        notes: summary,
        ...(selectedTrendIds.length ? { selected_trend_ids: selectedTrendIds } : {}),
        ...(selectedTrendNames.length ? { selected_trend_names: selectedTrendNames } : {}),
        conversation_log: conversationLog,
        status: 'new',
        submitted_at: new Date().toISOString(),
      });
      setSubmitted(true);
    } catch (e) {
      setSubmitError(e.message || 'Submission failed — please try again.');
    }
    setSubmitting(false);
  }

  function resetAll() {
    setStep(0); setJtbd(null); setMessages([]); setConversationLog([]);
    setFields({}); setInputText(''); setPlaceholder(DEFAULT_PLACEHOLDER);
    setRequesterName(''); setRequesterEmail(''); setSubmitError(''); setNameError(false);
    setSelectedTrendIds([]); setSelectedTrendNames([]);
    setSubmitted(false);
  }

  const reviewRows = [
    ['Request type', jtbdLabel],
    ['Customer / audience', fields.customer_audience],
    ['Market or region', fields.region],
    ['Category / application', fields.category],
    ['Business objective', fields.objective],
    ['Deadline', fields.deadline],
  ];

  return (
    <div className="min-h-screen" style={{ background: '#F9F8F6' }}>
      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-8">

        {/* Header */}
        <div className="text-center mb-8">
          <p className="text-xs uppercase tracking-widest text-stone-400 mb-1">Market Intelligence</p>
          <h1 className="text-2xl font-semibold text-[#1D428A]">Create a market intelligence brief</h1>
        </div>

        {step === 0 && !submitted && <ScopeIntro />}

        {!submitted && <Stepper currentStep={step} />}

        {/* ── Step 1: Brief type ── */}
        {step === 0 && !submitted && (
          <div className="max-w-3xl mx-auto">
            <h2 className="text-lg font-semibold text-stone-800 text-center">Select what you need help with.</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-6">
              {JTBD_OPTIONS.map(opt => {
                const Icon = opt.icon;
                const selected = jtbd === opt.id;
                return (
                  <button
                    key={opt.id}
                    onClick={() => selectJtbd(opt.id)}
                    className={`text-left rounded-xl p-4 border transition cursor-pointer ${
                      selected ? 'border-[#1D428A] bg-blue-50' : 'border-stone-200 bg-white hover:border-[#1D428A] hover:bg-blue-50'
                    }`}
                  >
                    <Icon className="w-6 h-6 text-[#1D428A] mb-2" />
                    <p className="text-sm font-semibold text-stone-800">{opt.label}</p>
                    <p className="text-xs text-stone-500 mt-1 leading-relaxed">{opt.desc}</p>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* ── Step 2: Add context ── */}
        {step === 1 && !submitted && (
          <div className="flex flex-col lg:flex-row gap-5">
            <div className="lg:w-3/5">
              <ChatPanel
                subtext={SUBTEXTS[jtbd]}
                messages={messages}
                loading={loading}
                inputText={inputText}
                setInputText={setInputText}
                onSend={sendMessage}
                isFirstMessage={isFirstMessage}
                placeholder={placeholder}
                setPlaceholder={setPlaceholder}
              />
            </div>
            <div className="lg:w-2/5">
              <BriefReadiness
                fields={fields}
                jtbdLabel={jtbdLabel}
                onChangeType={() => setStep(0)}
                onContinue={() => setStep(3)}
              />
              <div className="mt-4">
                <SimilarReportsPanel query={{
                  category: fields.category,
                  region: fields.region,
                  objective: fields.objective,
                  audience: fields.customer_audience,
                }} />
              </div>
            </div>
          </div>
        )}

        {/* ── Step 3: Trend relevance check — TEMPORARILY DISABLED (industry/trend matching needs refinement). Re-enable by restoring onContinue={() => setStep(2)} above and the Stepper "Focus trends" step. ──
        {step === 2 && !submitted && (
          <TrendRelevanceChecker
            fields={fields}
            onBack={() => setStep(1)}
            onSkip={() => { setSelectedTrendIds([]); setSelectedTrendNames([]); setStep(3); }}
            onConfirm={({ ids, names }) => { setSelectedTrendIds(ids); setSelectedTrendNames(names); setStep(3); }}
          />
        )}
        */}

        {/* ── Step 4: Review brief ── */}
        {step === 3 && !submitted && (
          <div className="max-w-2xl mx-auto">
            <div className="bg-white rounded-xl shadow-sm border border-stone-200 p-6">
              <p className="text-sm font-semibold text-stone-800 mb-4">Your market intelligence brief</p>
              <div className="space-y-3">
                {reviewRows.map(([label, value]) => (
                  <div key={label} className="flex gap-3 text-sm">
                    <span className="text-stone-400 w-40 shrink-0">{label}</span>
                    <span className="text-stone-800 font-medium">{value || 'Not specified'}</span>
                  </div>
                ))}
                <div className="flex gap-3 text-sm">
                  <span className="text-stone-400 w-40 shrink-0">Focus trends</span>
                  {selectedTrendNames.length > 0 ? (
                    <span className="flex flex-wrap gap-1.5">
                      {selectedTrendNames.map(name => (
                        <span key={name} className="inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium bg-blue-50 text-[#1D428A]">
                          {name}
                        </span>
                      ))}
                    </span>
                  ) : (
                    <span className="text-stone-800 font-medium">None selected</span>
                  )}
                </div>
              </div>
            </div>

            {/* Requester info */}
            <div className="bg-white rounded-xl shadow-sm border border-stone-200 p-6 mt-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-stone-600 mb-1">Your name <span className="text-red-500">*</span></label>
                  <input
                    type="text"
                    value={requesterName}
                    onChange={e => { setRequesterName(e.target.value); if (e.target.value.trim()) setNameError(false); }}
                    className={`w-full rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1D428A]/30 ${nameError ? 'border-red-400' : 'border-stone-200'}`}
                    style={{ background: '#ffffff' }}
                  />
                  {nameError && <p className="text-xs text-red-500 mt-1">Your name is required.</p>}
                </div>
                <div>
                  <label className="block text-xs font-medium text-stone-600 mb-1">Your email</label>
                  <input
                    type="email"
                    value={requesterEmail}
                    onChange={e => setRequesterEmail(e.target.value)}
                    className="w-full rounded-lg border border-stone-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1D428A]/30"
                    style={{ background: '#ffffff' }}
                  />
                </div>
              </div>

              {submitError && (
                <p className="text-sm text-red-500 mt-3">{submitError}</p>
              )}

              <div className="flex items-center justify-between mt-5">
                <button onClick={() => setStep(1)} className="text-sm text-stone-500 hover:text-stone-800">
                  ← Back
                </button>
                <button
                  onClick={submitBrief}
                  disabled={submitting}
                  className="rounded-lg px-5 py-2.5 text-sm font-semibold text-white transition-colors disabled:opacity-60"
                  style={{ background: '#1D428A' }}
                  onMouseEnter={e => { if (!submitting) e.currentTarget.style.background = '#1E3A8A'; }}
                  onMouseLeave={e => { if (!submitting) e.currentTarget.style.background = '#1D428A'; }}
                >
                  {submitting ? 'Submitting…' : 'Submit to Market Intelligence'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ── Success ── */}
        {submitted && (
          <div className="max-w-xl mx-auto text-center bg-white rounded-xl shadow-sm border border-stone-200 p-10 mt-4">
            <CheckCircle2 className="w-12 h-12 text-green-600 mx-auto mb-4" />
            <h2 className="text-xl font-semibold text-stone-800">Brief submitted</h2>
            <p className="text-sm text-stone-500 mt-2">
              The Market Intelligence team will review your request and be in touch.
            </p>
            <button
              onClick={resetAll}
              className="mt-6 rounded-lg px-5 py-2.5 text-sm font-semibold text-white"
              style={{ background: '#1D428A' }}
            >
              Submit another brief
            </button>
          </div>
        )}

        <p className="text-center text-xs text-stone-400 mt-10">
          Palsgaard A/S · Market Intelligence · Internal use only
        </p>
      </div>
    </div>
  );
}