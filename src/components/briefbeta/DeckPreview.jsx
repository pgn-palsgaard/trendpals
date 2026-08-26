import React, { useState } from 'react';
import { ChevronLeft, ChevronRight, Pencil, Check, Save, AlertTriangle } from 'lucide-react';
import SlideCanvas from './SlideCanvas';
import SlideCard from './SlideCard';
import { resolveSupportingData } from './citationMap';
import { buildToplines } from './slideTopline';

export default function DeckPreview({ slides, onSlideChange, onSave, saving, bindings, trendStatus, saveDisabledReason, saveWarning }) {
  const [index, setIndex] = useState(0);
  const [editing, setEditing] = useState(false);
  const raw = slides[Math.min(index, slides.length - 1)];
  // One consistent topline per slide, derived once at deck level.
  const toplines = buildToplines(slides);
  // Citations are resolved from the frozen map for display; an id that resolves to
  // nothing is dropped, never shown as a raw id or an empty citation.
  const current = Array.isArray(raw?.supporting_data)
    ? { ...raw, supporting_data: resolveSupportingData(raw.supporting_data, bindings) }
    : raw;

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
        {/* Build D — amber save state: the evidence is sound, some text is too long
            for the template. Distinct from disabled, which is integrity only. */}
        <button onClick={onSave} disabled={saving || !!saveDisabledReason}
          title={saveDisabledReason || saveWarning || undefined}
          className="inline-flex items-center gap-1.5 rounded-lg px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
          style={{ background: saveWarning && !saveDisabledReason ? '#C15338' : '#1D428A' }}>
          {saveWarning && !saveDisabledReason ? <AlertTriangle className="w-4 h-4" /> : <Save className="w-4 h-4" />}
          {saving ? 'Saving…' : (saveWarning && !saveDisabledReason ? 'Save anyway' : 'Save as beta report')}
        </button>
      </div>

      {saveDisabledReason && (
        <p className="text-xs rounded-md px-3 py-2" style={{ background: '#FAE9E5', color: '#A33B24' }}>
          {saveDisabledReason}
        </p>
      )}
      {!saveDisabledReason && saveWarning && (
        <p className="text-xs rounded-md px-3 py-2" style={{ background: '#FDF6E3', color: '#92600A' }}>
          {saveWarning}
        </p>
      )}

      {editing ? (
        <SlideCard slide={current} onChange={updated => onSlideChange(index, updated)} />
      ) : (
        <SlideCanvas slide={current} trendStatus={trendStatus} topline={toplines[Math.min(index, slides.length - 1)]} />
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