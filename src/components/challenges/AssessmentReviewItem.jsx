import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import AssessmentDetails from '@/components/challenges/AssessmentDetails';
export default function AssessmentReviewItem({ assessment: a }) {
  const [note, setNote] = useState('');
  const qc = useQueryClient();
  const review = useMutation({ mutationFn: () => base44.functions.invoke('reviewChallengeAssessment', { assessment_id: a.id, note }), onSuccess: () => { qc.invalidateQueries({ queryKey: ['challengeAssessments'] }); qc.invalidateQueries({ queryKey: ['assessmentHistory', a.challenge_id] }); } });
  return <article className="rounded-lg border border-border bg-card p-4">
    <h3 className="text-sm font-semibold">{a.challenge_name}</h3>
    <Link className="text-xs text-primary underline" to={`/TrendHub/${a.global_trend_id}`}>{a.trend_name}</Link>
    <p className="my-2 text-xs font-semibold text-primary">{a.recommendation.replaceAll('_',' ')} · {a.review_state}</p>
    <details><summary className="mb-3 cursor-pointer text-sm">Evidence, reasoning and suggestions</summary><AssessmentDetails assessment={a} /></details>
    {a.review_state === 'pending' && <div className="mt-3 flex flex-wrap gap-2"><input aria-label="Assessment review note" className="min-w-0 flex-1 rounded border border-input bg-background px-3 py-2 text-sm" placeholder="Optional review note" value={note} onChange={e => setNote(e.target.value)} /><button disabled={review.isPending} className="rounded bg-primary px-3 py-2 text-sm text-primary-foreground disabled:opacity-50" onClick={() => review.mutate()}>{review.isPending ? 'Saving…' : 'Mark assessment reviewed'}</button></div>}
    {review.error && <p role="alert" className="mt-2 text-sm text-destructive">{review.error.message}</p>}
  </article>;
}