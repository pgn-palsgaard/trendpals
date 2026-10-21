import React from 'react';
const labels = { trend_fit: 'Trend fit', customer_perspective: 'Customer perspective', specificity: 'Specificity', evidence_strength: 'Evidence strength' };
export default function AssessmentDetails({ assessment: a }) {
  return <div className="space-y-3 text-sm">
    <div className="flex flex-wrap gap-2">{Object.entries(a.scores || {}).map(([k,v]) => <span key={k} className="rounded bg-muted px-2 py-1 text-xs">{labels[k] || k}: {v}/100</span>)}</div>
    <p>{a.summary}</p>
    {a.causal_chain && <p><strong>Market → customer challenge:</strong> {a.causal_chain}</p>}
    <p><strong>Supplier fit hypothesis:</strong> {a.capability_fit_proposal}. {a.capability_reason}</p>
    {a.suggested_description && <div className="rounded border border-border bg-muted p-3"><strong>Suggested wording, not applied:</strong><p>{a.suggested_description}</p></div>}
    {a.gaps?.length > 0 && <div><strong>Evidence gaps</strong><ul className="list-disc pl-5">{a.gaps.map((g,i) => <li key={i}>{g}</li>)}</ul></div>}
    {a.counter_evidence?.length > 0 && <div><strong>Contrary evidence</strong><ul className="list-disc pl-5">{a.counter_evidence.map((g,i) => <li key={i}>{g}</li>)}</ul></div>}
    {a.duplicate_candidates?.length > 0 && <div><strong>Possible duplicates, not merged</strong>{a.duplicate_candidates.map(d => <p key={d.challenge_id}>{d.name}: {d.reason}</p>)}</div>}
    <div><strong>Traceable evidence</strong>{!a.evidence_refs?.length && <p className="text-muted-foreground">No verified quote citations in this assessment.</p>}{a.evidence_refs?.map((e,i) => <div key={`${e.ref}-${i}`} className="mt-2 border-l-2 border-border pl-3 text-xs"><p>{e.role} · {e.publisher} · {e.date || 'Date unknown'} · {e.region || 'Scope unknown'}</p>{e.url?.startsWith('https://') ? <a className="text-primary underline" href={e.url} target="_blank" rel="noreferrer">{e.title}</a> : <p>{e.title}</p>}<blockquote>“{e.quote}”</blockquote><p>{e.supports}</p><p className="text-muted-foreground">{e.ref}</p></div>)}</div>
    <p className="text-xs text-muted-foreground">{a.rubric_version} · {new Date(a.evaluated_at).toLocaleString()} · Stored evidence only, no live web research.</p>
    {a.review_state === 'reviewed' && <p className="text-xs">Reviewed by {a.reviewed_by}{a.review_note ? `: ${a.review_note}` : ''}</p>}
  </div>;
}