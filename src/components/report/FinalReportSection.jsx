import React, { useRef, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Upload, Download, FileText, Loader2, X, History, ExternalLink } from 'lucide-react';
import { toast } from 'sonner';
import { format } from 'date-fns';

export default function FinalReportSection({ report }) {
  const queryClient = useQueryClient();
  const fileRef = useRef();
  const [uploading, setUploading] = useState(false);

  const finalUploads = Array.isArray(report.final_uploads) ? report.final_uploads : [];

  // Legacy: also show old single-field uploads if they exist and aren't already in final_uploads
  const legacyUrls = [];
  if (report.final_pptx_url && !finalUploads.some(u => u.url === report.final_pptx_url)) {
    legacyUrls.push({ url: report.final_pptx_url, file_type: 'pptx', uploaded_at: report.final_uploaded_at, legacy: true });
  }
  if (report.final_pdf_url && !finalUploads.some(u => u.url === report.final_pdf_url)) {
    legacyUrls.push({ url: report.final_pdf_url, file_type: 'pdf', uploaded_at: report.final_uploaded_at, legacy: true });
  }
  const allUploads = [...legacyUrls, ...finalUploads].sort((a, b) =>
    new Date(b.uploaded_at || 0) - new Date(a.uploaded_at || 0)
  );

  const handleUpload = async (file) => {
    if (!file) return;
    setUploading(true);
    try {
      // Step 1: upload file to storage
      const { file_url } = await base44.integrations.Core.UploadFile({ file });

      // Step 2: determine file_type
      const ext = file.name.split('.').pop()?.toLowerCase();
      const file_type = ['pptx', 'ppt'].includes(ext) ? 'pptx' : ext === 'pdf' ? 'pdf' : 'other';

      // Step 3: call uploadReportAsKnowledge — creates Source + appends to final_uploads + triggers pipeline
      const res = await base44.functions.invoke('uploadReportAsKnowledge', {
        report_id: report.id,
        file_url,
        file_name: file.name,
        file_type,
      });

      if (res.data?.ok) {
        toast.success('File uploaded and sent to knowledge pipeline');
      } else {
        toast.error(res.data?.error || 'Upload failed');
      }

      queryClient.invalidateQueries({ queryKey: ['report', report.id] });
      queryClient.invalidateQueries({ queryKey: ['reportsLibrary'] });
    } catch (err) {
      toast.error('Upload failed: ' + err.message);
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  return (
    <Card className="mb-6">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base">Final Report Files</CardTitle>
          <Button
            variant="outline"
            size="sm"
            disabled={uploading}
            onClick={() => fileRef.current?.click()}
          >
            {uploading ? (
              <><Loader2 className="w-3 h-3 mr-1.5 animate-spin" />Uploading…</>
            ) : (
              <><Upload className="w-3 h-3 mr-1.5" />Upload File</>
            )}
          </Button>
          <input
            ref={fileRef}
            type="file"
            accept=".pptx,.ppt,.pdf"
            className="hidden"
            onChange={(e) => handleUpload(e.target.files[0])}
          />
        </div>
        <p className="text-xs text-slate-400 mt-1">
          Uploaded files are automatically ingested as Knowledge Sources for future report generation.
        </p>
      </CardHeader>
      <CardContent>
        {allUploads.length === 0 ? (
          <p className="text-sm text-slate-400 py-2">No files uploaded yet.</p>
        ) : (
          <div className="space-y-2">
            {allUploads.map((entry, idx) => (
              <div
                key={idx}
                className="flex items-center justify-between gap-3 p-3 rounded-lg border border-slate-200 bg-slate-50"
              >
                <div className="flex items-center gap-2 min-w-0">
                  <FileText className={`w-4 h-4 shrink-0 ${entry.file_type === 'pdf' ? 'text-red-500' : 'text-orange-500'}`} />
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className="text-xs px-1.5 py-0 uppercase font-mono">
                        {entry.file_type || 'file'}
                      </Badge>
                      {entry.legacy && (
                        <Badge className="text-xs px-1.5 py-0 bg-slate-100 text-slate-500">legacy</Badge>
                      )}
                      {entry.source_id && (
                        <Badge className="text-xs px-1.5 py-0 bg-green-100 text-green-700">→ Knowledge</Badge>
                      )}
                    </div>
                    <p className="text-xs text-slate-500 mt-0.5">
                      {entry.uploaded_at
                        ? format(new Date(entry.uploaded_at), 'dd MMM yyyy HH:mm')
                        : '—'}
                      {entry.uploaded_by ? ` · ${entry.uploaded_by}` : ''}
                    </p>
                  </div>
                </div>
                <a href={entry.url} target="_blank" rel="noopener noreferrer">
                  <Button variant="ghost" size="sm">
                    <ExternalLink className="w-3.5 h-3.5" />
                  </Button>
                </a>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}