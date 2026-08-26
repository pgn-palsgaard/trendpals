import React, { useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { useAuth } from '@/lib/AuthContext';
import { toast } from 'sonner';
import { getRegionLabel } from '@/lib/regions';
import TrendReviewGroup from '@/components/reviewportal/TrendReviewGroup';

const VERDICT_LABELS = { confirmed: 'Confirmed', needs_refinement: 'Needs refinement', rejected: 'Rejected' };
const SIGNAL_LABELS = { strong: 'Strong signal', emerging: 'Emerging', not_seeing_it: 'Not seeing it' };

export default function SMEReviewPortal() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const currentUserEmail = user?.email;

  const { data: assignments = [], isLoading: loadingAssignments } = useQuery({
    queryKey: ['myReviewAssignments', currentUserEmail],
    queryFn: () => base44.entities.ReviewAssignment.filter({ reviewer_email: currentUserEmail }),
    enabled: !!currentUserEmail,
  });

  const { data: allChallenges = [], isLoading: loadingChallenges } = useQuery({
    queryKey: ['assignedChallenges'],
    queryFn: () => base44.entities.IndustryChallenge.filter({}),
    enabled: assignments.length > 0,
  });

  const { data: allTrends = [], isLoading: loadingTrends } = useQuery({
    queryKey: ['assignedTrends'],
    queryFn: () => base44.entities.GlobalTrend.filter({}),
    enabled: assignments.length > 0,
  });

  const challengeMap = useMemo(() => Object.fromEntries(allChallenges.map(c => [c.id, c])), [allChallenges]);
  const trendMap = useMemo(() => Object.fromEntries(allTrends.map(t => [t.id, t])), [allTrends]);

  const submitMutation = useMutation({
    mutationFn: (updates) => Promise.all(updates.map(u => base44.entities.ReviewAssignment.update(u.id, u.data))),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['myReviewAssignments', currentUserEmail] });
      queryClient.invalidateQueries({ queryKey: ['smeAnnotationAssignments'] });
    },
  });

  const pending = useMemo(() => assignments.filter(a => a.status !== 'responded'), [assignments]);
  const completed = useMemo(() => assignments.filter(a => a.status === 'responded'), [assignments]);

  // Resolve the trend id for an assignment (challenge's parent trend, falling back to denormalized id)
  const trendIdFor = (a) => challengeMap[a.challenge_id]?.global_trend_id || a.global_trend_id || '__ungrouped__';

  // Group pending assignments by trend
  const pendingGroups = useMemo(() => {
    const groups = {};
    pending.forEach(a => {
      const tid = trendIdFor(a);
      if (!groups[tid]) groups[tid] = [];
      groups[tid].push(a);
    });
    return Object.entries(groups).map(([tid, items]) => ({
      trendId: tid,
      trend: trendMap[tid],
      assignments: items,
    }));
  }, [pending, challengeMap, trendMap]);

  const handleSubmitGroup = async ({ signal, region, items }) => {
    // CRITICAL: writes ONLY to ReviewAssignment. trend_signal applied to every assignment in the group.
    const updates = items.map(({ assignment, verdict, comment }) => ({
      id: assignment.id,
      data: {
        status: 'responded',
        verdict,
        comment: comment || '',
        trend_signal: signal,
        // Self-declared region, only when the dispatcher left it unset.
        ...(region ? { reviewer_region: region } : {}),
        responded_at: new Date().toISOString(),
      },
    }));
    await submitMutation.mutateAsync(updates);
    toast.success('Thank you — your review has been recorded.');
  };

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
              {pendingGroups.length} {pendingGroups.length === 1 ? 'trend' : 'trends'} awaiting your market validation
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
          {/* Awaiting — grouped by trend */}
          {pendingGroups.length > 0 && (
            <div>
              <p style={{ fontSize: 13, fontWeight: 600, color: '#1D2B47', marginBottom: 12 }}>Awaiting your review</p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                {pendingGroups.map(g => (
                  <TrendReviewGroup
                    key={g.trendId}
                    trend={g.trend}
                    assignments={g.assignments}
                    challengeMap={challengeMap}
                    onSubmitGroup={handleSubmitGroup}
                    isSubmitting={submitMutation.isPending}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Completed */}
          {completed.length > 0 && (
            <div>
              <p style={{ fontSize: 13, fontWeight: 600, color: '#1D2B47', marginBottom: 12 }}>Completed</p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {completed.map(a => {
                  const challenge = challengeMap[a.challenge_id];
                  const isConfirmed = a.verdict === 'confirmed';
                  return (
                    <div key={a.id} className="pal-card" style={{ padding: 16, opacity: 0.7 }}>
                      <div className="flex items-start justify-between gap-3 mb-1.5">
                        <h3 style={{ fontSize: 14, fontWeight: 600, color: '#1D2B47', lineHeight: 1.4 }}>
                          {challenge?.name || a.challenge_name}
                        </h3>
                        <span style={{ fontSize: 11, fontWeight: 600, padding: '2px 9px', borderRadius: 9999, background: isConfirmed ? '#EEF1EC' : 'hsl(var(--muted))', color: isConfirmed ? '#4A6040' : 'hsl(var(--muted-foreground))', whiteSpace: 'nowrap' }}>
                          {VERDICT_LABELS[a.verdict] || a.verdict}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 flex-wrap" style={{ marginBottom: a.comment ? 6 : 4 }}>
                        {a.trend_signal && (
                          <span style={{ fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 9999, background: '#EBF0F8', color: '#1D428A' }}>
                            {SIGNAL_LABELS[a.trend_signal] || a.trend_signal}
                          </span>
                        )}
                        {a.reviewer_region && (
                          <span style={{ fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 9999, background: 'hsl(var(--muted))', color: 'hsl(var(--muted-foreground))' }}>
                            {getRegionLabel(a.reviewer_region)}
                          </span>
                        )}
                      </div>
                      {a.comment && (
                        <p style={{ fontSize: 12.5, lineHeight: 1.5, color: '#3A4A66', fontStyle: 'italic', marginBottom: 4 }}>
                          "{a.comment}"
                        </p>
                      )}
                      {a.responded_at && (
                        <p style={{ fontSize: 11, color: 'hsl(var(--muted-foreground))' }}>
                          Submitted {new Date(a.responded_at).toLocaleDateString()}
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