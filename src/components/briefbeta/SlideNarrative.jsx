import React from 'react';
import { narrativeSections, itemText } from '@/components/briefbeta/reportPresentation';

export default function SlideNarrative({ slide }) {
  return <div className="space-y-5 min-w-0 text-sm leading-relaxed">
    {slide.prepared_for && <p>Prepared for: {slide.prepared_for}</p>}
    {slide.market_signal && <p className="whitespace-pre-wrap">{slide.market_signal}</p>}
    {slide.hypothesis_tieback && <p className="italic text-muted-foreground">{slide.hypothesis_tieback}</p>}
    {narrativeSections.map(([key, label]) => slide[key]?.length > 0 && <section key={key}>
      {(label || slide.bullets_header) && <h3 className="text-primary text-sm mb-2">{label || slide.bullets_header}</h3>}
      <ul className="space-y-3 list-disc pl-5 marker:text-primary">{slide[key].map((item, i) => <li key={i}>{itemText(item)}</li>)}</ul>
    </section>)}
    {slide.why_it_may_matter && <section><h3 className="text-primary text-sm mb-2">Why it may matter</h3><p>{slide.why_it_may_matter}</p></section>}
    {slide.customer_pains?.length > 0 && <section><h3 className="text-primary text-sm mb-2">Customer challenges</h3>{slide.customer_pains.map((p, i) => <div className="mb-3" key={i}><p>{p.pain}</p>{p.palsgaard_angle && <p className="text-muted-foreground">{p.palsgaard_angle}</p>}</div>)}</section>}
    {slide.supporting_data?.length > 0 && <section className="border-t pt-4"><h3 className="text-primary text-sm mb-2">Supporting evidence</h3><ul className="space-y-3">{slide.supporting_data.map((d, i) => <li key={i}><p>{d.stat}</p><p className="text-xs text-muted-foreground">{[d.source, d.geography].filter(Boolean).join(' · ')}</p></li>)}</ul></section>}
  </div>;
}