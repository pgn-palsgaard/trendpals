import React from 'react';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';

export default function PersonalCareSlideEditor({ draft, onChange }) {
  const change = (index, field, value) => onChange({ ...draft, items: draft.items.map((item, i) => i === index ? { ...item, [field]: value } : item) });
  return <div className="space-y-4">{(draft.items || []).map((item, i) => <fieldset key={i} className="border rounded-lg p-3 space-y-2">
    <legend className="text-xs px-1">Trend {i + 1}</legend>
    <Input aria-label={`Trend ${i + 1} title`} value={item.title} onChange={e => change(i, 'title', e.target.value)} />
    <Textarea aria-label={`Trend ${i + 1} summary`} rows={5} value={item.text} onChange={e => change(i, 'text', e.target.value)} />
    <p className="text-xs text-muted-foreground">{draft.supporting_data?.[i]?.source} — source reference retained.</p>
  </fieldset>)}</div>;
}