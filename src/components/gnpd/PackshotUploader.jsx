import React, { useRef, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Upload, Loader2, CheckCircle2, MinusCircle, AlertCircle } from 'lucide-react';

const BLUE = '#1D428A';

// Shared pack shot uploader — drop images (named after their GNPD Record ID)
// or a single .zip; matched products get the image stored on them.
export default function PackshotUploader({ onDone, compact = false }) {
  const inputRef = useRef(null);
  const [busy, setBusy] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);

  async function handleFiles(fileList) {
    const files = Array.from(fileList || []);
    if (files.length === 0) return;
    setBusy(true); setError(null); setResult(null);
    try {
      const payload = { files: [] };
      for (const f of files) {
        const { file_url } = await base44.integrations.Core.UploadFile({ file: f });
        if (/\.zip$/i.test(f.name)) payload.zip_url = file_url;
        else payload.files.push({ name: f.name, file_url });
      }
      const res = await base44.functions.invoke('uploadPackshots', payload);
      if (res.data?.error) throw new Error(res.data.error);
      setResult(res.data);
      if (onDone) onDone();
    } catch (e) {
      setError(e.message);
    }
    setBusy(false);
  }

  return (
    <div>
      <div
        onDragOver={e => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={e => { e.preventDefault(); setDragging(false); handleFiles(e.dataTransfer.files); }}
        onClick={() => !busy && inputRef.current?.click()}
        style={{
          border: `1.5px dashed ${dragging ? BLUE : '#d8d3c8'}`,
          background: dragging ? '#EBF0F8' : 'transparent',
          borderRadius: 8,
          padding: compact ? '14px 12px' : '22px 16px',
          textAlign: 'center',
          cursor: busy ? 'default' : 'pointer',
        }}
      >
        {busy ? (
          <p style={{ margin: 0, fontSize: 12, color: '#6B7280', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <Loader2 className="w-4 h-4 animate-spin" /> Uploading and matching pack shots…
          </p>
        ) : (
          <>
            <Upload className="w-5 h-5" style={{ color: BLUE, margin: '0 auto 6px' }} />
            <p style={{ margin: 0, fontSize: 13, fontWeight: 600, color: '#1D2B47' }}>
              Drop pack shots here, or click to choose files
            </p>
            <p style={{ margin: '3px 0 0', fontSize: 11, color: '#9CA3AF' }}>
              JPG, PNG, WEBP or a GNPD .zip — filenames must carry the Record ID (14535734.jpg or 14535734-0.jpg).
              Where a record has several shots, the first one is used.
            </p>
          </>
        )}
        <input
          ref={inputRef}
          type="file"
          multiple
          accept=".jpg,.jpeg,.png,.webp,.gif,.zip"
          style={{ display: 'none' }}
          onChange={e => handleFiles(e.target.files)}
        />
      </div>

      {error && (
        <p style={{ marginTop: 8, fontSize: 12, color: '#C15338', display: 'flex', alignItems: 'center', gap: 6 }}>
          <AlertCircle className="w-3.5 h-3.5" /> {error}
        </p>
      )}

      {result && (
        <div style={{ marginTop: 10 }}>
          <p style={{ margin: '0 0 6px', fontSize: 12, fontWeight: 600, color: '#1D2B47' }}>
            {result.matched} matched · {result.updated} products updated · {result.not_found} not found · {result.skipped} skipped
          </p>
          <div style={{ maxHeight: 160, overflowY: 'auto' }}>
            {(result.results || []).map((r, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, padding: '2px 0', color: '#6B7280' }}>
                {r.status === 'updated'
                  ? <CheckCircle2 className="w-3.5 h-3.5 shrink-0" style={{ color: '#6F8263' }} />
                  : <MinusCircle className="w-3.5 h-3.5 shrink-0" style={{ color: '#9CA3AF' }} />}
                <span style={{ fontFamily: 'monospace' }}>{r.name}</span>
                <span>— {r.status === 'updated' ? `Record ${r.record_id}` : r.status === 'not_found' ? `no product with Record ID ${r.record_id}` : r.reason}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}