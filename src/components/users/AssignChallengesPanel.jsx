import React, { useState, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { useAuth } from '@/lib/AuthContext';
import { toast } from 'sonner';
import { X, Send, Search } from 'lucide-react';
import { CANONICAL_REGIONS, isCanonicalRegion } from '@/lib/regions';
import { dispatchAssignments } from '@/lib/dispatchAssignments';

/**
 * Person-first assignment: an SME is already chosen, admin picks region + challenges.
 * Uses the exact same dispatch code path as the challenge-first Review Queue flow.
 */
export default function AssignChallengesPanel({ user, onClose }) {
  const { user: admin } = useAuth();
  const queryClient = useQueryClient();

  const [region, setRegion] = useState('');
  const [selectedIds, setSelectedIds] = useState([]);
  const [search, setSearch] = useState('');
  const [dispatching, setDispatching] = useState(false);

  const { data: challenges = [], isLoading } = useQuery({
    queryKey: ['approvedChallengesForAssign'],
    queryFn: () => base44.entities.IndustryChallenge.filter({ review_status: 'approved' }, '-created_date', 300),
  });

  const { data: existingAssignments = [] } = useQuery({
    queryKey: ['allAssignmentsForDispatch'],
    queryFn: () => base44.entities.ReviewAssignment.list(),
  });

  const { data: trends = [] } = useQuery({
    queryKey: ['globalTrends'],
    queryFn: () => base44.entities.GlobalTrend.list(),
  });
  const trendMap = useMemo(() => Object.fromEntries(trends.map(t => [t.id, t])), [trends]);

  const openForUser = useMemo(() => new Set(
    existingAssignments
      .filter(a => a.reviewer_email === (user.email || '').toLowerCase() && a.status !== 'responded')
      .map(a => a.challenge_id)
  ), [existingAssignments, user.email]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return challenges;
    return challenges.filter(c =>
      (c.name || '').toLowerCase().includes(q) ||
      (c.category || '').toLowerCase().includes(q)
    );
  }, [challenges, search]);

  const toggle = (id) => {
    setSelectedIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  };

  const handleDispatch = async () => {
    if (!region || !isCanonicalRegion(region)) { toast.error('Select a region for this dispatch.'); return; }
    if (selectedIds.length === 0) { toast.error('Select at least one challenge.'); return; }

    setDispatching(true);
    const selected = challenges.filter(c => selectedIds.includes(c.id));

    const { created, skipped, failedEmails, pendingEmails, writeErrors } = await dispatchAssignments({
      challenges: selected,
      reviewers: [{ name: user.full_name || '', email: user.email }],
      region,
      dispatchedBy: admin?.full_name || admin?.email || 'Admin',
      existingAssignments,
      trendMap,
    });

    queryClient.invalidateQueries({ queryKey: ['allAssignments'] });
    queryClient.invalidateQueries({ queryKey: ['allAssignmentsForDispatch'] });
    queryClient.invalidateQueries({ queryKey: ['usersReviewAssignments'] });

    writeErrors.forEach(e => toast.error(`Write confirmation failed for ${e}`));

    if (created > 0) {
      toast.success(`${created} assignment${created > 1 ? 's' : ''} sent to ${user.full_name || user.email}${skipped > 0 ? `, ${skipped} skipped (already open)` : ''}.`);
    } else {
      toast.warning(`No new assignments created. ${skipped} already open.`);
    }
    if (failedEmails.length > 0) {
      toast.error(`Email failed for ${failedEmails.join(', ')} — assignments were still created.`);
      setDispatching(false);
      return;
    }
    if (pendingEmails.length > 0) {
      toast.info(`${pendingEmails.join(', ')} was invited to TrendPals and will see the queue after accepting.`);
    }

    setDispatching(false);
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/40 flex items-end sm:items-center justify-center z-[60] p-4">
      <div className="bg-card rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="p-6">
          <div className="flex items-start justify-between mb-5">
            <div>
              <h2 className="text-lg font-semibold font-heading" style={{ color: '#1D2B47' }}>Assign challenges</h2>
              <p className="text-sm text-muted-foreground mt-0.5">
                To {user.full_name || user.email}
              </p>
            </div>
            <button onClick={onClose} className="text-muted-foreground hover:opacity-70">
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Region */}
          <div className="mb-5">
            <p className="text-sm font-semibold mb-2" style={{ color: '#1D2B47' }}>Review region *</p>
            <select
              value={region}
              onChange={e => setRegion(e.target.value)}
              className="w-full text-sm border border-border rounded-lg px-3 py-2 bg-card focus:outline-none"
              style={{ color: region ? '#1D2B47' : '#9CA3AF' }}
            >
              <option value="">Select region…</option>
              {CANONICAL_REGIONS.map(r => (
                <option key={r.key} value={r.key}>{r.label} — {r.description}</option>
              ))}
            </select>
          </div>

          {/* Challenges */}
          <div className="mb-5">
            <p className="text-sm font-semibold mb-2" style={{ color: '#1D2B47' }}>
              Challenges
              {selectedIds.length > 0 && (
                <span className="ml-2 text-xs font-medium" style={{ color: '#1D428A' }}>{selectedIds.length} selected</span>
              )}
            </p>
            <div className="relative mb-2">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search approved challenges…"
                className="w-full text-sm border border-border rounded-lg pl-9 pr-3 py-2 focus:outline-none bg-card"
              />
            </div>

            <div className="border border-border rounded-lg max-h-60 overflow-y-auto divide-y divide-border">
              {isLoading ? (
                <div className="flex items-center justify-center py-8">
                  <div className="w-5 h-5 border-2 border-muted border-t-[#1D428A] rounded-full animate-spin" />
                </div>
              ) : filtered.length === 0 ? (
                <div className="px-4 py-6 text-center">
                  <p className="text-sm text-muted-foreground">
                    {challenges.length === 0 ? 'No approved challenges available yet.' : 'No challenges match your search.'}
                  </p>
                </div>
              ) : (
                filtered.map(c => {
                  const alreadyOpen = openForUser.has(c.id);
                  return (
                    <label key={c.id} className={`flex items-start gap-3 px-3 py-2.5 ${alreadyOpen ? 'opacity-50' : 'cursor-pointer hover:bg-muted/50'}`}>
                      <input
                        type="checkbox"
                        disabled={alreadyOpen}
                        checked={selectedIds.includes(c.id)}
                        onChange={() => toggle(c.id)}
                        className="w-4 h-4 mt-0.5 rounded border-border"
                        style={{ accentColor: '#1D428A' }}
                      />
                      <div className="min-w-0">
                        <p className="text-sm font-medium" style={{ color: '#1D2B47' }}>{c.name}</p>
                        <p className="text-xs text-muted-foreground capitalize">
                          {(c.category || '').replace(/_/g, ' ')}
                          {alreadyOpen && ' · already assigned'}
                        </p>
                      </div>
                    </label>
                  );
                })
              )}
            </div>
          </div>

          <div className="flex gap-3">
            <button onClick={onClose} className="flex-1 py-2.5 rounded-xl text-sm font-medium border border-border text-muted-foreground hover:bg-muted">
              Cancel
            </button>
            <button
              onClick={handleDispatch}
              disabled={dispatching}
              className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-white flex items-center justify-center gap-2 disabled:opacity-50"
              style={{ background: '#1D428A' }}
            >
              {dispatching
                ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                : <Send className="w-4 h-4" />}
              {dispatching ? 'Dispatching…' : 'Dispatch & email'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}