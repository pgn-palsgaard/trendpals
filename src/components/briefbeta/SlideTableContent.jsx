import React from 'react';

export default function SlideTableContent({ slide }) {
  return <div className="space-y-5">
    {slide.columns?.length > 0 && <div className="overflow-x-auto rounded-lg border"><table className="w-full text-sm text-left">
      <thead className="bg-primary text-primary-foreground"><tr>{slide.columns.map((c, i) => <th className="p-3 font-medium" key={i}>{c}</th>)}</tr></thead>
      <tbody>{(slide.rows || []).map((row, i) => <tr key={i} className="border-t even:bg-muted/50">{(Array.isArray(row) ? row : []).map((cell, j) => <td key={j} className="p-3 align-top whitespace-pre-wrap break-words">{cell}</td>)}</tr>)}</tbody>
    </table></div>}
    {slide.so_what && <p className="border-l-4 border-primary bg-secondary p-4 text-sm font-medium">{slide.so_what}</p>}
    {slide.items?.length > 0 && <div className="report-slide-grid">{slide.items.map((item, i) => <section key={i} className="bg-secondary rounded-lg p-5"><p className="text-primary text-xs mb-3 font-semibold">{String(i + 1).padStart(2, '0')}</p><h3 className="mb-2">{item.title}</h3><p className="text-sm leading-relaxed">{item.text}</p></section>)}</div>}
  </div>;
}