import React, { useState, useEffect, useMemo } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';
import { Upload, Search, Database, CheckCircle2, AlertCircle, Loader2, FileText } from 'lucide-react';
import { format } from 'date-fns';
import GnpdDetailPanel from '../components/sources/GnpdDetailPanel';
import KnowledgeUploadModal from '../components/knowledge/KnowledgeUploadModal';

// ── Brand colours ────────────────────────────────────────────────────────────
const BLUE      = "#1D428A";
const DARK_BLUE = "#1D2B47";
const GOLD      = "#F7F4EE";
const TEAL      = "#22566E";
const ORANGE    = "#C15338";
const GREEN     = "#6F8263";
const GREY      = "#969696";

// ── Shared constants ─────────────────────────────────────────────────────────
const REGIONS    = ['ASPAC', 'AMERICAS', 'EMEC', 'IMEA', 'Global'];
const CATEGORIES = ['Bakery','Confectionery','Dairy','Feed','Fine Food','Ice Cream','Lipid','Meat','Other Food Applications','PCI','Polymer','Tech'];

// ─────────────────────────────────────────────────────────────────────────────
//  UPLOADS TAB
// ─────────────────────────────────────────────────────────────────────────────
function UploadsTab() {
  const queryClient = useQueryClient();
  const [search, setSearch]           = useState('');
  const [regionFilter, setRegion]     = useState('all');
  const [categoryFilter, setCategory] = useState('all');
  const [openSourceId, setOpenSourceId] = useState(null);
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [parsing, setParsing]         = useState({});   // { sourceId: {status, rows, created} }

  const queryKey = ['gnpdSources'];
  const [detectingTimers, setDetectingTimers] = useState({});

  const { data: sources = [], isLoading } = useQuery({
    queryKey,
    queryFn: () => base44.entities.Source.filter({ source_type: 'gnpd' }, '-created_date', 300),
    refetchInterval: (data) => {
      const sources = data?.state?.data ?? [];
      return sources.some(s => s.gnpd_mapping_status === 'detecting') ? 3000 : false;
    },
  });

  // Track elapsed seconds for detecting sources
  useEffect(() => {
    const detecting = sources.filter(s => s.gnpd_mapping_status === 'detecting');
    detecting.forEach(s => {
      if (!detectingTimers[s.id]) {
        setDetectingTimers(prev => ({ ...prev, [s.id]: { start: Date.now(), elapsed: 0 } }));
      }
    });
    // Clear timers for sources no longer detecting
    setDetectingTimers(prev => {
      const next = { ...prev };
      Object.keys(next).forEach(id => {
        if (!detecting.find(s => s.id === id)) delete next[id];
      });
      return next;
    });
  }, [sources]);

  useEffect(() => {
    const hasDetecting = Object.keys(detectingTimers).length > 0;
    if (!hasDetecting) return;
    const interval = setInterval(() => {
      setDetectingTimers(prev => {
        const next = { ...prev };
        Object.keys(next).forEach(id => {
          next[id] = { ...next[id], elapsed: Math.floor((Date.now() - next[id].start) / 1000) };
        });
        return next;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [Object.keys(detectingTimers).length]);

  const stats = useMemo(() => ({
    total:  sources.length,
    inDb:   sources.filter(s => s.pipeline_stage === 'extracted').length,
    failed: sources.filter(s => s.pipeline_stage === 'failed').length,
  }), [sources]);

  const visibleRows = useMemo(() => {
    let rows = [...sources];
    if (search.trim()) {
      const q = search.toLowerCase();
      rows = rows.filter(s => s.title?.toLowerCase().includes(q) || s.tags?.some(t => t.toLowerCase().includes(q)));
    }
    if (regionFilter !== 'all')   rows = rows.filter(s => s.region_code === regionFilter);
    if (categoryFilter !== 'all') rows = rows.filter(s => s.category === categoryFilter);
    return rows;
  }, [sources, search, regionFilter, categoryFilter]);

  async function handleParse(sourceId, e) {
    e.stopPropagation();
    setParsing(prev => ({ ...prev, [sourceId]: { status: 'parsing' } }));
    try {
      const res = await base44.functions.invoke('runGNPDBatchParse', { sourceIds: [sourceId] });
      const result = (res.data?.results || [])[0];
      if (result?.status === 'ok') {
        setParsing(prev => ({ ...prev, [sourceId]: { status: 'done', rows: result.rows_parsed, created: result.created } }));
        toast.success(`Parsed ${result.created} products from ${result.rows_parsed} rows`);
        queryClient.invalidateQueries({ queryKey });
      } else {
        setParsing(prev => ({ ...prev, [sourceId]: { status: 'error', error: result?.error || 'Unknown error' } }));
        toast.error(result?.error || 'Parse failed');
      }
    } catch (err) {
      setParsing(prev => ({ ...prev, [sourceId]: { status: 'error', error: err.message } }));
      toast.error(err.message);
    }
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-7 h-7 animate-spin" style={{ color: GREY }} />
      </div>
    );
  }

  return (
    <div style={{ fontFamily: "Calibri, Arial, sans-serif", color: DARK_BLUE }}>
      <div style={{ maxWidth: 1400, margin: "0 auto", padding: "24px 28px" }}>

        {/* Sub-header */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
          <p style={{ fontSize: 13, color: GREY, margin: 0 }}>
            Product launch exports from Mintel GNPD — used in account intelligence reports
          </p>
          <button
            onClick={() => setShowUploadModal(true)}
            style={{ display: "flex", alignItems: "center", gap: 6, background: BLUE, color: "white", border: "none", borderRadius: 6, padding: "8px 16px", fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}
          >
            <Upload size={14} /> Upload GNPD Export
          </button>
        </div>

        {/* Stats */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12, marginBottom: 20 }}>
          {[
            { label: "Total Uploads",      val: stats.total,  color: BLUE },
            { label: "In Database",        val: stats.inDb,   color: GREEN },
            { label: "Failed Processing",  val: stats.failed, color: ORANGE },
          ].map(({ label, val, color }) => (
            <div key={label} style={{ background: "white", border: "1px solid #d8d3c8", borderRadius: 8, padding: "14px 18px" }}>
              <div style={{ fontSize: 22, fontWeight: 700, color }}>{val}</div>
              <div style={{ fontSize: 12, color: GREY, marginTop: 2 }}>{label}</div>
            </div>
          ))}
        </div>

        {/* Filters */}
        <div style={{ display: "flex", gap: 10, marginBottom: 16, alignItems: "center" }}>
          <div style={{ position: "relative", flex: 1 }}>
            <Search size={14} style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: GREY }} />
            <input
              placeholder="Search by title or tag..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              style={{ width: "100%", paddingLeft: 32, paddingRight: 10, paddingTop: 7, paddingBottom: 7, fontSize: 13, borderRadius: 6, border: "1px solid #d8d3c8", fontFamily: "inherit", boxSizing: "border-box" }}
            />
          </div>
          {[["Region", REGIONS, regionFilter, setRegion], ["Category", CATEGORIES, categoryFilter, setCategory]].map(([label, opts, val, setter]) => (
            <select key={label} value={val} onChange={e => setter(e.target.value)}
              style={{ fontSize: 13, padding: "7px 10px", borderRadius: 6, border: "1px solid #d8d3c8", fontFamily: "inherit", background: "white", color: DARK_BLUE }}>
              <option value="all">All {label.toLowerCase()}s</option>
              {opts.map(o => <option key={o} value={o}>{o}</option>)}
            </select>
          ))}
        </div>

        {/* Table */}
        <div style={{ background: "white", border: "1px solid #d8d3c8", borderRadius: 8, overflow: "hidden" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ background: GOLD, borderBottom: "1px solid #d8d3c8" }}>
                {["Title", "Uploaded", "Region", "Category", "Rows", "Mapping status", ""].map(h => (
                  <th key={h} style={{ textAlign: h === "Rows" ? "right" : "left", padding: "10px 14px", fontWeight: 600, color: DARK_BLUE, fontSize: 12 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {visibleRows.length === 0 ? (
                <tr><td colSpan={7} style={{ textAlign: "center", padding: "3rem", color: GREY, fontSize: 13 }}>No GNPD exports match the current filter.</td></tr>
              ) : visibleRows.map(s => {
                const inDb    = s.pipeline_stage === 'extracted';
                const pState  = parsing[s.id];
                return (
                  <tr key={s.id} onClick={() => setOpenSourceId(s.id)} style={{
                    cursor: "pointer", borderBottom: "1px solid #ebe7e0",
                    background: openSourceId === s.id ? "#E8EEF6" : "transparent",
                    borderLeft: openSourceId === s.id ? `3px solid ${BLUE}` : "3px solid transparent"
                  }}>
                    <td style={{ padding: "10px 14px", maxWidth: 320 }}>
                      <div style={{ display: "flex", alignItems: "flex-start", gap: 8 }}>
                        <FileText size={14} style={{ color: GREY, flexShrink: 0, marginTop: 2 }} />
                        <span style={{ fontWeight: 600, color: DARK_BLUE }}>{s.title || 'Untitled'}</span>
                      </div>
                    </td>
                    <td style={{ padding: "10px 14px", color: GREY, whiteSpace: "nowrap" }}>
                      {s.created_date ? format(new Date(s.created_date), 'MMM d, yyyy') : '—'}
                    </td>
                    <td style={{ padding: "10px 14px", color: DARK_BLUE }}>{s.region_code || '—'}</td>
                    <td style={{ padding: "10px 14px", color: DARK_BLUE }}>{s.category || '—'}</td>
                    <td style={{ padding: "10px 14px", textAlign: "right", color: DARK_BLUE }}>{s.gnpd_row_count?.toLocaleString() || '—'}</td>
                    <td style={{ padding: "10px 14px" }}>
                      <MappingBadge status={s.gnpd_mapping_status} elapsed={detectingTimers[s.id]?.elapsed} />
                    </td>
                    <td style={{ padding: "10px 14px" }} onClick={e => e.stopPropagation()}>
                      {inDb ? (
                        <span style={{ fontSize: 11, padding: "3px 9px", borderRadius: 20, background: "#EDF4EA", color: GREEN, fontWeight: 700 }}>✓ In database</span>
                      ) : pState?.status === 'parsing' ? (
                        <span style={{ fontSize: 12, color: GREY, display: "flex", alignItems: "center", gap: 5 }}>
                          <Loader2 size={12} className="animate-spin" /> Parsing…
                        </span>
                      ) : pState?.status === 'done' ? (
                        <span style={{ fontSize: 11, color: GREEN }}>{pState.created} created / {pState.rows} rows</span>
                      ) : pState?.status === 'error' ? (
                        <span style={{ fontSize: 11, color: ORANGE }}>Error: {pState.error?.slice(0, 40)}</span>
                      ) : (
                        <button
                          onClick={e => handleParse(s.id, e)}
                          style={{ fontSize: 12, color: BLUE, background: "none", border: `1px solid ${BLUE}`, borderRadius: 5, padding: "3px 10px", cursor: "pointer", fontFamily: "inherit", fontWeight: 600 }}
                        >
                          Parse to database →
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {showUploadModal && <KnowledgeUploadModal onClose={() => setShowUploadModal(false)} />}
      <GnpdDetailPanel
        sourceId={openSourceId}
        onClose={() => setOpenSourceId(null)}
        onRefresh={() => queryClient.invalidateQueries({ queryKey })}
      />
    </div>
  );
}

function MappingBadge({ status, elapsed }) {
  const cfg = {
    not_started: { label: "Not started", bg: "#f1f1f1", color: GREY },
    detecting:   { label: "Detecting columns…", bg: "#E8EEF6", color: BLUE },
    complete:    { label: "Complete",    bg: "#EDF4EA", color: GREEN },
    failed:      { label: "Failed",      bg: "#FDECEA", color: ORANGE },
  };
  const c = cfg[status] || { label: status || "—", bg: "#f1f1f1", color: GREY };
  const elapsedLabel = elapsed != null && elapsed > 0
    ? elapsed < 60 ? `${elapsed}s` : `${Math.floor(elapsed / 60)}m ${elapsed % 60}s`
    : null;
  return (
    <span style={{ fontSize: 11, padding: "3px 9px", borderRadius: 20, background: c.bg, color: c.color, fontWeight: 600, display: "inline-flex", alignItems: "center", gap: 5 }}>
      {status === "detecting" && <Loader2 size={10} className="animate-spin" />}
      {c.label}
      {status === "detecting" && elapsedLabel && (
        <span style={{ opacity: 0.7, fontWeight: 400 }}>{elapsedLabel}</span>
      )}
    </span>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
//  PRODUCTS TAB
// ─────────────────────────────────────────────────────────────────────────────
function ProductsTab() {
  const [products, setProducts] = useState([]);
  const [loading, setLoading]   = useState(true);
  const [filters, setFilters]   = useState({ category: "", region: "", has_emulsifier: "", search: "" });
  const [selected, setSelected] = useState(null);

  useEffect(() => { loadProducts(); }, [filters]);

  async function loadProducts() {
    setLoading(true);
    try {
      const query = {};
      if (filters.category) query.category = filters.category;
      if (filters.region)   query.region_code = filters.region;
      if (filters.has_emulsifier === "yes") query.has_emulsifier = true;
      if (filters.has_emulsifier === "no")  query.has_emulsifier = false;

      let results = await base44.entities.GNPDProduct.filter(query, "-launch_date", 500);

      if (filters.search) {
        const s = filters.search.toLowerCase();
        results = results.filter(p =>
          (p.product_name  || "").toLowerCase().includes(s) ||
          (p.brand         || "").toLowerCase().includes(s) ||
          (p.company       || "").toLowerCase().includes(s) ||
          (p.ingredients   || "").toLowerCase().includes(s)
        );
      }
      setProducts(results);
    } catch (e) { console.error(e); }
    setLoading(false);
  }

  const stats = useMemo(() => ({
    total:          products.length,
    with_emulsifier: products.filter(p => p.has_emulsifier).length,
    with_trends:    products.filter(p => (p.linked_trend_ids || []).length > 0).length,
    pending_review: products.filter(p => p.processing_status === "trend_linking_pending").length,
  }), [products]);

  const categories = useMemo(() => [...new Set(products.map(p => p.category).filter(Boolean))].sort(), [products]);

  return (
    <div style={{ display: "flex", height: "calc(100vh - 120px)", fontFamily: "Calibri, Arial, sans-serif", color: DARK_BLUE }}>

      {/* Left panel */}
      <div style={{ width: 340, borderRight: "1px solid #d8d3c8", display: "flex", flexDirection: "column", flexShrink: 0, background: GOLD }}>

        {/* Stats 2×2 */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 1, borderBottom: "1px solid #d8d3c8", background: "#d8d3c8" }}>
          {[
            ["Products",      stats.total],
            ["With emulsifier", stats.with_emulsifier],
            ["Trend-linked",  stats.with_trends],
            ["Pending review", stats.pending_review],
          ].map(([label, val]) => (
            <div key={label} style={{ padding: "12px 14px", background: "white", textAlign: "center" }}>
              <div style={{ fontSize: 20, fontWeight: 700, color: BLUE }}>{val}</div>
              <div style={{ fontSize: 11, color: GREY }}>{label}</div>
            </div>
          ))}
        </div>

        {/* Filters */}
        <div style={{ padding: "12px 12px 10px", borderBottom: "1px solid #d8d3c8", background: "white" }}>
          <input
            placeholder="Search product, brand, ingredients..."
            value={filters.search}
            onChange={e => setFilters(f => ({ ...f, search: e.target.value }))}
            style={{ width: "100%", fontSize: 13, padding: "7px 10px", borderRadius: 5, border: "1px solid #d8d3c8", fontFamily: "inherit", boxSizing: "border-box", marginBottom: 8 }}
          />
          <div style={{ display: "flex", gap: 6 }}>
            <select value={filters.category} onChange={e => setFilters(f => ({ ...f, category: e.target.value }))}
              style={{ flex: 1, fontSize: 12, padding: "5px 7px", borderRadius: 5, border: "1px solid #d8d3c8", fontFamily: "inherit", background: "white" }}>
              <option value="">All categories</option>
              {categories.map(c => <option key={c}>{c}</option>)}
            </select>
            <select value={filters.region} onChange={e => setFilters(f => ({ ...f, region: e.target.value }))}
              style={{ flex: 1, fontSize: 12, padding: "5px 7px", borderRadius: 5, border: "1px solid #d8d3c8", fontFamily: "inherit", background: "white" }}>
              <option value="">All regions</option>
              {REGIONS.map(r => <option key={r}>{r}</option>)}
            </select>
            <select value={filters.has_emulsifier} onChange={e => setFilters(f => ({ ...f, has_emulsifier: e.target.value }))}
              style={{ fontSize: 12, padding: "5px 7px", borderRadius: 5, border: "1px solid #d8d3c8", fontFamily: "inherit", background: "white" }}>
              <option value="">All</option>
              <option value="yes">Emulsifier</option>
              <option value="no">No emulsifier</option>
            </select>
          </div>
        </div>

        {/* Product list */}
        <div style={{ overflowY: "auto", flex: 1 }}>
          {loading ? (
            <div style={{ padding: "1.5rem", textAlign: "center" }}>
              <Loader2 size={20} className="animate-spin" style={{ color: GREY, margin: "0 auto" }} />
            </div>
          ) : products.length === 0 ? (
            <p style={{ padding: "1rem 14px", color: GREY, fontSize: 13 }}>No products found.</p>
          ) : products.slice(0, 200).map(p => (
            <div key={p.id} onClick={() => setSelected(p)} style={{
              padding: "10px 14px", cursor: "pointer",
              borderBottom: "1px solid #e8e4de",
              background: selected?.id === p.id ? "#E8EEF6" : "transparent",
              borderLeft: selected?.id === p.id ? `3px solid ${BLUE}` : "3px solid transparent"
            }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 6, alignItems: "flex-start" }}>
                <span style={{ fontSize: 13, fontWeight: 600, color: DARK_BLUE, lineHeight: 1.3 }}>{p.product_name}</span>
                <div style={{ display: "flex", gap: 3, flexShrink: 0 }}>
                  {p.has_emulsifier && (
                    <span style={{ fontSize: 10, padding: "1px 5px", borderRadius: 20, background: "#E8EEF6", color: BLUE, fontWeight: 700 }}>E</span>
                  )}
                  {(p.linked_trend_ids || []).length > 0 && (
                    <span style={{ fontSize: 10, padding: "1px 5px", borderRadius: 20, background: "#EDF4EA", color: GREEN, fontWeight: 700 }}>T</span>
                  )}
                  {p.processing_status === "trend_linking_pending" && (
                    <span style={{ fontSize: 10, padding: "1px 5px", borderRadius: 20, background: "#FEF6EC", color: ORANGE, fontWeight: 700 }}>!</span>
                  )}
                </div>
              </div>
              <p style={{ fontSize: 12, color: GREY, margin: "2px 0 0" }}>
                {p.brand || "—"} · {p.country || "—"} · {p.launch_date || "—"}
              </p>
            </div>
          ))}
        </div>
      </div>

      {/* Right panel — detail */}
      <div style={{ flex: 1, overflowY: "auto", padding: "1.5rem 2rem", background: "white" }}>
        {!selected ? (
          <div style={{ color: GREY, fontSize: 14, paddingTop: "2rem" }}>
            <p>Select a product to see details.</p>
            <p style={{ fontSize: 13, marginTop: 8 }}>
              Legend: <strong style={{ color: BLUE }}>E</strong> = emulsifier/stabiliser ·{" "}
              <strong style={{ color: GREEN }}>T</strong> = trend-linked ·{" "}
              <strong style={{ color: ORANGE }}>!</strong> = pending trend review
            </p>
          </div>
        ) : (
          <ProductDetail product={selected} />
        )}
      </div>
    </div>
  );
}

function ProductDetail({ product: p }) {
  return (
    <>
      {/* Header */}
      <div style={{ borderBottom: `2px solid ${BLUE}`, paddingBottom: "1rem", marginBottom: "1.5rem" }}>
        <p style={{ fontSize: 11, color: GREY, margin: "0 0 4px", textTransform: "uppercase", letterSpacing: "0.06em" }}>
          {p.category}{p.sub_category ? ` · ${p.sub_category}` : ""}{p.region_code ? ` · ${p.region_code}` : ""}
        </p>
        <h2 style={{ fontSize: 22, fontWeight: 700, color: BLUE, margin: "0 0 4px", fontFamily: "Calibri, Arial, sans-serif" }}>{p.product_name}</h2>
        <p style={{ fontSize: 14, color: DARK_BLUE, margin: 0 }}>
          {[p.brand, p.company, p.country].filter(Boolean).join(" · ")}
        </p>
      </div>

      {/* Details card */}
      <div style={{ background: GOLD, border: "1px solid #d8d3c8", borderRadius: 8, padding: "1.25rem", marginBottom: "1rem" }}>
        <p style={{ fontSize: 11, color: GREY, textTransform: "uppercase", letterSpacing: "0.06em", margin: "0 0 1rem", fontWeight: 600 }}>Product details</p>
        {[
          ["Launch date",  p.launch_date],
          ["Launch type",  p.launch_type],
          ["Format",       p.format_type],
          ["Storage",      p.storage],
          ["Package",      p.package_type],
          ["Description",  p.product_description],
          ["Flavours",     (p.flavours  || []).join(", ")],
          ["Claims",       (p.claims    || []).join(" · ")],
        ].filter(r => r[1]).map(([label, val]) => (
          <div key={label} style={{ display: "flex", gap: 12, marginBottom: 8, fontSize: 13 }}>
            <span style={{ color: GREY, minWidth: 100, flexShrink: 0 }}>{label}</span>
            <span style={{ color: DARK_BLUE, lineHeight: 1.5 }}>{val}</span>
          </div>
        ))}
      </div>

      {/* Emulsifier card */}
      {p.has_emulsifier && (
        <div style={{ background: "#E8EEF6", border: `1px solid ${BLUE}`, borderLeft: `4px solid ${BLUE}`, borderRadius: 8, padding: "1rem 1.25rem", marginBottom: "1rem" }}>
          <p style={{ fontSize: 12, fontWeight: 700, color: BLUE, margin: "0 0 6px", textTransform: "uppercase", letterSpacing: "0.05em" }}>Emulsifier / stabiliser detected</p>
          <p style={{ fontSize: 13, color: DARK_BLUE, margin: "0 0 6px" }}>{p.emulsifier_keywords?.join(", ")}</p>
          {p.ingredients && <p style={{ fontSize: 12, color: GREY, margin: 0, lineHeight: 1.5 }}>{p.ingredients}</p>}
        </div>
      )}

      {/* Trend links */}
      {(p.trend_links || []).length > 0 && (
        <div style={{ background: "white", border: "1px solid #d8d3c8", borderRadius: 8, padding: "1.25rem", marginBottom: "1rem" }}>
          <p style={{ fontSize: 11, color: GREY, textTransform: "uppercase", letterSpacing: "0.06em", margin: "0 0 1rem", fontWeight: 600 }}>Trend links</p>
          {p.trend_links.map((link, i) => (
            <div key={i} style={{
              padding: "10px 12px", marginBottom: 8, borderRadius: 6,
              background: link.review_status === "auto_applied" ? "#EDF4EA" : "#FEF6EC",
              border: `1px solid ${link.review_status === "auto_applied" ? "#9DC98D" : "#F5C4A0"}`
            }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
                <span style={{ fontSize: 13, fontWeight: 600, color: DARK_BLUE }}>{link.trend_name}</span>
                <span style={{
                  fontSize: 10, padding: "2px 8px", borderRadius: 20, flexShrink: 0, fontWeight: 700,
                  background: link.review_status === "auto_applied" ? GREEN : ORANGE, color: "white"
                }}>
                  {link.review_status === "auto_applied" ? "Auto-linked" : "Pending review"}
                </span>
              </div>
              <p style={{ fontSize: 12, color: GREY, margin: "4px 0 0" }}>
                {link.confidence} confidence · score {link.confidence_score} · {(link.matched_keywords || []).join(", ")}
              </p>
            </div>
          ))}
        </div>
      )}

      {/* Mintel link */}
      {p.mintel_record_url && (
        <a href={p.mintel_record_url} target="_blank" rel="noopener noreferrer" style={{
          display: "inline-block", fontSize: 13, color: BLUE,
          border: "1px solid #d8d3c8", borderRadius: 6,
          padding: "6px 14px", textDecoration: "none", fontFamily: "Calibri, Arial, sans-serif"
        }}>Open in Mintel GNPD →</a>
      )}
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
//  UNIFIED PAGE
// ─────────────────────────────────────────────────────────────────────────────
export default function GNPD() {
  const [tab, setTab] = useState("uploads");

  return (
    <div style={{ fontFamily: "Calibri, Arial, sans-serif", minHeight: "100vh", background: GOLD }}>
      {/* Page header */}
      <div style={{ background: BLUE, padding: "16px 28px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div>
          <h1 style={{ color: "white", margin: 0, fontSize: 20, fontWeight: 700, letterSpacing: "0.01em" }}>GNPD</h1>
          <p style={{ color: "rgba(255,255,255,0.65)", margin: "2px 0 0", fontSize: 12 }}>Global New Products Database</p>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ background: "white", borderBottom: "1px solid #d8d3c8", padding: "0 28px", display: "flex", gap: 0 }}>
        {[["uploads", "Uploads"], ["products", "Products"]].map(([key, label]) => (
          <button key={key} onClick={() => setTab(key)} style={{
            background: "none", border: "none", cursor: "pointer",
            padding: "12px 20px", fontSize: 14, fontWeight: 600,
            fontFamily: "Calibri, Arial, sans-serif",
            color: tab === key ? BLUE : GREY,
            borderBottom: tab === key ? `2px solid ${BLUE}` : "2px solid transparent",
            marginBottom: -1,
            transition: "color 0.15s"
          }}>
            {label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div>
        {tab === "uploads"  && <UploadsTab />}
        {tab === "products" && <ProductsTab />}
      </div>
    </div>
  );
}