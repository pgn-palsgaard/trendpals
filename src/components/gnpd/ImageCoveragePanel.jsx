import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { ImageOff, RefreshCw } from 'lucide-react';
import PackshotUploader from '@/components/gnpd/PackshotUploader';
import MissingPackshotList from '@/components/gnpd/MissingPackshotList';

const BLUE = '#1D428A';

function Row({ label, stats }) {
  const pct = stats.total ? Math.round((stats.with_image / stats.total) * 100) : 0;
  const colour = pct >= 95 ? '#6F8263' : pct >= 50 ? '#F2C75C' : '#C15338';
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 0', borderBottom: '1px solid #ece8de' }}>
      <span style={{ width: 200, fontSize: 13, color: '#1D2B47', textTransform: 'capitalize' }}>
        {label.replace(/_/g, ' ')}
      </span>
      <div style={{ flex: 1, height: 8, background: '#ece8de', borderRadius: 4, overflow: 'hidden' }}>
        <div style={{ width: `${pct}%`, height: '100%', background: colour }} />
      </div>
      <span style={{ width: 130, textAlign: 'right', fontSize: 12, color: '#6B7280' }}>
        {stats.with_image} / {stats.total} ({pct}%)
      </span>
    </div>
  );
}

export default function ImageCoveragePanel() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // The scan runs in resumable chunks — a single full-database request times out
  // at the gateway. Each chunk's counts are merged as it arrives, so the bars
  // fill in progressively.
  async function run() {
    setLoading(true);
    setError(null);
    const acc = { total: 0, with_image: 0, by_category: {} };
    let skip = 0;
    try {
      while (true) {
        const res = await base44.functions.invoke('getImageCoverage', { skip });
        if (res.data?.error) throw new Error(res.data.error);
        acc.total += res.data.total;
        acc.with_image += res.data.with_image;
        for (const [cat, s] of Object.entries(res.data.by_category || {})) {
          if (!acc.by_category[cat]) acc.by_category[cat] = { total: 0, with_image: 0 };
          acc.by_category[cat].total += s.total;
          acc.by_category[cat].with_image += s.with_image;
        }
        setData({ ...acc, by_category: { ...acc.by_category } });
        if (!res.data.next_skip) break;
        skip = res.data.next_skip;
      }
    } catch (e) {
      setError(e.message);
    }
    setLoading(false);
  }

  const cats = data ? Object.entries(data.by_category).sort((a, b) => b[1].total - a[1].total) : [];

  return (
    <div style={{ padding: '24px 28px' }}>
      <div style={{ background: 'white', border: '1px solid #d8d3c8', borderRadius: 8, padding: '1.25rem', marginBottom: 16 }}>
        <p style={{ margin: 0, fontSize: 15, fontWeight: 700, color: '#1D2B47' }}>Add pack shots</p>
        <p style={{ margin: '2px 0 12px', fontSize: 12, color: '#6B7280' }}>
          Upload images named after their GNPD Record ID — they are attached to the matching products.
        </p>
        <PackshotUploader onDone={() => { if (data) run(); }} />
      </div>

      <div style={{ background: 'white', border: '1px solid #d8d3c8', borderRadius: 8, padding: '1.25rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
          <div>
            <p style={{ margin: 0, fontSize: 15, fontWeight: 700, color: '#1D2B47' }}>Product image coverage</p>
            <p style={{ margin: '2px 0 0', fontSize: 12, color: '#6B7280' }}>
              Share of GNPD products with a real pack shot — decks can only show images for these.
            </p>
          </div>
          <button
            onClick={run}
            disabled={loading}
            style={{
              background: BLUE, color: 'white', border: 'none', borderRadius: 6,
              padding: '8px 16px', fontSize: 13, fontWeight: 600, cursor: loading ? 'default' : 'pointer',
              display: 'inline-flex', alignItems: 'center', gap: 6, opacity: loading ? 0.6 : 1,
            }}
          >
            <RefreshCw className="w-4 h-4" style={{ animation: loading ? 'spin 1s linear infinite' : 'none' }} />
            {loading ? 'Scanning…' : data ? 'Rescan' : 'Scan database'}
          </button>
        </div>

        {error && <p style={{ fontSize: 13, color: '#C15338' }}>{error}</p>}

        {!data && !loading && !error && (
          <div style={{ textAlign: 'center', padding: '32px 0', color: '#9CA3AF' }}>
            <ImageOff className="w-8 h-8" style={{ margin: '0 auto 8px' }} />
            <p style={{ fontSize: 13, margin: 0 }}>Run a scan to see image coverage per category.</p>
          </div>
        )}

        {data && (
          <>
            <Row label="All products" stats={{ total: data.total, with_image: data.with_image }} />
            <div style={{ height: 12 }} />
            {cats.map(([cat, stats]) => <Row key={cat} label={cat} stats={stats} />)}
          </>
        )}
      </div>

      <MissingPackshotList />
    </div>
  );
}