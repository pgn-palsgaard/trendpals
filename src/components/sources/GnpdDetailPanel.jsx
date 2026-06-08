import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { ExternalLink, Loader2, RefreshCw, Trash2, BarChart2 } from 'lucide-react';
import { format } from 'date-fns';

const MAPPING_STATUS_BADGE = {
  not_started: 'bg-slate-100 text-slate-500',
  detecting:   'bg-blue-100 text-blue-700',
  complete:    'bg-green-100 text-green-700',
  failed:      'bg-red-100 text-red-700',
};

const GNPD_STATUS_BADGE = {
  pending:    'bg-amber-100 text-amber-700',
  processing: 'bg-blue-100 text-blue-700',
  ready:      'bg-green-100 text-green-700',
  failed:     'bg-red-100 text-red-700',
};

export default function GnpdDetailPanel({ sourceId, onClose, onRefresh, onDelete }) {
  const [source, setSource] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!sourceId) return;
    setSource(null);
    setLoading(true);
    base44.entities.Source.filter({ id: sourceId }, null, 1)
      .then(r => setSource(r[0]))
      .finally(() => setLoading(false));
  }, [sourceId]);

  const handleRerunMapping = async () => {
    await base44.entities.Source.update(sourceId, {
      gnpd_mapping_status: 'detecting',
    });
    toast.success('Column detection re-queued');
    onRefresh?.();
  };

  const handleDelete = async () => {
    if (!confirm('Delete this GNPD source permanently?')) return;
    await base44.functions.invoke('deleteSourceRecords', { ids: [sourceId] });
    toast.success('GNPD source deleted');
    onClose();
    onRefresh?.();
  };

  const mappingEntries = source?.gnpd_column_mapping
    ? Object.entries(source.gnpd_column_mapping).filter(([, v]) => v)
    : [];

  const headers = source?.gnpd_headers || (source?.gnpd_preview_rows?.[0] ? Object.keys(source.gnpd_preview_rows[0]) : []);
  const previewRows = source?.gnpd_preview_rows?.slice(0, 10) || [];

  return (
    <Sheet open={!!sourceId} onOpenChange={(open) => { if (!open) onClose(); }}>
      <SheetContent className="sm:max-w-2xl w-full flex flex-col p-0 gap-0" side="right">

        <SheetHeader className="px-6 py-4 border-b border-slate-200 shrink-0">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <SheetTitle className="text-lg font-bold text-slate-900 truncate" title={source?.title}>
                {loading ? '...' : (source?.title || 'Untitled GNPD Export')}
              </SheetTitle>
              {source && (
                <div className="flex flex-wrap gap-1.5 mt-1.5">
                  {source.region_code && <Badge variant="outline" className="text-xs">{source.region_code}</Badge>}
                  {source.category && <Badge variant="outline" className="text-xs">{source.category}</Badge>}
                  {source.gnpd_row_count != null && (
                    <span className="text-xs text-slate-400">{source.gnpd_row_count.toLocaleString()} rows</span>
                  )}
                  {source.created_date && (
                    <span className="text-xs text-slate-400">
                      Uploaded {format(new Date(source.created_date), 'MMM d, yyyy')}
                    </span>
                  )}
                </div>
              )}
            </div>
            {source?.file_url && (
              <a href={source.file_url} target="_blank" rel="noopener noreferrer">
                <Button variant="ghost" size="icon" className="shrink-0">
                  <ExternalLink className="w-4 h-4" />
                </Button>
              </a>
            )}
          </div>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-5">
          {loading && (
            <div className="flex items-center justify-center py-20">
              <Loader2 className="w-6 h-6 animate-spin text-slate-400" />
            </div>
          )}

          {!loading && source && (
            <>
              {/* Processing status */}
              <div className="flex items-center gap-3">
                <div>
                  <p className="text-xs text-slate-400 uppercase font-semibold tracking-wide mb-1">Processing Status</p>
                  <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${GNPD_STATUS_BADGE[source.gnpd_processing_status] || 'bg-slate-100 text-slate-600'}`}>
                    {source.gnpd_processing_status || 'unknown'}
                  </span>
                </div>
                <div>
                  <p className="text-xs text-slate-400 uppercase font-semibold tracking-wide mb-1">Column Mapping</p>
                  <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${MAPPING_STATUS_BADGE[source.gnpd_mapping_status] || 'bg-slate-100 text-slate-600'}`}>
                    {source.gnpd_mapping_status || 'not started'}
                  </span>
                </div>
              </div>

              {/* Column mapping */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-sm font-semibold text-slate-800">Column Mapping</h3>
                  {(source.gnpd_mapping_status === 'not_started' || source.gnpd_mapping_status === 'failed' || !source.gnpd_mapping_status) && (
                    <Button size="sm" variant="outline" onClick={handleRerunMapping}>
                      <RefreshCw className="w-3.5 h-3.5 mr-1.5" />
                      Re-run detection
                    </Button>
                  )}
                </div>
                {mappingEntries.length === 0 ? (
                  <p className="text-sm text-slate-400 italic">No column mapping available yet.</p>
                ) : (
                  <div className="border border-slate-200 rounded-lg overflow-hidden">
                    <table className="w-full text-xs">
                      <thead className="bg-slate-50">
                        <tr>
                          <th className="text-left px-3 py-2 font-semibold text-slate-600">Mapped Field</th>
                          <th className="text-left px-3 py-2 font-semibold text-slate-600">Raw Column Name</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {mappingEntries.map(([field, col]) => (
                          <tr key={field}>
                            <td className="px-3 py-1.5 font-medium text-slate-700">{field.replace(/_/g, ' ')}</td>
                            <td className="px-3 py-1.5 text-slate-500 font-mono">{String(col)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              {/* Preview table */}
              {previewRows.length > 0 && (
                <div>
                  <h3 className="text-sm font-semibold text-slate-800 mb-2">
                    Data Preview ({previewRows.length} of {source.gnpd_row_count?.toLocaleString() || '?'} rows)
                  </h3>
                  <div className="overflow-x-auto border border-slate-200 rounded-lg">
                    <table className="text-xs w-max min-w-full">
                      <thead className="bg-slate-50 sticky top-0">
                        <tr>
                          {headers.slice(0, 8).map(h => (
                            <th key={h} className="px-3 py-2 text-left font-semibold text-slate-600 whitespace-nowrap border-r border-slate-200 last:border-0">
                              {h}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {previewRows.map((row, i) => (
                          <tr key={i} className="hover:bg-slate-50">
                            {headers.slice(0, 8).map(h => (
                              <td key={h} className="px-3 py-1.5 text-slate-600 max-w-[150px] truncate border-r border-slate-100 last:border-0">
                                {String(row[h] ?? '')}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        {!loading && source && (
          <div className="shrink-0 border-t border-slate-200 px-6 py-4 bg-white flex items-center justify-between">
            <Button variant="outline" size="sm" className="text-red-600 hover:text-red-700 border-red-200" onClick={handleDelete}>
              <Trash2 className="w-3.5 h-3.5 mr-1.5" />
              Delete
            </Button>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={onClose}>Close</Button>
              <Button size="sm" className="bg-blue-600 hover:bg-blue-700" disabled>
                <BarChart2 className="w-3.5 h-3.5 mr-1.5" />
                Use in Report
              </Button>
            </div>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}