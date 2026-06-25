import React, { useRef, useEffect } from 'react';

/**
 * Left-column conversation panel for step 2.
 * Pure presentational — all state lives in the parent SubmitBrief page.
 */
export default function ChatPanel({
  subtext, messages, loading, inputText, setInputText,
  onSend, isFirstMessage, placeholder, setPlaceholder,
}) {
  const endRef = useRef(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  const handleKey = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); onSend(); }
  };

  return (
    <div className="bg-white rounded-xl shadow-sm border border-stone-200 p-5 flex flex-col">
      <div className="mb-4">
        <p className="text-sm font-semibold text-stone-800">Market Intelligence Assistant</p>
        <p className="text-xs text-stone-500 mt-1 leading-relaxed">{subtext}</p>
      </div>

      {/* Chat thread */}
      <div className="flex-1 overflow-y-auto space-y-3 mb-4 pr-1" style={{ minHeight: 300, maxHeight: 420 }}>
        {messages.map((m, i) => (
          <div
            key={i}
            className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}
          >
            <div
              className={
                m.role === 'user'
                  ? 'max-w-[85%] bg-[#1D428A] text-white rounded-2xl rounded-tr-sm px-4 py-2.5 text-sm leading-relaxed'
                  : 'max-w-[85%] bg-stone-100 text-stone-800 rounded-2xl rounded-tl-sm px-4 py-2.5 text-sm leading-relaxed'
              }
            >
              {m.content.split('\n').map((line, j, arr) => (
                <span key={j}>{line}{j < arr.length - 1 && <br />}</span>
              ))}
            </div>
          </div>
        ))}
        {loading && (
          <div className="flex justify-start">
            <div className="bg-stone-100 text-stone-400 rounded-2xl rounded-tl-sm px-4 py-2.5 text-sm">
              Thinking…
            </div>
          </div>
        )}
        <div ref={endRef} />
      </div>

      {/* Input */}
      <div>
        <textarea
          value={inputText}
          onChange={e => setInputText(e.target.value)}
          onKeyDown={handleKey}
          rows={4}
          placeholder={placeholder}
          className="w-full resize-none rounded-lg border border-stone-200 px-3 py-2.5 text-sm text-stone-800 focus:outline-none focus:ring-2 focus:ring-[#1D428A]/30 focus:border-[#1D428A]/50"
          style={{ background: '#ffffff' }}
        />

        <div className="flex items-center justify-between gap-3 mt-3">
          {!inputText.trim() && (
            <span className="text-xs text-stone-400">Add a few words to continue</span>
          )}
          <button
            onClick={onSend}
            disabled={loading || !inputText.trim()}
            className="ml-auto rounded-lg px-5 py-2 text-sm font-semibold text-white transition-colors disabled:cursor-not-allowed"
            style={{ background: loading || !inputText.trim() ? '#CBD5E1' : '#1D428A' }}
          >
            {isFirstMessage ? 'Analyse request' : 'Send reply'}
          </button>
        </div>
      </div>
    </div>
  );
}