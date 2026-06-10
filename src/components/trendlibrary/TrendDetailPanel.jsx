import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { X, CheckCircle, XCircle, Pencil, Trash2 } from 'lucide-react';
import ExpertExamplesSection from './ExpertExamplesSection';

const CAPABILITY_LABELS = {
  sustainability: 'Sustainability',
  texture_quality: 'Texture & Quality',
  cost_efficiency: 'Cost Efficiency',
  compliance_regulatory: 'Compliance',
  new_product_development: 'NPD',
  food_safety: 'Food Safety',
  supply_chain: 'Supply Chain',
  plant_based: 'Plant-Based',
  general: 'General',
};

function Section({ title, children }) {
  return (
    <div className="mb-5">
      <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2">{title}</h4>
      <div className="text-sm text-slate-700">{children}</div>
    </div>
  );
}

export default function TrendDetailPanel({ trend, onClose, onActivate, onDeactivate, onArchive, onEdit }) {
  const [showRejected, setShowRejected] = useState(false);
  if (!trend) return null;
  const isPending = !trend.is_active;

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 bg-black/30 z-40 md:hidden" onClick={onClose} />

      {/* Panel */}
      <div className="fixed inset-y-0 right-0 z-50 w-full md:w-[480px] bg-white shadow-2xl flex flex-col overflow-hidden">
        {/* Header */}
        <div className="px-5 py-4 border-b border-slate-200 flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <h2 className="font-bold text-slate-900 text-lg leading-snug">{trend.trend_name}</h2>
            <div className="flex flex-wrap items-center gap-2 mt-2">
              <span className="text-xs px-2 py-0.5 bg-slate-100 text-slate-600 rounded border border-slate-200">
                {trend.category}
              </span>
              {trend.capability_area && (
                <span className="text-xs px-2 py-0.5 bg-blue-50 text-blue-700 rounded border border-blue-100">
                  {CAPABILITY_LABELS[trend.capability_area] || trend.capability_area}
                </span>
              )}
              {isPending ? (
                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800 border border-yellow-200">
                  Pending review
                </span>
              ) : (
                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800 border border-green-200">
                  Active
                </span>
              )}
            </div>
          </div>
          <button onClick={onClose} className="p-1 rounded hover:bg-slate-100 text-slate-500 shrink-0">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Scrollable body */}
        <div className="flex-1 overflow-y-auto px-5 py-5">
          {/* Description */}
          <Section title="Description">
            {trend.description ? (
              <div className="leading-relaxed space-y-3 text-slate-700">
                {trend.description.split('\n\n').map((para, i) => (
                  <p key={i}>{para}</p>
                ))}
              </div>
            ) : (
              <p className="text-slate-400 italic text-sm">No description yet — click Edit to add one.</p>
            )}
          </Section>

          {trend.market_signal && (
            <Section title="Market Signal">
              <p>{trend.market_signal}</p>
            </Section>
          )}

          {trend.whats_changing?.length > 0 && (
            <Section title="What's Changing">
              <ul className="list-disc list-inside space-y-1">
                {trend.whats_changing.map((item, i) => (
                  <li key={i}>{item}</li>
                ))}
              </ul>
            </Section>
          )}

          {trend.why_now && (
            <Section title="Why Now">
              <p>{trend.why_now}</p>
            </Section>
          )}

          {trend.trend_keywords?.length > 0 && (
            <Section title="Trend Keywords">
              <div className="flex flex-wrap gap-1">
                {trend.trend_keywords.map((kw, i) => (
                  <span key={i} className="text-xs px-2 py-0.5 bg-blue-50 text-blue-700 rounded-full border border-blue-100">
                    {kw}
                  </span>
                ))}
              </div>
            </Section>
          )}

          {trend.confidence && (
            <Section title="Confidence">
              <span className="capitalize">{trend.confidence}</span>
            </Section>
          )}

          {trend.source_references?.length > 0 && (
            <Section title="Source References">
              <div className="space-y-1">
                {trend.source_references.map((ref, i) => (
                  <div key={i} className="text-xs font-mono bg-slate-50 px-2 py-1 rounded border border-slate-100 text-slate-600 truncate">
                    {ref}
                  </div>
                ))}
              </div>
            </Section>
          )}

          {trend.regional_manifestations?.length > 0 && (
            <Section title="Regional Manifestations">
              <div className="space-y-3">
                {trend.regional_manifestations.map((rm, i) => (
                  <div key={i} className="bg-slate-50 rounded p-3 border border-slate-100">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-medium text-slate-800">{rm.region}</span>
                      {rm.intensity && (
                        <span className="text-xs px-1.5 py-0.5 bg-white border border-slate-200 rounded text-slate-500 capitalize">
                          {rm.intensity}
                        </span>
                      )}
                    </div>
                    {rm.signal && <p className="text-slate-600 text-xs">{rm.signal}</p>}
                  </div>
                ))}
              </div>
            </Section>
          )}

          {/* Mintel Expert Examples */}
          <ExpertExamplesSection trendId={trend.id} />

          {/* Sources */}
          {(() => {
            const allSources = trend.sources || [];
            const rejectedSources = allSources.filter(s => s.review_status === 'rejected');
            const visibleSources = allSources.filter(s => s.review_status !== 'rejected');
            return (
              <Section title="Sources">
                {visibleSources.length > 0 ? (
                  <div className="space-y-3">
                    {visibleSources.map((src, i) => {
                      const isAuto = src.review_status === 'auto_applied';
                      const isPendingReview = src.review_status === 'pending';
                      return (
                        <div key={i} className={`border rounded-lg p-3 bg-white ${isPendingReview ? 'border-amber-200' : 'border-slate-200'}`}>
                          <div className="flex items-start justify-between gap-2 mb-1">
                            <span className="font-semibold text-slate-800 text-sm">{src.publisher}</span>
                            <div className="flex items-center gap-1 shrink-0">
                              {isAuto && (
                                <span className="text-xs px-1.5 py-0.5 bg-blue-50 text-blue-600 rounded border border-blue-100 font-medium">AUTO</span>
                              )}
                              {isPendingReview && (
                                <span className="text-xs px-1.5 py-0.5 bg-amber-100 text-amber-700 rounded border border-amber-200 font-medium">PENDING</span>
                              )}
                              {src.source_type && (
                                <span className="text-xs px-1.5 py-0.5 bg-slate-100 text-slate-500 rounded border border-slate-200 capitalize">
                                  {src.source_type.replace(/_/g, ' ')}
                                </span>
                              )}
                            </div>
                          </div>
                          {src.title && (
                            src.url
                              ? <a href={src.url} target="_blank" rel="noopener noreferrer" className="text-sm text-blue-600 hover:underline block mb-1">{src.title}</a>
                              : <p className="text-sm text-slate-700 mb-1">{src.title}</p>
                          )}
                          {src.date && <p className="text-xs text-slate-400 mb-1">{src.date}</p>}
                          {src.key_finding && <p className="text-sm italic text-slate-600">{src.key_finding}</p>}
                          {src.quote && (
                            <blockquote className="mt-2 border-l-2 border-slate-300 pl-3 text-xs text-slate-500 italic">
                              "{src.quote}"
                            </blockquote>
                          )}
                          {src.confidence_reasoning && (
                            <p className="text-xs text-slate-400 mt-1 italic">{src.confidence_reasoning}</p>
                          )}
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <p className="text-slate-400 italic text-sm">No sources added yet.</p>
                )}
                {rejectedSources.length > 0 && (
                  <div className="mt-3">
                    <button
                      onClick={() => setShowRejected(v => !v)}
                      className="text-xs text-slate-400 hover:text-slate-600 underline"
                    >
                      {showRejected ? 'Hide' : 'Show'} rejected ({rejectedSources.length})
                    </button>
                    {showRejected && (
                      <div className="space-y-2 mt-2">
                        {rejectedSources.map((src, i) => (
                          <div key={i} className="border border-slate-100 rounded-lg p-2 bg-slate-50 opacity-60">
                            <div className="flex items-center gap-2">
                              <span className="text-xs px-1.5 py-0 bg-slate-200 text-slate-500 rounded font-medium">REJECTED</span>
                              <span className="text-xs font-medium text-slate-500">{src.publisher}</span>
                              <span className="text-xs text-slate-400 truncate">{src.title}</span>
                            </div>
                            {src.confidence_reasoning && (
                              <p className="text-xs text-slate-400 mt-0.5 italic">{src.confidence_reasoning}</p>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </Section>
            );
          })()}
        </div>

        {/* Footer actions */}
        <div className="px-5 py-4 border-t border-slate-200 flex flex-wrap gap-2">
          {isPending ? (
            <Button className="bg-green-600 hover:bg-green-700 text-white" size="sm" onClick={() => onActivate(trend)}>
              <CheckCircle className="w-4 h-4 mr-1" /> Activate
            </Button>
          ) : (
            <Button variant="outline" size="sm" onClick={() => onDeactivate(trend)}>
              <XCircle className="w-4 h-4 mr-1" /> Deactivate
            </Button>
          )}
          <Button variant="outline" size="sm" onClick={() => onEdit(trend)}>
            <Pencil className="w-4 h-4 mr-1" /> Edit
          </Button>
          <Button variant="outline" size="sm" className="text-slate-500" onClick={() => onArchive(trend)}>
            <Trash2 className="w-4 h-4 mr-1" /> Archive
          </Button>
          <Button variant="ghost" size="sm" className="ml-auto" onClick={onClose}>
            Close
          </Button>
        </div>
      </div>
    </>
  );
}