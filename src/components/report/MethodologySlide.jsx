import React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { FileSearch } from 'lucide-react';

// The methodology appendix is rendered INLINE as a slide, in its deck position —
// never behind a toggle. What the report could not evidence is part of the report,
// not an optional detail the reader has to go looking for.
export default function MethodologySlide({ slide, index }) {
  const lines = String(slide.market_signal || '').split('\n').filter(Boolean);

  return (
    <Card className="mb-4 border-pal-blue">
      <CardContent className="pt-5">
        <p className="text-xs font-semibold tracking-widest uppercase text-muted-foreground mb-1">
          Slide {slide.slide_number ?? index + 1}
        </p>
        <h3 className="text-lg font-semibold text-foreground">
          <FileSearch className="w-4 h-4 inline mr-2 text-pal-blue" />
          {slide.title || 'How this report was evidenced'}
        </h3>
        {slide.subtitle && <p className="text-sm text-muted-foreground mt-0.5 mb-3">{slide.subtitle}</p>}

        <ul className="space-y-2 mt-3">
          {lines.map((l, i) => (
            <li key={i} className="text-sm text-foreground leading-relaxed">{l}</li>
          ))}
        </ul>

        {(slide.gnpd_examples || []).map((g, i) => (
          <p key={i} className="text-xs text-muted-foreground mt-3 break-words">{g}</p>
        ))}
      </CardContent>
    </Card>
  );
}