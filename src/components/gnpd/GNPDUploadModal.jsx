import React, { useState, useRef } from 'react';
import { base44 } from '@/api/base44Client';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Loader2, Upload, X, CheckCircle2, AlertCircle, FileSpreadsheet } from 'lucide-react';
import { toast } from 'sonner';

const BLUE   = '#1D428A';
const ORANGE = '#C15338';
const GREEN  = '#6F8263';
const GREY   = '#969696';
const GOLD   = '#F7F4EE';

export default function GNPDUploadModal({ onClose, onUploaded }) {
  const fileInputRef = useRef(null);
  const [file, setFile]           = useState(null);
  const [stage, setStage]         = useState('idle'); // idle | uploading | validating | done | error
  const [errors, setErrors]       = useState([]);
  const [result, setResult]       = useState(null);  // { title, region_code, category, rows }

  const handleFileSelect = (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    const ext = f.name.toLowerCase().split('.').pop();
    if (ext !== 'xls' && ext !== 'xlsx') {
      setErrors([`Wrong file type: .${ext}. Use the Mintel Spreadsheet Template export (.xls). Do not use HTML, CSV, or PPTX exports.`]);
      setStage('error');
      return;
    }
    setFile(f);
    setErrors([]);
    setStage('idle');
    setResult(null);
  };

  const handleUpload = async () => {
    if (!file) return;
    setStage('uploading');
    setErrors([]);

    try {
      // 1. Upload the raw file
      const { file_url } = await base44.integrations.Core.UploadFile({ file });

      // 2. Create the Source record (minimal — validateAndIngestGNPD fills the rest)
      const source = await base44.entities.Source.create({
        source_type: 'gnpd',
        title: file.name,
        file_url,
        file_size: file.size,
        status: 'uploaded',
        gnpd_mapping_status: 'detecting',
        visibility: 'org_shared'
      });

      setStage('validating');

      // 3. Run validation + ingestion
      const res = await base44.functions.invoke('validateAndIngestGNPD', { source_id: source.id });
      const data = res.data;

      if (!data.success) {
        // Validation failed — show errors
        setErrors(data.errors || ['Validation failed. Please check the file and try again.']);
        setStage('error');
        return;
      }

      setResult({
        title: data.auto_metadata?.title,
        region_code: data.auto_metadata?.region_code,
        category: data.auto_metadata?.category,
        dateRange: data.auto_metadata?.dateRange,
        rows: data.rows,
      });
      setStage('done');
      toast.success(`Uploaded: ${data.rows?.toLocaleString()} products detected`);
      onUploaded?.();

    } catch (err) {
      setErrors([err.message || 'Upload failed. Please try again.']);
      setStage('error');
    }
  };

  const reset = () => {
    setFile(null);
    setStage('idle');
    setErrors([]);
    setResult(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const isProcessing = stage === 'uploading' || stage === 'validating';

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent style={{ maxWidth: 480, fontFamily: 'Calibri, Arial, sans-serif' }}>
        <DialogHeader>
          <DialogTitle style={{ color: BLUE, fontSize: 17, fontWeight: 700 }}>
            Upload GNPD Export
          </DialogTitle>
        </DialogHeader>

        <div style={{ fontSize: 12, color: GREY, marginTop: -4, marginBottom: 16 }}>
          Accepts Mintel Spreadsheet Template exports only (.xls or .xlsx).
          Metadata is extracted automatically from the "Search details" sheet.
        </div>

        {/* Drop zone / file selector */}
        {stage !== 'done' && (
          <div
            onClick={() => !isProcessing && fileInputRef.current?.click()}
            style={{
              border: `2px dashed ${file ? BLUE : '#d8d3c8'}`,
              borderRadius: 8,
              padding: '24px 20px',
              textAlign: 'center',
              cursor: isProcessing ? 'default' : 'pointer',
              background: file ? '#E8EEF6' : GOLD,
              transition: 'all 0.15s'
            }}
          >
            {file ? (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10 }}>
                <FileSpreadsheet size={20} style={{ color: BLUE, flexShrink: 0 }} />
                <div style={{ textAlign: 'left' }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: BLUE }}>{file.name}</div>
                  <div style={{ fontSize: 11, color: GREY }}>{(file.size / 1024).toFixed(0)} KB</div>
                </div>
                {!isProcessing && (
                  <button onClick={e => { e.stopPropagation(); reset(); }}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: GREY, marginLeft: 8 }}>
                    <X size={14} />
                  </button>
                )}
              </div>
            ) : (
              <>
                <Upload size={24} style={{ color: GREY, margin: '0 auto 8px' }} />
                <div style={{ fontSize: 13, color: BLUE, fontWeight: 600 }}>Click to select file</div>
                <div style={{ fontSize: 11, color: GREY, marginTop: 4 }}>.xls or .xlsx only</div>
              </>
            )}
          </div>
        )}

        <input
          ref={fileInputRef}
          type="file"
          accept=".xls,.xlsx"
          className="hidden"
          onChange={handleFileSelect}
        />

        {/* Processing status */}
        {isProcessing && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 14px', background: '#E8EEF6', borderRadius: 8, fontSize: 13, color: BLUE }}>
            <Loader2 size={16} className="animate-spin" style={{ flexShrink: 0 }} />
            {stage === 'uploading' ? 'Uploading file…' : 'Validating structure and extracting metadata…'}
          </div>
        )}

        {/* Error state */}
        {stage === 'error' && errors.length > 0 && (
          <div style={{ background: '#FEF2F1', border: `1px solid ${ORANGE}`, borderLeft: `4px solid ${ORANGE}`, borderRadius: 8, padding: '12px 14px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
              <AlertCircle size={15} style={{ color: ORANGE, flexShrink: 0 }} />
              <span style={{ fontSize: 13, fontWeight: 700, color: ORANGE }}>
                {errors.length === 1 ? 'File rejected' : `${errors.length} issues found`}
              </span>
            </div>
            {errors.map((err, i) => (
              <div key={i} style={{ fontSize: 12, color: '#7A2E1F', lineHeight: 1.5, marginBottom: i < errors.length - 1 ? 6 : 0 }}>
                {errors.length > 1 && <span style={{ fontWeight: 600 }}>{i + 1}. </span>}
                {err}
              </div>
            ))}
          </div>
        )}

        {/* Success state */}
        {stage === 'done' && result && (
          <div style={{ background: '#EDF4EA', border: '1px solid #9DC98D', borderLeft: `4px solid ${GREEN}`, borderRadius: 8, padding: '14px 16px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
              <CheckCircle2 size={15} style={{ color: GREEN, flexShrink: 0 }} />
              <span style={{ fontSize: 13, fontWeight: 700, color: GREEN }}>Upload successful</span>
            </div>
            {[
              ['Title',    result.title],
              ['Category', result.category],
              ['Region',   result.region_code],
              ['Period',   result.dateRange],
              ['Products', result.rows?.toLocaleString()],
            ].filter(([, v]) => v).map(([label, val]) => (
              <div key={label} style={{ display: 'flex', gap: 10, fontSize: 12, marginBottom: 4 }}>
                <span style={{ color: GREY, minWidth: 64, flexShrink: 0 }}>{label}</span>
                <span style={{ color: '#1D2B47', fontWeight: 600 }}>{val}</span>
              </div>
            ))}
          </div>
        )}

        {/* Actions */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 4 }}>
          {stage === 'done' ? (
            <button onClick={onClose}
              style={{ background: BLUE, color: 'white', border: 'none', borderRadius: 6, padding: '8px 20px', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
              Done
            </button>
          ) : (
            <>
              <button onClick={onClose} disabled={isProcessing}
                style={{ background: 'none', border: '1px solid #d8d3c8', borderRadius: 6, padding: '8px 16px', fontSize: 13, color: GREY, cursor: isProcessing ? 'default' : 'pointer', fontFamily: 'inherit' }}>
                Cancel
              </button>
              <button
                onClick={stage === 'error' ? reset : handleUpload}
                disabled={(!file && stage !== 'error') || isProcessing}
                style={{
                  background: (!file && stage !== 'error') || isProcessing ? '#d8d3c8' : BLUE,
                  color: 'white', border: 'none', borderRadius: 6,
                  padding: '8px 20px', fontSize: 13, fontWeight: 600,
                  cursor: (!file && stage !== 'error') || isProcessing ? 'default' : 'pointer',
                  fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: 6
                }}
              >
                {isProcessing
                  ? <><Loader2 size={13} className="animate-spin" /> Processing…</>
                  : stage === 'error'
                  ? 'Try another file'
                  : <><Upload size={13} /> Upload</>
                }
              </button>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}