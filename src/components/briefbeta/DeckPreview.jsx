import React, { useState, useEffect } from 'react';
import { ChevronLeft, ChevronRight, Pencil, Check, Save } from 'lucide-react';
import SlideCanvas from '@/components/briefbeta/SlideCanvas';
import SlideCard from '@/components/briefbeta/SlideCard';
import SlideThumbnail from '@/components/briefbeta/SlideThumbnail';
import { presentSlide } from '@/components/briefbeta/reportPresentation';
import { buildToplines } from '@/components/briefbeta/slideTopline';
import { useLivePackshots } from '@/hooks/useLivePackshots';

export default function DeckPreview({ slides = [], onSlideChange, onSave, saving, bindings, trendStatus, saveDisabledReason, saveWarning, products = [] }) {
  const [index, setIndex] = useState(0);
  const [editing, setEditing] = useState(false);
  const active = Math.min(index, Math.max(0, slides.length - 1));
  const images = useLivePackshots([...new Set(slides.flatMap(s => (s.gnpd_examples || []).map(g => String(g).match(/^\s*(\d+)\s*\|/)?.[1]).filter(Boolean)))]);
  useEffect(() => { setIndex(0); setEditing(false); }, [slides.length]);
  if (!slides.length) return <div className="pal-card p-8 text-center text-muted-foreground">Your report will appear here once the draft is built.</div>;
  const current = presentSlide(slides[active], bindings);
  const go = next => { setEditing(false); setIndex(Math.max(0, Math.min(slides.length - 1, next))); };
  return <section className="space-y-4 min-w-0">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="flex items-center gap-2">
        <button aria-label="Previous slide" onClick={() => go(active - 1)} disabled={active === 0} className="p-3 rounded-lg border disabled:opacity-40 hover:bg-muted"><ChevronLeft className="w-4 h-4" /></button>
        <span className="text-sm font-medium tabular-nums">{active + 1} / {slides.length}</span>
        <button aria-label="Next slide" onClick={() => go(active + 1)} disabled={active === slides.length - 1} className="p-3 rounded-lg border disabled:opacity-40 hover:bg-muted"><ChevronRight className="w-4 h-4" /></button>
        {onSlideChange && <button onClick={() => setEditing(!editing)} className="inline-flex items-center gap-2 p-3 text-xs rounded-lg border hover:bg-muted">{editing ? <Check className="w-4 h-4" /> : <Pencil className="w-4 h-4" />}{editing ? 'Close editor' : 'Edit slide'}</button>}
      </div>
      {onSave && <button onClick={onSave} disabled={saving || !!saveDisabledReason} title={saveDisabledReason || saveWarning} className="inline-flex items-center gap-2 rounded-lg px-4 py-3 text-sm font-semibold bg-primary text-primary-foreground disabled:opacity-50"><Save className="w-4 h-4" />{saving ? 'Saving…' : saveWarning ? 'Save anyway' : 'Save report'}</button>}
    </div>
    {(saveDisabledReason || saveWarning) && <p className="text-xs bg-secondary p-3 rounded-lg">{saveDisabledReason || saveWarning}</p>}
    <label className="block text-xs text-muted-foreground">Jump to slide
      <select value={active} onChange={e => go(Number(e.target.value))} className="mt-1 w-full rounded-lg border bg-card text-foreground p-3 text-sm">{slides.map((s, i) => <option key={i} value={i}>{i + 1}. {s.title || s.slide_name}</option>)}</select>
    </label>
    {editing && onSlideChange ? <SlideCard key={active} slide={current} onChange={updated => onSlideChange(active, updated)} /> : <SlideCanvas slide={current} trendStatus={trendStatus} topline={buildToplines(slides)[active]} products={products} images={images} />}
    <div className="flex gap-3 overflow-x-auto pb-2" aria-label="Slide thumbnails">
      {slides.map((s, i) => <button key={i} onClick={() => go(i)} aria-label={`Slide ${i + 1}: ${s.title || s.slide_name}`} aria-current={i === active ? 'true' : undefined} className={`shrink-0 w-36 rounded-lg p-1 border-2 text-left transition-colors ${i === active ? 'border-primary bg-secondary' : 'border-border bg-card hover:border-primary/50'}`}><SlideThumbnail slide={s} /><p className="text-xs px-1 pt-1 truncate">{i + 1}. {s.title || s.slide_name}</p></button>)}
    </div>
  </section>;
}