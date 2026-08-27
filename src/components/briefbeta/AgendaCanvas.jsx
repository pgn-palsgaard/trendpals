import React from 'react';

// Agenda slide (Build B/C narrative) — the deck overview between the opening
// hypothesis and the first section divider. List only: no products, no citations.
export default function AgendaCanvas({ slide, topline }) {
  return (
    <div className="w-full bg-card border border-border rounded-xl shadow-panel overflow-hidden">
      <div className="aspect-[16/9] w-full overflow-y-auto p-8 flex flex-col">
        <p className="text-[11px] font-bold tracking-widest uppercase mb-2" style={{ color: '#1D428A' }}>
          {topline || 'In this report'}
        </p>
        <h2 className="font-heading text-[26px] leading-tight text-foreground">{slide.title}</h2>
        {slide.subtitle && (
          <p className="text-sm mt-1.5" style={{ color: '#1D428A' }}>{slide.subtitle}</p>
        )}
        <ul className="mt-6 space-y-3">
          {(slide.agenda_items || []).map((item, i) => (
            <li key={i} className="text-sm leading-snug text-foreground/85 flex gap-3">
              <span className="font-bold shrink-0" style={{ color: '#1D428A' }}>→</span>
              <span>{item}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}