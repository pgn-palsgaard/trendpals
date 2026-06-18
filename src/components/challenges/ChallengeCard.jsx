import React from 'react';
import { CheckCircle, XCircle, Clock, AlertTriangle } from 'lucide-react';

const CAP_FIT_STYLES = {
  strong:  { bg: '#eaf2e8', text: '#3a6b2e', label: 'Strong fit' },
  possible:{ bg: '#fef3c7', text: '#92400e', label: 'Possible fit' },
  none:    { bg: '#f1f5f9', text: '#64748b', label: 'No fit' },
  unknown: { bg: '#f8fafc', text: '#94a3b8', label: 'Fit unknown' },
};

const VALIDATION_STYLES = {
  confirmed:   { bg: '#eaf2e8', text: '#3a6b2e', icon: CheckCircle, label: 'Confirmed' },
  in_field:    { bg: '#fff7ed', text: '#c2410c', icon: AlertTriangle, label: 'In field' },
  rejected:    { bg: '#f1f5f9', text: '#64748b', icon: XCircle, label: 'Rejected' },
  unvalidated: { bg: '#f8fafc', text: '#94a3b8', icon: Clock, label: 'Unvalidated' },
};

const REVIEW_STYLES = {
  approved: { color: '#3a6b2e', label: 'Approved' },
  rejected: { color: '#64748b', label: 'Rejected' },
  pending:  { color: '#92400e', label: 'Pending review' },
};

export default function ChallengeCard({ challenge, onApprove, onReject, onViewDetails }) {
  const fitStyle = CAP_FIT_STYLES[challenge.capability_fit] || CAP_FIT_STYLES.unknown;
  const valStyle = VALIDATION_STYLES[challenge.validation_status || 'unvalidated'];
  const reviewStyle = REVIEW_STYLES[challenge.review_status] || REVIEW_STYLES.pending;
  const ValIcon = valStyle.icon;

  return (
    <div
      className="px-5 py-4 hover:bg-slate-50 transition-colors cursor-pointer"
      onClick={() => onViewDetails(challenge)}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className="font-semibold text-sm" style={{ color: '#1D2B47' }}>{challenge.name}</span>
            {challenge.defaulted_conservatively && (
              <span className="text-xs px-1.5 py-0.5 rounded" style={{ backgroundColor: '#fff7ed', color: '#c2410c' }}>Conservative</span>
            )}
          </div>
          {challenge.description && (
            <p className="text-xs text-slate-500 line-clamp-2">{challenge.description}</p>
          )}
          <div className="flex items-center gap-2 mt-2">
            <span className="text-xs px-2 py-0.5 rounded-full font-medium" style={{ backgroundColor: fitStyle.bg, color: fitStyle.text }}>
              {fitStyle.label}
            </span>
            <span className="text-xs flex items-center gap-1 px-2 py-0.5 rounded-full" style={{ backgroundColor: valStyle.bg, color: valStyle.text }}>
              <ValIcon className="w-3 h-3" />
              {valStyle.label}
            </span>
            {challenge.capability_area && (
              <span className="text-xs text-slate-400 capitalize">{challenge.capability_area.replace(/_/g, ' ')}</span>
            )}
          </div>
        </div>

        {/* Editorial approval controls */}
        {challenge.review_status === 'pending' && (
          <div className="flex items-center gap-2 shrink-0" onClick={e => e.stopPropagation()}>
            <button
              onClick={() => onReject(challenge)}
              className="text-xs px-3 py-1.5 rounded-lg border transition-colors"
              style={{ borderColor: '#e2e8f0', color: '#64748b' }}
            >
              Reject
            </button>
            <button
              onClick={() => onApprove(challenge)}
              className="text-xs px-3 py-1.5 rounded-lg text-white transition-colors"
              style={{ backgroundColor: '#1D428A' }}
            >
              Approve
            </button>
          </div>
        )}
        {challenge.review_status !== 'pending' && (
          <span className="text-xs font-medium shrink-0" style={{ color: reviewStyle.color }}>
            {reviewStyle.label}
          </span>
        )}
      </div>
    </div>
  );
}