import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { Star, CheckCircle, XCircle, ChevronDown, ChevronUp, AlertTriangle } from 'lucide-react';

import { CATEGORY_LABELS } from '@/lib/palsgaardCategoryMapping';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/use-toast';

function ExpertBadge() {
  return (
    <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-200 font-medium">
      <Star className="w-3 h-3" />
      Expert pick
    </span>
  );
}

function ExpertExampleCard({ example, onStatusChange }) {
  const [expanded, setExpanded] = useState(false);
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  // Find the link for this trend (we'll need the index)
  const pendingLinks = (example.trend_links || []).filter(l => l.review_status === 'pending');
  const isPending = pendingLinks.length > 0;

  async function handleApprove() {
    setLoading(true);
    const updatedLinks = (example.trend_links || []).map(l =>
      l.review_status === 'pending' ? { ...l, review_status: 'approved', reviewed_at: new Date().toISOString() } : l
    );
    const approvedIds = updatedLinks.filter(l => l.review_status === 'approved' || l.review_status === 'auto_applied').map(l => l.trend_id);
    await base44.entities.ExpertExample.update(example.id, {
      trend_links: updatedLinks,
      linked_trend_ids: approvedIds,
    });
    toast({ title: 'Approved' });
    onStatusChange();
    setLoading(false);
  }

  async function handleReject() {
    setLoading(true);
    const updatedLinks = (example.trend_links || []).map(l =>
      l.review_status === 'pending' ? { ...l, review_status: 'rejected', reviewed_at: new Date().toISOString() } : l
    );
    const remainingIds = updatedLinks.filter(l => l.review_status === 'approved' || l.review_status === 'auto_applied').map(l => l.trend_id);
    await base44.entities.ExpertExample.update(example.id, {
      trend_links: updatedLinks,
      linked_trend_ids: remainingIds,
    });
    toast({ title: 'Rejected' });
    onStatusChange();
    setLoading(false);
  }

  return (
    <div className="border border-slate-200 rounded-lg bg-white p-3">
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-1.5 mb-1">
            <ExpertBadge />
            {example.category === 'needs_human_review' ? (
              <span className="inline-flex items-center gap-1 text-xs px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700 border border-amber-200 font-medium">
                <AlertTriangle className="w-3 h-3" /> Needs review
              </span>
            ) : example.category ? (
              <span className="text-xs px-1.5 py-0.5 rounded-full bg-slate-100 text-slate-600">
                {CATEGORY_LABELS[example.category] || example.category}
              </span>
            ) : null}
            {example.country && (
              <span className="text-xs text-slate-500">{example.country}</span>
            )}
            {example.page_ref && (
              <span className="text-xs text-slate-400">p.{example.page_ref}</span>
            )}
          </div>
          <p className="font-semibold text-slate-900 text-sm leading-snug">{example.product_name}</p>
          {example.brand && <p className="text-xs text-slate-500 mt-0.5">{example.brand}</p>}
          {example.analyst_framing && (
            <p className="text-xs text-slate-600 mt-1 font-medium">{example.analyst_framing}</p>
          )}
          {example.analyst_quote && (
            <p className="text-xs text-slate-500 mt-1 italic">"{example.analyst_quote}"</p>
          )}
          {example.report_title && (
            <p className="text-xs text-slate-400 mt-1">From: {example.report_title}</p>
          )}
        </div>
        <div className="flex flex-col items-end gap-1 shrink-0">
          {isPending && (
            <span className="text-xs px-1.5 py-0.5 bg-amber-100 text-amber-700 rounded border border-amber-200 font-medium">PENDING</span>
          )}
          <button
            onClick={() => setExpanded(v => !v)}
            className="text-slate-400 hover:text-slate-600"
          >
            {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {expanded && (
        <div className="mt-2 pt-2 border-t border-slate-100 space-y-1">
          {example.mintel_section_heading && (
            <p className="text-xs text-slate-500"><span className="font-medium">Section:</span> {example.mintel_section_heading}</p>
          )}
          {example.mintel_trend_label && (
            <p className="text-xs text-slate-500"><span className="font-medium">Mintel trend label:</span> {example.mintel_trend_label}</p>
          )}
          {example.claims?.length > 0 && (
            <p className="text-xs text-slate-500"><span className="font-medium">Claims:</span> {example.claims.join(', ')}</p>
          )}
          {example.format_notes && (
            <p className="text-xs text-slate-500"><span className="font-medium">Format:</span> {example.format_notes}</p>
          )}
          {example.trend_links?.map((link, i) => (
            <div key={i} className="text-xs text-slate-400 mt-1">
              <span className={`font-medium ${link.review_status === 'auto_applied' ? 'text-green-600' : link.review_status === 'approved' ? 'text-blue-600' : link.review_status === 'rejected' ? 'text-red-400 line-through' : 'text-amber-600'}`}>
                [{link.review_status}]
              </span>{' '}
              Score {link.confidence_score} — {link.reasoning}
            </div>
          ))}
        </div>
      )}

      {isPending && (
        <div className="flex items-center gap-2 mt-2 pt-2 border-t border-slate-100">
          <Button size="sm" variant="outline" className="h-7 text-xs text-green-700 border-green-200 hover:bg-green-50" disabled={loading} onClick={handleApprove}>
            <CheckCircle className="w-3 h-3 mr-1" /> Approve
          </Button>
          <Button size="sm" variant="outline" className="h-7 text-xs text-red-600 border-red-200 hover:bg-red-50" disabled={loading} onClick={handleReject}>
            <XCircle className="w-3 h-3 mr-1" /> Reject
          </Button>
        </div>
      )}
    </div>
  );
}

export default function ExpertExamplesSection({ trendId, trendCategory }) {
  const [examples, setExamples] = useState([]);
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    // Fetch all ExpertExamples and filter client-side for this trend
    // (entity filter doesn't support array-contains, so we filter in memory)
    const all = await base44.entities.ExpertExample.list('-extracted_at', 500);
    const linked = all.filter(ex => {
      // Category guard — an example only belongs to a trend in the same solution category.
      // Hides legacy cross-industry links (e.g. chocolate products on a condiments trend)
      // until the linker re-runs. Examples with no category fall through (shown).
      if (trendCategory && ex.category && ex.category !== trendCategory) return false;
      const links = ex.trend_links || [];
      return links.some(l =>
        l.trend_id === trendId &&
        (l.review_status === 'auto_applied' || l.review_status === 'approved' || l.review_status === 'pending')
      );
    });
    setExamples(linked);
    setLoading(false);
  }

  useEffect(() => {
    if (trendId) load();
  }, [trendId, trendCategory]);

  if (loading) return <p className="text-xs text-slate-400">Loading…</p>;

  if (examples.length === 0) return (
    <p className="text-sm text-slate-400 italic">No expert product examples linked to this trend yet.</p>
  );

  return (
    <div className="space-y-2">
      {examples.map(ex => (
        <ExpertExampleCard key={ex.id} example={ex} onStatusChange={load} />
      ))}
    </div>
  );
}