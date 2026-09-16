import React from 'react';

export default function PersonalCareOverview({ slide }) {
  return <div className="space-y-5">
    {slide.market_signal && <p className="text-sm text-muted-foreground">{slide.market_signal}</p>}
    <div className="personal-care-columns">
      {(slide.items || []).map((item, i) => {
        const source = slide.supporting_data?.[i];
        return <section key={i} className="border-t-2 border-primary pt-4 min-w-0">
          <p className="text-xs text-muted-foreground mb-3">{String(i + 1).padStart(2, '0')}</p>
          <h3 className="text-primary mb-3">{item.title}</h3>
          <p className="text-sm leading-relaxed whitespace-pre-wrap">{item.text}</p>
          {source && <details className="text-xs text-muted-foreground mt-5"><summary className="cursor-pointer">{source.source || 'Source'} · {source.geography}</summary><blockquote className="mt-2 border-l pl-3 whitespace-pre-wrap">{source.stat}</blockquote></details>}
        </section>;
      })}
    </div>
  </div>;
}