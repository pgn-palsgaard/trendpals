import React from 'react';
import ReactMarkdown from 'react-markdown';
import { format } from 'date-fns';

export default function TranscriptView({ messages }) {
  if (!messages?.length) {
    return <p className="text-sm text-muted-foreground">No messages stored for this session.</p>;
  }

  return (
    <div className="space-y-3">
      {messages.map((m, i) => (
        <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
          <div className="max-w-[85%]">
            <div className={m.role === 'user'
              ? 'bg-pal-blue text-white rounded-2xl rounded-tr-sm px-4 py-2.5 text-sm leading-relaxed'
              : 'bg-muted text-foreground rounded-2xl rounded-tl-sm px-4 py-2.5 text-sm leading-relaxed'}>
              {m.role === 'assistant'
                ? <ReactMarkdown className="prose prose-sm max-w-none [&>p]:my-1">{m.content}</ReactMarkdown>
                : m.content.split('\n').map((line, j, arr) => (
                    <span key={j}>{line}{j < arr.length - 1 && <br />}</span>
                  ))}
            </div>
            {m.timestamp && (
              <p className={`text-[11px] text-muted-foreground mt-1 ${m.role === 'user' ? 'text-right' : ''}`}>
                {format(new Date(m.timestamp), 'd MMM HH:mm')}
              </p>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}