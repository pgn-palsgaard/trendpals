import React, { useState, useEffect, useCallback } from 'react';
import { base44 } from '@/api/base44Client';
import { Loader2, CheckCircle2, Clock, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import { formatDistanceToNow } from 'date-fns';

const BLUE   = '#1D428A';
const ORANGE = '#C15338';
const GREEN  = '#6F8263';
const GREY   = '#969696';

export default function RevalidateJobPanel({ onCompleted }) {
  const [job, setJob]         = useState(null);         // latest job record
  const [loading, setLoading] = useState(true);          // initial load
  const [invoking, setInvoking] = useState(false);       // button press in flight

  // ── Fetch latest job ──────────────────────────────────────────────────────
  const fetchJob = useCallback(async () => {
    try {
      const jobs = await base44.entities.ProcessingJob.filter(
        { job_type: 'revalidate_trend_links' }, '-created_date', 1
      );
      setJob(jobs[0] || null);
    } catch (e) {
      console.error('RevalidateJobPanel fetch error', e);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchJob();
  }, [fetchJob]);

  // ── Poll while active ─────────────────────────────────────────────────────
  useEffect(() => {
    if (!job) return;
    if (job.status !== 'running' && job.status !== 'paused_timeout') return;

    // Poll every 5 seconds while running
    const isRunning = job.status === 'running';
    if (!isRunning) return;

    const interval = setInterval(async () => {
      const jobs = await base44.entities.ProcessingJob.filter(
        { job_type: 'revalidate_trend_links' }, '-created_date', 1
      ).catch(() => []);
      const latest = jobs[0];
      if (latest) {
        setJob(latest);
        if (latest.status === 'completed') {
          clearInterval(interval);
          toast.success(
            `Sweep complete — ${latest.summary?.links_rejected ?? 0} rejected, ${latest.summary?.links_upgraded_to_auto_applied ?? 0} upgraded`
          );
          if (onCompleted) onCompleted();
        }
      }
    }, 5000);

    return () => clearInterval(interval);
  }, [job?.id, job?.status, onCompleted]);

  // ── Invoke the function ───────────────────────────────────────────────────
  async function handleInvoke() {
    setInvoking(true);
    try {
      await base44.functions.invoke('revalidatePendingTrendLinks', {});
      // Re-fetch job after invocation (it may have paused_timeout already)
      await fetchJob();
    } catch (e) {
      toast.error(e.message || 'Failed to start sweep');
    }
    setInvoking(false);
  }

  if (loading) return null;

  const isActive = job?.status === 'running' || job?.status === 'paused_timeout';
  const isComplete = job?.status === 'completed';
  const pct = job?.total_items > 0
    ? Math.round((job.processed_items / job.total_items) * 100)
    : 0;
  const lastUpdate = job?.last_progress_at
    ? formatDistanceToNow(new Date(job.last_progress_at), { addSuffix: true })
    : null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6 }}>

      {/* Active job: progress bar */}
      {isActive && (
        <div style={{ background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.25)', borderRadius: 8, padding: '8px 14px', minWidth: 280 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
            <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.9)', fontWeight: 600 }}>
              {job.status === 'running' ? (
                <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                  <Loader2 size={11} className="animate-spin" /> Running sweep…
                </span>
              ) : 'Paused — awaiting resume'}
            </span>
            <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.6)' }}>
              {job.processed_items ?? 0} / {job.total_items ?? '?'}
            </span>
          </div>
          {/* Progress bar */}
          <div style={{ height: 5, background: 'rgba(255,255,255,0.15)', borderRadius: 10, overflow: 'hidden', marginBottom: 6 }}>
            <div style={{ height: '100%', width: `${pct}%`, background: 'white', borderRadius: 10, transition: 'width 0.4s' }} />
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.55)' }}>
              {lastUpdate ? `Last update ${lastUpdate}` : ''}
            </span>
            {job.status === 'paused_timeout' && (
              <button
                onClick={handleInvoke}
                disabled={invoking}
                style={{ fontSize: 11, padding: '3px 10px', borderRadius: 4, border: '1px solid rgba(255,255,255,0.5)', background: 'rgba(255,255,255,0.18)', color: 'white', cursor: 'pointer', fontFamily: 'inherit', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 4 }}
              >
                {invoking ? <Loader2 size={10} className="animate-spin" /> : <RefreshCw size={10} />}
                Continue sweep
              </button>
            )}
          </div>
        </div>
      )}

      {/* No active job: start button + last result */}
      {!isActive && (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
          <button
            onClick={handleInvoke}
            disabled={invoking}
            style={{ fontSize: 12, padding: '6px 14px', borderRadius: 5, border: '1px solid rgba(255,255,255,0.4)', background: 'rgba(255,255,255,0.12)', color: 'white', cursor: 'pointer', fontFamily: 'inherit', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6, opacity: invoking ? 0.7 : 1 }}
          >
            {invoking ? <Loader2 size={12} className="animate-spin" /> : null}
            {invoking ? 'Starting…' : 'Re-validate pending trend links'}
          </button>

          {isComplete && job?.summary && (
            <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.65)' }}>
              Last sweep: {job.summary.links_rejected ?? 0} rejected · {job.summary.links_upgraded_to_auto_applied ?? 0} upgraded
              {lastUpdate ? `, ${lastUpdate}` : ''}
            </span>
          )}
        </div>
      )}
    </div>
  );
}