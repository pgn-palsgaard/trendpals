import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { useAuth } from '@/lib/AuthContext';
import { Send, X, Plus, Users } from 'lucide-react';
import { toast } from 'sonner';

const CATEGORIES = [
  { value: 'bakery', label: 'Bakery' },
  { value: 'condiments', label: 'Condiments' },
  { value: 'chocolate_confectionery', label: 'Chocolate & Confectionery' },
  { value: 'dairy', label: 'Dairy' },
  { value: 'ice_cream', label: 'Ice Cream' },
  { value: 'meat', label: 'Processed Meat' },
  { value: 'oils_fats', label: 'Oils & Fats' },
  { value: 'plant_based', label: 'Plant-based' },
  { value: 'rutf_rusf', label: 'RUTF/RUSF' },
];

export default function DispatchPanel({ selectedChallenges, allChallenges, onClose }) {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const [reviewers, setReviewers] = useState([{ name: '', email: '' }]);
  const [dispatching, setDispatching] = useState(false);

  const { data: existingAssignments = [] } = useQuery({
    queryKey: ['allAssignmentsForDispatch'],
    queryFn: () => base44.entities.ReviewAssignment.list(),
  });

  const addReviewer = () => setReviewers(r => [...r, { name: '', email: '' }]);
  const removeReviewer = (i) => setReviewers(r => r.filter((_, idx) => idx !== i));
  const updateReviewer = (i, field, val) => {
    setReviewers(r => r.map((rev, idx) => idx === i ? { ...rev, [field]: val } : rev));
  };

  const handleDispatch = async () => {
    const validReviewers = reviewers.filter(r => r.email.trim());
    if (validReviewers.length === 0) { toast.error('Add at least one reviewer email.'); return; }
    if (selectedChallenges.length === 0) { toast.error('No challenges selected.'); return; }

    setDispatching(true);
    let created = 0;
    let skipped = 0;

    for (const challenge of selectedChallenges) {
      for (const reviewer of validReviewers) {
        // Check for existing open assignment (same challenge + reviewer, not responded)
        const existing = existingAssignments.find(a =>
          a.challenge_id === challenge.id &&
          a.reviewer_email === reviewer.email.trim().toLowerCase() &&
          a.status !== 'responded'
        );
        if (existing) { skipped++; continue; }

        // IMMUTABLE RULE: assigned_by set by dispatcher (current admin user), NOT by LLM/automation
        // SME-set fields (verdict, comment, suggested_capability_fit, responded_at) are intentionally omitted
        const payload = {
          challenge_id: challenge.id,
          challenge_name: challenge.name,
          global_trend_id: challenge.global_trend_id || undefined,
          category: challenge.category || undefined,
          reviewer_email: reviewer.email.trim().toLowerCase(),
          reviewer_name: reviewer.name.trim() || undefined,
          assigned_by: user?.full_name || user?.email || 'Admin',
          assigned_at: new Date().toISOString(),
          status: 'sent',
        };

        // Remove undefined keys
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
      }
    }

    queryClient.invalidateQueries({ queryKey: ['allAssignments'] });
    queryClient.invalidateQueries({ queryKey: ['allAssignmentsForDispatch'] });

    if (created > 0) toast.success(`${created} assignment${created > 1 ? 's' : ''} dispatched${skipped > 0 ? `, ${skipped} skipped (already open)` : ''}.`);
    else toast.warning(`No new assignments created. ${skipped} already open.`);

    setDispatching(false);
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/40 flex items-end sm:items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="p-6">
          <div className="flex items-center justify-between mb-5">
            <div>
              <h2 className="text-lg font-bold" style={{ color: '#1D2B47' }}>Dispatch for SME Review</h2>
              <p className="text-sm text-slate-500 mt-0.5">
                {selectedChallenges.length} challenge{selectedChallenges.length !== 1 ? 's' : ''} selected
              </p>
            </div>
            <button onClick={onClose} className="text-slate-400 hover:text-slate-700">
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Selected challenges preview */}
          <div className="mb-5 rounded-xl p-3 space-y-1.5" style={{ background: '#F7F4EE' }}>
            {selectedChallenges.map(c => (
              <div key={c.id} className="text-sm font-medium" style={{ color: '#1D2B47' }}>
                • {c.name}
                <span className="ml-2 text-xs text-slate-400 capitalize">{c.category?.replace(/_/g, ' ')}</span>
              </div>
            ))}
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

          <p className="text-xs text-slate-400 mb-5">
            Assignments will be created with <strong>status: sent</strong>. Duplicate open assignments (same challenge + reviewer) will be skipped automatically.
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
              Dispatch
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}