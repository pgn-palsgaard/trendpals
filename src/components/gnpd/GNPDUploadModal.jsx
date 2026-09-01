import React, { useState, useRef } from 'react';
import { base44 } from '@/api/base44Client';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Loader2, Upload, X, CheckCircle2, AlertCircle, FileSpreadsheet } from 'lucide-react';
import { toast } from 'sonner';
import { intakeFile, DuplicateSourceError } from '../intake/sourceIntake';
import { useDivision } from '@/lib/division';

const BLUE   = '#1D428A';
const ORANGE = '#C15338';
const GREEN  = '#6F8263';
const GREY   = '#969696';
const GOLD   = '#F7F4EE';

const MAX_GNPD_FILE_SIZE  = 10 * 1024 * 1024; // 10MB — soft warning above this
const HARD_GNPD_FILE_SIZE = 25 * 1024 * 1024; // 25MB — hard block above this

const fmtMB = (bytes) => (bytes / (1024 * 1024)).toFixed(1);

export default function GNPDUploadModal({ onClose, onUploaded }) {
  const division = useDivision();
  const fileInputRef = useRef(null);
  const [file, setFile]           = useState(null);
  const [stage, setStage]         = useState('idle'); // idle | sizeWarning | uploading | done | error
  const [errors, setErrors]       = useState([]);
  const [result, setResult]       = useState(null);  // { title }

  const handleFileSelect = (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    const ext = f.name.toLowerCase().split('.').pop();
    if (ext !== 'xls' && ext !== 'xlsx') {
      setErrors([`Wrong file type: .${ext}. Use the Mintel Spreadsheet Template export (.xls). Do not use HTML, CSV, or PPTX exports.`]);
      setStage('error');
      return;
    }
    // Hard block — file too large to process reliably
    if (f.size > HARD_GNPD_FILE_SIZE) {
      setFile(null);
      setErrors([`File exceeds 25MB limit (${fmtMB(f.size)}MB). Please split into smaller files by region or time period before uploading.`]);
      setStage('error');
      if (fileInputRef.current) fileInputRef.current.value = '';
      return;
    }
    setFile(f);
    setErrors([]);
    setResult(null);
    // Soft warning — large but allowed
    setStage(f.size > MAX_GNPD_FILE_SIZE ? 'sizeWarning' : 'idle');
  };

  const handleUpload = async () => {
    if (!file) return;
    setStage('uploading');
    setErrors([]);

    try {
      // Unified intake: dedup check + upload. GNPD validation/parsing runs in the background.
      // Tagged with the active division, so the export lands in the right library.
      await intakeFile({ file, title: file.name, mainGroup: division });

      setResult({ title: file.name });
      setStage('done');
      toast.success('Uploaded — processing in the background');
      onUploaded?.();

    } catch (err) {
      if (err instanceof DuplicateSourceError) {
        const dup = err.duplicates[0];
        setErrors([`Duplicate detected: "${dup.title}" already exists (${dup.pipeline_stage || 'uploaded'} / ${dup.review_status || 'pending'}). Delete the existing source first if you want to re-upload.`]);
      } else {
        setErrors([err.message || 'Upload failed. Please try again.']);
      }
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

  const isProcessing = stage === 'uploading';

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

        {/* Large-file soft warning */}
        {stage === 'sizeWarning' && file && (
          <div style={{ background: '#FEF6EC', border: `1px solid ${ORANGE}`, borderLeft: `4px solid ${ORANGE}`, borderRadius: 8, padding: '12px 14px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
              <AlertCircle size={15} style={{ color: ORANGE, flexShrink: 0 }} />
              <span style={{ fontSize: 13, fontWeight: 700, color: ORANGE }}>Large file ({fmtMB(file.size)}MB)</span>
            </div>
            <div style={{ fontSize: 12, color: '#7A4A1F', lineHeight: 1.5 }}>
              Large files may take several minutes to process. For best results, split global exports
              into regional files (e.g. one per sales region) before uploading.
            </div>
          </div>
        )}

        {/* Processing status */}
        {isProcessing && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 14px', background: '#E8EEF6', borderRadius: 8, fontSize: 13, color: BLUE }}>
            <Loader2 size={16} className="animate-spin" style={{ flexShrink: 0 }} />
            Uploading… this may take a minute for large files.
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
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
              <CheckCircle2 size={15} style={{ color: GREEN, flexShrink: 0 }} />
              <span style={{ fontSize: 13, fontWeight: 700, color: GREEN }}>Upload successful</span>
            </div>
            <div style={{ fontSize: 12, color: '#3F5A33', lineHeight: 1.5 }}>
              <strong>{result.title}</strong> is now processing in the background. Structure
              validation and metadata extraction run automatically — the export will appear in the
              table with its title, region and row count once ready (this can take a few minutes for large files).
            </div>
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
                  ? <><Loader2 size={13} className="animate-spin" /> Uploading…</>
                  : stage === 'error'
                  ? 'Try another file'
                  : stage === 'sizeWarning'
                  ? <><Upload size={13} /> Upload anyway</>
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