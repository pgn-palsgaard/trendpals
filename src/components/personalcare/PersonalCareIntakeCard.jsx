import React, { useRef, useState } from 'react';
import { Upload, Link2, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { intakeFile, intakeUrl, DuplicateSourceError } from '@/components/intake/sourceIntake';

// Every source created here is tagged main_group='BSA' at intake — that tag is what
// keeps Personal Care data out of the Food views, so it is set once, at the door.
export default function PersonalCareIntakeCard({ onDone }) {
  const fileRef = useRef(null);
  const [busy, setBusy] = useState(false);
  const [url, setUrl] = useState('');

  async function handleFile(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setBusy(true);
    try {
      await intakeFile({ file, title: file.name, mainGroup: 'BSA' });
      toast.success('Uploaded — processing in the background');
      onDone?.();
    } catch (err) {
      toast.error(err instanceof DuplicateSourceError ? err.message : (err.message || 'Upload failed'));
    }
    setBusy(false);
    if (fileRef.current) fileRef.current.value = '';
  }

  async function handleUrl() {
    if (!url.trim()) return;
    setBusy(true);
    try {
      await intakeUrl({ url: url.trim(), mainGroup: 'BSA' });
      toast.success('Link added — classifying in the background');
      setUrl('');
      onDone?.();
    } catch (err) {
      toast.error(err.message || 'Could not add link');
    }
    setBusy(false);
  }

  return (
    <div className="pal-card p-5">
      <p className="section-label mb-3">Add Personal Care source</p>
      <div className="flex flex-col sm:flex-row gap-3">
        <button
          onClick={() => !busy && fileRef.current?.click()}
          disabled={busy}
          className="flex items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-60"
          style={{ background: '#1D428A' }}
        >
          {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
          Upload file
        </button>
        <div className="flex-1 flex gap-2">
          <input
            value={url}
            onChange={e => setUrl(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') handleUrl(); }}
            placeholder="…or paste an article / webpage URL"
            className="flex-1 rounded-lg border border-border bg-card px-3 py-2 text-sm"
          />
          <button
            onClick={handleUrl}
            disabled={busy || !url.trim()}
            className="flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm font-medium text-foreground disabled:opacity-50"
          >
            <Link2 className="w-4 h-4" /> Add
          </button>
        </div>
      </div>
      <input
        ref={fileRef}
        type="file"
        className="hidden"
        accept=".pdf,.doc,.docx,.ppt,.pptx,.xls,.xlsx,.txt,.html,.htm"
        onChange={handleFile}
      />
      <p className="text-xs text-muted-foreground mt-3">
        Spreadsheets in the Mintel GNPD template are routed to the GNPD tab automatically.
        Everything else is classified as a knowledge or market-intelligence source.
      </p>
    </div>
  );
}