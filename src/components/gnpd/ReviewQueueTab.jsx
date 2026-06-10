import React, { useState, useEffect, useMemo } from 'react';
import { base44 } from '@/api/base44Client';
import { toast } from 'sonner';
import { Loader2, RefreshCw } from 'lucide-react';

const BLUE      = "#1D428A";
const ORANGE    = "#C15338";
const GREEN     = "#6F8263";
const GREY      = "#969696";
const DARK_BLUE = "#1D2B47";
const GOLD      = "#F7F4EE";

export default function ReviewQueueTab() {
  const [links, setLinks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [total, setTotal] = useState(0);
  const [filters, setFilters] = useState({ trend: '', category: '', confidence: '', country: '' });
  const [selected, setSelected] = useState(new Set()); // Set of "productId:linkIndex"
  const [saving, setSaving] = useState(false);
  const [bulkAction, setBulkAction] = useState('');

  useEffect(() => { fetchLinks(); }, []);

  async function fetchLinks() {
    setLoading(true);
    setSelected(new Set());
    try {
      const res = await base44.functions.invoke('getPendingTrendLinks', { skip: 0 });
      setLinks(res.data?.links || []);
      setTotal(res.data?.total || 0);
    } catch (e) {
      toast.error(e.message || 'Failed to load queue');
    }
    setLoading(false);
  }

  // Derive filter options
  const allTrends     = useMemo(() => [...new Set(links.map(l => l.trend_name).filter(Boolean))].sort(), [links]);
  const allCategories = useMemo(() => [...new Set(links.map(l => l.category).filter(Boolean))].sort(), [links]);
  const allCountries  = useMemo(() => [...new Set(links.map(l => l.country).filter(Boolean))].sort(), [links]);

  const filtered = useMemo(() => {
    return links.filter(l => {
      if (filters.trend      && l.trend_name !== filters.trend)      return false;
      if (filters.category   && l.category   !== filters.category)   return false;
      if (filters.confidence && l.confidence !== filters.confidence) return false;
      if (filters.country    && l.country    !== filters.country)    return false;
      return true;
    });
  }, [links, filters]);

  // Reset selection when filter changes
  useEffect(() => { setSelected(new Set()); }, [filters]);

  function rowKey(l) { return `${l.entity_type || 'gnpd_product'}:${l.product_id}:${l.link_index}`; }

  function toggleRow(l) {
    const k = rowKey(l);
    setSelected(prev => {
      const next = new Set(prev);
      next.has(k) ? next.delete(k) : next.add(k);
      return next;
    });
  }

  function toggleAll() {
    if (selected.size === filtered.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(filtered.map(rowKey)));
    }
  }

  async function applyBulk() {
    if (!bulkAction || selected.size === 0) return;
    const newStatus = bulkAction;
    setSaving(true);

    // Group selected rows by entity+record to minimise update calls
    const byProduct = {};
    for (const k of selected) {
      const [entityType, productId, linkIndexStr] = k.split(':');
      const gk = `${entityType}:${productId}`;
      if (!byProduct[gk]) byProduct[gk] = [];
      byProduct[gk].push(parseInt(linkIndexStr));
    }

    // For each product, fetch full product, mutate all selected link indices, then update once
    const me = await base44.auth.me();
    const now = new Date().toISOString();
    let approved = 0, rejected = 0, failed = 0;

    for (const [gk, idxList] of Object.entries(byProduct)) {
      const [entityType, productId] = gk.split(':');
      const Entity = entityType === 'expert_example' ? base44.entities.ExpertExample : base44.entities.GNPDProduct;
      try {
        const product = await Entity.filter({ id: productId }, null, 1);
        const p = product[0];
        if (!p) { failed++; continue; }
        const updatedLinks = (p.trend_links || []).map((link, i) => {
          if (idxList.includes(i) && link.review_status === 'pending') {
            if (newStatus === 'approved') approved++;
            else rejected++;
            return { ...link, review_status: newStatus, reviewed_at: now, reviewed_by: me?.email || '' };
          }
          return link;
        });
        // Propagate: keep linked_trend_ids + processing_status in sync with link decisions
        const appliedIds = [...new Set(updatedLinks
          .filter(x => x.review_status === 'auto_applied' || x.review_status === 'approved')
          .map(x => x.trend_id))];
        const update = { trend_links: updatedLinks, linked_trend_ids: appliedIds };
        if (entityType !== 'expert_example') {
          update.processing_status = updatedLinks.some(x => x.review_status === 'pending') ? 'trend_linking_pending' : 'trend_linked';
        }
        await Entity.update(productId, update);
      } catch (e) {
        failed++;
      }
    }

    const parts = [];
    if (approved) parts.push(`${approved} approved`);
    if (rejected) parts.push(`${rejected} rejected`);
    if (failed)   parts.push(`${failed} failed`);
    toast.success(parts.join(', '));

    setSaving(false);
    setBulkAction('');
    fetchLinks();
  }

  return (
    <div style={{ fontFamily: "Calibri, Arial, sans-serif", color: DARK_BLUE, padding: "24px 28px" }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
        <div>
          <h2 style={{ fontSize: 16, fontWeight: 700, margin: 0, color: BLUE }}>Trend link review queue</h2>
          <p style={{ fontSize: 13, color: GREY, margin: "3px 0 0" }}>
            {loading ? 'Loading…' : `${total} pending links across the database`}
          </p>
        </div>
        <button onClick={fetchLinks} disabled={loading}
          style={{ background: "none", border: `1px solid #d8d3c8`, borderRadius: 6, padding: "6px 12px", cursor: "pointer", display: "flex", alignItems: "center", gap: 5, fontSize: 13, color: GREY, fontFamily: "inherit" }}>
          <RefreshCw size={13} className={loading ? "animate-spin" : ""} /> Refresh
        </button>
      </div>

      {/* Filters */}
      <div style={{ display: "flex", gap: 8, marginBottom: 14, flexWrap: "wrap", alignItems: "center" }}>
        {[
          ["Trend", allTrends, "trend"],
          ["Category", allCategories, "category"],
          ["Country", allCountries, "country"],
        ].map(([label, opts, key]) => (
          <select key={key} value={filters[key]} onChange={e => setFilters(f => ({ ...f, [key]: e.target.value }))}
            style={{ fontSize: 12, padding: "6px 10px", borderRadius: 5, border: "1px solid #d8d3c8", fontFamily: "inherit", background: "white", color: DARK_BLUE, maxWidth: 200 }}>
            <option value="">All {label.toLowerCase()}s</option>
            {opts.map(o => <option key={o}>{o}</option>)}
          </select>
        ))}
        <select value={filters.confidence} onChange={e => setFilters(f => ({ ...f, confidence: e.target.value }))}
          style={{ fontSize: 12, padding: "6px 10px", borderRadius: 5, border: "1px solid #d8d3c8", fontFamily: "inherit", background: "white", color: DARK_BLUE }}>
          <option value="">All confidence</option>
          <option value="high">High</option>
          <option value="medium">Medium</option>
          <option value="low">Low</option>
        </select>

        {/* Bulk action */}
        {selected.size > 0 && (
          <div style={{ marginLeft: "auto", display: "flex", gap: 6, alignItems: "center" }}>
            <span style={{ fontSize: 12, color: GREY }}>{selected.size} selected</span>
            <select value={bulkAction} onChange={e => setBulkAction(e.target.value)}
              style={{ fontSize: 12, padding: "6px 10px", borderRadius: 5, border: `1px solid ${BLUE}`, fontFamily: "inherit", background: "white", color: BLUE }}>
              <option value="">Bulk action…</option>
              <option value="approved">Approve selected</option>
              <option value="rejected">Reject selected</option>
            </select>
            <button onClick={applyBulk} disabled={!bulkAction || saving}
              style={{ fontSize: 12, padding: "6px 14px", borderRadius: 5, border: "none", background: BLUE, color: "white", cursor: "pointer", fontFamily: "inherit", fontWeight: 600, opacity: (!bulkAction || saving) ? 0.6 : 1 }}>
              {saving ? <Loader2 size={12} className="animate-spin" /> : 'Apply'}
            </button>
          </div>
        )}
      </div>

      {/* Table */}
      {loading ? (
        <div style={{ textAlign: "center", padding: "3rem" }}>
          <Loader2 size={24} className="animate-spin" style={{ color: GREY, margin: "0 auto" }} />
          <p style={{ color: GREY, marginTop: 10, fontSize: 13 }}>Scanning all GNPD products for pending links…</p>
        </div>
      ) : filtered.length === 0 ? (
        <div style={{ textAlign: "center", padding: "3rem", color: GREY, fontSize: 14 }}>
          {links.length === 0 ? '🎉 No pending trend links — queue is clear.' : 'No links match the current filters.'}
        </div>
      ) : (
        <div style={{ background: "white", border: "1px solid #d8d3c8", borderRadius: 8, overflow: "hidden" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
            <thead>
              <tr style={{ background: GOLD, borderBottom: "1px solid #d8d3c8" }}>
                <th style={{ padding: "10px 12px", width: 32 }}>
                  <input type="checkbox"
                    checked={selected.size === filtered.length && filtered.length > 0}
                    onChange={toggleAll}
                    style={{ cursor: "pointer" }}
                  />
                </th>
                {["Product", "Brand", "Country", "Category", "Trend", "Confidence", "Score", "LLM reasoning", "Actions"].map(h => (
                  <th key={h} style={{ textAlign: "left", padding: "10px 10px", fontWeight: 600, color: DARK_BLUE, fontSize: 11, whiteSpace: "nowrap" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((l, i) => {
                const k = rowKey(l);
                const isSelected = selected.has(k);
                const confColor = l.confidence === 'high' ? GREEN : l.confidence === 'medium' ? ORANGE : GREY;
                return (
                  <tr key={k} style={{
                    borderBottom: "1px solid #ebe7e0",
                    background: isSelected ? "#E8EEF6" : i % 2 === 0 ? "white" : GOLD,
                  }}>
                    <td style={{ padding: "8px 12px" }}>
                      <input type="checkbox" checked={isSelected} onChange={() => toggleRow(l)} style={{ cursor: "pointer" }} />
                    </td>
                    <td style={{ padding: "8px 10px", maxWidth: 180, fontWeight: 600, color: DARK_BLUE }}>
                      {l.product_name}
                      {l.entity_type === 'expert_example' && (
                        <span style={{ marginLeft: 6, fontSize: 9, padding: "1px 6px", borderRadius: 20, background: "#FDF3E7", color: ORANGE, border: `1px solid ${ORANGE}`, fontWeight: 700 }}>EXPERT</span>
                      )}
                    </td>
                    <td style={{ padding: "8px 10px", color: GREY }}>{l.brand || '—'}</td>
                    <td style={{ padding: "8px 10px", color: GREY }}>{l.country || '—'}</td>
                    <td style={{ padding: "8px 10px", color: GREY }}>{l.category || '—'}</td>
                    <td style={{ padding: "8px 10px", maxWidth: 160, color: DARK_BLUE, fontWeight: 600 }}>{l.trend_name}</td>
                    <td style={{ padding: "8px 10px" }}>
                      <span style={{ fontSize: 10, padding: "2px 7px", borderRadius: 20, fontWeight: 700, textTransform: "capitalize", color: confColor, border: `1px solid ${confColor}` }}>
                        {l.confidence}
                      </span>
                    </td>
                    <td style={{ padding: "8px 10px", color: DARK_BLUE, fontWeight: 600 }}>{l.confidence_score}</td>
                    <td style={{ padding: "8px 10px", maxWidth: 280 }}>
                      <div style={{ fontSize: 11, color: DARK_BLUE, lineHeight: 1.4 }}>{l.reasoning || '—'}</div>
                      {l.matched_keywords?.length > 0 && (
                        <div style={{ fontSize: 9, color: GREY, marginTop: 2 }}>
                          kw: {l.matched_keywords.slice(0, 4).join(', ')}{l.matched_keywords.length > 4 ? ` +${l.matched_keywords.length - 4}` : ''}
                        </div>
                      )}
                    </td>
                    <td style={{ padding: "8px 10px", whiteSpace: "nowrap" }}>
                      <ApproveRejectButtons link={l} onDone={fetchLinks} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <div style={{ padding: "10px 14px", borderTop: "1px solid #d8d3c8", background: GOLD, fontSize: 12, color: GREY }}>
            Showing {filtered.length} of {total} pending links
          </div>
        </div>
      )}
    </div>
  );
}

function ApproveRejectButtons({ link, onDone }) {
  const [saving, setSaving] = useState(false);

  async function act(newStatus) {
    setSaving(true);
    try {
      const me = await base44.auth.me();
      const now = new Date().toISOString();
      const Entity = link.entity_type === 'expert_example' ? base44.entities.ExpertExample : base44.entities.GNPDProduct;
      const products = await Entity.filter({ id: link.product_id }, null, 1);
      const p = products[0];
      if (!p) throw new Error('Product not found');
      const updatedLinks = (p.trend_links || []).map((l, i) =>
        i === link.link_index
          ? { ...l, review_status: newStatus, reviewed_at: now, reviewed_by: me?.email || '' }
          : l
      );
      // Propagate: keep linked_trend_ids + processing_status in sync with link decisions
      const appliedIds = [...new Set(updatedLinks
        .filter(x => x.review_status === 'auto_applied' || x.review_status === 'approved')
        .map(x => x.trend_id))];
      const update = { trend_links: updatedLinks, linked_trend_ids: appliedIds };
      if (link.entity_type !== 'expert_example') {
        update.processing_status = updatedLinks.some(x => x.review_status === 'pending') ? 'trend_linking_pending' : 'trend_linked';
      }
      await Entity.update(link.product_id, update);
      toast.success(newStatus === 'approved' ? 'Approved' : 'Rejected');
      onDone();
    } catch (e) {
      toast.error(e.message || 'Update failed');
      setSaving(false);
    }
  }

  if (saving) return <Loader2 size={12} className="animate-spin" style={{ color: GREY }} />;
  return (
    <div style={{ display: "flex", gap: 5 }}>
      <button onClick={() => act('approved')}
        style={{ fontSize: 11, padding: "3px 10px", borderRadius: 4, border: "none", background: GREEN, color: "white", cursor: "pointer", fontFamily: "inherit", fontWeight: 600 }}>
        Approve
      </button>
      <button onClick={() => act('rejected')}
        style={{ fontSize: 11, padding: "3px 10px", borderRadius: 4, border: "none", background: ORANGE, color: "white", cursor: "pointer", fontFamily: "inherit", fontWeight: 600 }}>
        Reject
      </button>
    </div>
  );
}