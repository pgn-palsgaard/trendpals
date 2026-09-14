import React from 'react';

export default function SlideProductIngredients({ ingredients }) {
  if (!ingredients) return null;
  return (
    <section className="rounded-lg border border-border bg-muted/30 p-4">
      <p className="section-label mb-2">Ingredients</p>
      <p className="text-xs leading-relaxed text-foreground/80 whitespace-pre-wrap">{ingredients}</p>
    </section>
  );
}