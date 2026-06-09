import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";

const BLUE = "#1D428A";
const DARK_BLUE = "#1D2B47";
const GOLD = "#F7F4EE";
const TEAL = "#22566E";
const ORANGE = "#C15338";
const GREEN = "#6F8263";
const GREY = "#969696";

export default function GNPDDatabase() {
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState({ category: "", region: "", has_emulsifier: "", search: "" });
  const [selected, setSelected] = useState(null);
  const [stats, setStats] = useState(null);

  useEffect(() => { loadProducts(); }, [filters]);

  async function loadProducts() {
    setLoading(true);
    try {
      const query = {};
      if (filters.category) query.category = filters.category;
      if (filters.region) query.region_code = filters.region;
      if (filters.has_emulsifier === "yes") query.has_emulsifier = true;
      if (filters.has_emulsifier === "no") query.has_emulsifier = false;

      let results = await base44.entities.GNPDProduct.filter(query, "-launch_date", 500);

      if (filters.search) {
        const s = filters.search.toLowerCase();
        results = results.filter(p =>
          (p.product_name || "").toLowerCase().includes(s) ||
          (p.brand || "").toLowerCase().includes(s) ||
          (p.company || "").toLowerCase().includes(s) ||
          (p.ingredients || "").toLowerCase().includes(s)
        );
      }

      setProducts(results);
      setStats({
        total: results.length,
        with_emulsifier: results.filter(p => p.has_emulsifier).length,
        with_trends: results.filter(p => (p.linked_trend_ids || []).length > 0).length,
        pending_review: results.filter(p => p.processing_status === "trend_linking_pending").length
      });
    } catch (e) { console.error(e); }
    setLoading(false);
  }

  const categories = [...new Set(products.map(p => p.category).filter(Boolean))].sort();
  const regions = ["ASPAC", "AMERICAS", "EMEC", "IMEA", "Global"];

  return (
    <div style={{ fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif", color: DARK_BLUE, background: GOLD, minHeight: "100vh" }}>
      <div style={{ display: "flex", height: "calc(100vh - 73px)" }}>

        {/* Left — filters + list */}
        <div style={{ width: 340, borderRight: `1px solid #d8d3c8`, display: "flex", flexDirection: "column", flexShrink: 0 }}>

          {/* Stats row */}
          {stats && (
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 1, borderBottom: `1px solid #d8d3c8` }}>
              {[
                ["Products", stats.total],
                ["With emulsifier", stats.with_emulsifier],
                ["Trend-linked", stats.with_trends],
                ["Pending review", stats.pending_review]
              ].map(([label, val]) => (
                <div key={label} style={{ padding: "10px 14px", background: "white", textAlign: "center" }}>
                  <div style={{ fontSize: 18, fontWeight: 700, color: BLUE }}>{val}</div>
                  <div style={{ fontSize: 11, color: GREY }}>{label}</div>
                </div>
              ))}
            </div>
          )}

          {/* Filters */}
          <div style={{ padding: "12px 14px", borderBottom: `1px solid #d8d3c8`, background: "white" }}>
            <input
              placeholder="Search product, brand, ingredients..."
              value={filters.search}
              onChange={e => setFilters(f => ({ ...f, search: e.target.value }))}
              style={{ width: "100%", fontSize: 13, padding: "7px 10px", borderRadius: 5, border: `1px solid #d8d3c8`, fontFamily: "inherit", boxSizing: "border-box", marginBottom: 8 }}
            />
            <div style={{ display: "flex", gap: 6 }}>
              <select value={filters.category} onChange={e => setFilters(f => ({ ...f, category: e.target.value }))}
                style={{ flex: 1, fontSize: 12, padding: "5px 8px", borderRadius: 5, border: `1px solid #d8d3c8`, fontFamily: "inherit" }}>
                <option value="">All categories</option>
                {categories.map(c => <option key={c}>{c}</option>)}
              </select>
              <select value={filters.region} onChange={e => setFilters(f => ({ ...f, region: e.target.value }))}
                style={{ flex: 1, fontSize: 12, padding: "5px 8px", borderRadius: 5, border: `1px solid #d8d3c8`, fontFamily: "inherit" }}>
                <option value="">All regions</option>
                {regions.map(r => <option key={r}>{r}</option>)}
              </select>
              <select value={filters.has_emulsifier} onChange={e => setFilters(f => ({ ...f, has_emulsifier: e.target.value }))}
                style={{ fontSize: 12, padding: "5px 8px", borderRadius: 5, border: `1px solid #d8d3c8`, fontFamily: "inherit" }}>
                <option value="">All</option>
                <option value="yes">Emulsifier</option>
                <option value="no">No emulsifier</option>
              </select>
            </div>
          </div>

          {/* Product list */}
          <div style={{ overflowY: "auto", flex: 1 }}>
            {loading ? (
              <p style={{ padding: "1rem", color: GREY, fontSize: 13 }}>Loading…</p>
            ) : products.length === 0 ? (
              <p style={{ padding: "1rem", color: GREY, fontSize: 13 }}>No products found.</p>
            ) : products.slice(0, 200).map(p => (
              <div key={p.id} onClick={() => setSelected(p)} style={{
                padding: "10px 14px", cursor: "pointer",
                borderBottom: `1px solid #e8e4de`,
                background: selected?.id === p.id ? "#E8EEF6" : "transparent",
                borderLeft: selected?.id === p.id ? `3px solid ${BLUE}` : "3px solid transparent"
              }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 6, alignItems: "flex-start" }}>
                  <span style={{ fontSize: 13, fontWeight: 600, color: DARK_BLUE, lineHeight: 1.3 }}>{p.product_name}</span>
                  <div style={{ display: "flex", gap: 4, flexShrink: 0 }}>
                    {p.has_emulsifier && (
                      <span style={{ fontSize: 10, padding: "1px 6px", borderRadius: 20, background: "#E8EEF6", color: BLUE, fontWeight: 700 }}>E</span>
                    )}
                    {(p.linked_trend_ids || []).length > 0 && (
                      <span style={{ fontSize: 10, padding: "1px 6px", borderRadius: 20, background: "#EDF4EA", color: GREEN, fontWeight: 700 }}>T</span>
                    )}
                    {p.processing_status === "trend_linking_pending" && (
                      <span style={{ fontSize: 10, padding: "1px 6px", borderRadius: 20, background: "#FEF6EC", color: ORANGE, fontWeight: 700 }}>!</span>
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

        {/* Right — product detail */}
        <div style={{ flex: 1, overflowY: "auto", padding: "1.5rem 2rem" }}>
          {!selected ? (
            <div style={{ color: GREY, fontSize: 14, paddingTop: "2rem" }}>
              <p>Select a product to see details.</p>
              <p style={{ fontSize: 13 }}>
                Legend: <strong style={{ color: BLUE }}>E</strong> = contains emulsifier/stabiliser ·{" "}
                <strong style={{ color: GREEN }}>T</strong> = trend-linked ·{" "}
                <strong style={{ color: ORANGE }}>!</strong> = pending trend review
              </p>
            </div>
          ) : (
            <>
              <div style={{ borderBottom: `2px solid ${BLUE}`, paddingBottom: "1rem", marginBottom: "1.5rem" }}>
                <p style={{ fontSize: 11, color: GREY, margin: "0 0 2px", textTransform: "uppercase" }}>
                  {selected.category}{selected.sub_category ? ` · ${selected.sub_category}` : ""} · {selected.region_code}
                </p>
                <h2 style={{ fontSize: 20, fontWeight: 700, color: BLUE, margin: "0 0 4px" }}>{selected.product_name}</h2>
                <p style={{ fontSize: 14, color: DARK_BLUE, margin: 0 }}>
                  {selected.brand}{selected.company ? ` · ${selected.company}` : ""}{selected.country ? ` · ${selected.country}` : ""}
                </p>
              </div>

              <div style={{ background: "white", border: `1px solid #d8d3c8`, borderRadius: 8, padding: "1.25rem", marginBottom: "1rem" }}>
                <p style={{ fontSize: 11, color: GREY, textTransform: "uppercase", letterSpacing: "0.06em", margin: "0 0 1rem" }}>Product details</p>
                {[
                  ["Launch date", selected.launch_date],
                  ["Launch type", selected.launch_type],
                  ["Format", selected.format_type],
                  ["Storage", selected.storage],
                  ["Package", selected.package_type],
                  ["Description", selected.product_description],
                  ["Flavours", (selected.flavours || []).join(", ")],
                  ["Claims", (selected.claims || []).join(" · ")],
                ].filter(r => r[1]).map(([label, val]) => (
                  <div key={label} style={{ display: "flex", gap: 12, marginBottom: 8, fontSize: 13 }}>
                    <span style={{ color: GREY, minWidth: 100, flexShrink: 0 }}>{label}</span>
                    <span style={{ color: DARK_BLUE, lineHeight: 1.5 }}>{val}</span>
                  </div>
                ))}
              </div>

              {selected.has_emulsifier && (
                <div style={{ background: "#E8EEF6", border: `1px solid ${BLUE}`, borderLeft: `4px solid ${BLUE}`, borderRadius: 8, padding: "1rem 1.25rem", marginBottom: "1rem" }}>
                  <p style={{ fontSize: 12, fontWeight: 700, color: BLUE, margin: "0 0 6px", textTransform: "uppercase" }}>Emulsifier / stabiliser detected</p>
                  <p style={{ fontSize: 13, color: DARK_BLUE, margin: "0 0 6px" }}>{selected.emulsifier_keywords?.join(", ")}</p>
                  {selected.ingredients && (
                    <p style={{ fontSize: 12, color: GREY, margin: 0, lineHeight: 1.5 }}>{selected.ingredients}</p>
                  )}
                </div>
              )}

              {(selected.trend_links || []).length > 0 && (
                <div style={{ background: "white", border: `1px solid #d8d3c8`, borderRadius: 8, padding: "1.25rem", marginBottom: "1rem" }}>
                  <p style={{ fontSize: 11, color: GREY, textTransform: "uppercase", letterSpacing: "0.06em", margin: "0 0 1rem" }}>Trend links</p>
                  {selected.trend_links.map((link, i) => (
                    <div key={i} style={{
                      padding: "10px 12px", marginBottom: 8, borderRadius: 6,
                      background: link.review_status === "auto_applied" ? "#EDF4EA" : "#FEF6EC",
                      border: `1px solid ${link.review_status === "auto_applied" ? "#9DC98D" : "#F5C4A0"}`
                    }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
                        <span style={{ fontSize: 13, fontWeight: 600, color: DARK_BLUE }}>{link.trend_name}</span>
                        <span style={{
                          fontSize: 10, padding: "2px 7px", borderRadius: 20, flexShrink: 0,
                          background: link.review_status === "auto_applied" ? GREEN : ORANGE,
                          color: "white", fontWeight: 700
                        }}>
                          {link.review_status === "auto_applied" ? "Auto-linked" : "Pending review"}
                        </span>
                      </div>
                      <p style={{ fontSize: 12, color: GREY, margin: "4px 0 0" }}>
                        {link.confidence} confidence · score {link.confidence_score} · keywords: {(link.matched_keywords || []).join(", ")}
                      </p>
                    </div>
                  ))}
                </div>
              )}

              {selected.mintel_record_url && (
                <a href={selected.mintel_record_url} target="_blank" rel="noopener noreferrer" style={{
                  display: "inline-block", fontSize: 13, color: BLUE,
                  border: `1px solid #d8d3c8`, borderRadius: 6,
                  padding: "6px 14px", textDecoration: "none"
                }}>Open in Mintel GNPD →</a>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}