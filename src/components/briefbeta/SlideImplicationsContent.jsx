import React from 'react';

export default function SlideImplicationsContent({ slide }) {
  return <div className="report-slide-grid">
    {[[slide.strategic_implications, 'So what for manufacturers?'], [slide.palsgaard_support, 'Where Palsgaard supports']].map(([items, label]) => items?.length > 0 && <section key={label} className="rounded-lg bg-secondary p-5 border-t-4 border-primary">
      <h3 className="text-primary text-sm mb-4">{label}</h3>
      <ul className="space-y-4 list-disc pl-4 text-sm leading-relaxed marker:text-primary">{items.map((text, i) => <li key={i}>{text}</li>)}</ul>
    </section>)}
  </div>;
}