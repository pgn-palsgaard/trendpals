import React, { useState, useEffect, useRef } from 'react';
import { base44 } from '@/api/base44Client';
import { Loader2, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import { formatDistanceToNow } from 'date-fns';

const BLUE = '#1D428A';

async function fetchActiveJob() {
  const jobs = await base44.entities.ProcessingJob.filter(
    { job_type: 'revalidate_trend_links' }, '-created_date', 1
  );
  return jobs[0] || null;
}

export default function RevalidateJobPanel({ onCompleted }) {
  const [job, setJob]         = useState(null);
  const [loading, setLoading] = useState(true);
  const [invoking, setInvoking] = useState(false);
  const pollRef = useRef(null);

  function startPolling() {
    if (pollRef.current) return;
    pollRef.current = setInterval(async () => {
      const latest = await fetchActiveJob().catch(() => null);
      if (latest) {
        setJob(latest);
        if (latest.status === 'completed') {
          stopPolling();
          toast.success(
            `Sweep complete — ${latest.summary?.links_rejected ?? 0} rejected, ${latest.summary?.links_upgraded_to_auto_applied ?? 0} upgraded`
          );
          if (onCompleted) onCompleted();
        }
      }
    }, 5000);
  }

  function stopPolling() {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }

  // Initial load
  useEffect(() => {
    fetchActiveJob().then(j => {
      setJob(j);
      setLoading(false);
      if (j?.status === 'running' || j?.status === 'paused_timeout') {
        startPolling();
      }
    }).catch(() => setLoading(false));
    return stopPolling;
  }, []);

  // Start/stop polling when job status changes
  useEffect(() => {
    if (!job) return;
    if (job.status === 'running' || job.status === 'paused_timeout') {
      startPolling();
    } else {
      stopPolling();
    }
  }, [job?.status]);

  async function handleInvoke() {
    setInvoking(true);
    try {
      // Fire the function (don't await completion — it's long-running)
      base44.functions.invoke('revalidatePendingTrendLinks', {}).catch(() => {});
      // Poll until the job record appears (up to ~10s)
      let found = null;
      for (let i = 0; i < 5; i++) {
        await new Promise(r => setTimeout(r, 2000));
        found = await fetchActiveJob().catch(() => null);
        if (found && (found.status === 'running' || found.status === 'paused_timeout')) break;
      }
      if (found) {
        setJob(found);
        startPolling();
      } else {
        toast.error('Job did not start — check logs');
      }
    } catch (e) {
      toast.error(e.message || 'Failed to start sweep');
    }
    setInvoking(false);
  }

  if (loading) return null;

  const isActive   = job?.status === 'running' || job?.status === 'paused_timeout';
  const isComplete = job?.status === 'completed';
  const pct        = job?.total_items > 0 ? Math.round((job.processed_items / job.total_items) * 100) : 0;
  const lastUpdate = job?.last_progress_at
    ? formatDistanceToNow(new Date(job.last_progress_at), { addSuffix: true })
    : null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6 }}>

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