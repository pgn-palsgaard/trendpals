import React, { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { useAuth } from '@/lib/AuthContext';
import { Send, X, Plus, Mail, AlertCircle } from 'lucide-react';
import { toast } from 'sonner';
import { sendReviewNotificationEmail } from '@/lib/sendReviewEmail';
import SMECoverageRow from '@/components/challenges/SMECoverageRow';
import { CANONICAL_REGIONS, isCanonicalRegion } from '@/lib/regions';

export default function DispatchPanel({ selectedChallenges, allChallenges, onClose }) {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const [reviewers, setReviewers] = useState([{ name: '', email: '' }]);
  const [region, setRegion] = useState('');
  const [dispatching, setDispatching] = useState(false);
  const [emailErrors, setEmailErrors] = useState([]); // emails that failed to send

  const { data: existingAssignments = [] } = useQuery({
    queryKey: ['allAssignmentsForDispatch'],
    queryFn: () => base44.entities.ReviewAssignment.list(),
  });

  // Fetch trends so we can include trend_name in email
  const { data: trends = [] } = useQuery({
    queryKey: ['globalTrends'],
    queryFn: () => base44.entities.GlobalTrend.list(),
  });
  const trendMap = Object.fromEntries(trends.map(t => [t.id, t]));

  const addReviewer = () => setReviewers(r => [...r, { name: '', email: '' }]);
  const removeReviewer = (i) => setReviewers(r => r.filter((_, idx) => idx !== i));
  const updateReviewer = (i, field, val) => {
    setReviewers(r => r.map((rev, idx) => idx === i ? { ...rev, [field]: val } : rev));
  };

  const handleDispatch = async () => {
    const validReviewers = reviewers.filter(r => r.email.trim());
    if (validReviewers.length === 0) { toast.error('Add at least one reviewer email.'); return; }
    if (selectedChallenges.length === 0) { toast.error('No challenges selected.'); return; }
    if (!region) { toast.error('Select a region for this dispatch.'); return; }
    if (!isCanonicalRegion(region)) { toast.error('Invalid region selected.'); return; }

    setDispatching(true);
    setEmailErrors([]);

    // Track which challenges were actually newly assigned per reviewer
    // { reviewerEmail -> [challenge, ...] }
    const newlyAssignedPerReviewer = {};
    let created = 0;
    let skipped = 0;

    for (const challenge of selectedChallenges) {
      for (const reviewer of validReviewers) {
        const emailKey = reviewer.email.trim().toLowerCase();

        // Check for existing open assignment (same challenge + reviewer, not responded)
        const existing = existingAssignments.find(a =>
          a.challenge_id === challenge.id &&
          a.reviewer_email === emailKey &&
          a.status !== 'responded'
        );
        if (existing) { skipped++; continue; }

        // IMMUTABLE RULE: assigned_by set by dispatcher (current admin user)
        // SME-set fields (verdict, comment, suggested_capability_fit, responded_at) intentionally omitted
        const payload = {
          challenge_id: challenge.id,
          challenge_name: challenge.name,
          global_trend_id: challenge.global_trend_id || undefined,
          category: challenge.category || undefined,
          reviewer_email: emailKey,
          reviewer_name: reviewer.name.trim() || undefined,
          reviewer_region: region,
          assigned_by: user?.full_name || user?.email || 'Admin',
          assigned_at: new Date().toISOString(),
          status: 'sent',
        };
        Object.keys(payload).forEach(k => payload[k] === undefined && delete payload[k]);

        const created_rec = await base44.entities.ReviewAssignment.create(payload);

        // Read-back confirmation
        const readBack = await base44.entities.ReviewAssignment.filter({ id: created_rec.id });
        const rec = readBack[0];
        if (!rec || rec.status !== 'sent') {
          toast.error(`Write confirmation failed for ${challenge.name} → ${reviewer.email}`);
          continue;
        }

        created++;

        // Track for consolidated email
        if (!newlyAssignedPerReviewer[emailKey]) {
          newlyAssignedPerReviewer[emailKey] = { reviewer, challenges: [] };
        }
        newlyAssignedPerReviewer[emailKey].challenges.push(challenge);
      }
    }

    queryClient.invalidateQueries({ queryKey: ['allAssignments'] });
    queryClient.invalidateQueries({ queryKey: ['allAssignmentsForDispatch'] });

    // --- Ensure each new reviewer is a 'reviewer'-role user (gated to /review) ---
    // inviteUser is idempotent-friendly here: if they already exist it throws, which we ignore.
    for (const emailKey of Object.keys(newlyAssignedPerReviewer)) {
      try {
        await base44.users.inviteUser(emailKey, 'reviewer');
      } catch {
        // Already a user, or invite not permitted — assignment + email still proceed.
      }
    }

    // --- Send ONE consolidated email per reviewer ---
    const dispatchedBy = user?.full_name || user?.email || 'Palsgaard';
    const failedEmails = [];   // genuine, unexpected failures
    const pendingEmails = [];  // reviewer not yet joined — platform invite covers their access

    for (const [emailKey, { reviewer, challenges }] of Object.entries(newlyAssignedPerReviewer)) {
      const enrichedChallenges = challenges.map(c => ({
        name: c.name,
        category: c.category,
        trend_name: c.global_trend_id ? trendMap[c.global_trend_id]?.trend_name : undefined,
      }));

      try {
        await sendReviewNotificationEmail({
          reviewerEmail: emailKey,
          reviewerName: reviewer.name.trim() || undefined,
          dispatchedBy,
          challenges: enrichedChallenges,
          appUrl: window.location.origin,
        });
      } catch (err) {
        // "Cannot send emails to users outside the app" = reviewer has only a pending
        // invite and hasn't joined yet. This is expected — the platform invitation email
        // already gave them access. Treat as informational, not a failure.
        const msg = (err?.response?.data?.error || err?.message || '').toLowerCase();
        if (msg.includes('outside the app')) {
          pendingEmails.push(emailKey);
        } else {
          failedEmails.push(emailKey);
          console.error(`Failed to send email to ${emailKey}:`, err);
        }
      }
    }

    // Surface results
    if (created > 0) {
      toast.success(`${created} assignment${created > 1 ? 's' : ''} dispatched${skipped > 0 ? `, ${skipped} skipped (already open)` : ''}.`);
    } else {
      toast.warning(`No new assignments created. ${skipped} already open.`);
    }

    // Genuine failures keep the panel open with a red banner.
    if (failedEmails.length > 0) {
      setEmailErrors(failedEmails);
      toast.error(`Email failed for: ${failedEmails.join(', ')}. Assignments were still created — resend from Validation Tracking.`);
      setDispatching(false);
      return;
    }

    // Pending invitees: just inform — they got the platform invite and will see their queue once they join.
    if (pendingEmails.length > 0) {
      toast.info(`${pendingEmails.join(', ')} ${pendingEmails.length > 1 ? 'were' : 'was'} invited to TrendPals. They'll see their review queue as soon as they accept the invitation.`);
    }

    setDispatching(false);
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/40 flex items-end sm:items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="p-6">
          <div className="flex items-center justify-between mb-5">
            <div>
              <h2 className="text-lg font-bold" style={{ color: '#1D2B47' }}>Dispatch for SME review</h2>
              <p className="text-sm text-slate-500 mt-0.5">
                {selectedChallenges.length} challenge{selectedChallenges.length !== 1 ? 's' : ''} selected · a consolidated email will be sent to each reviewer
              </p>
            </div>
            <button onClick={onClose} className="text-slate-400 hover:text-slate-700">
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Email error banner */}
          {emailErrors.length > 0 && (
            <div className="mb-4 rounded-lg p-3 flex items-start gap-2" style={{ background: '#FAE9E5', border: '1px solid #C1533840' }}>
              <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" style={{ color: '#A33B24' }} />
              <div>
                <p className="text-sm font-semibold" style={{ color: '#A33B24' }}>Email delivery failed</p>
                <p className="text-xs mt-0.5" style={{ color: '#7a3320' }}>
                  Assignments were created successfully but email could not be sent to: {emailErrors.join(', ')}. You can resend from Validation Tracking.
                </p>
              </div>
            </div>
          )}

          {/* Selected challenges preview */}
          <div className="mb-5 rounded-xl p-3 space-y-1.5" style={{ background: '#F7F4EE' }}>
            {selectedChallenges.map(c => (
              <div key={c.id} className="text-sm font-medium" style={{ color: '#1D2B47' }}>
                • {c.name}
                <span className="ml-2 text-xs text-slate-400 capitalize">{c.category?.replace(/_/g, ' ')}</span>
              </div>
            ))}
          </div>

          {/* SME coverage for the trends being dispatched */}
          <SMECoverageRow
            assignments={existingAssignments}
            trendIds={[...new Set(selectedChallenges.map(c => c.global_trend_id).filter(Boolean))]}
          />

          {/* Region */}
          <div className="mb-5">
            <p className="text-sm font-semibold mb-2" style={{ color: '#1D2B47' }}>Review region *</p>
            <select
              value={region}
              onChange={e => setRegion(e.target.value)}
              className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 bg-white focus:outline-none"
              style={{ color: region ? '#1D2B47' : '#9CA3AF' }}
            >
              <option value="">Select region…</option>
              {CANONICAL_REGIONS.map(r => (
                <option key={r.key} value={r.key}>{r.label} — {r.description}</option>
              ))}
            </select>
            <p className="text-xs text-slate-400 mt-1.5">The reviewer validates these trends from this region's perspective.</p>
          </div>

          {/* Reviewers */}
          <div className="mb-5">
            <div className="flex items-center justify-between mb-3">
              <p className="text-sm font-semibold" style={{ color: '#1D2B47' }}>Assign to reviewers</p>
              <button
                onClick={addReviewer}
                className="flex items-center gap-1 text-xs font-medium px-2.5 py-1.5 rounded-lg border"
                style={{ color: '#1D428A', borderColor: '#1D428A30', background: '#EEF2FF' }}
              >
                <Plus className="w-3 h-3" /> Add reviewer
              </button>
            </div>
            <div className="space-y-3">
              {reviewers.map((rev, i) => (
                <div key={i} className="flex items-center gap-2">
                  <input
                    value={rev.name}
                    onChange={e => updateReviewer(i, 'name', e.target.value)}
                    placeholder="Name (optional)"
                    className="flex-1 text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none"
                  />
                  <input
                    value={rev.email}
                    onChange={e => updateReviewer(i, 'email', e.target.value)}
                    placeholder="Email *"
                    type="email"
                    className="flex-1 text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none"
                  />
                  {reviewers.length > 1 && (
                    <button onClick={() => removeReviewer(i)} className="text-slate-300 hover:text-red-400">
                      <X className="w-4 h-4" />
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>

          <p className="text-xs text-slate-400 mb-5 flex items-center gap-1.5">
            <Mail className="w-3 h-3" />
            New reviewers get a TrendPals invitation with review-only access · the challenge summary email reaches them once they accept · duplicate open assignments are skipped
          </p>

          <div className="flex gap-3">
            <button
              onClick={onClose}
              className="flex-1 py-2.5 rounded-xl text-sm font-medium border border-slate-200 text-slate-600 hover:bg-slate-50"
            >
              Cancel
            </button>
            <button
              onClick={handleDispatch}
              disabled={dispatching}
              className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-white flex items-center justify-center gap-2 disabled:opacity-50"
              style={{ background: '#1D428A' }}
            >
              {dispatching ? (
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
              ) : (
                <Send className="w-4 h-4" />
              )}
              {dispatching ? 'Dispatching…' : 'Dispatch & email'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}