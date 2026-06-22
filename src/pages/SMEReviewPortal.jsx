import React, { useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { useAuth } from '@/lib/AuthContext';
import { toast } from 'sonner';
import AssignmentCard from '@/components/reviewportal/AssignmentCard';

const VERDICT_LABELS = { validated: 'Validated', not_validated: 'Not validated' };

export default function SMEReviewPortal() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const currentUserEmail = user?.email;

  // (b) Assignments for this reviewer
  const { data: assignments = [], isLoading: loadingAssignments } = useQuery({
    queryKey: ['myReviewAssignments', currentUserEmail],
    queryFn: () => base44.entities.ReviewAssignment.filter({ reviewer_email: currentUserEmail }),
    enabled: !!currentUserEmail,
  });

  // (c) Challenges for the assigned challenge IDs
  const { data: allChallenges = [], isLoading: loadingChallenges } = useQuery({
    queryKey: ['assignedChallenges'],
    queryFn: () => base44.entities.IndustryChallenge.filter({}),
    enabled: assignments.length > 0,
  });

  // (d) Trends for context
  const { data: allTrends = [], isLoading: loadingTrends } = useQuery({
    queryKey: ['assignedTrends'],
    queryFn: () => base44.entities.GlobalTrend.filter({}),
    enabled: assignments.length > 0,
  });

  const challengeMap = useMemo(() => Object.fromEntries(allChallenges.map(c => [c.id, c])), [allChallenges]);
  const trendMap = useMemo(() => Object.fromEntries(allTrends.map(t => [t.id, t])), [allTrends]);

  const submitMutation = useMutation({
    mutationFn: ({ id, data }) => base44.entities.ReviewAssignment.update(id, data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['myReviewAssignments', currentUserEmail] }),
  });

  const handleSubmit = async (assignment, verdict, comment) => {
    if (!verdict) return;
    // CRITICAL: writes ONLY to ReviewAssignment. Never touches IndustryChallenge validation fields.
    await submitMutation.mutateAsync({
      id: assignment.id,
      data: {
        status: 'responded',
        verdict,
        verdict_comment: comment || '',
        submitted_at: new Date().toISOString(),
      },
    });
    toast.success('Thank you — your verdict has been recorded.');
  };

  const pending = useMemo(() => assignments.filter(a => a.status !== 'responded'), [assignments]);
  const completed = useMemo(() => assignments.filter(a => a.status === 'responded'), [assignments]);

  const isLoading = loadingAssignments || (assignments.length > 0 && (loadingChallenges || loadingTrends));

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center" style={{ padding: '80px 0', gap: 14 }}>
        <div className="w-8 h-8 border-4 border-muted border-t-[#1D428A] rounded-full animate-spin" />
        <p style={{ fontSize: 13, color: 'hsl(var(--muted-foreground))' }}>Loading your assignments…</p>
      </div>
    );
  }

  return (
    <div>
      {/* Header */}
      <div style={{ marginBottom: 24 }}>
        <p className="section-label" style={{ marginBottom: 6 }}>TrendPals · Expert review</p>
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 style={{ fontFamily: "'Lora', Georgia, serif", fontWeight: 600, fontSize: 28, color: '#1D2B47', marginBottom: 4 }}>
              Your review assignments
            </h1>
            <p style={{ fontSize: 14, color: 'hsl(var(--muted-foreground))' }}>
              {pending.length} {pending.length === 1 ? 'challenge' : 'challenges'} awaiting your market validation
            </p>
          </div>
          {user && (
            <div className="text-right shrink-0">
              <p style={{ fontSize: 13, fontWeight: 600, color: '#1D2B47' }}>{user.full_name}</p>
              <p style={{ fontSize: 11, color: 'hsl(var(--muted-foreground))' }}>{user.email}</p>
            </div>
          )}
        </div>
      </div>

      {/* Empty state */}
      {assignments.length === 0 ? (
        <div className="pal-card" style={{ padding: '48px 24px', textAlign: 'center' }}>
          <p style={{ fontSize: 14, color: 'hsl(var(--muted-foreground))', lineHeight: 1.6, maxWidth: 460, margin: '0 auto' }}>
            You have no review assignments. When the innovation team needs your market expertise,
            assignments will appear here.
          </p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
          {/* Group 1 — Awaiting */}
          {pending.length > 0 && (
            <div>
              <p style={{ fontSize: 13, fontWeight: 600, color: '#1D2B47', marginBottom: 12 }}>Awaiting your review</p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                {pending.map(a => (
                  <AssignmentCard
                    key={a.id}
                    assignment={a}
                    challenge={challengeMap[a.challenge_id]}
                    trend={trendMap[challengeMap[a.challenge_id]?.global_trend_id || a.global_trend_id]}
                    onSubmit={handleSubmit}
                    isSubmitting={submitMutation.isPending}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Group 2 — Completed */}
          {completed.length > 0 && (
            <div>
              <p style={{ fontSize: 13, fontWeight: 600, color: '#1D2B47', marginBottom: 12 }}>Completed</p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {completed.map(a => {
                  const challenge = challengeMap[a.challenge_id];
                  const isValidated = a.verdict === 'validated';
                  return (
                    <div key={a.id} className="pal-card" style={{ padding: 16, opacity: 0.7 }}>
                      <div className="flex items-start justify-between gap-3 mb-1.5">
                        <h3 style={{ fontSize: 14, fontWeight: 600, color: '#1D2B47', lineHeight: 1.4 }}>
                          {challenge?.name || a.challenge_name}
                        </h3>
                        <span style={{ fontSize: 11, fontWeight: 600, padding: '2px 9px', borderRadius: 9999, background: isValidated ? '#EEF1EC' : 'hsl(var(--muted))', color: isValidated ? '#4A6040' : 'hsl(var(--muted-foreground))', whiteSpace: 'nowrap' }}>
                          {VERDICT_LABELS[a.verdict] || a.verdict}
                        </span>
                      </div>
                      {a.verdict_comment && (
                        <p style={{ fontSize: 12.5, lineHeight: 1.5, color: '#3A4A66', fontStyle: 'italic', marginBottom: 4 }}>
                          "{a.verdict_comment}"
                        </p>
                      )}
                      {a.submitted_at && (
                        <p style={{ fontSize: 11, color: 'hsl(var(--muted-foreground))' }}>
                          Submitted {new Date(a.submitted_at).toLocaleDateString()}
                        </p>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}