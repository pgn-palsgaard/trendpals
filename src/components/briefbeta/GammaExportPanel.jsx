import React, { useState, useEffect, useRef } from 'react';
import { base44 } from '@/api/base44Client';
import { Presentation, Download, ExternalLink, AlertCircle, Sparkles } from 'lucide-react';
import GammaProgressSteps from './GammaProgressSteps';
import ImagePreflight from './ImagePreflight';

const STEPS = [
  'Preparing deck structure',
  'Sending brief to Gamma',
  'Gamma is building your slides',
  'Finalising PowerPoint file',
];

export default function GammaExportPanel({ report, slideCount }) {
  const [phase, setPhase] = useState('idle'); // idle | running | ready | failed
  const [stepIndex, setStepIndex] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const pollRef = useRef(null);
  const tickRef = useRef(null);

  useEffect(() => () => { clearInterval(pollRef.current); clearInterval(tickRef.current); }, []);

  async function startExport() {
    setPhase('running');
    setError(null);
    setStepIndex(0);
    setElapsed(0);
    tickRef.current = setInterval(() => setElapsed(e => e + 1), 1000);

    try {
      setStepIndex(1);
      const res = await base44.functions.invoke('startGammaExport', { report_id: report.id });
      if (res.data?.error) throw new Error(res.data.error);
      setStepIndex(2);

      pollRef.current = setInterval(async () => {
        try {
          const poll = await base44.functions.invoke('checkGammaExport', { report_id: report.id });
          const d = poll.data || {};
          if (d.status === 'ready') {
            clearInterval(pollRef.current);
            clearInterval(tickRef.current);
            setStepIndex(STEPS.length);
            setResult(d);
            setPhase('ready');
          } else if (d.status === 'failed') {
            clearInterval(pollRef.current);
            clearInterval(tickRef.current);
            setError(d.error || 'Gamma could not build the deck.');
            setPhase('failed');
          }
        } catch { /* transient — keep polling */ }
      }, 5000);
    } catch (e) {
      clearInterval(tickRef.current);
      setError(e.message);
      setPhase('failed');
    }
  }

  const mins = Math.floor(elapsed / 60);
  const secs = elapsed % 60;

  if (phase === 'ready') {
    return (
      <div className="pal-card p-5">
        <div className="flex items-center gap-2 mb-1">
          <Sparkles className="w-4 h-4" style={{ color: '#6F8263' }} />
          <p className="font-semibold text-foreground">Your PowerPoint is ready</p>
        </div>
        <p className="text-xs text-muted-foreground mb-4">
          {slideCount} slides built by Gamma from your approved deck.
        </p>
        <div className="flex flex-col gap-2">
          {result?.pptx_url && (
            <a
              href={result.pptx_url}
              className="inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-semibold text-white"
              style={{ background: '#1D428A' }}
            >
              <Download className="w-4 h-4" /> Download report (.pptx)
            </a>
          )}
          {result?.gamma_url && (
            <a
              href={result.gamma_url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center justify-center gap-2 rounded-lg border border-border px-4 py-2.5 text-sm font-semibold"
              style={{ color: '#1D428A' }}
            >
              <ExternalLink className="w-4 h-4" /> Open in Gamma to edit
            </a>
          )}
        </div>
        <p className="text-[11px] text-muted-foreground mt-3">
          Download links expire after about a week — save the file locally.
        </p>
      </div>
    );
  }

  if (phase === 'running') {
    return (
      <div className="pal-card p-5">
        <div className="flex items-center justify-between mb-4">
          <p className="font-semibold text-foreground text-sm">Building your PowerPoint</p>
          <span className="text-xs text-muted-foreground tabular-nums">
            {mins > 0 ? `${mins}m ` : ''}{secs}s
          </span>
        </div>
        <GammaProgressSteps steps={STEPS} activeIndex={stepIndex} failed={false} />
        <p className="text-xs text-muted-foreground mt-4">
          Most decks are ready in 1–3 minutes. You can keep this tab open — we'll show the download button here.
        </p>
      </div>
    );
  }

  return (
    <div className="pal-card p-5">
      <div className="flex items-center gap-2 mb-1">
        <Presentation className="w-4 h-4" style={{ color: '#1D428A' }} />
        <p className="font-semibold text-foreground">Build the PowerPoint</p>
      </div>
      <p className="text-xs text-muted-foreground mb-4">
        Sends your approved {slideCount}-slide deck to Gamma and returns a finished .pptx file.
      </p>
      <ImagePreflight reportId={report.id} />
      {phase === 'failed' && (
        <div className="flex items-start gap-2 rounded-lg p-3 mb-3" style={{ background: '#FAE9E5' }}>
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" style={{ color: '#C15338' }} />
          <p className="text-xs" style={{ color: '#A33B24' }}>{error}</p>
        </div>
      )}
      <button
        onClick={startExport}
        className="w-full inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-semibold text-white"
        style={{ background: '#1D428A' }}
      >
        <Presentation className="w-4 h-4" />
        {phase === 'failed' ? 'Try again' : 'Generate PowerPoint'}
      </button>
    </div>
  );
}