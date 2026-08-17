import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Copy, Check, Download, ListX } from 'lucide-react';

const BLUE = '#1D428A';

const CATEGORIES = [
  'bakery', 'ice_cream', 'dairy', 'chocolate_confectionery',
  'plant_based', 'oils_fats', 'condiments', 'meat', 'rutf_rusf',
];

// Mintel search boxes choke on very long ID lists, so the output is split into
// batches small enough to paste in one go.
const BATCH = 100;

function Batch({ ids, index }) {
  const [copied, setCopied] = useState(false);
  const text = ids.join(',');

  async function copy() {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <div style={{ border: '1px solid #ece8de', borderRadius: 6, marginBottom: 10 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 12px', background: '#faf8f3' }}>
        <span style={{ fontSize: 12, fontWeight: 600, color: '#1D2B47' }}>
          Batch {index + 1} — {ids.length} record IDs
        </span>
        <button
          onClick={copy}
          style={{
            background: copied ? '#6F8263' : BLUE, color: 'white', border: 'none', borderRadius: 5,
            padding: '5px 10px', fontSize: 12, fontWeight: 600, cursor: 'pointer',
            display: 'inline-flex', alignItems: 'center', gap: 5,
          }}
        >
          {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
      <textarea
        readOnly
        value={text}
        onFocus={e => e.target.select()}
        style={{
          width: '100%', border: 'none', borderTop: '1px solid #ece8de', borderRadius: 0,
          padding: '10px 12px', fontSize: 11, fontFamily: 'monospace', color: '#4B5563',
          resize: 'vertical', minHeight: 64, outline: 'none', boxSizing: 'border-box',
        }}
      />
    </div>
  );
}

export default function MissingPackshotList() {
  const [category, setCategory] = useState('bakery');
  const [ids, setIds] = useState(null);
  const [scanned, setScanned] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // Scanned in resumable chunks — the whole category in one request would exceed
  // the gateway timeout.
  async function run() {
    setLoading(true);
    setError(null);
    setIds(null);
    setScanned(0);
    const all = [];
    let skip = 0;
    let seen = 0;
    try {
      while (true) {
        const res = await base44.functions.invoke('listMissingPackshots', { category, skip });
        if (res.data?.error) throw new Error(res.data.error);
        all.push(...(res.data.missing || []));
        seen += res.data.scanned || 0;
        setIds([...all]);
        setScanned(seen);
        if (!res.data.next_skip) break;
        skip = res.data.next_skip;
      }
    } catch (e) {
      setError(e.message);
    }
    setLoading(false);
  }

  function downloadCsv() {
    const blob = new Blob([ids.join(',')], { type: 'text/csv' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `missing-packshots-${category}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  const batches = [];
  for (let i = 0; ids && i < ids.length; i += BATCH) batches.push(ids.slice(i, i + BATCH));

  return (
    <div style={{ background: 'white', border: '1px solid #d8d3c8', borderRadius: 8, padding: '1.25rem', marginTop: 16 }}>
      <p style={{ margin: 0, fontSize: 15, fontWeight: 700, color: '#1D2B47' }}>Products missing a pack shot</p>
      <p style={{ margin: '2px 0 14px', fontSize: 12, color: '#6B7280' }}>
        GNPD Record IDs with no image, as comma-separated batches you can paste straight into Mintel.
      </p>

      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
        <select
          value={category}
          onChange={e => setCategory(e.target.value)}
          style={{ border: '1px solid #d8d3c8', borderRadius: 6, padding: '7px 10px', fontSize: 13, color: '#1D2B47', background: 'white' }}
        >
          {CATEGORIES.map(c => <option key={c} value={c}>{c.replace(/_/g, ' ')}</option>)}
        </select>
        <button
          onClick={run}
          disabled={loading}
          style={{
            background: BLUE, color: 'white', border: 'none', borderRadius: 6,
            padding: '8px 16px', fontSize: 13, fontWeight: 600,
            cursor: loading ? 'default' : 'pointer', opacity: loading ? 0.6 : 1,
          }}
        >
          {loading ? `Scanning… ${scanned.toLocaleString()} checked` : 'List missing IDs'}
        </button>
        {ids && ids.length > 0 && !loading && (
          <button
            onClick={downloadCsv}
            style={{
              background: 'white', color: BLUE, border: `1px solid ${BLUE}`, borderRadius: 6,
              padding: '8px 14px', fontSize: 13, fontWeight: 600, cursor: 'pointer',
              display: 'inline-flex', alignItems: 'center', gap: 6,
            }}
          >
            <Download className="w-4 h-4" /> Download all
          </button>
        )}
      </div>

      {error && <p style={{ fontSize: 13, color: '#C15338' }}>{error}</p>}

      {ids && (
        <p style={{ fontSize: 12, color: '#6B7280', margin: '0 0 12px' }}>
          {ids.length.toLocaleString()} of {scanned.toLocaleString()} scanned products have no pack shot
          {batches.length > 1 ? ` — split into ${batches.length} batches of ${BATCH}.` : '.'}
        </p>
      )}

      {ids && ids.length === 0 && !loading && (
        <div style={{ textAlign: 'center', padding: '24px 0', color: '#9CA3AF' }}>
          <ListX className="w-7 h-7" style={{ margin: '0 auto 8px' }} />
          <p style={{ fontSize: 13, margin: 0 }}>Every product in this category has a pack shot.</p>
        </div>
      )}

      {batches.map((b, i) => <Batch key={i} ids={b} index={i} />)}
    </div>
  );
}