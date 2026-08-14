import React, { useState, useEffect, useRef } from 'react';
import { base44 } from '@/api/base44Client';
import { Download, AlertCircle, Wand2 } from 'lucide-react';
import ImagePreflight from '@/components/briefbeta/ImagePreflight';

// Builds the PPTX with the custom Palsgaard PowerPoint skill via Claude,
// as a CVI-true alternative to the Gamma export. Polls the Report record.
export default function ClaudePptxPanel({ report, slideCount }) {
  const [phase, setPhase] = useState(report?.claude_export_status === 'ready' ? 'ready' : 'idle');
  const [pptxUrl, setPptxUrl] = useState(report?.claude_pptx_url || null);
  const [error, setError] = useState(null);
  const [elapsed, setElapsed] = useState(0);
  const pollRef = useRef(null);
  const tickRef = useRef(null);

  useEffect(() => () => { clearInterval(pollRef.current); clearInterval(tickRef.current); }, []);

  // Poll the backend, which advances the Anthropic batch and stores the file.
  function beginPolling() {
    clearInterval(pollRef.current);
    pollRef.current = setInterval(async () => {
      try {
        const res = await base44.functions.invoke('checkClaudePptxExport', { report_id: report.id });
        const d = res.data || {};
        if (d.status === 'ready') {
          clearInterval(pollRef.current);
          clearInterval(tickRef.current);
          setPptxUrl(d.pptx_url);
          setPhase('ready');
        } else if (d.status === 'failed' || d.error) {
          clearInterval(pollRef.current);
          clearInterval(tickRef.current);
          setError(d.error || 'The skill could not build the deck.');
          setPhase('failed');
        }
      } catch { /* transient — keep polling */ }
    }, 10000);
  }

  // Resume an export that was already running when this view opened.
  useEffect(() => {
    if (report?.claude_export_status !== 'generating') return;
    setPhase('running');
    const started = report.claude_export_started_at ? new Date(report.claude_export_started_at).getTime() : Date.now();
    setElapsed(Math.max(0, Math.round((Date.now() - started) / 1000)));
    tickRef.current = setInterval(() => setElapsed(e => e + 1), 1000);
    beginPolling();
  }, [report?.id]);

  async function startExport() {
    setPhase('running');
    setError(null);
    setElapsed(0);
    clearInterval(tickRef.current);
    tickRef.current = setInterval(() => setElapsed(e => e + 1), 1000);

    try {
      const res = await base44.functions.invoke('startClaudePptxExport', { report_id: report.id });
      if (res.data?.error) throw new Error(res.data.error);
      beginPolling();
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
          <Wand2 className="w-4 h-4" style={{ color: '#6F8263' }} />
          <p className="font-semibold text-foreground">Palsgaard-skill PowerPoint ready</p>
        </div>
        <p className="text-xs text-muted-foreground mb-4">
          Built with your own Claude skill — CVI template applied directly.
        </p>
        <a
          href={pptxUrl}
          className="inline-flex w-full items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-semibold text-white"
          style={{ background: '#1D428A' }}
        >
          <Download className="w-4 h-4" /> Download report (.pptx)
        </a>
      </div>
    );
  }

  if (phase === 'running') {
    return (
      <div className="pal-card p-5">
        <div className="flex items-center justify-between mb-2">
          <p className="font-semibold text-foreground text-sm">Claude is building your PowerPoint</p>
          <span className="text-xs text-muted-foreground tabular-nums">
            {mins > 0 ? `${mins}m ` : ''}{secs}s
          </span>
        </div>
        <p className="text-xs text-muted-foreground">
          Your Palsgaard skill is laying out {slideCount} slides with the CVI template and product pack-shots.
          This typically takes 2–6 minutes — keep this tab open.
        </p>
      </div>
    );
  }

  return (
    <div className="pal-card p-5">
      <div className="flex items-center gap-2 mb-1">
        <Wand2 className="w-4 h-4" style={{ color: '#1D428A' }} />
        <p className="font-semibold text-foreground">Build with Palsgaard skill (Claude)</p>
      </div>
      <p className="text-xs text-muted-foreground mb-4">
        Generates the .pptx directly with your own Claude PowerPoint skill — exact CVI template, no Gamma.
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
        <Wand2 className="w-4 h-4" />
        {phase === 'failed' ? 'Try again' : 'Generate PowerPoint (Palsgaard skill)'}
      </button>
    </div>
  );
}