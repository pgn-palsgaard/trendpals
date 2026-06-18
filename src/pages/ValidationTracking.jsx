import React, { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { CheckCircle, AlertCircle, XCircle, Clock, Users, ChevronDown, ChevronRight } from 'lucide-react';
import { toast } from 'sonner';
import ResendReviewerButton from '@/components/challenges/ResendReviewerButton';

const VERDICT_STYLE = {
  confirmed: { bg: '#d4e8cc', color: '#3d5235', label: 'Confirmed' },
  needs_refinement: { bg: '#fde8dc', color: '#7a3320', label: 'Needs refinement' },
  rejected: { bg: '#e8eaed', color: '#475569', label: 'Rejected' },
};

const VALIDATION_STATUSES = [
  { value: 'unvalidated', label: 'Unvalidated' },
  { value: 'in_field', label: 'In field' },
  { value: 'confirmed', label: 'Confirmed' },
  { value: 'rejected', label: 'Rejected' },
];

const CAP_FIT_LABELS = {
  strong: 'Strong fit',
  possible: 'Possible fit',
  none: 'No fit',
  unknown: 'Not sure',
};

function VerdictBadge({ verdict }) {
  if (!verdict) return <span className="text-xs text-slate-400">—</span>;
  const s = VERDICT_STYLE[verdict] || {};
  return (
    <span className="text-xs font-semibold px-2 py-0.5 rounded-full" style={{ background: s.bg, color: s.color }}>
      {s.label}
    </span>
  );
}

function VerdictBar({ assignments }) {
  const responded = assignments.filter(a => a.status === 'responded');
  const counts = { confirmed: 0, needs_refinement: 0, rejected: 0 };
  responded.forEach(a => { if (a.verdict) counts[a.verdict]++; });
  const total = responded.length;
  if (total === 0) return null;

  const disagreement = Object.values(counts).filter(v => v > 0).length > 1;

  return (
    <div>
      <div className="flex gap-1 h-2 rounded-full overflow-hidden mb-1">
        {counts.confirmed > 0 && (
          <div style={{ flex: counts.confirmed, background: '#6F8263' }} />
        )}
        {counts.needs_refinement > 0 && (
          <div style={{ flex: counts.needs_refinement, background: '#C15338' }} />
        )}
        {counts.rejected > 0 && (
          <div style={{ flex: counts.rejected, background: '#94a3b8' }} />
        )}
      </div>
      <div className="flex items-center gap-3 text-xs text-slate-500">
        {counts.confirmed > 0 && <span style={{ color: '#3d5235' }}>✓ {counts.confirmed} confirmed</span>}
        {counts.needs_refinement > 0 && <span style={{ color: '#7a3320' }}>~ {counts.needs_refinement} needs refinement</span>}
        {counts.rejected > 0 && <span className="text-slate-400">✗ {counts.rejected} rejected</span>}
        {disagreement && (
          <span className="font-semibold ml-auto" style={{ color: '#C15338' }}>⚠ Reviewers disagree</span>
        )}
      </div>
    </div>
  );
}

function ValidationRollupControl({ challenge, onSave }) {
  const [status, setStatus] = useState(challenge.validation_status || 'unvalidated');
  const [validatedBy, setValidatedBy] = useState(challenge.validated_by || '');
  const [dirty, setDirty] = useState(false);

  const handleChange = (field, val) => {
    if (field === 'status') setStatus(val);
    if (field === 'validatedBy') setValidatedBy(val);
    setDirty(true);
  };

  const handleSave = () => {
    // IMMUTABLE RULE: only admin sets validation_status, validated_by, validated_date
    onSave(challenge.id, {
      validation_status: status,
      validated_by: validatedBy,
      validated_date: new Date().toISOString(),
    });
    setDirty(false);
  };

  const statusColors = {
    unvalidated: { bg: '#f1f5f9', color: '#475569' },
    in_field: { bg: '#EEF2FF', color: '#1D428A' },
    confirmed: { bg: '#d4e8cc', color: '#3d5235' },
    rejected: { bg: '#e8eaed', color: '#475569' },
  };
  const sc = statusColors[status] || statusColors.unvalidated;

  return (
    <div className="rounded-xl p-4 space-y-3" style={{ background: '#F7F4EE', border: '1.5px solid #e2d8c8' }}>
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Admin rollup decision</p>
      <div className="flex flex-wrap gap-2 items-end">
        <div>
          <p className="text-xs text-slate-500 mb-1">Validation status</p>
          <select
            value={status}
            onChange={e => handleChange('status', e.target.value)}
            className="text-sm border border-slate-200 rounded-lg px-3 py-1.5 focus:outline-none"
            style={{ background: sc.bg, color: sc.color, fontWeight: 600, border: `1.5px solid ${sc.color}30` }}
          >
            {VALIDATION_STATUSES.map(s => (
              <option key={s.value} value={s.value}>{s.label}</option>
            ))}
          </select>
        </div>
        <div>
          <p className="text-xs text-slate-500 mb-1">Decided by</p>
          <input
            value={validatedBy}
            onChange={e => handleChange('validatedBy', e.target.value)}
            placeholder="Your name"
            className="text-sm border border-slate-200 rounded-lg px-3 py-1.5 focus:outline-none w-40"
          />
        </div>
        {dirty && (
          <button
            onClick={handleSave}
            className="px-4 py-1.5 rounded-lg text-sm font-semibold text-white transition-all"
            style={{ background: '#1D428A' }}
          >
            Save decision
          </button>
        )}
      </div>
      {challenge.validated_date && (
        <p className="text-xs text-slate-400">
          Last updated {new Date(challenge.validated_date).toLocaleDateString()} by {challenge.validated_by || '—'}
        </p>
      )}
    </div>
  );
}

function ChallengeTrackingRow({ challenge, assignments, onSaveValidation, trendMap = {} }) {
  const [expanded, setExpanded] = useState(false);
  const total = assignments.length;
  const responded = assignments.filter(a => a.status === 'responded').length;
  const outstanding = assignments.filter(a => a.status !== 'responded');
  const allDone = responded === total && total > 0;

  return (
    <div className="bg-card rounded-[10px] overflow-hidden border border-border" style={{ boxShadow: '0 1px 4px 0 rgba(29,43,71,0.06)' }}>
      <button
        className="w-full text-left px-5 py-4 flex items-start gap-3"
        onClick={() => setExpanded(e => !e)}
      >
        <div className="mt-0.5 text-slate-400">
          {expanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-1">
            <h3 className="font-semibold text-sm" style={{ color: '#1D2B47' }}>{challenge.name}</h3>
            <span className="text-xs text-slate-400 capitalize">{challenge.category?.replace(/_/g, ' ')}</span>
          </div>
          <VerdictBar assignments={assignments} />
          <div className="flex items-center gap-3 mt-2">
            <span className="flex items-center gap-1 text-xs text-slate-500">
              <Users className="w-3 h-3" />
              {responded}/{total} responded
            </span>
            {outstanding.length > 0 && (
              <span className="text-xs font-medium" style={{ color: '#C15338' }}>
                {outstanding.map(a => a.reviewer_name || a.reviewer_email).join(', ')} outstanding
              </span>
            )}
            {allDone && (
              <span className="text-xs font-semibold" style={{ color: '#6F8263' }}>✓ All responses in</span>
            )}
            {challenge.validation_status && challenge.validation_status !== 'unvalidated' && (
              <span className="text-xs font-semibold px-2 py-0.5 rounded-full ml-auto"
                style={challenge.validation_status === 'confirmed' ? { background: '#d4e8cc', color: '#3d5235' }
                  : challenge.validation_status === 'rejected' ? { background: '#e8eaed', color: '#475569' }
                  : { background: '#EEF2FF', color: '#1D428A' }
                }
              >
                {VALIDATION_STATUSES.find(s => s.value === challenge.validation_status)?.label}
              </span>
            )}
          </div>
        </div>
      </button>

      {expanded && (
        <div className="px-5 pb-5 space-y-4 border-t border-border pt-4">
          {/* SME responses */}
          <div className="space-y-3">
            {assignments.map(a => (
              <div key={a.id} className="rounded-xl p-4" style={{ background: a.status === 'responded' ? '#F9FAFB' : '#FFF8F5', border: a.status !== 'responded' ? '1px dashed #C1533850' : '1px solid #e2e8f0' }}>
                <div className="flex items-start justify-between gap-2 mb-2">
                  <div>
                    <p className="text-sm font-medium" style={{ color: '#1D2B47' }}>{a.reviewer_name || a.reviewer_email}</p>
                    <p className="text-xs text-slate-400">{a.reviewer_email}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    {a.status === 'responded' ? (
                      <VerdictBadge verdict={a.verdict} />
                    ) : (
                      <>
                        <span className="flex items-center gap-1 text-xs font-medium" style={{ color: '#C15338' }}>
                          <Clock className="w-3 h-3" /> Outstanding
                        </span>
                        <ResendReviewerButton
                          reviewerEmail={a.reviewer_email}
                          reviewerName={a.reviewer_name}
                          outstandingAssignments={assignments.filter(x => x.reviewer_email === a.reviewer_email && x.status !== 'responded')}
                          trendMap={trendMap}
                        />
                      </>
                    )}
                  </div>
                </div>
                {a.suggested_capability_fit && (
                  <p className="text-xs text-slate-500 mb-1">
                    Capability fit: <span className="font-medium">{CAP_FIT_LABELS[a.suggested_capability_fit]}</span>
                  </p>
                )}
                {a.comment && (
                  <p className="text-sm text-slate-700 italic leading-relaxed">"{a.comment}"</p>
                )}
                {a.responded_at && (
                  <p className="text-xs text-slate-400 mt-1">Submitted {new Date(a.responded_at).toLocaleDateString()}</p>
                )}
              </div>
            ))}
          </div>

          {/* Admin rollup — ONLY place to write validation_status/validated_by/validated_date */}
          <ValidationRollupControl challenge={challenge} onSave={onSaveValidation} />
        </div>
      )}
    </div>
  );
}

export default function ValidationTracking() {
  const queryClient = useQueryClient();
  const [filter, setFilter] = useState('all');

  const { data: assignments = [], isLoading: loadingAssignments } = useQuery({
    queryKey: ['allAssignments'],
    queryFn: () => base44.entities.ReviewAssignment.list(),
  });

  const { data: challenges = [], isLoading: loadingChallenges } = useQuery({
    queryKey: ['industryChallengesTracking'],
    queryFn: () => base44.entities.IndustryChallenge.list(),
  });

  const { data: trends = [] } = useQuery({
    queryKey: ['globalTrends'],
    queryFn: () => base44.entities.GlobalTrend.list(),
  });
  const trendMap = useMemo(() => Object.fromEntries(trends.map(t => [t.id, t])), [trends]);

  const updateChallengeMutation = useMutation({
    mutationFn: ({ id, data }) => base44.entities.IndustryChallenge.update(id, data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['industryChallengesTracking'] }),
  });

  const handleSaveValidation = async (challengeId, payload) => {
    // IMMUTABLE RULE: only validation_status, validated_by, validated_date — never verdict/comment/responded_at
    const safePayload = {
      validation_status: payload.validation_status,
      validated_by: payload.validated_by,
      validated_date: payload.validated_date,
    };
    await updateChallengeMutation.mutateAsync({ id: challengeId, data: safePayload });
    toast.success('Validation decision saved');
  };

  // Group assignments by challenge_id
  const assignmentsByChallenge = useMemo(() => {
    const map = {};
    assignments.forEach(a => {
      if (!map[a.challenge_id]) map[a.challenge_id] = [];
      map[a.challenge_id].push(a);
    });
    return map;
  }, [assignments]);

  // Only challenges that have at least one assignment
  const challengesWithAssignments = useMemo(() => {
    return challenges.filter(c => assignmentsByChallenge[c.id]?.length > 0);
  }, [challenges, assignmentsByChallenge]);

  const filtered = useMemo(() => {
    return challengesWithAssignments.filter(c => {
      const ass = assignmentsByChallenge[c.id] || [];
      const responded = ass.filter(a => a.status === 'responded').length;
      if (filter === 'awaiting') return responded < ass.length;
      if (filter === 'complete') return responded === ass.length && ass.length > 0;
      if (filter === 'unvalidated') return !c.validation_status || c.validation_status === 'unvalidated';
      return true;
    });
  }, [challengesWithAssignments, assignmentsByChallenge, filter]);

  const totalAssigned = challengesWithAssignments.length;
  const totalResponded = challengesWithAssignments.filter(c => {
    const ass = assignmentsByChallenge[c.id] || [];
    return ass.every(a => a.status === 'responded') && ass.length > 0;
  }).length;
  const totalOutstanding = challengesWithAssignments.filter(c => {
    const ass = assignmentsByChallenge[c.id] || [];
    return ass.some(a => a.status !== 'responded');
  }).length;

  const isLoading = loadingAssignments || loadingChallenges;

  return (
    <div className="min-h-screen bg-background">

      <div className="max-w-5xl mx-auto px-4 md:px-6 py-8">
        <div className="mb-6">
          <h1 className="font-heading text-2xl font-semibold text-foreground">Validation tracking</h1>
          <p className="text-sm text-muted-foreground mt-1">SME field validation rollup — review responses and set final validation decisions.</p>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-4 mb-6">
          {[
            { label: 'Challenges in field', value: totalAssigned, color: '#1D428A', bg: '#EEF2FF' },
            { label: 'All responses in', value: totalResponded, color: '#6F8263', bg: '#F0F5EE' },
            { label: 'Outstanding', value: totalOutstanding, color: '#C15338', bg: '#FFF0ED' },
          ].map(s => (
            <div key={s.label} className="rounded-xl p-4 text-center" style={{ background: s.bg }}>
              <p className="text-2xl font-bold" style={{ color: s.color }}>{s.value}</p>
              <p className="text-xs text-slate-500 mt-0.5">{s.label}</p>
            </div>
          ))}
        </div>

        {/* Filter tabs */}
        <div className="flex items-center gap-1 mb-6 p-1 rounded-xl inline-flex" style={{ background: '#e8e3d8' }}>
          {[
            { key: 'all', label: 'All' },
            { key: 'awaiting', label: 'Awaiting responses' },
            { key: 'complete', label: 'All responded' },
            { key: 'unvalidated', label: 'Unvalidated' },
          ].map(t => (
            <button
              key={t.key}
              onClick={() => setFilter(t.key)}
              className="px-4 py-2 rounded-lg text-sm font-medium transition-all"
              style={filter === t.key
                ? { background: '#1D428A', color: '#fff' }
                : { color: '#1D2B47', background: 'transparent' }
              }
            >
              {t.label}
            </button>
          ))}
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-24">
            <div className="w-8 h-8 border-4 border-slate-200 border-t-blue-700 rounded-full animate-spin" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-20 text-slate-400">
            <Users className="w-10 h-10 mx-auto mb-3" style={{ color: '#cbd5e1' }} />
            <p className="text-lg font-medium">No challenges found for this filter</p>
            <p className="text-sm mt-1">Dispatch some challenges from the Challenge Library to get started.</p>
          </div>
        ) : (
          <div className="space-y-4">
            {filtered.map(c => (
              <ChallengeTrackingRow
                key={c.id}
                challenge={c}
                assignments={assignmentsByChallenge[c.id] || []}
                onSaveValidation={handleSaveValidation}
                trendMap={trendMap}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}