import React, { useState } from 'react';
import { X, CheckCircle, XCircle, Clock, AlertTriangle, Info } from 'lucide-react';
import { Input } from '@/components/ui/input';

const CAP_FIT_STYLES = {
  strong:  { bg: '#eaf2e8', text: '#3a6b2e', label: 'Strong fit' },
  possible:{ bg: '#fef3c7', text: '#92400e', label: 'Possible fit' },
  none:    { bg: '#f1f5f9', text: '#64748b', label: 'No fit' },
  unknown: { bg: '#f8fafc', text: '#94a3b8', label: 'Fit unknown' },
};

const VALIDATION_STYLES = {
  confirmed:   { bg: '#eaf2e8', text: '#3a6b2e', label: 'Confirmed in field' },
  in_field:    { bg: '#fff7ed', text: '#c2410c', label: 'In field' },
  rejected:    { bg: '#f1f5f9', text: '#64748b', label: 'Rejected' },
  unvalidated: { bg: '#f8fafc', text: '#94a3b8', label: 'Unvalidated' },
};

const VALIDATION_OPTIONS = ['unvalidated', 'in_field', 'confirmed', 'rejected'];

export default function ChallengeDetailPanel({ challenge, onClose, onApprove, onReject, onSaveValidation }) {
  const [editingValidation, setEditingValidation] = useState(false);
  const [valStatus, setValStatus] = useState(challenge.validation_status || 'unvalidated');
  const [validatedBy, setValidatedBy] = useState(challenge.validated_by || '');
  const [validatedDate, setValidatedDate] = useState(challenge.validated_date ? challenge.validated_date.split('T')[0] : '');
  const [saving, setSaving] = useState(false);

  const fitStyle = CAP_FIT_STYLES[challenge.capability_fit] || CAP_FIT_STYLES.unknown;
  const valStyle = VALIDATION_STYLES[challenge.validation_status || 'unvalidated'];

  const handleSaveVal = async () => {
    setSaving(true);
    await onSaveValidation(challenge, {
      validation_status: valStatus,
      validated_by: validatedBy || undefined,
      validated_date: validatedDate ? new Date(validatedDate).toISOString() : undefined,
    });
    setSaving(false);
    setEditingValidation(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex" style={{ backgroundColor: 'rgba(0,0,0,0.3)' }}>
      <div className="ml-auto w-full max-w-lg bg-white h-full overflow-y-auto shadow-2xl flex flex-col">
        {/* Header */}
        <div className="flex items-start justify-between px-6 py-5 border-b border-slate-200 sticky top-0 bg-white z-10">
          <div>
            <h2 className="font-bold text-base" style={{ color: '#1D2B47' }}>{challenge.name}</h2>
            {challenge.category && (
              <span className="text-xs text-slate-400 capitalize mt-0.5 block">{challenge.category.replace(/_/g, ' ')}</span>
            )}
          </div>
          <button onClick={onClose} className="p-1 rounded hover:bg-slate-100 transition-colors ml-4 shrink-0">
            <X className="w-4 h-4 text-slate-500" />
          </button>
        </div>

        <div className="flex-1 px-6 py-5 space-y-6">
          {/* Badges */}
          <div className="flex flex-wrap gap-2">
            <span className="text-xs px-2 py-1 rounded-full font-medium" style={{ backgroundColor: fitStyle.bg, color: fitStyle.text }}>
              Capability fit: {fitStyle.label}
            </span>
            <span className="text-xs px-2 py-1 rounded-full" style={{ backgroundColor: valStyle.bg, color: valStyle.text }}>
              {valStyle.label}
            </span>
            {challenge.capability_area && (
              <span className="text-xs px-2 py-1 rounded-full bg-slate-100 text-slate-500 capitalize">
                {challenge.capability_area.replace(/_/g, ' ')}
              </span>
            )}
            {challenge.defaulted_conservatively && (
              <span className="text-xs px-2 py-1 rounded-full" style={{ backgroundColor: '#fff7ed', color: '#c2410c' }}>
                Conservative default
              </span>
            )}
          </div>

          {/* Description */}
          {challenge.description && (
            <div>
              <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1.5">Challenge Description</h3>
              <p className="text-sm text-slate-700 leading-relaxed">{challenge.description}</p>
            </div>
          )}

          {/* Capability observation */}
          {challenge.capability_observation && (
            <div>
              <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1.5">Capability Observation</h3>
              <p className="text-sm text-slate-700 leading-relaxed">{challenge.capability_observation}</p>
            </div>
          )}

          {/* Capability hypothesis — always flagged as unconfirmed */}
          {challenge.capability_hypothesis && (
            <div className="rounded-lg p-4" style={{ backgroundColor: '#F7F4EE', border: '1px solid #e8e4da' }}>
              <div className="flex items-center gap-2 mb-2">
                <h3 className="text-xs font-semibold uppercase tracking-wider" style={{ color: '#6F8263' }}>Capability Hypothesis</h3>
                <span className="text-xs font-medium px-2 py-0.5 rounded" style={{ backgroundColor: '#fff7ed', color: '#c2410c' }}>
                  UNCONFIRMED — awaiting field validation
                </span>
              </div>
              <p className="text-sm leading-relaxed" style={{ color: '#1D2B47' }}>{challenge.capability_hypothesis}</p>
            </div>
          )}

          {/* Supporting note */}
          {challenge.supporting_note && (
            <div>
              <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1.5">Supporting Note</h3>
              <p className="text-sm text-slate-600 leading-relaxed">{challenge.supporting_note}</p>
            </div>
          )}

          {/* ── SECTION A: Editorial Approval ── */}
          <div className="rounded-xl border-2 border-slate-200 p-4">
            <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3">Editorial Approval</h3>
            <p className="text-xs text-slate-400 mb-3">Controls whether this challenge appears in reports. Set by the editorial team.</p>
            {challenge.review_status === 'pending' ? (
              <div className="flex gap-2">
                <button
                  onClick={() => onReject(challenge)}
                  className="flex-1 py-2 rounded-lg text-sm font-medium border transition-colors"
                  style={{ borderColor: '#e2e8f0', color: '#64748b' }}
                >
                  Reject
                </button>
                <button
                  onClick={() => onApprove(challenge)}
                  className="flex-1 py-2 rounded-lg text-sm font-medium text-white transition-colors"
                  style={{ backgroundColor: '#1D428A' }}
                >
                  Approve
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <span className={`text-sm font-semibold ${challenge.review_status === 'approved' ? '' : 'text-slate-500'}`}
                  style={challenge.review_status === 'approved' ? { color: '#3a6b2e' } : {}}>
                  {challenge.review_status === 'approved' ? '✓ Approved' : '✗ Rejected'}
                </span>
              </div>
            )}
          </div>

          {/* ── SECTION B: Market Validation (HUMAN-ONLY) ── */}
          <div className="rounded-xl border-2 p-4" style={{ borderColor: '#6F8263', backgroundColor: '#f7faf5' }}>
            <div className="flex items-start justify-between mb-3">
              <div>
                <h3 className="text-xs font-bold uppercase tracking-wider" style={{ color: '#6F8263' }}>Market Validation</h3>
                <p className="text-xs text-slate-500 mt-0.5">Set by technical/sales staff. Distinct from editorial approval.</p>
              </div>
              {!editingValidation && (
                <button
                  onClick={() => setEditingValidation(true)}
                  className="text-xs font-medium px-3 py-1 rounded-lg border transition-colors"
                  style={{ borderColor: '#6F8263', color: '#6F8263' }}
                >
                  Edit
                </button>
              )}
            </div>

            {!editingValidation ? (
              <div className="space-y-2 text-sm">
                <div className="flex items-center gap-2">
                  <span className="text-xs text-slate-400 w-28">Status</span>
                  <span className="text-xs font-medium px-2 py-0.5 rounded-full capitalize"
                    style={{ backgroundColor: (VALIDATION_STYLES[challenge.validation_status || 'unvalidated']).bg, color: (VALIDATION_STYLES[challenge.validation_status || 'unvalidated']).text }}>
                    {(VALIDATION_STYLES[challenge.validation_status || 'unvalidated']).label}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-slate-400 w-28">Validated by</span>
                  <span className="text-xs text-slate-600">{challenge.validated_by || '—'}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-slate-400 w-28">Date</span>
                  <span className="text-xs text-slate-600">{challenge.validated_date ? challenge.validated_date.split('T')[0] : '—'}</span>
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                <div>
                  <label className="text-xs text-slate-500 block mb-1">Validation status</label>
                  <select
                    value={valStatus}
                    onChange={e => setValStatus(e.target.value)}
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none"
                  >
                    {VALIDATION_OPTIONS.map(v => (
                      <option key={v} value={v}>{v.replace(/_/g, ' ')}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-xs text-slate-500 block mb-1">Validated by</label>
                  <Input value={validatedBy} onChange={e => setValidatedBy(e.target.value)} placeholder="Name or role" className="text-sm" />
                </div>
                <div>
                  <label className="text-xs text-slate-500 block mb-1">Validation date</label>
                  <Input type="date" value={validatedDate} onChange={e => setValidatedDate(e.target.value)} className="text-sm" />
                </div>
                <div className="flex gap-2 pt-1">
                  <button onClick={() => setEditingValidation(false)} className="flex-1 py-2 text-sm border rounded-lg text-slate-500">
                    Cancel
                  </button>
                  <button
                    onClick={handleSaveVal}
                    disabled={saving}
                    className="flex-1 py-2 text-sm rounded-lg text-white font-medium"
                    style={{ backgroundColor: '#6F8263' }}
                  >
                    {saving ? 'Saving…' : 'Save'}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}