import React, { useState, useEffect } from 'react';
import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import AssessmentReviewItem from '@/components/challenges/AssessmentReviewItem';
import AssessmentJobStatus from '@/components/challenges/AssessmentJobStatus';
export default function ChallengeAssessmentQueue() {
  const [filter, setFilter] = useState('pending');
  const qc = useQueryClient();
  const q = useInfiniteQuery({ queryKey: ['challengeAssessments', filter], initialPageParam: undefined, queryFn: ({ pageParam }) => base44.entities.ChallengeAssessment.filter({ is_latest: true, ...(filter === 'all' ? {} : { review_state: filter }) }, { sort: '-evaluated_at', limit: 20, ...(pageParam ? { cursor: pageParam } : {}) }), getNextPageParam: p => p.has_more ? p.next_cursor : undefined });
  const queue = useMutation({ mutationFn: () => base44.functions.invoke('queueChallengeAssessment', { reason: 'manual_review' }), onSuccess: () => qc.invalidateQueries({ queryKey: ['challengeAssessmentJobs'] }) });
  useEffect(() => { const unsub = base44.entities.ChallengeAssessment.subscribe(() => { qc.invalidateQueries({ queryKey: ['challengeAssessments'] }); qc.invalidateQueries({ queryKey: ['challengeAssessmentJobs'] }); qc.invalidateQueries({ queryKey: ['assessmentHistory'] }); }); return unsub; }, [qc]);
  return <div className="space-y-4">
    <div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-lg font-semibold">Challenge-to-trend assessments</h2><p className="text-xs text-muted-foreground">Evidence-based advice, never automatic approval or market validation.</p></div><button className="rounded border border-border px-3 py-2 text-sm disabled:opacity-50" disabled={queue.isPending} onClick={() => queue.mutate()}>{queue.isPending ? 'Queueing…' : 'Queue reassessment'}</button></div>
    <AssessmentJobStatus />
    {queue.isSuccess && <p className="text-sm text-primary">Queued. The background worker processes resumable batches every five minutes.</p>}
    {queue.error && <p role="alert" className="text-sm text-destructive">{queue.error.message}</p>}
    <div className="flex flex-wrap items-center gap-3"><label className="text-sm">Review state <select aria-label="Assessment review state" className="ml-2 rounded border border-border bg-card px-2 py-1" value={filter} onChange={e => setFilter(e.target.value)}><option value="pending">Needs expert review</option><option value="reviewed">Reviewed</option><option value="all">All latest assessments</option></select></label><button className="text-sm text-primary underline" onClick={() => { q.refetch(); qc.invalidateQueries({ queryKey: ['challengeAssessmentJobs'] }); }}>Refresh</button></div>
    {q.isPending && <p className="text-sm">Loading assessments…</p>}
    {q.error && <p role="alert" className="text-sm text-destructive">{q.error.message}</p>}
    {q.data?.pages[0]?.items.length === 0 && <p className="rounded border border-border p-6 text-sm text-muted-foreground">No assessments in this review state.</p>}
    {q.data?.pages.flatMap(p => p.items).map(a => <AssessmentReviewItem key={a.id} assessment={a} />)}
    {q.hasNextPage && <button className="rounded border border-border px-4 py-2 text-sm" disabled={q.isFetchingNextPage} onClick={() => q.fetchNextPage()}>{q.isFetchingNextPage ? 'Loading…' : 'Load more assessments'}</button>}
  </div>;
}