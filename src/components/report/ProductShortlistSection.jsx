import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ImageOff } from 'lucide-react';
import { useLivePackshots } from '@/hooks/useLivePackshots';

export default function ProductShortlistSection({ report }) {
  const products = report?.product_shortlist || [];
  // Pack shots uploaded after the report was saved are not in the snapshot —
  // resolve the live image for each record so the list is never falsely empty.
  const liveImages = useLivePackshots(products.map(p => p.gnpd_record_id));
  if (products.length === 0) return null;

  return (
    <Card className="mb-6">
      <CardHeader>
        <CardTitle className="text-lg">Product Shortlist ({products.length})</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {products.map((p, idx) => {
            const imageUrl = liveImages[p.gnpd_record_id] || p.image_url;
            return (
            <div key={idx} className="flex gap-3 p-3 rounded-lg border border-border bg-card">
              <div className="w-16 h-16 shrink-0 rounded-md overflow-hidden bg-muted flex items-center justify-center">
                {imageUrl ? (
                  <img src={imageUrl} alt={p.product_name} className="w-full h-full object-contain" loading="lazy" />
                ) : (
                  <ImageOff className="w-5 h-5 text-muted-foreground" />
                )}
              </div>
              <div className="min-w-0">
                <p className="text-sm font-semibold text-foreground leading-tight">{p.product_name}</p>
                <p className="text-xs text-muted-foreground truncate">
                  {[p.brand, p.market, p.launch_date].filter(Boolean).join(' · ')}
                </p>
                {p.supporting_trends?.length > 0 && (
                  <div className="mt-1 flex flex-wrap gap-1">
                    {p.supporting_trends.slice(0, 2).map((t, i) => (
                      <Badge key={i} variant="secondary" className="text-[10px] px-1.5 py-0">{t}</Badge>
                    ))}
                  </div>
                )}
              </div>
            </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}