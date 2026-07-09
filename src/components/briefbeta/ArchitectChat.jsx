import React, { useRef, useEffect } from 'react';
import { ThumbsUp, ThumbsDown } from 'lucide-react';
import ReactMarkdown from 'react-markdown';

export default function ArchitectChat({
  messages, loading, inputText, setInputText, onSend, onFeedback, feedbackGiven,
}) {
  const endRef = useRef(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  const handleKey = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); onSend(); }
  };

  return (
    <div className="pal-card p-5 flex flex-col">
      <div className="flex-1 overflow-y-auto space-y-3 mb-4 pr-1" style={{ minHeight: 360, maxHeight: 480 }}>
        {messages.map((m, i) => (
          <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div className={m.role === 'user'
              ? 'max-w-[85%] bg-pal-blue text-white rounded-2xl rounded-tr-sm px-4 py-2.5 text-sm leading-relaxed'
              : 'max-w-[85%] bg-muted text-foreground rounded-2xl rounded-tl-sm px-4 py-2.5 text-sm leading-relaxed'}>
              {m.role === 'assistant'
                ? <ReactMarkdown className="prose prose-sm max-w-none [&>p]:my-1">{m.content}</ReactMarkdown>
                : m.content.split('\n').map((line, j, arr) => (
                    <span key={j}>{line}{j < arr.length - 1 && <br />}</span>
                  ))}
              {m.role === 'assistant' && (
                <div className="flex gap-1 mt-1.5 -mb-0.5">
                  {['up', 'down'].map(v => {
                    const given = feedbackGiven[i];
                    const Icon = v === 'up' ? ThumbsUp : ThumbsDown;
                    return (
                      <button
                        key={v}
                        onClick={() => !given && onFeedback(i, v)}
                        disabled={!!given}
                        className="p-1 rounded hover:bg-background/60 disabled:cursor-default"
                        title={v === 'up' ? 'Good response' : 'Poor response'}
                      >
                        <Icon
                          className="w-3.5 h-3.5"
                          style={{ color: given === v ? (v === 'up' ? '#6F8263' : '#C15338') : '#9CA3AF' }}
                        />
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        ))}
        {loading && (
          <div className="flex justify-start">
            <div className="bg-muted text-muted-foreground rounded-2xl rounded-tl-sm px-4 py-2.5 text-sm">
              Thinking…
            </div>
          </div>
        )}
        <div ref={endRef} />
      </div>

      <div>
        <textarea
          value={inputText}
          onChange={e => setInputText(e.target.value)}
          onKeyDown={handleKey}
          rows={3}
          placeholder="Describe the report you need — or answer the architect's question."
          className="w-full resize-none rounded-lg border border-border bg-card px-3 py-2.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring/30"
        />
        <div className="flex justify-end mt-2">
          <button
            onClick={onSend}
            disabled={loading || !inputText.trim()}
            className="rounded-lg px-5 py-2 text-sm font-semibold text-white transition-colors disabled:cursor-not-allowed"
            style={{ background: loading || !inputText.trim() ? '#CBD5E1' : '#1D428A' }}
          >
            Send
          </button>
        </div>
      </div>
    </div>
  );
}