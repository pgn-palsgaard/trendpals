import React from 'react';
import { X } from 'lucide-react';
import { format } from 'date-fns';

function Section({ title, children }) {
  return (
    <div className="mb-6">
      <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2">{title}</h4>
      <div className="text-sm text-slate-700">{children}</div>
    </div>
  );
}

function formatDate(dateStr) {
  if (!dateStr) return 'Date unknown';
  try {
    return format(new Date(dateStr), 'MMM yyyy');
  } catch {
    return dateStr;
  }
}

export default function MegaTrendDetailPanel({ megaTrend, linkedTrends, onClose, onSelectTrend }) {
  if (!megaTrend) return null;

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 bg-black/30 z-40" onClick={onClose} />

      {/* Panel */}
      <div className="fixed inset-y-0 right-0 z-50 w-full md:w-[520px] bg-white shadow-2xl flex flex-col overflow-hidden">
        {/* Header */}
        <div className="px-5 py-4 border-b border-slate-200 flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <h2 className="font-bold text-slate-900 text-xl leading-snug">{megaTrend.mega_trend_name}</h2>
            {megaTrend.short_description && (
              <p className="text-sm text-slate-500 mt-1 leading-snug">{megaTrend.short_description}</p>
            )}
          </div>
          <button onClick={onClose} className="p-1 rounded hover:bg-slate-100 text-slate-500 shrink-0 mt-0.5">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5 py-5">
          {/* Description */}
          {megaTrend.description && (
            <Section title="Overview">
              <div className="leading-relaxed space-y-3 text-slate-700 max-w-prose">
                {megaTrend.description.split('\n\n').map((para, i) => (
                  <p key={i}>{para}</p>
                ))}
              </div>
            </Section>
          )}

          {/* Linked GlobalTrends */}
          {linkedTrends.length > 0 && (
            <Section title={`Linked Trends (${linkedTrends.length})`}>
              <div className="space-y-2">
                {linkedTrends.map(t => (
                  <button
                    key={t.id}
                    onClick={() => onSelectTrend(t)}
                    className="w-full text-left flex items-center gap-2 px-3 py-2 rounded-lg border border-slate-200 bg-slate-50 hover:bg-white hover:shadow-sm transition-all"
                  >
                    <span className="flex-1 text-sm font-medium text-slate-800 truncate">{t.trend_name}</span>
                    <span className="text-xs px-1.5 py-0.5 bg-slate-200 text-slate-600 rounded shrink-0">{t.category}</span>
                    {t.is_active ? (
                      <span className="text-xs px-1.5 py-0.5 bg-green-100 text-green-700 rounded border border-green-200 shrink-0">Active</span>
                    ) : (
                      <span className="text-xs px-1.5 py-0.5 bg-yellow-100 text-yellow-700 rounded border border-yellow-200 shrink-0">Pending</span>
                    )}
                  </button>
                ))}
              </div>
            </Section>
          )}

          {/* Sources */}
          <Section title="Sources">
            {megaTrend.sources?.length > 0 ? (
              <div className="space-y-3">
                {megaTrend.sources.map((src, i) => (
                  <div key={i} className="border border-slate-200 rounded-lg p-3 bg-white">
                    <div className="flex items-start justify-between gap-2 mb-1">
                      <span className="font-semibold text-slate-800 text-sm">{src.publisher}</span>
                      {src.source_type && (
                        <span className="text-xs px-1.5 py-0.5 bg-slate-100 text-slate-500 rounded border border-slate-200 shrink-0 capitalize">
                          {src.source_type.replace(/_/g, ' ')}
                        </span>
                      )}
                    </div>
                    {src.title && (
                      src.url
                        ? <a href={src.url} target="_blank" rel="noopener noreferrer" className="text-sm text-blue-600 hover:underline block mb-1">{src.title}</a>
                        : <p className="text-sm text-slate-700 mb-1">{src.title}</p>
                    )}
                    <p className="text-xs text-slate-400 mb-1">{formatDate(src.date)}</p>
                    {src.key_finding && <p className="text-sm italic text-slate-600">{src.key_finding}</p>}
                    {src.quote && (
                      <blockquote className="mt-2 border-l-2 border-slate-300 pl-3 text-xs text-slate-500 italic">
                        "{src.quote}"
                      </blockquote>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-slate-400 italic text-sm">No sources added yet.</p>
            )}
          </Section>
        </div>

        {/* Footer */}
        <div className="px-5 py-4 border-t border-slate-200">
          <button onClick={onClose} className="text-sm text-slate-500 hover:text-slate-800">Close</button>
        </div>
      </div>
    </>
  );
}