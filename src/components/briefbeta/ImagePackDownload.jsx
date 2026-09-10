import React, { useState } from 'react';
import { Download } from 'lucide-react';
import { base44 } from '@/api/base44Client';

export default function ImagePackDownload({ report }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  async function download() {
    setLoading(true);
    setError(null);
    try {
      const response = await base44.functions.invoke('downloadReportImagePack', { report_id: report.id });
      if (response.data?.error) throw new Error(response.data.error);
      const link = document.createElement('a');
      link.href = response.data.file_url;
      link.download = response.data.filename || 'report-image-pack.zip';
      document.body.appendChild(link);
      link.click();
      link.remove();
    } catch (e) {
      setError(e.response?.data?.error || e.message || 'The image pack could not be downloaded.');
    } finally {
      setLoading(false);
    }
  }

  return <div>
    <button onClick={download} disabled={loading || !report?.id} className="inline-flex items-center justify-center gap-2 rounded-lg border border-primary px-4 py-3 text-sm font-semibold text-primary hover:bg-secondary disabled:opacity-50">
      <Download className="w-4 h-4" />{loading ? 'Preparing ZIP…' : 'Download all image packs (.zip)'}
    </button>
    {error && <p role="alert" className="mt-2 text-xs text-destructive">{error}</p>}
  </div>;
}