import React, { useRef, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Upload, Download, FileText, Loader2, X } from 'lucide-react';
import { toast } from 'sonner';

export default function FinalReportSection({ report }) {
  const queryClient = useQueryClient();
  const pptxRef = useRef();
  const pdfRef = useRef();
  const [uploadingPptx, setUploadingPptx] = useState(false);
  const [uploadingPdf, setUploadingPdf] = useState(false);

  const handleUpload = async (file, field, setLoading) => {
    if (!file) return;
    setLoading(true);
    try {
      const { file_url } = await base44.integrations.Core.UploadFile({ file });
      await base44.entities.Report.update(report.id, {
        [field]: file_url,
        final_uploaded_at: new Date().toISOString(),
      });
      queryClient.invalidateQueries({ queryKey: ['report', report.id] });
      queryClient.invalidateQueries({ queryKey: ['reportsLibrary'] });
      toast.success('File uploaded successfully');
    } catch (err) {
      toast.error('Upload failed');
    } finally {
      setLoading(false);
    }
  };

  const handleRemove = async (field) => {
    await base44.entities.Report.update(report.id, { [field]: null });
    queryClient.invalidateQueries({ queryKey: ['report', report.id] });
    queryClient.invalidateQueries({ queryKey: ['reportsLibrary'] });
    toast.success('File removed');
  };

  return (
    <Card className="mb-6">
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Final Report Files</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid sm:grid-cols-2 gap-4">
          {/* PPTX */}
          <div className="border rounded-lg p-4 space-y-3">
            <div className="flex items-center gap-2">
              <FileText className="w-4 h-4 text-orange-500" />
              <span className="text-sm font-medium text-slate-700">PowerPoint (PPTX)</span>
              {report.final_pptx_url && (
                <Badge className="bg-green-100 text-green-700 border-green-200 text-xs ml-auto">PPTX ready</Badge>
              )}
            </div>
            {report.final_pptx_url ? (
              <div className="flex gap-2">
                <a href={report.final_pptx_url} target="_blank" rel="noopener noreferrer" className="flex-1">
                  <Button variant="outline" size="sm" className="w-full">
                    <Download className="w-3 h-3 mr-1" /> Download
                  </Button>
                </a>
                <Button variant="ghost" size="sm" onClick={() => handleRemove('final_pptx_url')}>
                  <X className="w-3 h-3" />
                </Button>
              </div>
            ) : (
              <>
                <input
                  ref={pptxRef}
                  type="file"
                  accept=".pptx,.ppt"
                  className="hidden"
                  onChange={(e) => handleUpload(e.target.files[0], 'final_pptx_url', setUploadingPptx)}
                />
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full"
                  disabled={uploadingPptx}
                  onClick={() => pptxRef.current?.click()}
                >
                  {uploadingPptx ? (
                    <><Loader2 className="w-3 h-3 mr-1 animate-spin" />Uploading…</>
                  ) : (
                    <><Upload className="w-3 h-3 mr-1" />Upload PPTX</>
                  )}
                </Button>
              </>
            )}
          </div>

          {/* PDF */}
          <div className="border rounded-lg p-4 space-y-3">
            <div className="flex items-center gap-2">
              <FileText className="w-4 h-4 text-red-500" />
              <span className="text-sm font-medium text-slate-700">PDF</span>
              {report.final_pdf_url && (
                <Badge className="bg-green-100 text-green-700 border-green-200 text-xs ml-auto">PDF ready</Badge>
              )}
            </div>
            {report.final_pdf_url ? (
              <div className="flex gap-2">
                <a href={report.final_pdf_url} target="_blank" rel="noopener noreferrer" className="flex-1">
                  <Button variant="outline" size="sm" className="w-full">
                    <Download className="w-3 h-3 mr-1" /> Download
                  </Button>
                </a>
                <Button variant="ghost" size="sm" onClick={() => handleRemove('final_pdf_url')}>
                  <X className="w-3 h-3" />
                </Button>
              </div>
            ) : (
              <>
                <input
                  ref={pdfRef}
                  type="file"
                  accept=".pdf"
                  className="hidden"
                  onChange={(e) => handleUpload(e.target.files[0], 'final_pdf_url', setUploadingPdf)}
                />
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full"
                  disabled={uploadingPdf}
                  onClick={() => pdfRef.current?.click()}
                >
                  {uploadingPdf ? (
                    <><Loader2 className="w-3 h-3 mr-1 animate-spin" />Uploading…</>
                  ) : (
                    <><Upload className="w-3 h-3 mr-1" />Upload PDF</>
                  )}
                </Button>
              </>
            )}
          </div>
        </div>
        {report.final_uploaded_at && (
          <p className="text-xs text-slate-400 mt-3">
            Last updated {new Date(report.final_uploaded_at).toLocaleDateString()}
          </p>
        )}
      </CardContent>
    </Card>
  );
}