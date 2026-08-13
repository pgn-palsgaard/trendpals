import React from 'react';

export default function SessionSlides({ slides }) {
  if (!slides?.length) {
    return <p className="text-sm text-muted-foreground">No deck was built in this session.</p>;
  }

  return (
    <div className="space-y-3">
      {slides.map((s, i) => (
        <div key={i} className="rounded-lg border border-border bg-card p-4">
          <div className="flex items-baseline gap-2 mb-1">
            <span className="section-label">{s.slide_name || `Slide ${s.slide_number ?? i + 1}`}</span>
          </div>
          <p className="font-semibold text-foreground">{s.title}</p>
          {s.subtitle && <p className="text-sm text-muted-foreground mt-0.5">{s.subtitle}</p>}
          {s.market_signal && (
            <p className="text-sm text-foreground mt-2 whitespace-pre-wrap">{s.market_signal}</p>
          )}
          {Array.isArray(s.gnpd_examples) && s.gnpd_examples.length > 0 && (
            <ul className="mt-2 list-disc list-inside text-sm text-muted-foreground space-y-0.5">
              {s.gnpd_examples.map((g, j) => <li key={j}>{g}</li>)}
            </ul>
          )}
        </div>
      ))}
    </div>
  );
}