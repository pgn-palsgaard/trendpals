import React, { useState, useMemo, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { useAuth } from '@/lib/AuthContext';
import { CheckCircle, AlertCircle, XCircle, ChevronDown, ChevronUp, Clock, Send } from 'lucide-react';
import { toast } from 'sonner';

const VERDICT_OPTIONS = [
  {
    value: 'confirmed',
    label: 'Confirmed',
    desc: 'The challenge is real and the hypothesis is credible',
    icon: CheckCircle,
    style: { background: '#F0F5EE', border: '2px solid #6F8263', color: '#3d5235' },
    activeStyle: { background: '#6F8263', border: '2px solid #6F8263', color: '#fff' },
  },
  {
    value: 'needs_refinement',
    label: 'Needs Refinement',
    desc: 'The direction is right but the framing needs work',
    icon: AlertCircle,
    style: { background: '#FFF8F0', border: '2px solid #C15338', color: '#7a3320' },
    activeStyle: { background: '#C15338', border: '2px solid #C15338', color: '#fff' },
  },
  {
    value: 'rejected',
    label: 'Rejected',
    desc: "This challenge doesn't hold up in practice",
    icon: XCircle,
    style: { background: '#F5F5F5', border: '2px solid #94a3b8', color: '#475569' },
    activeStyle: { background: '#64748b', border: '2px solid #64748b', color: '#fff' },
  },
];

const CAP_FIT_OPTIONS = [
  { value: 'strong', label: 'Strong fit' },
  { value: 'possible', label: 'Possible fit' },
  { value: 'none', label: 'No fit' },
  { value: 'unknown', label: 'Not sure' },
];

function AssignmentCard({ assignment, onSubmit, isSubmitting }) {
  const [expanded, setExpanded] = useState(false);
  const [verdict, setVerdict] = useState('');
  const [capFit, setCapFit] = useState('');
  const [comment, setComment] = useState('');

  const isResponded = assignment.status === 'responded';
  const isOpen = assignment.status === 'opened';

  // Auto-expand open items
  React.useEffect(() => {
    if (!isResponded) setExpanded(true);
  }, [isResponded]);

  const handleSubmit = () => {
    if (!verdict) { toast.error('Please select a verdict before submitting.'); return; }
    if (!comment.trim()) { toast.error('Please add a comment — your expert reasoning is the most valuable part.'); return; }
    onSubmit(assignment.id, { verdict, suggested_capability_fit: capFit || undefined, comment });
  };

  const verdictOpt = VERDICT_OPTIONS.find(v => v.value === assignment.verdict);

  return (
    <div
      className="rounded-2xl overflow-hidden transition-shadow"
      style={{
        background: '#fff',
        border: isResponded ? '1.5px solid #e2e8f0' : '1.5px solid #1D428A30',
        boxShadow: isResponded ? 'none' : '0 2px 12px rgba(29,66,138,0.07)',
        opacity: isResponded ? 0.8 : 1,
      }}
    >
      {/* Card header */}
      <button
        className="w-full text-left px-6 py-4 flex items-start justify-between gap-4"
        onClick={() => setExpanded(e => !e)}
      >
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            {isResponded ? (
              <span
                className="text-xs font-semibold px-2.5 py-0.5 rounded-full"
                style={
                  assignment.verdict === 'confirmed' ? { background: '#d4e8cc', color: '#3d5235' }
                  : assignment.verdict === 'needs_refinement' ? { background: '#fde8dc', color: '#7a3320' }
                  : { background: '#e8eaed', color: '#475569' }
                }
              >
                {verdictOpt?.label || assignment.verdict}
              </span>
            ) : (
              <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full" style={{ background: '#EEF2FF', color: '#1D428A' }}>
                {assignment.status === 'opened' ? 'In progress' : 'Awaiting your response'}
              </span>
            )}
            <span className="text-xs text-slate-400 capitalize">{assignment.category?.replace(/_/g, ' ')}</span>
          </div>
          <h3 className="font-semibold mt-1.5 leading-snug" style={{ color: '#1D2B47', fontSize: 16 }}>
            {assignment.challenge_name}
          </h3>
        </div>
        <div className="shrink-0 mt-1 text-slate-400">
          {expanded ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
        </div>
      </button>

      {/* Expanded body */}
      {expanded && (
        <div className="px-6 pb-6 space-y-5 border-t border-slate-100">
          {/* Challenge context from challenge entity */}
          <ChallengeContext challengeId={assignment.challenge_id} trendId={assignment.global_trend_id} />

          {isResponded ? (
            /* Read-only responded view */
            <div className="rounded-xl p-4 space-y-3" style={{ background: '#F7F4EE' }}>
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Your response</p>
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium" style={{ color: '#1D2B47' }}>Verdict:</span>
                <span
                  className="text-sm font-semibold px-2.5 py-0.5 rounded-full"
                  style={
                    assignment.verdict === 'confirmed' ? { background: '#d4e8cc', color: '#3d5235' }
                    : assignment.verdict === 'needs_refinement' ? { background: '#fde8dc', color: '#7a3320' }
                    : { background: '#e8eaed', color: '#475569' }
                  }
                >
                  {verdictOpt?.label}
                </span>
                {assignment.suggested_capability_fit && (
                  <span className="text-xs text-slate-500 ml-2">
                    Capability fit: <span className="font-medium">{CAP_FIT_OPTIONS.find(c => c.value === assignment.suggested_capability_fit)?.label}</span>
                  </span>
                )}
              </div>
              {assignment.comment && (
                <p className="text-sm text-slate-700 italic">"{assignment.comment}"</p>
              )}
              {assignment.responded_at && (
                <p className="text-xs text-slate-400">Submitted {new Date(assignment.responded_at).toLocaleDateString()}</p>
              )}
            </div>
          ) : (
            /* Response form */
            <div className="space-y-5">
              {/* Verdict buttons */}
              <div>
                <p className="text-sm font-semibold mb-2" style={{ color: '#1D2B47' }}>Your verdict</p>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  {VERDICT_OPTIONS.map(opt => {
                    const Icon = opt.icon;
                    const isActive = verdict === opt.value;
                    return (
                      <button
                        key={opt.value}
                        onClick={() => setVerdict(opt.value)}
                        className="flex flex-col items-start gap-1.5 rounded-xl p-4 text-left transition-all"
                        style={isActive ? opt.activeStyle : opt.style}
                      >
                        <div className="flex items-center gap-2">
                          <Icon className="w-4 h-4" />
                          <span className="font-semibold text-sm">{opt.label}</span>
                        </div>
                        <span className="text-xs opacity-80 leading-snug">{opt.desc}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Capability fit */}
              <div>
                <p className="text-sm font-semibold mb-2" style={{ color: '#1D2B47' }}>
                  Capability fit <span className="font-normal text-slate-400">(optional)</span>
                </p>
                <div className="flex flex-wrap gap-2">
                  {CAP_FIT_OPTIONS.map(opt => (
                    <button
                      key={opt.value}
                      onClick={() => setCapFit(capFit === opt.value ? '' : opt.value)}
                      className="px-3 py-1.5 rounded-lg text-sm font-medium transition-all"
                      style={
                        capFit === opt.value
                          ? { background: '#1D428A', color: '#fff', border: '1.5px solid #1D428A' }
                          : { background: '#fff', color: '#475569', border: '1.5px solid #e2e8f0' }
                      }
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Comment */}
              <div>
                <p className="text-sm font-semibold mb-1" style={{ color: '#1D2B47' }}>Your expert comment <span className="font-normal text-slate-400">(required)</span></p>
                <p className="text-xs text-slate-400 mb-2">This is the most valuable part — your reasoning, refinements, or field observations.</p>
                <textarea
                  value={comment}
                  onChange={e => setComment(e.target.value)}
                  placeholder="What's your expert take? What would you change, add, or emphasise?"
                  rows={4}
                  className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm text-slate-700 resize-none focus:outline-none focus:ring-2"
                  style={{ focusRingColor: '#1D428A' }}
                />
              </div>

              <button
                onClick={handleSubmit}
                disabled={isSubmitting}
                className="flex items-center gap-2 px-6 py-3 rounded-xl font-semibold text-sm transition-all disabled:opacity-50"
                style={{ background: '#1D428A', color: '#fff' }}
              >
                {isSubmitting ? (
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                ) : (
                  <Send className="w-4 h-4" />
                )}
                Submit my review
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function ChallengeContext({ challengeId, trendId }) {
  const { data: challenge } = useQuery({
    queryKey: ['challenge', challengeId],
    queryFn: () => base44.entities.IndustryChallenge.filter({ id: challengeId }).then(r => r[0]),
    enabled: !!challengeId,
  });

  const { data: trend } = useQuery({
    queryKey: ['trend-ctx', trendId],
    queryFn: () => base44.entities.GlobalTrend.filter({ id: trendId }).then(r => r[0]),
    enabled: !!trendId,
  });

  if (!challenge) return <div className="py-3 text-sm text-slate-400">Loading context…</div>;

  return (
    <div className="space-y-3 pt-2">
      {/* Trend context */}
      {trend && (
        <div className="rounded-xl px-4 py-3" style={{ background: '#F0F4FB' }}>
          <p className="text-xs font-semibold uppercase tracking-wide mb-0.5" style={{ color: '#1D428A' }}>Market trend context</p>
          <p className="text-sm font-medium" style={{ color: '#1D2B47' }}>{trend.trend_name}</p>
          {trend.market_signal && <p className="text-sm text-slate-500 mt-1 leading-relaxed">{trend.market_signal}</p>}
        </div>
      )}

      {/* Challenge description */}
      {challenge.description && (
        <div className="rounded-xl px-4 py-3" style={{ background: '#F7F4EE' }}>
          <p className="text-xs font-semibold uppercase tracking-wide mb-0.5 text-slate-500">The challenge (pain)</p>
          <p className="text-sm text-slate-700 leading-relaxed">{challenge.description}</p>
        </div>
      )}

      {/* Hypothesis — clearly labelled as unconfirmed */}
      {challenge.capability_hypothesis && (
        <div className="rounded-xl px-4 py-3" style={{ background: '#fff8f0', border: '1.5px dashed #C15338' }}>
          <p className="text-xs font-semibold uppercase tracking-wide mb-0.5" style={{ color: '#C15338' }}>
            ⚠ Unconfirmed hypothesis — we want your expert view
          </p>
          <p className="text-sm leading-relaxed" style={{ color: '#59361F' }}>{challenge.capability_hypothesis}</p>
        </div>
      )}
    </div>
  );
}

export default function SMEReviewQueue() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [tab, setTab] = useState('open');
  const [submittingId, setSubmittingId] = useState(null);

  const { data: assignments = [], isLoading } = useQuery({
    queryKey: ['myAssignments', user?.email],
    queryFn: () => base44.entities.ReviewAssignment.filter({ reviewer_email: user?.email }),
    enabled: !!user?.email,
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }) => base44.entities.ReviewAssignment.update(id, data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['myAssignments'] }),
  });

  // Mark as opened on first view
  const handleOpen = async (assignment) => {
    if (assignment.status === 'sent') {
      await updateMutation.mutateAsync({ id: assignment.id, data: { status: 'opened' } });
    }
  };

  const handleSubmit = async (id, payload) => {
    setSubmittingId(id);
    try {
      // IMMUTABLE RULE: only write SME-set fields + status/responded_at
      // NEVER write to challenge's validation_status/validated_by/validated_date
      const safePayload = {
        verdict: payload.verdict,
        comment: payload.comment,
        status: 'responded',
        responded_at: new Date().toISOString(),
      };
      if (payload.suggested_capability_fit) safePayload.suggested_capability_fit = payload.suggested_capability_fit;

      await updateMutation.mutateAsync({ id, data: safePayload });

      // Read-back confirmation
      const updated = await base44.entities.ReviewAssignment.filter({ id });
      const record = updated[0];
      if (!record || record.status !== 'responded' || !record.verdict) {
        throw new Error('Write confirmation failed — record not updated as expected');
      }

      toast.success('Thank you! Your review has been submitted.');
    } catch (err) {
      toast.error(`Submission failed: ${err.message}`);
    } finally {
      setSubmittingId(null);
    }
  };

  const open = assignments.filter(a => a.status !== 'responded');
  const responded = assignments.filter(a => a.status === 'responded');
  const displayed = tab === 'open' ? open : responded;

  return (
    <div className="min-h-screen" style={{ background: '#F7F4EE' }}>
      {/* Header */}
      <div style={{ background: '#1D2B47', borderBottom: '1px solid #2d3f61' }}>
        <div className="max-w-3xl mx-auto px-6 py-5 flex items-center justify-between">
          <div>
            <img
              src="https://qtrypzzcjebvfcihiynt.supabase.co/storage/v1/object/public/base44-prod/public/6987a5428ef229e6ee55cbb6/16cea8b8e_Palsgaardlogo_blue_250x250.png"
              alt="Palsgaard"
              className="h-8 mb-3"
              style={{ filter: 'brightness(0) invert(1)' }}
            />
            <h1 className="text-xl font-bold text-white">SME Review Queue</h1>
            <p className="text-sm mt-0.5" style={{ color: '#94afd4' }}>Your expert input shapes our capability intelligence</p>
          </div>
          <div className="text-right">
            {user?.full_name && <p className="text-sm font-medium text-white">{user.full_name}</p>}
            <p className="text-xs" style={{ color: '#94afd4' }}>{user?.email}</p>
            <button
              onClick={() => base44.auth.logout()}
              className="text-xs mt-2 underline"
              style={{ color: '#94afd4' }}
            >
              Sign out
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-3xl mx-auto px-6 py-8">
        {/* Tabs + counts */}
        <div className="flex items-center gap-1 mb-6 p-1 rounded-xl inline-flex" style={{ background: '#E8E3D8' }}>
          <button
            onClick={() => setTab('open')}
            className="px-4 py-2 rounded-lg text-sm font-medium transition-all"
            style={tab === 'open'
              ? { background: '#1D428A', color: '#fff' }
              : { color: '#1D2B47', background: 'transparent' }
            }
          >
            Open items
            {open.length > 0 && (
              <span className="ml-2 text-xs font-bold px-1.5 py-0.5 rounded-full" style={{ background: tab === 'open' ? 'rgba(255,255,255,0.25)' : '#C15338', color: '#fff' }}>
                {open.length}
              </span>
            )}
          </button>
          <button
            onClick={() => setTab('responded')}
            className="px-4 py-2 rounded-lg text-sm font-medium transition-all"
            style={tab === 'responded'
              ? { background: '#1D428A', color: '#fff' }
              : { color: '#1D2B47', background: 'transparent' }
            }
          >
            Submitted
            {responded.length > 0 && (
              <span className="ml-2 text-xs px-1.5 py-0.5 rounded-full" style={{ background: '#e2e8f0', color: '#475569' }}>
                {responded.length}
              </span>
            )}
          </button>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-24">
            <div className="w-8 h-8 border-4 border-slate-200 border-t-blue-800 rounded-full animate-spin" />
          </div>
        ) : displayed.length === 0 ? (
          <div className="text-center py-20">
            <Clock className="w-10 h-10 mx-auto mb-3 text-slate-300" />
            <p className="text-lg font-semibold text-slate-500">
              {tab === 'open' ? 'All caught up!' : 'No submissions yet'}
            </p>
            <p className="text-sm text-slate-400 mt-1">
              {tab === 'open' ? 'No open assignments right now.' : 'Submitted reviews will appear here.'}
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {displayed.map(a => (
              <div key={a.id} onClick={() => handleOpen(a)}>
                <AssignmentCard
                  assignment={a}
                  onSubmit={handleSubmit}
                  isSubmitting={submittingId === a.id}
                />
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}