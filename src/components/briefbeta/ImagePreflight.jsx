import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { ImageOff, CheckCircle2, Loader2 } from 'lucide-react';

// Preflight gate: shows how many products in the deck resolve to a real GNPD
// pack shot before the user sends the deck to Gamma.
export default function ImagePreflight({ reportId }) {
  const [data, setData] = useState(null);

  useEffect(() => {
    let cancelled = false;
    base44.functions
      .invoke('getImageCoverage', { report_id: reportId })
      .then(res => { if (!cancelled) setData(res.data); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [reportId]);

  if (!data) {
    return (
      <p className="flex items-center gap-2 text-xs text-muted-foreground mb-3">
        <Loader2 className="w-3 h-3 animate-spin" /> Checking product images…
      </p>
    );
  }

  if (data.total === 0) return null;

  const allOk = data.missing.length === 0;

  return (
    <div className="rounded-lg p-3 mb-3" style={{ background: allOk ? '#EEF1EC' : '#FEF6EC' }}>
      <div className="flex items-center gap-2">
        {allOk
          ? <CheckCircle2 className="w-4 h-4" style={{ color: '#6F8263' }} />
          : <ImageOff className="w-4 h-4" style={{ color: '#C15338' }} />}
        <p className="text-xs font-semibold" style={{ color: allOk ? '#4A6040' : '#A33B24' }}>
          {data.matched} of {data.total} products have a pack shot
        </p>
      </div>
      {!allOk && (
        <p className="text-[11px] mt-1.5" style={{ color: '#92600A' }}>
          No image found for: {data.missing.slice(0, 6).join(', ')}
          {data.missing.length > 6 ? ` +${data.missing.length - 6} more` : ''}. These slides will export without a product image.
        </p>
      )}
    </div>
  );
}