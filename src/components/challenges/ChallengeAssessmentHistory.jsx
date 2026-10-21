import React from 'react';
import { useInfiniteQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import AssessmentDetails from '@/components/challenges/AssessmentDetails';
export default function ChallengeAssessmentHistory({ challengeId }) {
  const q = useInfiniteQuery({ queryKey: ['assessmentHistory', challengeId], initialPageParam: undefined, queryFn: ({ pageParam }) => base44.entities.ChallengeAssessment.filter({ challenge_id: challengeId }, { sort: '-evaluated_at', limit: 5, ...(pageParam ? { cursor: pageParam } : {}) }), getNextPageParam: p => p.has_more ? p.next_cursor : undefined });
  return <section className="space-y-3 rounded-lg border border-border bg-card p-4">
    <h3 className="text-sm font-semibold">Automated trend assessment history</h3>
    <p className="text-xs text-muted-foreground">Advisory only. Editorial approval and human market validation are unchanged.</p>
    {q.isPending && <p className="text-sm">Loading assessments…</p>}
    {q.error && <p className="text-sm text-destructive">{q.error.message}</p>}
    {q.data?.pages.flatMap(p => p.items).map((a,i) => <details key={a.id} open={i === 0}><summary className="mb-3 cursor-pointer text-xs font-semibold">{a.recommendation.replaceAll('_',' ')} · {new Date(a.evaluated_at).toLocaleDateString()} · {a.review_state}</summary><AssessmentDetails assessment={a} /></details>)}
    {q.data?.pages[0]?.items.length === 0 && <p className="text-xs text-muted-foreground">Not assessed yet. Background evaluation will add a separate advisory result.</p>}
    {q.hasNextPage && <button className="text-sm text-primary underline" disabled={q.isFetchingNextPage} onClick={() => q.fetchNextPage()}>{q.isFetchingNextPage ? 'Loading…' : 'Load older assessments'}</button>}
  </section>;
}