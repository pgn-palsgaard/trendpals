import React, { useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { toast } from 'sonner';
import { Trash2, ChevronDown, ChevronRight, Users, Clock } from 'lucide-react';
import ResendReviewerButton from '@/components/challenges/ResendReviewerButton';

const VERDICT_STYLE = {
  confirmed:       { bg: '#d4e8cc', color: '#3d5235', label: 'Confirmed' },
  needs_refinement:{ bg: '#fde8dc', color: '#7a3320', label: 'Needs refinement' },
  rejected:        { bg: '#e8eaed', color: '#475569', label: 'Rejected' },
};

const VALIDATION_STATUSES = [
  { value: 'unvalidated', label: 'Unvalidated' },
  { value: 'in_field',    label: 'In field' },
  { value: 'confirmed',   label: 'Confirmed' },
  { value: 'rejected',    label: 'Rejected' },
];

const VALIDATION_STATUS_COLORS = {
  unvalidated: { bg: '#f1f5f9', color: '#475569' },
  in_field:    { bg: '#EEF2FF', color: '#1D428A' },
  confirmed:   { bg: '#d4e8cc', color: '#3d5235' },
  rejected:    { bg: '#e8eaed', color: '#475569' },
};

function VerdictBadge({ verdict }) {
  if (!verdict) return <span style={{ fontSize: 12, color: 'hsl(var(--muted-foreground))' }}>—</span>;
  const s = VERDICT_STYLE[verdict] || {};
  return (
    <span style={{ fontSize: 12, fontWeight: 600, padding: '2px 8px', borderRadius: 9999, background: s.bg, color: s.color }}>
      {s.label || verdict}
    </span>
  );
}

// Inline validation editor — human-only fields
function ValidationControl({ challenge, onSave }) {
  const [status, setStatus] = useState(challenge.validation_status || 'unvalidated');
  const [validatedBy, setValidatedBy] = useState(challenge.validated_by || '');
  const [dirty, setDirty] = useState(false);

  const sc = VALIDATION_STATUS_COLORS[status] || VALIDATION_STATUS_COLORS.unvalidated;

  const handleChange = (field, val) => {
    if (field === 'status') setStatus(val);
    if (field === 'validatedBy') setValidatedBy(val);
    setDirty(true);
  };

  const handleSave = () => {
    // HUMAN-ONLY: only write values the user explicitly entered
    onSave(challenge.id, {
      validation_status: status,
      validated_by: validatedBy,
      validated_date: new Date().toISOString(),
    });
    setDirty(false);
  };

  return (
    <div style={{ borderRadius: 10, padding: '12px 14px', background: '#F7F4EE', border: '1.5px solid #e2d8c8', marginTop: 8 }}>
      <p style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', color: '#6B7280', marginBottom: 8 }}>
        Admin rollup decision
      </p>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'flex-end' }}>
        <div>
          <p style={{ fontSize: 11, color: 'hsl(var(--muted-foreground))', marginBottom: 4 }}>Status</p>
          <select
            value={status}
            onChange={e => handleChange('status', e.target.value)}
            style={{
              fontSize: 13, borderRadius: 7, padding: '5px 10px',
              border: `1.5px solid ${sc.color}40`,
              background: sc.bg, color: sc.color, fontWeight: 600,
            }}
          >
            {VALIDATION_STATUSES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
          </select>
        </div>
        <div>
          <p style={{ fontSize: 11, color: 'hsl(var(--muted-foreground))', marginBottom: 4 }}>Decided by</p>
          <input
            value={validatedBy}
            onChange={e => handleChange('validatedBy', e.target.value)}
            placeholder="Your name"
            style={{ fontSize: 13, border: '1px solid hsl(var(--border))', borderRadius: 7, padding: '5px 10px', width: 140 }}
          />
        </div>
        {dirty && (
          <button
            onClick={handleSave}
            style={{ fontSize: 13, fontWeight: 600, padding: '6px 14px', borderRadius: 7, background: '#1D428A', color: '#fff', border: 'none', cursor: 'pointer' }}
          >
            Save decision
          </button>
        )}
      </div>
      {challenge.validated_date && (
        <p style={{ fontSize: 11, color: 'hsl(var(--muted-foreground))', marginTop: 6 }}>
          Last updated {new Date(challenge.validated_date).toLocaleDateString()} by {challenge.validated_by || '—'}
        </p>
      )}
    </div>
  );
}

// Reviewer group row (collapsible)
function ReviewerGroup({ reviewerEmail, reviewerName, assignments, trendMap, onDelete }) {
  const [expanded, setExpanded] = useState(true);
  const outstanding = assignments.filter(a => a.status !== 'responded');
  const responded = assignments.filter(a => a.status === 'responded');

  return (
    <div style={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: 10, overflow: 'hidden', boxShadow: '0 1px 4px 0 rgba(29,43,71,0.06)' }}>
      <button
        onClick={() => setExpanded(e => !e)}
        style={{ width: '100%', textAlign: 'left', padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 10, background: 'none', border: 'none', cursor: 'pointer' }}
      >
        {expanded ? <ChevronDown className="w-4 h-4" style={{ color: 'hsl(var(--muted-foreground))', flexShrink: 0 }} />
                  : <ChevronRight className="w-4 h-4" style={{ color: 'hsl(var(--muted-foreground))', flexShrink: 0 }} />}
        <div style={{ flex: 1 }}>
          <p style={{ fontSize: 14, fontWeight: 600, color: '#1D2B47', margin: 0 }}>{reviewerName || reviewerEmail}</p>
          <p style={{ fontSize: 12, color: 'hsl(var(--muted-foreground))', margin: 0 }}>{reviewerEmail}</p>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexShrink: 0 }}>
          {outstanding.length > 0 && (
            <span style={{ fontSize: 12, color: '#C15338', display: 'flex', alignItems: 'center', gap: 4 }}>
              <Clock className="w-3 h-3" /> {outstanding.length} outstanding
            </span>
          )}
          {responded.length > 0 && (
            <span style={{ fontSize: 12, color: '#6F8263' }}>{responded.length} responded</span>
          )}
          <ResendReviewerButton
            reviewerEmail={reviewerEmail}
            reviewerName={reviewerName}
            outstandingAssignments={outstanding}
            trendMap={trendMap}
          />
        </div>
      </button>

      {expanded && (
        <div style={{ borderTop: '1px solid hsl(var(--border))', padding: '8px 0' }}>
          {assignments.map(a => (
            <div key={a.id} style={{
              padding: '10px 16px', display: 'flex', alignItems: 'flex-start', gap: 10,
              background: a.status === 'responded' ? 'hsl(var(--card))' : '#FFF8F5',
              borderBottom: '1px solid hsl(var(--border)/0.5)',
            }}>
              <div style={{ flex: 1 }}>
                <p style={{ fontSize: 13, fontWeight: 500, color: '#1D2B47', margin: '0 0 2px' }}>
                  {a.challenge_name || 'Challenge'}
                </p>
                {a.trend_name && (
                  <p style={{ fontSize: 12, color: 'hsl(var(--muted-foreground))', margin: '0 0 4px' }}>{a.trend_name}</p>
                )}
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  <span style={{
                    fontSize: 11, padding: '1px 7px', borderRadius: 9999,
                    background: a.status === 'responded' ? '#eaf2e8' : '#fef3c7',
                    color: a.status === 'responded' ? '#3a6b2e' : '#92400e',
                  }}>
                    {a.status === 'responded' ? 'Responded' : 'Outstanding'}
                  </span>
                  <VerdictBadge verdict={a.verdict} />
                  {a.responded_at && (
                    <span style={{ fontSize: 11, color: 'hsl(var(--muted-foreground))' }}>
                      {new Date(a.responded_at).toLocaleDateString()}
                    </span>
                  )}
                </div>
                {a.comment && (
                  <p style={{ fontSize: 13, fontStyle: 'italic', color: '#475569', marginTop: 4 }}>"{a.comment}"</p>
                )}
              </div>
              <button
                onClick={() => onDelete(a.id)}
                style={{ padding: 4, borderRadius: 6, background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8', flexShrink: 0 }}
                title="Remove assignment"
                onMouseEnter={e => e.currentTarget.style.color = '#C15338'}
                onMouseLeave={e => e.currentTarget.style.color = '#94a3b8'}
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function ValidationsTab({ challenges, assignments, trends }) {
  const queryClient = useQueryClient();

  const trendMap = useMemo(() => Object.fromEntries(trends.map(t => [t.id, t])), [trends]);

  const challengeMutation = useMutation({
    mutationFn: ({ id, data }) => base44.entities.IndustryChallenge.update(id, data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['allIndustryChallenges'] }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => base44.entities.ReviewAssignment.delete(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['allReviewAssignments'] }),
  });

  const handleSaveValidation = async (challengeId, payload) => {
    // HUMAN-ONLY: validation_status, validated_by, validated_date only
    const safePayload = {
      validation_status: payload.validation_status,
      validated_by: payload.validated_by,
      validated_date: payload.validated_date,
    };
    await challengeMutation.mutateAsync({ id: challengeId, data: safePayload });
    toast.success('Validation decision saved');
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Remove this reviewer from the assignment list?')) return;
    await deleteMutation.mutateAsync(id);
    toast.success('Reviewer removed');
  };

  // Section A: group assignments by reviewer
  const reviewerGroups = useMemo(() => {
    const map = {};
    assignments.forEach(a => {
      const key = a.reviewer_email || '__unknown__';
      if (!map[key]) map[key] = { reviewerEmail: a.reviewer_email, reviewerName: a.reviewer_name, assignments: [] };
      map[key].assignments.push(a);
    });
    return Object.values(map);
  }, [assignments]);

  const outstandingTotal = useMemo(() =>
    assignments.filter(a => a.status !== 'responded').length, [assignments]);

  // Section B: approved challenges grouped by trend
  const approvedChallenges = useMemo(() =>
    challenges.filter(c => c.review_status === 'approved'), [challenges]);

  const approvedByTrend = useMemo(() => {
    const map = {};
    approvedChallenges.forEach(c => {
      const trendId = c.global_trend_id || '__unlinked__';
      if (!map[trendId]) map[trendId] = [];
      map[trendId].push(c);
    });
    return map;
  }, [approvedChallenges]);

  const trendIds = Object.keys(approvedByTrend);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 32 }}>

      {/* ── SECTION A: REVIEW ASSIGNMENTS ── */}
      <div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
          <h2 style={{ fontSize: 15, fontWeight: 600, color: '#1D2B47', margin: 0 }}>Review assignments</h2>
          {outstandingTotal > 0 && (
            <span style={{ fontSize: 12, fontWeight: 600, padding: '2px 8px', borderRadius: 9999, background: '#fef3c7', color: '#92400e' }}>
              {outstandingTotal} outstanding
            </span>
          )}
        </div>

        {reviewerGroups.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '32px 0', color: 'hsl(var(--muted-foreground))', fontSize: 14 }}>
            No outstanding review assignments.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {reviewerGroups.map(group => (
              <ReviewerGroup
                key={group.reviewerEmail}
                reviewerEmail={group.reviewerEmail}
                reviewerName={group.reviewerName}
                assignments={group.assignments}
                trendMap={trendMap}
                onDelete={handleDelete}
              />
            ))}
          </div>
        )}
      </div>

      {/* ── SECTION B: VALIDATION ROLLUP ── */}
      <div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
          <h2 style={{ fontSize: 15, fontWeight: 600, color: '#1D2B47', margin: 0 }}>Validation status by trend</h2>
          <span style={{ fontSize: 12, color: 'hsl(var(--muted-foreground))' }}>
            {approvedChallenges.length} approved challenge{approvedChallenges.length !== 1 ? 's' : ''}
          </span>
        </div>

        {trendIds.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '32px 0', color: 'hsl(var(--muted-foreground))', fontSize: 14 }}>
            No approved challenges to validate.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {trendIds.map(trendId => {
              const trend = trendMap[trendId];
              const group = approvedByTrend[trendId];
              return (
                <div key={trendId} style={{
                  background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))',
                  borderRadius: 10, overflow: 'hidden',
                  boxShadow: '0 1px 4px 0 rgba(29,43,71,0.06)',
                }}>
                  {/* Trend header */}
                  <div style={{ padding: '10px 16px', borderBottom: '1px solid hsl(var(--border))', background: 'hsl(var(--muted)/0.4)', display: 'flex', alignItems: 'center', gap: 8 }}>
                    {trend ? (
                      <Link
                        to={`/TrendHub/${trendId}`}
                        style={{ fontWeight: 600, fontSize: 13, color: '#1D428A', textDecoration: 'none' }}
                        onMouseEnter={e => e.currentTarget.style.textDecoration = 'underline'}
                        onMouseLeave={e => e.currentTarget.style.textDecoration = 'none'}
                      >
                        {trend.trend_name}
                      </Link>
                    ) : (
                      <span style={{ fontWeight: 600, fontSize: 13, color: '#1D2B47' }}>Unlinked</span>
                    )}
                    {trend?.category && (
                      <span style={{ fontSize: 11, padding: '1px 7px', borderRadius: 9999, background: 'hsl(var(--muted))', color: 'hsl(var(--muted-foreground))', textTransform: 'capitalize' }}>
                        {trend.category.replace(/_/g, ' ')}
                      </span>
                    )}
                  </div>

                  {/* Challenges */}
                  <div style={{ padding: '8px 16px 12px', display: 'flex', flexDirection: 'column', gap: 12 }}>
                    {group.map(c => (
                      <div key={c.id}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4, flexWrap: 'wrap' }}>
                          <span style={{ fontSize: 13, fontWeight: 500, color: '#1D2B47' }}>{c.name}</span>
                          <span style={{
                            fontSize: 11, padding: '1px 7px', borderRadius: 9999,
                            background: (VALIDATION_STATUS_COLORS[c.validation_status || 'unvalidated']).bg,
                            color: (VALIDATION_STATUS_COLORS[c.validation_status || 'unvalidated']).color,
                          }}>
                            {VALIDATION_STATUSES.find(s => s.value === (c.validation_status || 'unvalidated'))?.label}
                          </span>
                          {c.validated_by && (
                            <span style={{ fontSize: 11, color: 'hsl(var(--muted-foreground))' }}>by {c.validated_by}</span>
                          )}
                          {c.validated_date && (
                            <span style={{ fontSize: 11, color: 'hsl(var(--muted-foreground))' }}>
                              {new Date(c.validated_date).toLocaleDateString()}
                            </span>
                          )}
                        </div>
                        <ValidationControl challenge={c} onSave={handleSaveValidation} />
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}