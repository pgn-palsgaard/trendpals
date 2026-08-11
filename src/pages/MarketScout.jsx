import React, { useState, useEffect, useRef } from 'react';
import { base44 } from '@/api/base44Client';
import { Globe, Send, Loader2, Info } from 'lucide-react';
import MessageBubble from '@/components/marketscout/MessageBubble';
import ScoutSidebar from '@/components/marketscout/ScoutSidebar';

const AGENT = 'market_scout';

const STARTERS = [
  'Hvad er nyt i plant-based de seneste 3 måneder?',
  'Kør en dyb ransagning på ice cream — hvilke vinkler mangler vi?',
  'Hvad rører sig i bakery i ASPAC lige nu?',
  'Er der nye claims eller regler på vej i dairy?',
];

export default function MarketScout() {
  const [conversations, setConversations] = useState([]);
  const [conversation, setConversation] = useState(null);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [loadingConv, setLoadingConv] = useState(false);
  const endRef = useRef(null);

  useEffect(() => {
    base44.agents.listConversations({ agent_name: AGENT })
      .then(list => setConversations(Array.isArray(list) ? list : (list?.conversations || [])))
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!conversation?.id) return;
    const unsubscribe = base44.agents.subscribeToConversation(conversation.id, (data) => {
      setMessages(data.messages || []);
    });
    return () => unsubscribe();
  }, [conversation?.id]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, sending]);

  const agentBusy = messages.length > 0
    && messages[messages.length - 1].role === 'user';

  async function openConversation(id) {
    setLoadingConv(true);
    const conv = await base44.agents.getConversation(id);
    setConversation(conv);
    setMessages(conv?.messages || []);
    setLoadingConv(false);
  }

  function startNew() {
    setConversation(null);
    setMessages([]);
    setInput('');
  }

  async function send(text) {
    const content = (text ?? input).trim();
    if (!content || sending) return;
    setInput('');
    setSending(true);
    try {
      let conv = conversation;
      if (!conv) {
        conv = await base44.agents.createConversation({
          agent_name: AGENT,
          metadata: { name: content.slice(0, 70), description: 'Market Scout web sweep' },
        });
        setConversation(conv);
        setConversations(prev => [conv, ...prev]);
      }
      setMessages(prev => [...prev, { role: 'user', content }]);
      await base44.agents.addMessage(conv, { role: 'user', content });
    } catch (e) {
      setMessages(prev => [...prev, { role: 'assistant', content: `Der opstod en fejl: ${e.message}` }]);
    }
    setSending(false);
  }

  return (
    <div className="page-shell">
      <div className="page-inner">
        <div className="page-header">
          <div className="flex items-center gap-2">
            <Globe className="w-6 h-6" style={{ color: '#1D428A' }} />
            <h1 className="page-title">Market Scout</h1>
          </div>
          <p className="page-subtitle">
            Dyb ransagning af det åbne web — multi-vinkel søgning, region-rotation, citation hopping og
            krydstjek mod trend-biblioteket. Fund gemmes altid som forslag til manuel godkendelse.
          </p>
        </div>

        <div className="flex flex-col gap-5 lg:flex-row">
          <div className="lg:w-64 lg:shrink-0" style={{ minHeight: 200 }}>
            <ScoutSidebar
              conversations={conversations}
              activeId={conversation?.id}
              onSelect={openConversation}
              onNew={startNew}
            />
          </div>

          <div className="min-w-0 flex-1">
            <div className="pal-card flex flex-col" style={{ height: 'calc(100vh - 260px)', minHeight: 480 }}>
              <div className="flex-1 space-y-4 overflow-y-auto p-5">
                {loadingConv && (
                  <div className="flex justify-center py-8">
                    <Loader2 className="w-5 h-5 animate-spin" style={{ color: '#1D428A' }} />
                  </div>
                )}

                {!loadingConv && messages.length === 0 && (
                  <div className="mx-auto max-w-xl py-8 text-center">
                    <Globe className="mx-auto mb-3 w-10 h-10" style={{ color: '#1D428A' }} />
                    <h2 className="font-heading text-lg font-semibold text-foreground">Hvad skal jeg lede efter?</h2>
                    <p className="mt-1 text-sm text-muted-foreground">
                      En fuld ransagning tager 30-60 sekunder — den kører flere søgerunder pr. spørgsmål.
                    </p>
                    <div className="mt-5 grid gap-2 sm:grid-cols-2">
                      {STARTERS.map(s => (
                        <button
                          key={s}
                          onClick={() => send(s)}
                          className="rounded-lg border border-border bg-card px-3 py-2.5 text-left text-xs leading-snug text-foreground transition-shadow hover:shadow-sm"
                        >
                          {s}
                        </button>
                      ))}
                    </div>
                    <div className="mt-6 flex items-start gap-2 rounded-lg bg-muted/60 p-3 text-left text-xs text-muted-foreground">
                      <Info className="mt-0.5 w-3.5 h-3.5 shrink-0" />
                      <span>
                        Mintel- og GNPD-data ligger bag betalingsmur og kan ikke nås fra web. Fund herfra er
                        supplerende signaler — de erstatter ikke den strukturerede evidens.
                      </span>
                    </div>
                  </div>
                )}

                {messages.map((m, i) => <MessageBubble key={i} message={m} />)}

                {(sending || agentBusy) && (
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Loader2 className="w-3.5 h-3.5 animate-spin" style={{ color: '#1D428A' }} />
                    Ransager web — flere søgerunder i gang, det kan tage op til et minut.
                  </div>
                )}
                <div ref={endRef} />
              </div>

              <div className="border-t border-border p-3">
                <div className="flex items-end gap-2">
                  <textarea
                    value={input}
                    onChange={e => setInput(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); }
                    }}
                    rows={2}
                    placeholder="Spørg om en kategori, en region eller et konkret signal…"
                    className="flex-1 resize-none rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2"
                    style={{ '--tw-ring-color': '#1D428A' }}
                  />
                  <button
                    onClick={() => send()}
                    disabled={!input.trim() || sending}
                    className="rounded-lg px-4 py-2.5 text-sm font-semibold text-white transition-opacity disabled:opacity-40"
                    style={{ background: '#1D428A' }}
                  >
                    <Send className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}