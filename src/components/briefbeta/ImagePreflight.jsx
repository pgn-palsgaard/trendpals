import React, { useState, useEffect, useCallback } from 'react';
import { base44 } from '@/api/base44Client';
import { ImageOff, CheckCircle2, Loader2, Copy, Check } from 'lucide-react';
import PackshotUploader from '@/components/gnpd/PackshotUploader';

// Preflight gate: shows how many products in the deck resolve to a real GNPD
// pack shot before the user sends the deck to Gamma, lists the Record IDs that
// are still missing one, and lets the user upload them right here.
export default function ImagePreflight({ reportId }) {
  const [data, setData] = useState(null);
  const [copied, setCopied] = useState(false);

  const load = useCallback(() => {
    setData(null);
    return base44.functions
      .invoke('getImageCoverage', { report_id: reportId })
      .then(res => setData(res.data))
      .catch(() => {});
  }, [reportId]);

  useEffect(() => { load(); }, [load]);

  // Pack shots live in one database, so an upload made in ANY export panel must
  // refresh every other preflight on the page — otherwise the second panel keeps
  // claiming images are missing that were just uploaded.
  useEffect(() => {
    const onUpdated = () => { load(); };
    window.addEventListener('packshots-updated', onUpdated);
    return () => window.removeEventListener('packshots-updated', onUpdated);
  }, [load]);

  if (!data) {
    return (
      <p className="flex items-center gap-2 text-xs text-muted-foreground mb-3">
        <Loader2 className="w-3 h-3 animate-spin" /> Checking product images…
      </p>
    );
  }

  if (data.total === 0) return null;

  const allOk = (data.missing || []).length === 0;
  const missingIds = data.missing_record_ids || [];
  const idList = missingIds.join(', ');

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
        <>
          <p className="text-[11px] mt-1.5" style={{ color: '#92600A' }}>
            No image found for: {data.missing.slice(0, 6).join(', ')}
            {data.missing.length > 6 ? ` +${data.missing.length - 6} more` : ''}. These slides will export without a product image.
          </p>

          {missingIds.length > 0 && (
            <div className="mt-2.5">
              <div className="flex items-center justify-between mb-1">
                <p className="text-[11px] font-semibold" style={{ color: '#1D2B47' }}>
                  Missing pack shots — {missingIds.length} GNPD Record ID{missingIds.length === 1 ? '' : 's'}
                </p>
                <button
                  onClick={() => {
                    navigator.clipboard.writeText(idList);
                    setCopied(true);
                    setTimeout(() => setCopied(false), 2000);
                  }}
                  className="inline-flex items-center gap-1 text-[11px] font-semibold rounded px-2 py-1"
                  style={{ background: '#1D428A', color: 'white' }}
                >
                  {copied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                  {copied ? 'Copied' : 'Copy'}
                </button>
              </div>
              <div
                className="text-[11px] rounded p-2 break-words"
                style={{ background: 'white', border: '1px solid #ece8de', color: '#1D2B47', fontFamily: 'monospace', maxHeight: 90, overflowY: 'auto' }}
              >
                {idList}
              </div>
            </div>
          )}

          <div className="mt-2.5">
            <PackshotUploader compact onDone={() => window.dispatchEvent(new Event('packshots-updated'))} />
          </div>
        </>
      )}
    </div>
  );
}