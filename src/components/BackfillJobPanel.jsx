import React, { useState, useEffect, useCallback } from 'react';
import { base44 } from '@/api/base44Client';
import { Loader2, RefreshCw, BookOpen } from 'lucide-react';
import { toast } from 'sonner';
import { formatDistanceToNow } from 'date-fns';

const BLUE  = '#1D428A';
const GREEN = '#6F8263';

export default function BackfillJobPanel() {
  const [job, setJob]         = useState(null);
  const [loading, setLoading] = useState(true);
  const [invoking, setInvoking] = useState(false);

  const fetchJob = useCallback(async () => {
    try {
      const jobs = await base44.entities.ProcessingJob.filter(
        { job_type: 'backfill_expert_examples' }, '-created_date', 1
      );
      setJob(jobs[0] || null);
    } catch (e) { /* ignore */ }
    setLoading(false);
  }, []);

  useEffect(() => { fetchJob(); }, [fetchJob]);

  // Poll while running
  useEffect(() => {
    if (job?.status !== 'running') return;
    const interval = setInterval(async () => {
      const jobs = await base44.entities.ProcessingJob.filter(
        { job_type: 'backfill_expert_examples' }, '-created_date', 1
      ).catch(() => []);
      const latest = jobs[0];
      if (latest) {
        setJob(latest);
        if (latest.status === 'completed') {
          clearInterval(interval);
          toast.success(`Backfill complete — ${latest.summary?.examples_created ?? 0} expert examples created`);
        }
      }
    }, 5000);
    return () => clearInterval(interval);
  }, [job?.id, job?.status]);

  async function handleInvoke() {
    setInvoking(true);
    try {
      await base44.functions.invoke('backfillExpertExamples', {});
      await fetchJob();
    } catch (e) {
      toast.error(e.message || 'Backfill failed to start');
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
    <div style={{ border: '1px solid #d8d3c8', borderRadius: 8, padding: '14px 18px', background: 'white', fontFamily: 'Calibri, Arial, sans-serif' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
        <BookOpen size={15} style={{ color: BLUE }} />
        <span style={{ fontSize: 13, fontWeight: 700, color: '#1D2B47' }}>Backfill Expert Examples</span>
      </div>
      <p style={{ fontSize: 12, color: '#969696', margin: '0 0 12px', lineHeight: 1.5 }}>
        Run <code>extractExpertExamples</code> on all Mintel reports that pre-date the extractor. Resumable — safe to click multiple times.
      </p>

      {isActive && (
        <div style={{ marginBottom: 10 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: '#1D2B47', marginBottom: 4 }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
              {job.status === 'running'
                ? <><Loader2 size={11} className="animate-spin" /> Running…</>
                : 'Paused — awaiting resume'}
            </span>
            <span style={{ color: '#969696' }}>{job.processed_items ?? 0} / {job.total_items ?? '?'} sources</span>
          </div>
          <div style={{ height: 6, background: '#f0ede8', borderRadius: 10, overflow: 'hidden' }}>
            <div style={{ height: '100%', width: `${pct}%`, background: BLUE, borderRadius: 10, transition: 'width 0.4s' }} />
          </div>
          {lastUpdate && (
            <p style={{ fontSize: 11, color: '#969696', margin: '4px 0 0' }}>Last update {lastUpdate}</p>
          )}
        </div>
      )}

      {isComplete && job?.summary && (
        <p style={{ fontSize: 12, color: GREEN, margin: '0 0 10px', fontWeight: 600 }}>
          ✓ Completed — {job.summary.examples_created ?? 0} examples created from {job.summary.sources_processed ?? 0} reports
          {lastUpdate ? `, ${lastUpdate}` : ''}
        </p>
      )}

      <button
        onClick={handleInvoke}
        disabled={invoking || job?.status === 'running'}
        style={{
          fontSize: 12, padding: '6px 14px', borderRadius: 5,
          border: `1px solid ${BLUE}`, background: BLUE, color: 'white',
          cursor: (invoking || job?.status === 'running') ? 'not-allowed' : 'pointer',
          fontFamily: 'inherit', fontWeight: 600,
          display: 'flex', alignItems: 'center', gap: 6,
          opacity: (invoking || job?.status === 'running') ? 0.6 : 1
        }}
      >
        {invoking ? <Loader2 size={11} className="animate-spin" /> : <RefreshCw size={11} />}
        {job?.status === 'paused_timeout' ? 'Continue backfill' : job?.status === 'running' ? 'Running…' : 'Start backfill'}
      </button>
    </div>
  );
}