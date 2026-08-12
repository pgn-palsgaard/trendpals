import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { toast } from 'sonner';
import { X, Send, Info } from 'lucide-react';
import { ROLES, roleLabel, ROLE_BADGE_CLASS, ACCESS_MAP } from '@/lib/accessMap';
import { getRegionLabel, CANONICAL_REGIONS } from '@/lib/regions';

const VERDICT_LABELS = { confirmed: 'Confirmed', needs_refinement: 'Needs refinement', rejected: 'Rejected' };

export default function UserDetailDrawer({ row, onClose, onAssign, onRoleChanged }) {
  const { user, assignments } = row;
  const [role, setRole] = useState(user.role || 'user');
  const [region, setRegion] = useState(user.region || '');
  const [saving, setSaving] = useState(false);
  const [savingRegion, setSavingRegion] = useState(false);

  const saveRegion = async () => {
    setSavingRegion(true);
    try {
      await base44.entities.User.update(user.id, { region: region || null });
      toast.success(region ? `Region set to ${getRegionLabel(region)}.` : 'Region cleared.');
      onRoleChanged?.();
    } catch (err) {
      toast.error(err?.message || 'Could not update region.');
    }
    setSavingRegion(false);
  };

  const access = ACCESS_MAP.find(a => a.role === role);
  const responded = assignments.filter(a => a.status === 'responded');
  const pending = assignments.filter(a => a.status !== 'responded');

  const saveRole = async () => {
    setSaving(true);
    try {
      await base44.entities.User.update(user.id, { role });
      toast.success(`Role updated to ${roleLabel(role)} — applies next time they log in.`);
      onRoleChanged?.();
    } catch (err) {
      toast.error(err?.message || 'Could not update role.');
    }
    setSaving(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />
      <div className="relative w-full max-w-md h-full bg-card border-l border-border overflow-y-auto">
        <div className="p-6">
          <div className="flex items-start justify-between mb-5">
            <div className="min-w-0">
              <h2 className="text-lg font-semibold font-heading truncate" style={{ color: '#1D2B47' }}>
                {user.full_name || user.email}
              </h2>
              <p className="text-xs text-muted-foreground truncate">{user.email}</p>
            </div>
            <button onClick={onClose} className="text-muted-foreground hover:opacity-70 shrink-0">
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Role */}
          <div className="mb-6">
            <p className="section-label mb-2">Role & access</p>
            <div className="flex items-center gap-2 mb-3">
              <select
                value={role}
                onChange={e => setRole(e.target.value)}
                className="flex-1 text-sm border border-border rounded-lg px-3 py-2 bg-card"
                style={{ color: '#1D2B47' }}
              >
                {ROLES.map(r => <option key={r} value={r}>{roleLabel(r)}</option>)}
              </select>
              <button
                onClick={saveRole}
                disabled={saving || role === (user.role || 'user')}
                className="text-sm font-semibold text-white px-4 py-2 rounded-lg disabled:opacity-40"
                style={{ background: '#1D428A' }}
              >
                {saving ? 'Saving…' : 'Save'}
              </button>
            </div>
            {access && (
              <div className="rounded-[10px] border border-border p-3">
                <p className="text-xs text-muted-foreground mb-2">{access.ui}</p>
                <ul className="space-y-1">
                  {access.routes.map(r => (
                    <li key={r} className="text-xs" style={{ color: '#3A4A66' }}>· {r}</li>
                  ))}
                </ul>
              </div>
            )}
            <p className="text-xs text-muted-foreground mt-2 flex items-start gap-1.5">
              <Info className="w-3 h-3 mt-0.5 shrink-0" />
              Role changes apply the next time the user logs in.
            </p>
          </div>

          {/* Region */}
          <div className="mb-6">
            <p className="section-label mb-2">Region</p>
            <div className="flex items-center gap-2">
              <select
                value={region}
                onChange={e => setRegion(e.target.value)}
                className="flex-1 text-sm border border-border rounded-lg px-3 py-2 bg-card"
                style={{ color: '#1D2B47' }}
              >
                <option value="">No region</option>
                {CANONICAL_REGIONS.map(r => (
                  <option key={r.key} value={r.key}>{r.label}</option>
                ))}
              </select>
              <button
                onClick={saveRegion}
                disabled={savingRegion || region === (user.region || '')}
                className="text-sm font-semibold text-white px-4 py-2 rounded-lg disabled:opacity-40"
                style={{ background: '#1D428A' }}
              >
                {savingRegion ? 'Saving…' : 'Save'}
              </button>
            </div>
            <p className="text-xs text-muted-foreground mt-2">
              The region this user belongs to — used for reviewer coverage.
            </p>
          </div>

          {/* Assign */}
          <button
            onClick={() => onAssign(row)}
            className="w-full mb-6 py-2.5 rounded-xl text-sm font-semibold text-white flex items-center justify-center gap-2"
            style={{ background: '#1D428A' }}
          >
            <Send className="w-4 h-4" />
            Assign challenges
          </button>

          {/* Review history */}
          <div>
            <p className="section-label mb-2">Review activity</p>
            <div className="flex gap-2 mb-3">
              <span className={ROLE_BADGE_CLASS[user.role] || 'badge-draft'}>{roleLabel(user.role)}</span>
              <span className="badge-draft">{pending.length} awaiting</span>
              <span className="badge-approved">{responded.length} done</span>
            </div>

            {assignments.length === 0 ? (
              <p className="text-xs text-muted-foreground">No review assignments yet.</p>
            ) : (
              <div className="space-y-2">
                {[...pending, ...responded].map(a => (
                  <div key={a.id} className="rounded-[10px] border border-border p-3">
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-sm font-medium" style={{ color: '#1D2B47' }}>{a.challenge_name}</p>
                      <span className="text-xs shrink-0 text-muted-foreground">
                        {a.status === 'responded' ? (VERDICT_LABELS[a.verdict] || 'Responded') : 'Awaiting'}
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {a.reviewer_region ? getRegionLabel(a.reviewer_region) : '—'}
                      {a.responded_at && ` · ${new Date(a.responded_at).toLocaleDateString()}`}
                    </p>
                    {a.comment && (
                      <p className="text-xs italic mt-1.5" style={{ color: '#3A4A66' }}>"{a.comment}"</p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}