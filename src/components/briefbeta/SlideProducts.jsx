import React from 'react';

export default function SlideProducts({ examples = [], products = [], images = {} }) {
  if (!examples.length) return null;
  const byId = Object.fromEntries(products.filter(p => p.gnpd_record_id).map(p => [String(p.gnpd_record_id), p]));
  return <aside className="space-y-3 min-w-0">
    <h3 className="text-xs uppercase tracking-widest text-primary">Product evidence</h3>
    {examples.map((example, i) => {
      const raw = String(example);
      const id = raw.match(/^\s*(\d+)\s*\|/)?.[1];
      const product = byId[id];
      const image = images[id] || product?.image_url;
      return <div key={i} className="rounded-lg border border-border bg-background p-4 flex gap-4">
        {image && <img src={image} alt={product?.product_name || `Product ${id}`} loading="lazy" width="72" height="92" className="w-16 h-24 object-contain shrink-0" />}
        <div className="min-w-0 space-y-1">
          {product && <><p className="text-sm font-semibold">{product.product_name}</p><p className="text-xs text-muted-foreground">{[product.brand, product.country, product.launch_date].filter(Boolean).join(' · ')}</p></>}
          <p className="text-sm leading-relaxed break-words">{id ? raw.replace(/^\s*\d+\s*\|\s*/, '') : raw}</p>
          {id && <p className="text-xs text-primary font-medium">GNPD {id}</p>}
        </div>
      </div>;
    })}
  </aside>;
}