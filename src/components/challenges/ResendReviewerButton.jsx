import React, { useState } from 'react';
import { RotateCcw } from 'lucide-react';
import { toast } from 'sonner';
import { sendReviewNotificationEmail } from '@/lib/sendReviewEmail';
import { useAuth } from '@/lib/AuthContext';

/**
 * A small inline "Send reminder" button for a specific reviewer.
 * Re-sends ONE consolidated email covering all their outstanding (non-responded) assignments.
 * Never creates or modifies ReviewAssignment records — email only.
 *
 * @param {string}  reviewerEmail     - Recipient email
 * @param {string}  [reviewerName]    - Recipient display name
 * @param {Array}   outstandingAssignments - Array of ReviewAssignment records for this reviewer
 * @param {object}  trendMap          - { [trendId]: GlobalTrend } for name lookup
 */
export default function ResendReviewerButton({ reviewerEmail, reviewerName, outstandingAssignments, trendMap = {} }) {
  const { user } = useAuth();
  const [sending, setSending] = useState(false);

  const hasOutstanding = outstandingAssignments.length > 0;

  const handleResend = async () => {
    if (!hasOutstanding) return;
    setSending(true);

    const challenges = outstandingAssignments.map(a => ({
      name: a.challenge_name || 'Challenge',
      category: a.category,
      trend_name: a.global_trend_id ? trendMap[a.global_trend_id]?.trend_name : undefined,
    }));

    const dispatchedBy = user?.full_name || user?.email || 'Palsgaard';

    try {
      await sendReviewNotificationEmail({
        reviewerEmail,
        reviewerName,
        dispatchedBy,
        challenges,
        appUrl: window.location.origin,
      });
      toast.success(`Reminder sent to ${reviewerName || reviewerEmail}`);
    } catch (err) {
      toast.error(`Failed to send reminder to ${reviewerEmail}: ${err.message}`);
    } finally {
      setSending(false);
    }
  };

  if (!hasOutstanding) {
    return (
      <span className="text-xs text-slate-300 flex items-center gap-1 cursor-not-allowed" title="No outstanding assignments">
        <RotateCcw className="w-3 h-3" /> Resend
      </span>
    );
  }

  return (
    <button
      onClick={handleResend}
      disabled={sending}
      className="flex items-center gap-1 text-xs font-medium px-2 py-1 rounded-md transition-colors disabled:opacity-50 cursor-pointer"
      style={{ color: '#1D428A', background: '#EBF0F8' }}
      onMouseEnter={e => { if (!sending) e.currentTarget.style.background = '#D6E3F4'; }}
      onMouseLeave={e => { e.currentTarget.style.background = '#EBF0F8'; }}
      title={`Resend reminder to ${reviewerEmail} (${outstandingAssignments.length} outstanding)`}
    >
      {sending ? (
        <div className="w-3 h-3 border-2 border-[#1D428A] border-t-transparent rounded-full animate-spin" />
      ) : (
        <RotateCcw className="w-3 h-3" />
      )}
      {sending ? 'Sending…' : 'Resend'}
    </button>
  );
}