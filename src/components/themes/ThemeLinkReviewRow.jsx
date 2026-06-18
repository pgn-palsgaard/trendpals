import React from 'react';
import { CheckCircle, XCircle, Star } from 'lucide-react';

const STATUS_STYLES = {
  proposed: { bg: '#fffbeb', border: '#fde68a', badge: '#fef3c7', badgeText: '#92400e', label: 'Proposed' },
  approved: { bg: '#f0fdf4', border: '#bbf7d0', badge: '#dcfce7', badgeText: '#16a34a', label: 'Approved' },
  rejected: { bg: '#f8fafc', border: '#e2e8f0', badge: '#f1f5f9', badgeText: '#94a3b8', label: 'Rejected' },
};

export default function ThemeLinkReviewRow({ link, trend, onApprove, onReject, onTogglePrimary, decidedBy, onDecidedByChange, themeColor }) {
  const statusStyle = STATUS_STYLES[link.link_status] || STATUS_STYLES.proposed;
  const isPending = link.link_status === 'proposed';

  if (!trend) return null;

  return (
    <div className="px-5 py-3.5 flex items-start gap-4" style={{ backgroundColor: statusStyle.bg }}>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-0.5">
          <span className="font-semibold text-sm" style={{ color: '#1D2B47' }}>{trend.trend_name}</span>
          {link.is_primary && (
            <Star className="w-3.5 h-3.5 shrink-0" style={{ color: themeColor, fill: themeColor }} />
          )}
          <span className="text-xs px-1.5 py-0.5 rounded font-medium" style={{ backgroundColor: statusStyle.badge, color: statusStyle.badgeText }}>
            {statusStyle.label}
          </span>
          {link.relevance_score != null && (
            <span className="text-xs text-slate-400">{link.relevance_score}% fit</span>
          )}
        </div>
        {trend.category && (
          <span className="text-xs text-slate-400 capitalize">{trend.category.replace(/_/g, ' ')}</span>
        )}
        {link.proposed_rationale && (
          <p className="text-xs text-slate-500 mt-1 leading-relaxed">{link.proposed_rationale}</p>
        )}
        {link.decided_by && (
          <p className="text-xs text-slate-400 mt-0.5">Decided by: {link.decided_by}{link.decided_at ? ` · ${link.decided_at.split('T')[0]}` : ''}</p>
        )}
      </div>

      <div className="flex items-center gap-2 shrink-0">
        {/* Mark as primary (hero) */}
        <button
          onClick={() => onTogglePrimary(link)}
          className="p-1.5 rounded-lg transition-colors"
          title={link.is_primary ? 'Remove hero' : 'Mark as hero trend'}
          style={{ color: link.is_primary ? themeColor : '#cbd5e1', backgroundColor: 'transparent' }}
        >
          <Star className="w-4 h-4" style={{ fill: link.is_primary ? themeColor : 'none' }} />
        </button>

        {isPending && (
          <>
            <input
              type="text"
              value={decidedBy}
              onChange={e => onDecidedByChange(e.target.value)}
              placeholder="Your name (optional)"
              className="text-xs border border-slate-200 rounded px-2 py-1 w-32 bg-white focus:outline-none"
            />
            <button
              onClick={() => onReject(link)}
              className="p-1.5 rounded-lg text-slate-400 hover:text-red-500 hover:bg-red-50 transition-colors"
              title="Reject"
            >
              <XCircle className="w-4 h-4" />
            </button>
            <button
              onClick={() => onApprove(link)}
              className="flex items-center gap-1 text-xs font-semibold px-3 py-1.5 rounded-lg text-white transition-colors"
              style={{ backgroundColor: themeColor }}
              title="Approve"
            >
              <CheckCircle className="w-3.5 h-3.5" />
              Approve
            </button>
          </>
        )}
        {!isPending && link.link_status === 'approved' && (
          <button
            onClick={() => onReject(link)}
            className="text-xs text-slate-400 hover:text-red-500 transition-colors px-2 py-1"
          >
            Revoke
          </button>
        )}
        {!isPending && link.link_status === 'rejected' && (
          <button
            onClick={() => onApprove(link)}
            className="text-xs text-slate-400 hover:text-green-600 transition-colors px-2 py-1"
          >
            Re-approve
          </button>
        )}
      </div>
    </div>
  );
}