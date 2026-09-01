import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Loader2, FileSpreadsheet, Upload } from 'lucide-react';
import { format } from 'date-fns';
import { toast } from 'sonner';
import { intakeFile, DuplicateSourceError } from '@/components/intake/sourceIntake';

export default function PersonalCareGnpdTab() {
  const queryClient = useQueryClient();
  const queryKey = ['bsaGnpdSources'];
  const [uploading, setUploading] = useState(false);
  const [parsing, setParsing] = useState({});
  const fileRef = React.useRef(null);

  const { data: sources = [], isLoading } = useQuery({
    queryKey,
    queryFn: () => base44.entities.Source.filter({ source_type: 'gnpd', main_group: 'BSA' }, '-created_date', 200),
    refetchInterval: (data) => {
      const rows = data?.state?.data ?? [];
      return rows.some(s => s.gnpd_mapping_status === 'detecting') ? 3000 : false;
    },
  });

  async function handleFile(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    const ext = file.name.toLowerCase().split('.').pop();
    if (ext !== 'xls' && ext !== 'xlsx') {
      toast.error('Use the Mintel Spreadsheet Template export (.xls or .xlsx).');
      return;
    }
    setUploading(true);
    try {
      await intakeFile({ file, title: file.name, mainGroup: 'BSA' });
      toast.success('Uploaded — column detection is running');
      queryClient.invalidateQueries({ queryKey });
    } catch (err) {
      toast.error(err instanceof DuplicateSourceError ? err.message : (err.message || 'Upload failed'));
    }
    setUploading(false);
    if (fileRef.current) fileRef.current.value = '';
  }

  async function handleParse(sourceId) {
    setParsing(p => ({ ...p, [sourceId]: 'parsing' }));
    try {
      const res = await base44.functions.invoke('runGNPDBatchParse', { sourceIds: [sourceId], skipTrendLinking: true });
      const result = (res.data?.results || [])[0];
      if (result?.status === 'error') throw new Error(result.error || 'Parse failed');
      toast.success(`${result?.created ?? 0} Personal Care product(s) created`);
      setParsing(p => ({ ...p, [sourceId]: 'done' }));
      queryClient.invalidateQueries({ queryKey });
    } catch (err) {
      setParsing(p => ({ ...p, [sourceId]: 'error' }));
      toast.error(err.message);
    }
  }

  return (
    <div className="space-y-4">
      <div className="pal-card p-5 flex items-center justify-between gap-4">
        <div>
          <p className="section-label mb-1">Personal Care GNPD upload</p>
          <p className="text-xs text-muted-foreground">
            Same Mintel spreadsheet template as Food. Extra Personal Care columns are preserved on each product.
          </p>
        </div>
        <button
          onClick={() => !uploading && fileRef.current?.click()}
          disabled={uploading}
          className="flex items-center gap-2 rounded-lg px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-60 shrink-0"
          style={{ background: '#1D428A' }}
        >
          {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
          Upload export
        </button>
        <input ref={fileRef} type="file" accept=".xls,.xlsx" className="hidden" onChange={handleFile} />
      </div>

      <div className="pal-card overflow-hidden">
        {isLoading ? (
          <div className="flex justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
        ) : sources.length === 0 ? (
          <p className="p-10 text-center text-sm text-muted-foreground">No Personal Care GNPD exports uploaded yet.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-muted/60 border-b border-border">
                {['Export', 'Uploaded', 'Rows', 'Mapping', ''].map(h => (
                  <th key={h} className="text-left px-4 py-2.5 text-xs font-semibold text-foreground">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sources.map(s => (
                <tr key={s.id} className="table-row-airy">
                  <td className="px-4 py-2.5">
                    <div className="flex items-start gap-2">
                      <FileSpreadsheet className="w-4 h-4 mt-0.5 shrink-0 text-muted-foreground" />
                      <span className="font-medium text-foreground">{s.title || 'Untitled'}</span>
                    </div>
                  </td>
                  <td className="px-4 py-2.5 text-muted-foreground whitespace-nowrap">
                    {s.created_date ? format(new Date(s.created_date), 'MMM d, yyyy') : '—'}
                  </td>
                  <td className="px-4 py-2.5 text-muted-foreground">{s.gnpd_row_count?.toLocaleString() || '—'}</td>
                  <td className="px-4 py-2.5">
                    <span className={s.gnpd_mapping_status === 'complete' ? 'badge-approved' : s.gnpd_mapping_status === 'failed' ? 'badge-rejected' : 'badge-pending'}>
                      {s.gnpd_mapping_status || 'not started'}
                    </span>
                  </td>
                  <td className="px-4 py-2.5">
                    {s.pipeline_stage === 'gnpd_ready' ? (
                      <span className="badge-approved">In database</span>
                    ) : parsing[s.id] === 'parsing' ? (
                      <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                        <Loader2 className="w-3 h-3 animate-spin" /> Parsing…
                      </span>
                    ) : (
                      <button
                        onClick={() => handleParse(s.id)}
                        className="rounded-md border px-2.5 py-1 text-xs font-semibold"
                        style={{ borderColor: '#1D428A', color: '#1D428A' }}
                      >
                        Parse to database →
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}