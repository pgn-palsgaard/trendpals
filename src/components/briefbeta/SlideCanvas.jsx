import React from 'react';
import { annotationForSlide } from '@/components/briefbeta/trendStatus';
import SlideNarrative from '@/components/briefbeta/SlideNarrative';
import SlideProducts from '@/components/briefbeta/SlideProducts';
import SlideTableContent from '@/components/briefbeta/SlideTableContent';
import SlideImplicationsContent from '@/components/briefbeta/SlideImplicationsContent';
import SMEAnnotationBadge from '@/components/sme/SMEAnnotationBadge';

export default function SlideCanvas({ slide, trendStatus, topline, products = [], images = {}, thumbnail = false }) {
  if (!slide) return null;
  const divider = slide.slide_type === 'section_header';
  const signalLine = annotationForSlide(slide, trendStatus);
  return <article className={`report-slide w-full rounded-xl border shadow-card overflow-hidden ${divider ? 'bg-primary text-primary-foreground' : 'bg-card text-card-foreground'}`}>
    <div className="min-h-[360px] sm:min-h-[450px] p-5 sm:p-8 flex flex-col break-words">
      <header className={divider ? 'my-auto py-12' : 'mb-6'}>
        <p className={`text-xs font-semibold tracking-widest uppercase mb-3 ${divider ? 'text-primary-foreground/80' : 'text-primary'}`}>{slide.preheader || topline || (divider ? 'TrendPals · Market intelligence' : 'Market intelligence')}</p>
        <h2 className={`font-heading leading-tight ${divider ? 'text-4xl sm:text-5xl text-primary-foreground' : 'text-2xl sm:text-3xl'}`}>{slide.title || slide.slide_name}</h2>
        {slide.subtitle && <p className={`mt-3 ${divider ? 'text-xl text-primary-foreground/90' : 'text-sm text-muted-foreground'}`}>{slide.subtitle}</p>}
      </header>
      {slide.provenance_label && <p className="text-xs bg-secondary text-secondary-foreground rounded-lg p-3 mb-4">{slide.provenance_label}</p>}
      {signalLine && <p className="text-xs italic mb-4">{signalLine}</p>}
      {!thumbnail && slide.trend_id && <div className="mb-4"><SMEAnnotationBadge trendId={slide.trend_id} /></div>}
      <div className="space-y-6 flex-1">
        <div className={slide.gnpd_examples?.length ? 'report-slide-grid' : ''}>
          <SlideNarrative slide={slide} />
          <SlideProducts examples={slide.gnpd_examples} products={products} images={images} />
        </div>
        <SlideTableContent slide={slide} />
        <SlideImplicationsContent slide={slide} />
      </div>
      <footer className={`flex items-end justify-between gap-4 text-xs mt-8 pt-4 border-t ${divider ? 'border-primary-foreground/30 text-primary-foreground/80' : 'border-border text-muted-foreground'}`}>
        <span className="whitespace-pre-wrap">{slide.evidence_footer || 'TrendPals · Palsgaard'}</span><span className="tabular-nums shrink-0">{slide.slide_number ?? ''}</span>
      </footer>
    </div>
  </article>;
}