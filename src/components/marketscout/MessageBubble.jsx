import React, { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import { ChevronDown, ChevronRight, Loader2, CheckCircle2, AlertTriangle, Globe } from 'lucide-react';

const RUNNING = ['pending', 'running', 'in_progress'];

function parseResults(raw) {
  if (!raw) return null;
  if (typeof raw === 'object') return raw;
  try { return JSON.parse(raw); } catch { return raw; }
}

function isFailed(toolCall, parsed) {
  if (['failed', 'error'].includes(toolCall.status)) return true;
  if (parsed && typeof parsed === 'object' && parsed.success === false) return true;
  if (typeof parsed === 'string' && /error|failed/i.test(parsed)) return true;
  return false;
}

function prettyName(name) {
  return String(name || 'tool').replace(/_/g, ' ').replace(/([a-z])([A-Z])/g, '$1 $2');
}

function ToolCallRow({ toolCall }) {
  const [expanded, setExpanded] = useState(false);
  const parsed = parseResults(toolCall.results);
  const failed = isFailed(toolCall, parsed);
  const running = RUNNING.includes(toolCall.status);
  const proj = toolCall.display_projection || {};
  const hidden = proj.hide_details && proj.details_redacted;

  const label = failed
    ? (proj.error_label || `${prettyName(toolCall.name)} failed`)
    : running
      ? (proj.active_label || `Searching the web — ${prettyName(toolCall.name)}`)
      : (proj.label || prettyName(toolCall.name));

  const Icon = failed ? AlertTriangle : running ? Loader2 : CheckCircle2;
  const color = failed ? '#C15338' : running ? '#1D428A' : '#6F8263';

  return (
    <div className="mt-2 text-xs">
      <button
        onClick={() => !hidden && setExpanded(!expanded)}
        className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 transition-colors"
        style={{ background: 'rgba(29,66,138,0.05)', color: '#1D2B47', cursor: hidden ? 'default' : 'pointer' }}
      >
        <Icon className={`w-3.5 h-3.5 ${running ? 'animate-spin' : ''}`} style={{ color }} />
        <span className="font-medium capitalize">{label}</span>
        {!hidden && (expanded ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />)}
      </button>

      {expanded && !hidden && (
        <div className="mt-1.5 space-y-2 rounded-lg border border-border bg-muted/40 p-2.5">
          {toolCall.arguments_string && (
            <div>
              <p className="section-label mb-1">Parameters</p>
              <pre className="whitespace-pre-wrap break-words text-[11px] text-muted-foreground">
                {(() => { try { return JSON.stringify(JSON.parse(toolCall.arguments_string), null, 2); } catch { return toolCall.arguments_string; } })()}
              </pre>
            </div>
          )}
          {parsed != null && (
            <div>
              <p className="section-label mb-1">Result</p>
              <pre className="max-h-64 overflow-auto whitespace-pre-wrap break-words text-[11px] text-muted-foreground">
                {typeof parsed === 'string' ? parsed : JSON.stringify(parsed, null, 2)}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function MessageBubble({ message }) {
  const isUser = message.role === 'user';

  if (isUser) {
    return (
      <div className="flex justify-end">
        <div className="max-w-[85%] rounded-2xl rounded-br-md px-4 py-2.5" style={{ background: '#1D428A' }}>
          <p className="whitespace-pre-wrap text-sm text-white">{message.content}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex justify-start">
      <div className="max-w-[92%]">
        <div className="mb-1 flex items-center gap-1.5">
          <Globe className="w-3.5 h-3.5" style={{ color: '#1D428A' }} />
          <span className="section-label">Market Scout</span>
        </div>
        <div className="rounded-2xl rounded-bl-md border border-border bg-card px-4 py-3 shadow-sm">
          {message.content && (
            <div className="prose prose-sm max-w-none text-sm text-foreground prose-headings:font-heading prose-a:text-[#1D428A]">
              <ReactMarkdown>{message.content}</ReactMarkdown>
            </div>
          )}
          {(message.tool_calls || []).map((tc, i) => <ToolCallRow key={i} toolCall={tc} />)}
        </div>
      </div>
    </div>
  );
}