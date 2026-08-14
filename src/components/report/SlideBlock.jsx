import React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { HelpCircle, TrendingUp, Quote, Package, AlertTriangle } from 'lucide-react';

// One report slide, rendered with every evidence layer the deck carries.
// why_it_may_matter and formulation_questions are first-class here: they are what
// turns a market observation into a technical conversation, and they were
// previously stored but never shown.
export default function SlideBlock({ slide, index, isSignal }) {
  return (
    <Card className="mb-4">
      <CardContent className="pt-5">
        <div className="flex items-start justify-between gap-3 mb-3">
          <div>
            <p className="text-xs font-semibold tracking-widest uppercase text-muted-foreground mb-1">
              Slide {slide.slide_number ?? index + 1}
            </p>
            <h3 className="text-lg font-semibold text-foreground">{slide.title || slide.slide_name}</h3>
            {slide.subtitle && <p className="text-sm text-muted-foreground mt-0.5">{slide.subtitle}</p>}
          </div>
          {isSignal && (
            <span className="badge-pending shrink-0 whitespace-nowrap">
              <AlertTriangle className="w-3 h-3 mr-1" />Signal only
            </span>
          )}
        </div>

        {slide.market_signal && (
          <p className="text-sm text-foreground whitespace-pre-line mb-4">{slide.market_signal}</p>
        )}

        {slide.why_it_may_matter && (
          <div className="mb-4 rounded-lg p-3 bg-pal-blue-10">
            <p className="text-xs font-semibold tracking-widest uppercase mb-1 text-pal-blue">
              <TrendingUp className="w-3 h-3 inline mr-1" />Why it may matter
            </p>
            <p className="text-sm text-foreground">{slide.why_it_may_matter}</p>
          </div>
        )}

        {(slide.formulation_questions || []).length > 0 && (
          <div className="mb-4 rounded-lg p-3 bg-pal-sage-10">
            <p className="text-xs font-semibold tracking-widest uppercase mb-1.5" style={{ color: '#4A6040' }}>
              <HelpCircle className="w-3 h-3 inline mr-1" />Formulation and application questions it raises
            </p>
            <ul className="space-y-1">
              {slide.formulation_questions.map((q, i) => (
                <li key={i} className="text-sm text-foreground">• {q}</li>
              ))}
            </ul>
          </div>
        )}

        {(slide.supporting_data || []).length > 0 && (
          <div className="mb-4">
            <p className="section-label mb-1.5">Supporting data</p>
            <ul className="space-y-1">
              {slide.supporting_data.map((d, i) => (
                <li key={i} className="text-sm text-foreground">
                  • {d.stat}
                  {d.source && <span className="text-muted-foreground"> ({d.source})</span>}
                </li>
              ))}
            </ul>
          </div>
        )}

        {(slide.gnpd_examples || []).length > 0 && (
          <div className="mb-4">
            <p className="section-label mb-1.5">
              <Package className="w-3 h-3 inline mr-1" />Market evidence (Mintel GNPD)
            </p>
            <ul className="space-y-1">
              {slide.gnpd_examples.map((g, i) => (
                <li key={i} className="text-sm text-foreground">• {g}</li>
              ))}
            </ul>
          </div>
        )}

        {(slide.conversation_openers || []).length > 0 && (
          <div>
            <p className="section-label mb-1.5">
              <Quote className="w-3 h-3 inline mr-1" />Conversation openers
            </p>
            <ul className="space-y-1">
              {slide.conversation_openers.map((q, i) => (
                <li key={i} className="text-sm text-foreground italic">• {q}</li>
              ))}
            </ul>
          </div>
        )}

        {slide.evidence_footer && (
          <p className="text-xs text-muted-foreground mt-3">Sources: {slide.evidence_footer}</p>
        )}
      </CardContent>
    </Card>
  );
}