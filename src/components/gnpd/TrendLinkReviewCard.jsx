import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { toast } from 'sonner';
import { ChevronDown, ChevronUp, Loader2 } from 'lucide-react';

const BLUE    = "#1D428A";
const ORANGE  = "#C15338";
const GREEN   = "#6F8263";
const GREY    = "#969696";
const DARK_BLUE = "#1D2B47";

const CONFIDENCE_COLORS = {
  high:   { bg: "#EDF4EA", color: GREEN, border: "#9DC98D" },
  medium: { bg: "#FEF6EC", color: ORANGE, border: "#F5C4A0" },
  low:    { bg: "#f5f5f5", color: GREY, border: "#e0e0e0" },
};

const STATUS_CFG = {
  auto_applied: { label: "Auto-applied",   bg: GREEN,    color: "white" },
  pending:      { label: "Pending review", bg: ORANGE,   color: "white" },
  approved:     { label: "Approved",       bg: GREEN,    color: "white" },
  rejected:     { label: "Rejected",       bg: GREY,     color: "white" },
};

export default function TrendLinkReviewCard({ link, linkIndex, product, onProductUpdated }) {
  const [saving, setSaving] = useState(false);
  const [expanded, setExpanded] = useState(false);

  const conf = CONFIDENCE_COLORS[link.confidence] || CONFIDENCE_COLORS.low;
  const statusCfg = STATUS_CFG[link.review_status] || STATUS_CFG.pending;

  async function updateLink(newStatus) {
    setSaving(true);
    try {
      const me = await base44.auth.me();
      const updatedLinks = (product.trend_links || []).map((l, i) =>
        i === linkIndex
          ? { ...l, review_status: newStatus, reviewed_at: new Date().toISOString(), reviewed_by: me?.email || '' }
          : l
      );
      const updated = await base44.entities.GNPDProduct.update(product.id, { trend_links: updatedLinks });
      toast.success(newStatus === 'approved' ? 'Link approved' : 'Link rejected');
      onProductUpdated(updated);
    } catch (e) {
      toast.error(e.message || 'Update failed');
    }
    setSaving(false);
  }

  return (
    <div style={{
      padding: "12px 14px", marginBottom: 10, borderRadius: 7,
      background: conf.bg, border: `1px solid ${conf.border}`
    }}>
      {/* Top row */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8, marginBottom: 6 }}>
        <span style={{ fontSize: 13, fontWeight: 700, color: DARK_BLUE, lineHeight: 1.3 }}>{link.trend_name}</span>
        <div style={{ display: "flex", gap: 5, alignItems: "center", flexShrink: 0 }}>
          <span style={{
            fontSize: 10, padding: "2px 8px", borderRadius: 20, fontWeight: 700,
            background: statusCfg.bg, color: statusCfg.color
          }}>
            {statusCfg.label}
          </span>
          <span style={{
            fontSize: 10, padding: "2px 8px", borderRadius: 20, fontWeight: 700, textTransform: "capitalize",
            background: conf.bg, color: conf.color, border: `1px solid ${conf.border}`
          }}>
            {link.confidence}
          </span>
        </div>
      </div>

      {/* Score + keywords */}
      <div style={{ fontSize: 12, color: GREY, marginBottom: 6 }}>
        Score: <strong style={{ color: DARK_BLUE }}>{link.confidence_score}</strong>
        {link.linked_at && (
          <span style={{ marginLeft: 10 }}>· {link.linked_at.slice(0, 10)}</span>
        )}
      </div>

      {/* Matched keywords */}
      {(link.matched_keywords || []).length > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginBottom: 6 }}>
          {link.matched_keywords.map((kw, i) => (
            <span key={i} style={{ fontSize: 11, padding: "2px 7px", borderRadius: 20, background: "white", border: `1px solid ${conf.border}`, color: conf.color, fontWeight: 600 }}>
              {kw}
            </span>
          ))}
        </div>
      )}

      {/* Reasoning (expandable) */}
      {link.reasoning && (
        <div style={{ marginBottom: 8 }}>
          <button
            onClick={() => setExpanded(e => !e)}
            style={{ background: "none", border: "none", cursor: "pointer", padding: 0, fontSize: 11, color: GREY, display: "flex", alignItems: "center", gap: 3, fontFamily: "inherit" }}
          >
            {expanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
            {expanded ? "Hide reasoning" : "Show reasoning"}
          </button>
          {expanded && (
            <p style={{ fontSize: 12, color: DARK_BLUE, margin: "5px 0 0", lineHeight: 1.5, background: "rgba(255,255,255,0.6)", borderRadius: 5, padding: "7px 10px" }}>
              {link.reasoning}
            </p>
          )}
        </div>
      )}

      {/* Action buttons */}
      <div style={{ display: "flex", gap: 6 }}>
        {saving ? (
          <Loader2 size={14} className="animate-spin" style={{ color: GREY }} />
        ) : (
          <>
            {(link.review_status === 'pending' || link.review_status === 'rejected') && (
              <button
                onClick={() => updateLink('approved')}
                style={{ fontSize: 12, padding: "4px 12px", borderRadius: 5, border: "none", background: GREEN, color: "white", cursor: "pointer", fontFamily: "inherit", fontWeight: 600 }}
              >
                Approve
              </button>
            )}
            {(link.review_status === 'pending' || link.review_status === 'auto_applied' || link.review_status === 'approved') && (
              <button
                onClick={() => updateLink('rejected')}
                style={{ fontSize: 12, padding: "4px 12px", borderRadius: 5, border: "none", background: ORANGE, color: "white", cursor: "pointer", fontFamily: "inherit", fontWeight: 600 }}
              >
                Reject
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
}