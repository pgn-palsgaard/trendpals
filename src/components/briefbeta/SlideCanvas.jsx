import React from 'react';
import { annotationForSlide } from './trendStatus';
import ImplicationsCanvas from './ImplicationsCanvas';

// One slide rendered as a presentation-style 16:9 canvas.
export default function SlideCanvas({ slide, trendStatus }) {
  // Build B — computed render-state. Derived from the frozen trend status, never
  // from slide prose; the architect no longer writes record counts.
  const signalLine = annotationForSlide(slide, trendStatus);
  if (slide.slide_type === 'implications') return <ImplicationsCanvas slide={slide} />;
  return (
    <div className="w-full bg-card border border-border rounded-xl shadow-panel overflow-hidden">
      <div className="aspect-[16/9] w-full overflow-y-auto p-8 flex flex-col">
        <p className="section-label mb-2">Slide {slide.slide_number}</p>
        <h2 className="font-heading text-2xl leading-tight text-foreground">{slide.title}</h2>
        {slide.subtitle && (
          <p className="text-sm mt-1.5" style={{ color: '#1D428A' }}>{slide.subtitle}</p>
        )}
        {/* Build C — render-owned provenance banner. Shown from the stamped label
            only; the architect never writes this line. */}
        {slide.evidence_class === 'read_across' && slide.provenance_label && (
          <p className="text-xs mt-2 rounded-md px-2.5 py-1.5 font-medium" style={{ background: '#FAE9E5', color: '#A33B24' }}>
            {slide.provenance_label}
          </p>
        )}
        {signalLine && (
          <p className="text-xs italic mt-2" style={{ color: '#62837F' }}>{signalLine}</p>
        )}

        <div className="grid md:grid-cols-2 gap-6 mt-5 flex-1">
          <div>
            {slide.market_signal && (
              <p className="text-[15px] leading-relaxed text-foreground/85">{slide.market_signal}</p>
            )}
            {(slide.supporting_data || []).length > 0 && (
              <ul className="mt-4 space-y-1.5">
                {slide.supporting_data.map((d, i) => (
                  <li key={i} className="text-xs text-muted-foreground leading-snug">
                    • {d.stat} <span className="italic">({d.source})</span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="space-y-4">
            {(slide.gnpd_examples || []).length > 0 && (
              <div className="rounded-lg p-3" style={{ background: '#EBF0F8' }}>
                <p className="section-label mb-1.5">GNPD evidence</p>
                <ul className="space-y-1.5">
                  {slide.gnpd_examples.map((g, i) => (
                    <li key={i} className="text-xs text-foreground/75 leading-snug">{g}</li>
                  ))}
                </ul>
              </div>
            )}
            {(slide.conversation_openers || []).length > 0 && (
              <div>
                <p className="section-label mb-1.5">Conversation openers</p>
                <ul className="space-y-1">
                  {slide.conversation_openers.map((c, i) => (
                    <li key={i} className="text-xs italic text-foreground/70">“{c}”</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </div>

        {slide.evidence_footer && (
          <p className="text-[11px] text-muted-foreground mt-4 pt-3 border-t border-border">
            {slide.evidence_footer}
          </p>
        )}
      </div>
    </div>
  );
}