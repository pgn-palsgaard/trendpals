import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
export default function AssessmentJobStatus() {
  const { data, isPending, error } = useQuery({ queryKey: ['challengeAssessmentJobs'], queryFn: () => base44.entities.ChallengeAssessmentJob.list({ sort: '-created_date', limit: 3 }) });
  if (isPending) return <p className="text-xs text-muted-foreground">Loading background progress…</p>;
  if (error) return <p className="text-xs text-destructive">Could not load background progress.</p>;
  return <div className="space-y-1 text-xs text-muted-foreground">{data?.items.map(j => <p key={j.id}>Background assessment: {j.status} · {j.processed}/{j.total} checked · {j.evaluated} assessed · {j.unchanged} unchanged{j.last_error ? ` · ${j.last_error}` : ''}</p>)}</div>;
}