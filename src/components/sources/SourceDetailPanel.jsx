import React, { useState, useEffect, useCallback } from 'react';
import { base44 } from '@/api/base44Client';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';
import {
  ExternalLink, Loader2, AlertTriangle, SkipForward, Check, X,
  FileText, RefreshCw
} from 'lucide-react';
import { format, isValid } from 'date-fns';
import MetadataEditSection from './MetadataEditSection';

// Safely format a date string — returns null for missing/invalid dates instead of throwing
function safeFormat(value, fmt) {
  if (!value) return null;
  const d = new Date(value);
  return isValid(d) ? format(d, fmt) : null;
}

// ─── config ───────────────────────────────────────────────────────────────────
const CAPABILITY_COLORS = {
  sustainability:          'bg-green-100 text-green-700',
  texture_quality:         'bg-blue-100 text-blue-700',
  cost_efficiency:         'bg-amber-100 text-amber-700',
  compliance_regulatory:   'bg-red-100 text-red-700',
  new_product_development: 'bg-purple-100 text-purple-700',
  food_safety:             'bg-red-100 text-red-700',
  supply_chain:            'bg-orange-100 text-orange-700',
  plant_based:             'bg-green-100 text-green-700',
  general:                 'bg-slate-100 text-slate-600',
};

const CONFIDENCE_COLORS = {
  high:   'bg-green-100 text-green-700',
  medium: 'bg-amber-100 text-amber-700',
  low:    'bg-red-100 text-red-700',
};

const PIPELINE_BADGE = {
  uploaded:   'bg-slate-100 text-slate-600',
  extracting: 'bg-blue-100 text-blue-700',
  extracted:  'bg-green-100 text-green-700',
  gnpd_ready: 'bg-blue-100 text-blue-700',
  skipped:    'bg-slate-100 text-slate-400',
  failed:     'bg-red-100 text-red-700',
};

const REVIEW_BADGE = {
  pending:  'bg-amber-100 text-amber-700',
  approved: 'bg-green-100 text-green-700',
  rejected: 'bg-red-100 text-red-700',
};

function SmallBadge({ label, cls }) {
  return <span className={`inline-flex text-xs font-medium px-2 py-0.5 rounded-full ${cls}`}>{label}</span>;
}

function Label({ color, children }) {
  const colors = {
    amber: 'text-amber-600',
    red:   'text-red-500',
    blue:  'text-blue-600',
    slate: 'text-slate-400',
  };
  return (
    <p className={`text-[10px] font-semibold uppercase tracking-wider mb-0.5 ${colors[color] || 'text-slate-400'}`}>
      {children}
    </p>
  );
}

// ─── excerpt card ─────────────────────────────────────────────────────────────
function ExcerptCard({ excerpt, decision, onDecide }) {
  const capabilityClass = CAPABILITY_COLORS[excerpt.capability_area] || 'bg-slate-100 text-slate-600';
  const confidenceClass = CONFIDENCE_COLORS[excerpt.confidence] || 'bg-slate-100 text-slate-600';
  const angleViolation = excerpt.palsgaard_angle?.trim().startsWith('Palsgaard');

  const borderCls = decision === 'keep'
    ? 'border-l-4 border-l-green-400'
    : decision === 'discard'
      ? 'border-l-4 border-l-red-400 opacity-60'
      : 'border-l-4 border-l-transparent';

  return (
    <div className={`rounded-lg border border-slate-200 bg-white p-4 space-y-3 ${borderCls} transition-all`}>
      {/* header */}
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-1.5 flex-wrap">
          {excerpt.capability_area && (
            <SmallBadge label={excerpt.capability_area.replace(/_/g, ' ')} cls={capabilityClass} />
          )}
          {excerpt.confidence && (
            <SmallBadge label={excerpt.confidence} cls={confidenceClass} />
          )}
        </div>
        {excerpt.page_ref && (
          <span className="text-xs text-slate-400">{excerpt.page_ref}</span>
        )}
      </div>

      {/* market signal */}
      {excerpt.market_signal && (
        <div>
          <Label color="amber">Market Signal</Label>
          <p className={`text-sm text-slate-800 ${decision === 'discard' ? 'line-through' : ''}`}>
            {excerpt.market_signal}
          </p>
        </div>
      )}

      {/* customer pain */}
      {excerpt.customer_pain && (
        <div>
          <Label color="red">Customer Pain</Label>
          <p className={`text-sm text-slate-800 ${decision === 'discard' ? 'line-through' : ''}`}>
            {excerpt.customer_pain}
          </p>
        </div>
      )}

      {/* palsgaard angle */}
      {excerpt.palsgaard_angle && (
        <div className={angleViolation ? 'border border-red-300 rounded-lg p-2 bg-red-50' : ''}>
          {angleViolation && (
            <div className="flex items-center gap-1 text-xs text-red-600 mb-1">
              <AlertTriangle className="w-3 h-3" />
              Violation: angle starts with "Palsgaard"
            </div>
          )}
          <Label color="blue">Palsgaard Angle</Label>
          <p className={`text-sm text-slate-800 ${decision === 'discard' ? 'line-through' : ''}`}>
            {excerpt.palsgaard_angle}
          </p>
        </div>
      )}

      {/* source quote */}
      {excerpt.source_quote && (
        <div className="border-l-2 border-slate-300 pl-3">
          <Label color="slate">Source Quote</Label>
          <p className={`text-sm text-slate-600 italic ${decision === 'discard' ? 'line-through' : ''}`}>
            {excerpt.source_quote}
          </p>
        </div>
      )}

      {/* footer tags */}
      {((excerpt.category_relevance?.length > 0) || (excerpt.trend_keywords?.length > 0)) && (
        <div className="flex flex-wrap gap-1 pt-1">
          {(excerpt.category_relevance || []).map(c => (
            <span key={c} className="text-xs px-1.5 py-0.5 rounded border border-slate-200 text-slate-500">{c}</span>
          ))}
          {(excerpt.trend_keywords || []).map(k => (
            <span key={k} className="text-xs px-1.5 py-0.5 rounded bg-slate-100 text-slate-400">{k}</span>
          ))}
        </div>
      )}

      {/* per-excerpt actions */}
      <div className="flex gap-2 pt-1 border-t border-slate-100">
        <Button
          size="sm"
          variant="outline"
          className={decision === 'keep' ? 'border-green-400 text-green-700' : ''}
          onClick={() => onDecide(excerpt.id, decision === 'keep' ? null : 'keep')}
        >
          <Check className="w-3 h-3 mr-1" />
          Keep
        </Button>
        <Button
          size="sm"
          variant="outline"
          className={decision === 'discard' ? 'border-red-400 text-red-600' : 'text-red-500'}
          onClick={() => onDecide(excerpt.id, decision === 'discard' ? null : 'discard')}
        >
          <X className="w-3 h-3 mr-1" />
          Discard
        </Button>
      </div>
    </div>
  );
}

// ─── main panel ───────────────────────────────────────────────────────────────
export default function SourceDetailPanel({ sourceId, onClose, onRefresh }) {
  const [source, setSource] = useState(null);
  const [loading, setLoading] = useState(false);
  const [reviewNotes, setReviewNotes] = useState('');
  const [excerptDecisions, setExcerptDecisions] = useState({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!sourceId) return;
    setSource(null);
    setReviewNotes('');
    setExcerptDecisions({});
    setLoading(true);
    base44.entities.Source.filter({ id: sourceId }, null, 1)
      .then(results => {
        const s = results[0];
        setSource(s);
        setReviewNotes(s?.review_notes || '');
      })
      .finally(() => setLoading(false));
  }, [sourceId]);

  const handleDecide = useCallback((excerptId, decision) => {
    setExcerptDecisions(prev => ({ ...prev, [excerptId]: decision }));
  }, []);

  const handleReview = async (status) => {
    setSaving(true);
    let user = null;
    try { user = await base44.auth.me(); } catch (_) {}

    let payload = {
      review_status: status,
      review_notes: reviewNotes || null,
      reviewed_at: new Date().toISOString(),
      reviewed_by: user?.email || null,
    };

    if (status === 'approved') {
      const discarded = Object.entries(excerptDecisions)
        .filter(([, d]) => d === 'discard')
        .map(([id]) => id);
      if (discarded.length > 0) {
        const kept = (source.excerpts || []).filter(e => !discarded.includes(e.id));
        payload.excerpts = kept;
      }
    }

    await base44.entities.Source.update(sourceId, payload);
    toast.success(`Source ${status}`);
    setSaving(false);
    onClose();
    onRefresh?.();
  };

  const handleRetry = async () => {
    // TODO: wire up to triggerSourceProcessor backend function when ready
    await base44.entities.Source.update(sourceId, {
      pipeline_stage: 'uploaded',
      failure_reason: null,
      retry_count: (source?.retry_count || 0) + 1,
      last_retry_at: new Date().toISOString(),
    });
    toast.success('Source reset to queue for retry');
    onClose();
    onRefresh?.();
  };

  // keyboard shortcuts
  useEffect(() => {
    if (!sourceId) return;
    const handler = (e) => {
      if (e.target.tagName === 'TEXTAREA' || e.target.tagName === 'INPUT') return;
      if (e.key === 'Escape') onClose();
      if (e.key === 'a' && source?.pipeline_stage === 'extracted') handleReview('approved');
      if (e.key === 'r' && source?.pipeline_stage === 'extracted') handleReview('rejected');
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [sourceId, source]);

  const isReviewable = source?.pipeline_stage === 'extracted';
  const isGnpd = source?.source_type === 'gnpd';
  const excerpts = source?.excerpts || [];
  const discardedCount = Object.values(excerptDecisions).filter(d => d === 'discard').length;

  return (
    <Sheet open={!!sourceId} onOpenChange={(open) => { if (!open) onClose(); }}>
      <SheetContent className="sm:max-w-2xl w-full flex flex-col p-0 gap-0" side="right">

        {/* ── header ── */}
        <SheetHeader className="px-6 py-4 border-b border-slate-200 shrink-0">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <SheetTitle className="text-lg font-bold text-slate-900 leading-snug truncate" title={source?.title}>
                {loading ? '...' : (source?.title || 'Untitled')}
              </SheetTitle>
              {source && (
                <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
                  {source.source_type && (
                    <Badge variant="outline" className="text-xs">{source.source_type}</Badge>
                  )}
                  {source.pipeline_stage && (
                    <SmallBadge
                      label={source.pipeline_stage.replace(/_/g, ' ')}
                      cls={PIPELINE_BADGE[source.pipeline_stage] || 'bg-slate-100 text-slate-600'}
                    />
                  )}
                  {source.review_status && (
                    <SmallBadge
                      label={source.review_status}
                      cls={REVIEW_BADGE[source.review_status] || 'bg-slate-100 text-slate-600'}
                    />
                  )}
                </div>
              )}
            </div>
            {source?.file_url && (
              <a href={source.file_url} target="_blank" rel="noopener noreferrer">
                <Button variant="ghost" size="icon" className="shrink-0">
                  <ExternalLink className="w-4 h-4" />
                </Button>
              </a>
            )}
          </div>

          {/* meta strip */}
          {source && (
            <div className="flex flex-wrap gap-x-2 text-xs text-slate-400 mt-1">
              {[
                source.category,
                source.region_code,
                safeFormat(source.date_published, 'MMM yyyy'),
                !isGnpd ? `${(source.excerpts || []).length} excerpts` : null,
              ].filter(Boolean).join(' · ')}
            </div>
          )}
        </SheetHeader>

        {/* ── body ── */}
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-5">

          {loading && (
            <div className="flex items-center justify-center py-20">
              <Loader2 className="w-6 h-6 animate-spin text-slate-400" />
            </div>
          )}

          {!loading && source && (
            <>
              {/* not-yet-processed notice */}
              {source.pipeline_stage === 'uploaded' || source.pipeline_stage === 'extracting' ? (
                <div className="p-4 bg-slate-100 rounded-lg text-sm text-slate-600">
                  This source has not been processed yet — no excerpts available for review.
                </div>
              ) : null}

              {/* failed notice */}
              {source.pipeline_stage === 'failed' && (
                <div className="p-4 bg-red-50 border border-red-200 rounded-lg space-y-2">
                  <div className="flex items-center gap-2 text-red-700 font-semibold text-sm">
                    <AlertTriangle className="w-4 h-4" />
                    Processing failed
                  </div>
                  {source.failure_reason && (
                    <p className="text-sm text-red-600">Reason: <strong>{source.failure_reason}</strong></p>
                  )}
                  {source.processing_error && (
                    <p className="text-xs text-red-500 font-mono break-all">{source.processing_error}</p>
                  )}
                  <Button size="sm" variant="outline" onClick={handleRetry} className="mt-1">
                    <RefreshCw className="w-3.5 h-3.5 mr-1.5" />
                    Retry
                  </Button>
                </div>
              )}

              {/* skipped notice */}
              {source.pipeline_stage === 'skipped' && (
                <div className="p-4 bg-slate-100 border border-slate-200 rounded-lg flex items-center gap-2 text-slate-600 text-sm">
                  <SkipForward className="w-4 h-4 shrink-0" />
                  <span>Skipped: <strong>{source.skip_reason || 'unknown reason'}</strong></span>
                </div>
              )}

              {/* Inline metadata editing — awaiting verification or approved (admin correction) */}
              {!isGnpd && (
                (source.pipeline_stage === 'metadata_extracted' && source.review_status === 'pending') ||
                source.review_status === 'approved'
              ) && (
                <MetadataEditSection source={source} onSourceChange={setSource} />
              )}

              {/* AI summary */}
              {source.ai_summary && (
                <div className="p-4 bg-slate-50 rounded-lg border border-slate-200">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 mb-1">AI Summary</p>
                  <p className="text-sm text-slate-700">{source.ai_summary}</p>
                </div>
              )}

              {/* GNPD preview */}
              {isGnpd && source.gnpd_preview_rows?.length > 0 && (
                <div>
                  <h3 className="text-sm font-semibold text-slate-800 mb-2">
                    GNPD Preview ({source.gnpd_row_count || source.gnpd_preview_rows.length} rows)
                  </h3>
                  <div className="overflow-x-auto border border-slate-200 rounded-lg">
                    <table className="text-xs w-full">
                      <thead className="bg-slate-50">
                        <tr>
                          {(source.gnpd_headers || Object.keys(source.gnpd_preview_rows[0])).slice(0, 6).map(h => (
                            <th key={h} className="px-3 py-2 text-left font-medium text-slate-600 whitespace-nowrap">{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {source.gnpd_preview_rows.map((row, i) => (
                          <tr key={i}>
                            {(source.gnpd_headers || Object.keys(row)).slice(0, 6).map(h => (
                              <td key={h} className="px-3 py-1.5 text-slate-600 truncate max-w-[120px]">{String(row[h] ?? '')}</td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* excerpts */}
              {!isGnpd && (
                <div>
                  <h3 className="text-sm font-semibold text-slate-800 mb-3">
                    Extracted Excerpts ({excerpts.length})
                    {discardedCount > 0 && (
                      <span className="ml-2 text-xs text-red-500 font-normal">{discardedCount} marked to discard</span>
                    )}
                  </h3>
                  {excerpts.length === 0 ? (
                    <p className="text-sm text-slate-400 italic">No excerpts extracted yet.</p>
                  ) : (
                    <div className="space-y-3">
                      {excerpts.map((exc) => (
                        <ExcerptCard
                          key={exc.id}
                          excerpt={exc}
                          decision={excerptDecisions[exc.id] || null}
                          onDecide={handleDecide}
                        />
                      ))}
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </div>

        {/* ── bottom action bar ── */}
        {!loading && source && (
          <div className="shrink-0 border-t border-slate-200 px-6 py-4 bg-white space-y-3">
            {isReviewable ? (
              <>
                <Textarea
                  placeholder="Review notes (optional) — why approve/reject? What's the issue?"
                  value={reviewNotes}
                  onChange={e => setReviewNotes(e.target.value)}
                  className="text-sm resize-none h-16"
                />
                <div className="flex justify-between items-center gap-2">
                  <p className="text-xs text-slate-400">Shortcuts: A = approve · R = reject · Esc = close</p>
                  <div className="flex gap-2">
                    <Button
                      variant="destructive"
                      size="sm"
                      disabled={saving}
                      onClick={() => handleReview('rejected')}
                    >
                      {saving ? <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" /> : <X className="w-3.5 h-3.5 mr-1" />}
                      Reject source
                    </Button>
                    <Button
                      size="sm"
                      disabled={saving}
                      onClick={() => handleReview('approved')}
                      className="bg-green-600 hover:bg-green-700"
                    >
                      {saving ? <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" /> : <Check className="w-3.5 h-3.5 mr-1" />}
                      Approve source{discardedCount > 0 ? ` (–${discardedCount})` : ''}
                    </Button>
                  </div>
                </div>
              </>
            ) : (
              <div className="flex justify-end gap-2">
                {source.pipeline_stage === 'failed' && (
                  <Button variant="outline" size="sm" onClick={handleRetry}>
                    <RefreshCw className="w-3.5 h-3.5 mr-1" />
                    Retry
                  </Button>
                )}
                <Button variant="outline" size="sm" onClick={onClose}>Close</Button>
              </div>
            )}
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}