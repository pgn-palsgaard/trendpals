import React, { useState } from 'react';
import { ChevronLeft, ChevronRight, Pencil, Check, Save } from 'lucide-react';
import SlideCanvas from './SlideCanvas';
import SlideCard from './SlideCard';

export default function DeckPreview({ slides, onSlideChange, onSave, saving }) {
  const [index, setIndex] = useState(0);
  const [editing, setEditing] = useState(false);
  const current = slides[Math.min(index, slides.length - 1)];

  const go = (delta) => {
    setEditing(false);
    setIndex(i => Math.max(0, Math.min(slides.length - 1, i + delta)));
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <button onClick={() => go(-1)} disabled={index === 0}
            className="p-1.5 rounded-md border border-border disabled:opacity-40 hover:bg-muted">
            <ChevronLeft className="w-4 h-4" />
          </button>
          <span className="text-sm font-medium text-foreground">{index + 1} / {slides.length}</span>
          <button onClick={() => go(1)} disabled={index === slides.length - 1}
            className="p-1.5 rounded-md border border-border disabled:opacity-40 hover:bg-muted">
            <ChevronRight className="w-4 h-4" />
          </button>
          <button onClick={() => setEditing(e => !e)}
            className="ml-1 inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md border border-border text-xs font-medium hover:bg-muted">
            {editing ? <Check className="w-3.5 h-3.5" /> : <Pencil className="w-3.5 h-3.5" />}
            {editing ? 'Done editing' : 'Edit slide'}
          </button>
        </div>
        <button onClick={onSave} disabled={saving}
          className="inline-flex items-center gap-1.5 rounded-lg px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
          style={{ background: '#1D428A' }}>
          <Save className="w-4 h-4" />
          {saving ? 'Saving…' : 'Save as beta report'}
        </button>
      </div>

      {editing ? (
        <SlideCard slide={current} onChange={updated => onSlideChange(index, updated)} />
      ) : (
        <SlideCanvas slide={current} />
      )}

      <div className="flex gap-2 overflow-x-auto pb-1">
        {slides.map((s, i) => (
          <button key={i} onClick={() => { setEditing(false); setIndex(i); }}
            className="shrink-0 w-32 h-20 rounded-md border p-2 text-left overflow-hidden transition-colors"
            style={{
              borderColor: i === index ? '#1D428A' : 'hsl(var(--border))',
              background: i === index ? '#EBF0F8' : 'hsl(var(--card))',
            }}>
            <p className="text-[9px] text-muted-foreground">Slide {i + 1}</p>
            <p className="text-[10px] font-medium leading-tight text-foreground line-clamp-3">{s.title}</p>
          </button>
        ))}
      </div>
    </div>
  );
}