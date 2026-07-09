import React, { useState } from 'react';
import { Pencil, Check } from 'lucide-react';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';

export default function SlideCard({ slide, onChange }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(slide);

  const save = () => { onChange(draft); setEditing(false); };

  return (
    <div className="pal-card p-4">
      <div className="flex items-start justify-between gap-2">
        <span className="badge-blue shrink-0">Slide {slide.slide_number}</span>
        <button
          onClick={() => (editing ? save() : (setDraft(slide), setEditing(true)))}
          className="p-1.5 rounded-md hover:bg-muted text-muted-foreground"
          title={editing ? 'Save changes' : 'Edit slide'}
        >
          {editing ? <Check className="w-4 h-4" style={{ color: '#6F8263' }} /> : <Pencil className="w-4 h-4" />}
        </button>
      </div>

      {editing ? (
        <div className="space-y-2 mt-2">
          <Input value={draft.title || ''} onChange={e => setDraft({ ...draft, title: e.target.value })} placeholder="Title" />
          <Input value={draft.subtitle || ''} onChange={e => setDraft({ ...draft, subtitle: e.target.value })} placeholder="Subtitle" />
          <Textarea rows={3} value={draft.market_signal || ''} onChange={e => setDraft({ ...draft, market_signal: e.target.value })} placeholder="Market signal" />
        </div>
      ) : (
        <div className="mt-2">
          <p className="font-semibold text-foreground text-sm">{slide.title}</p>
          {slide.subtitle && <p className="text-xs text-muted-foreground mt-0.5">{slide.subtitle}</p>}
          {slide.market_signal && <p className="text-sm text-foreground/80 mt-2 leading-relaxed">{slide.market_signal}</p>}
          {(slide.supporting_data || []).length > 0 && (
            <ul className="mt-2 space-y-1">
              {slide.supporting_data.map((d, i) => (
                <li key={i} className="text-xs text-muted-foreground">• {d.stat} <span className="italic">({d.source})</span></li>
              ))}
            </ul>
          )}
          {(slide.gnpd_examples || []).length > 0 && (
            <div className="mt-2 pt-2 border-t border-border">
              <p className="section-label mb-1">GNPD evidence</p>
              {slide.gnpd_examples.map((g, i) => (
                <p key={i} className="text-xs text-foreground/70">{g}</p>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}