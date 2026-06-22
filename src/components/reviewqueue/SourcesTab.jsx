import React, { useState, useMemo } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { toast } from 'sonner';
import { ChevronDown, ChevronRight } from 'lucide-react';

const PIPELINE_STAGE_STYLES = {
  uploaded:           { bg: '#f1f5f9', color: '#64748b', label: 'Uploaded' },
  needs_classification:{ bg: '#fef3c7', color: '#92400e', label: 'Needs classification' },
  extracting:         { bg: '#EBF0F8', color: '#1D428A', label: 'Extracting' },
  metadata_extracted: { bg: '#EEF2FF', color: '#4338ca', label: 'Metadata extracted' },
  extracted:          { bg: '#eaf2e8', color: '#3a6b2e', label: 'Extracted' },
  gnpd_ready:         { bg: '#eaf2e8', color: '#3a6b2e', label: 'GNPD ready' },
  skipped:            { bg: '#f1f5f9', color: '#64748b', label: 'Skipped' },
  failed:             { bg: '#FAE9E5', color: '#A33B24', label: 'Failed' },
};

const REVIEW_STATUS_STYLES = {
  pending:  { bg: '#fef3c7', color: '#92400e', label: 'Pending review' },
  approved: { bg: '#eaf2e8', color: '#3a6b2e', label: 'Approved' },
  rejected: { bg: '#f1f5f9', color: '#64748b', label: 'Rejected' },
};

const SOURCE_TYPE_LABELS = {
  mintel: 'Mintel', market_intel: 'Market Intel', gnpd: 'GNPD',
  report: 'Report', url: 'URL', knowledge: 'Knowledge', other: 'Other',
};

const STATUS_TABS = [
  { key: 'needs_review', label: 'Needs review' },
  { key: 'approved', label: 'Approved' },
  { key: 'rejected', label: 'Rejected' },
  { key: 'all', label: 'All' },
];

function SourceRow({ source, onApprove, onReject }) {
  const [expanded, setExpanded] = useState(false);
  const stageStyle = PIPELINE_STAGE_STYLES[source.pipeline_stage] || { bg: '#f1f5f9', color: '#64748b', label: source.pipeline_stage || '—' };
  const reviewStyle = REVIEW_STATUS_STYLES[source.review_status] || REVIEW_STATUS_STYLES.pending;

  return (
    <div style={{ borderBottom: '1px solid hsl(var(--border))' }}>
      {/* Row header */}
      <div
        style={{ display: 'flex', alignItems: 'flex-start', gap: 12, padding: '12px 16px', cursor: 'pointer' }}
        onClick={() => setExpanded(e => !e)}
      >
        <div style={{ paddingTop: 2, color: 'hsl(var(--muted-foreground))', flexShrink: 0 }}>
          {expanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4, flexWrap: 'wrap' }}>
            <span style={{ fontWeight: 600, fontSize: 13, color: '#1D2B47', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 360 }}>
              {source.title || source.publisher || 'Untitled'}
            </span>
            {source.source_type && (
              <span style={{ fontSize: 11, padding: '1px 7px', borderRadius: 9999, background: '#EBF0F8', color: '#1D428A', border: '1px solid #C5D2EC', flexShrink: 0 }}>
                {SOURCE_TYPE_LABELS[source.source_type] || source.source_type}
              </span>
            )}
            <span style={{ fontSize: 11, padding: '1px 7px', borderRadius: 9999, flexShrink: 0, background: stageStyle.bg, color: stageStyle.color }}>
              {stageStyle.label}
            </span>
            <span style={{ fontSize: 11, padding: '1px 7px', borderRadius: 9999, flexShrink: 0, background: reviewStyle.bg, color: reviewStyle.color }}>
              {reviewStyle.label}
            </span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, fontSize: 12, color: 'hsl(var(--muted-foreground))' }}>
            {source.publisher && source.publisher !== source.title && <span>{source.publisher}</span>}
            {source.date_published && <span>{source.date_published}</span>}
            {source.category && <span style={{ textTransform: 'capitalize' }}>{source.category.replace(/_/g, ' ')}</span>}
            {source.region_code && <span>{source.region_code}</span>}
          </div>
        </div>
        {/* Action buttons */}
        <div style={{ display: 'flex', gap: 6, flexShrink: 0 }} onClick={e => e.stopPropagation()}>
          {source.review_status !== 'approved' && (
            <button
              onClick={() => onApprove(source.id)}
              style={{
                fontSize: 12, fontWeight: 600, padding: '4px 12px', borderRadius: 7,
                background: '#1D428A', color: '#fff', border: 'none', cursor: 'pointer',
              }}
            >
              Approve
            </button>
          )}
          {source.review_status !== 'rejected' && (
            <button
              onClick={() => onReject(source.id)}
              style={{
                fontSize: 12, fontWeight: 500, padding: '4px 12px', borderRadius: 7,
                background: 'transparent', color: '#64748b',
                border: '1px solid hsl(var(--border))', cursor: 'pointer',
              }}
            >
              Reject
            </button>
          )}
        </div>
      </div>

      {/* Expanded detail */}
      {expanded && (
        <div style={{ padding: '0 16px 16px 44px', display: 'flex', flexDirection: 'column', gap: 12 }}>
          {/* Metadata fields */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 8 }}>
            {[
              ['Author', source.author],
              ['Coverage period', source.coverage_period],
              ['Document type', source.document_type],
              ['Knowledge subtype', source.knowledge_subtype],
              ['Region', source.region_code],
              ['Main group', source.main_group],
              ['Allowed use', source.allowed_use],
              ['Pipeline stage', source.pipeline_stage],
              ['Failure reason', source.failure_reason],
              ['Retry count', source.retry_count],
            ].filter(([, v]) => v != null && v !== '').map(([label, value]) => (
              <div key={label}>
                <p style={{ fontSize: 11, color: 'hsl(var(--muted-foreground))', marginBottom: 2 }}>{label}</p>
                <p style={{ fontSize: 13, color: '#1D2B47', margin: 0 }}>{String(value)}</p>
              </div>
            ))}
          </div>

          {/* AI summary */}
          {source.ai_summary && (
            <div>
              <p style={{ fontSize: 11, color: 'hsl(var(--muted-foreground))', marginBottom: 4 }}>AI summary</p>
              <p style={{ fontSize: 13, color: '#1D2B47', lineHeight: 1.6, margin: 0 }}>{source.ai_summary}</p>
            </div>
          )}

          {/* Excerpts */}
          {source.excerpts?.length > 0 && (
            <div>
              <p style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'hsl(var(--muted-foreground))', marginBottom: 8 }}>
                Excerpts ({source.excerpts.length})
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {source.excerpts.slice(0, 5).map((ex, i) => (
                  <blockquote key={ex.id || i} style={{
                    borderLeft: '3px solid #1D428A', paddingLeft: 12, margin: 0,
                    fontSize: 13, color: '#475569', fontStyle: 'italic', lineHeight: 1.6,
                  }}>
                    {ex.source_quote || ex.market_signal || ex.customer_pain || '—'}
                    {ex.confidence && (
                      <span style={{ fontSize: 11, marginLeft: 8, color: 'hsl(var(--muted-foreground))', fontStyle: 'normal' }}>
                        [{ex.confidence} confidence]
                      </span>
                    )}
                  </blockquote>
                ))}
                {source.excerpts.length > 5 && (
                  <p style={{ fontSize: 12, color: 'hsl(var(--muted-foreground))' }}>
                    +{source.excerpts.length - 5} more excerpts
                  </p>
                )}
              </div>
            </div>
          )}

          {/* URL */}
          {source.url && (
            <a href={source.url} target="_blank" rel="noopener noreferrer" style={{ fontSize: 12, color: '#1D428A' }}>
              View source ↗
            </a>
          )}
        </div>
      )}
    </div>
  );
}

export default function SourcesTab({ sources }) {
  const queryClient = useQueryClient();
  const [statusFilter, setStatusFilter] = useState('needs_review');
  const [typeFilter, setTypeFilter] = useState('');

  const mutation = useMutation({
    mutationFn: ({ id, data }) => base44.entities.Source.update(id, data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['allSources'] }),
  });

  const handleApprove = async (id) => {
    await mutation.mutateAsync({ id, data: { review_status: 'approved' } });
    toast.success('Source approved');
  };

  const handleReject = async (id) => {
    await mutation.mutateAsync({ id, data: { review_status: 'rejected' } });
    toast.warning('Source rejected');
  };

  const uniqueTypes = useMemo(() => [...new Set(sources.map(s => s.source_type).filter(Boolean))], [sources]);

  const filtered = useMemo(() => {
    return sources.filter(s => {
      if (statusFilter === 'needs_review' && s.review_status !== 'pending') return false;
      if (statusFilter === 'approved' && s.review_status !== 'approved') return false;
      if (statusFilter === 'rejected' && s.review_status !== 'rejected') return false;
      if (typeFilter && s.source_type !== typeFilter) return false;
      return true;
    });
  }, [sources, statusFilter, typeFilter]);

  return (
    <div>
      {/* Filter bar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', background: '#e8e3d8', borderRadius: 10, padding: 4, gap: 2 }}>
          {STATUS_TABS.map(t => (
            <button
              key={t.key}
              onClick={() => setStatusFilter(t.key)}
              style={{
                padding: '5px 14px', borderRadius: 7, fontSize: 13, fontWeight: 500,
                background: statusFilter === t.key ? '#1D428A' : 'transparent',
                color: statusFilter === t.key ? '#fff' : '#1D2B47',
                border: 'none', cursor: 'pointer',
              }}
            >
              {t.label}
            </button>
          ))}
        </div>
        {uniqueTypes.length > 0 && (
          <select
            value={typeFilter}
            onChange={e => setTypeFilter(e.target.value)}
            style={{
              border: '1px solid hsl(var(--border))', background: 'hsl(var(--card))',
              borderRadius: 8, padding: '6px 10px', fontSize: 13, color: '#1D2B47',
            }}
          >
            <option value="">All source types</option>
            {uniqueTypes.map(t => <option key={t} value={t}>{SOURCE_TYPE_LABELS[t] || t}</option>)}
          </select>
        )}
        <span style={{ fontSize: 13, color: 'hsl(var(--muted-foreground))', marginLeft: 'auto' }}>
          {filtered.length} source{filtered.length !== 1 ? 's' : ''}
        </span>
      </div>

      {filtered.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '48px 0', color: 'hsl(var(--muted-foreground))', fontSize: 14 }}>
          No sources awaiting review.
        </div>
      ) : (
        <div style={{
          background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))',
          borderRadius: 10, overflow: 'hidden',
          boxShadow: '0 1px 4px 0 rgba(29,43,71,0.06)',
        }}>
          {filtered.map(source => (
            <SourceRow
              key={source.id}
              source={source}
              onApprove={handleApprove}
              onReject={handleReject}
            />
          ))}
        </div>
      )}
    </div>
  );
}