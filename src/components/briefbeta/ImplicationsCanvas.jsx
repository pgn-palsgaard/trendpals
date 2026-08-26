import React from 'react';

// Preview of the strategic-implications slide — mirrors what build_deck.py renders:
// a big insight title, a light-gold "so what" box and a sage Palsgaard box.
export default function ImplicationsCanvas({ slide, topline }) {
  const implications = slide.strategic_implications || [];
  const support = slide.palsgaard_support || [];

  return (
    <div className="w-full bg-card border border-border rounded-xl shadow-panel overflow-hidden">
      <div className="aspect-[16/9] w-full overflow-y-auto p-8 flex flex-col">
        <p className="text-[11px] font-bold tracking-widest uppercase" style={{ color: '#1D428A' }}>
          {topline || slide.preheader || 'Strategic implications'}
        </p>
        <h2 className="font-heading text-[26px] leading-tight text-foreground mt-2">{slide.title}</h2>

        {implications.length > 0 && (
          <div className="mt-5 rounded-md p-4" style={{ background: '#F7F4EE' }}>
            <p className="text-sm font-bold" style={{ color: '#C15338' }}>So what for manufacturers?</p>
            <ul className="mt-2 space-y-2">
              {implications.map((t, i) => (
                <li key={i} className="text-xs leading-snug text-foreground/85">→&nbsp; {t}</li>
              ))}
            </ul>
          </div>
        )}

        {support.length > 0 && (
          <div className="mt-3 rounded-md p-4" style={{ background: '#ACCEAE' }}>
            <p className="text-sm font-bold" style={{ color: '#1D428A' }}>Where Palsgaard supports</p>
            <ul className="mt-2 space-y-2">
              {support.map((t, i) => (
                <li key={i} className="text-xs leading-snug" style={{ color: '#1D2B47' }}>✓&nbsp; {t}</li>
              ))}
            </ul>
          </div>
        )}

        {slide.evidence_footer && (
          <p className="text-[11px] text-muted-foreground mt-4">Sources: {slide.evidence_footer}</p>
        )}
      </div>
    </div>
  );
}