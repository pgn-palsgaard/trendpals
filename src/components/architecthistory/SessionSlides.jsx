import React from 'react';
import DeckPreview from '@/components/briefbeta/DeckPreview';

export default function SessionSlides({ slides, report }) {
  const deck = report?.slides || slides;
  if (!deck?.length) return <p className="text-sm text-muted-foreground">No deck was built in this session.</p>;
  return <DeckPreview slides={deck} bindings={report?.evidence_bindings} trendStatus={report?.trend_status} products={report?.product_shortlist || []} />;
}