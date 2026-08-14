import React from 'react';
import SlideBlock from './SlideBlock';
import MethodologySlide from './MethodologySlide';

const SIGNAL_RE = /signal\s*[—–-]\s*not yet evidenced|signal only/i;

function isSignalHeader(slide) {
  return SIGNAL_RE.test(`${slide.title || ''} ${slide.subtitle || ''} ${slide.slide_name || ''}`);
}

// Renders the deck in its saved order. Slides that sit under the
// "Signal — not yet evidenced at regional level" divider stay visually separated
// from fully evidenced trends, so a thin-evidence trend can never be mistaken for
// a confirmed one.
export default function SlidesSection({ slides = [] }) {
  // The AI disclaimer is already rendered once at the top of the page.
  const body = slides.filter(s => s.slide_type !== 'briefing_context' && s.slide_name !== 'AI Disclaimer');
  if (body.length === 0) return null;

  let inSignal = false;

  return (
    <div className="mt-6">
      <h2 className="page-title text-xl mb-3">Report content</h2>
      {body.map((slide, i) => {
        if (slide.slide_type === 'section_header') {
          inSignal = isSignalHeader(slide);
          return (
            <div
              key={i}
              className="rounded-[10px] px-4 py-3 mb-4"
              style={inSignal
                ? { background: '#FEF6E7', border: '1px solid #F2C75C' }
                : { background: '#1D428A', color: 'white' }}
            >
              <p className="font-semibold" style={inSignal ? { color: '#92600A' } : undefined}>
                {slide.title || slide.slide_name}
              </p>
              {slide.subtitle && (
                <p className="text-sm mt-0.5" style={inSignal ? { color: '#92600A' } : { color: 'rgba(255,255,255,0.85)' }}>
                  {slide.subtitle}
                </p>
              )}
              {inSignal && (
                <p className="text-xs mt-1.5" style={{ color: '#92600A' }}>
                  The trends below have too few eligible regional launches to be treated as evidenced. They are shown as signals, with their record count stated.
                </p>
              )}
            </div>
          );
        }

        if (slide.slide_type === 'methodology') {
          return <MethodologySlide key={i} slide={slide} index={i} />;
        }

        return <SlideBlock key={i} slide={slide} index={i} isSignal={inSignal || isSignalHeader(slide)} />;
      })}
    </div>
  );
}