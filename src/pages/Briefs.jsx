import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Link } from "react-router-dom";

const BLUE = "#1D428A";
const DARK_BLUE = "#1D2B47";
const GOLD = "#F7F4EE";
const TEAL = "#22566E";
const ORANGE = "#C15338";
const GREY = "#969696";
const GREEN = "#6F8263";

const JTBD_LABELS = {
  prepare_customer_meeting: "Customer meeting",
  build_trend_deck: "Trend deck",
  understand_market: "Market understanding",
  support_innovation_pipeline: "Innovation pipeline",
  other: "Other"
};

const STATUS_STYLES = {
  new: { bg: "#FEF6EC", color: ORANGE, label: "New" },
  in_progress: { bg: "#E8EEF6", color: BLUE, label: "In progress" },
  delivered: { bg: "#EDF4EA", color: GREEN, label: "Delivered" }
};

export default function Briefs() {
  const [briefs, setBriefs] = useState([]);
  const [selected, setSelected] = useState(null);
  const [loading, setLoading] = useState(true);
  const [converting, setConverting] = useState(false);
  const [convertResult, setConvertResult] = useState(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => { loadBriefs(); }, []);

  async function loadBriefs() {
    setLoading(true);
    try {
      const results = await base44.entities.ReportRequest.list('-submitted_at', 100);
      setBriefs(results);
      if (results.length > 0 && !selected) setSelected(results[0]);
    } catch (e) { console.error(e); }
    setLoading(false);
  }

  async function convertToProject(brief) {
    setConverting(true);
    setConvertResult(null);
    try {
      const res = await base44.functions.invoke("convertBriefToProject", { briefId: brief.id });
      setConvertResult({ success: true, ...res.data });
      await loadBriefs();
      const updated = await base44.entities.ReportRequest.get(brief.id);
      setSelected(updated);
    } catch (e) {
      setConvertResult({ success: false, error: e.message });
    }
    setConverting(false);
  }

  async function deleteBrief(briefId) {
    await base44.entities.ReportRequest.delete(briefId);
    setBriefs(prev => prev.filter(b => b.id !== briefId));
    setSelected(null);
    setConfirmDelete(false);
  }

  async function unlinkAndRecreate(brief) {
    // Clear existing project link, then convert fresh
    await base44.entities.ReportRequest.update(brief.id, { project_id: null, status: "new" });
    const refreshed = { ...brief, project_id: null, status: "new" };
    setSelected(refreshed);
    setBriefs(prev => prev.map(b => b.id === brief.id ? refreshed : b));
    setConvertResult(null);
    await convertToProject(refreshed);
  }

  async function updateStatus(briefId, status) {
    await base44.entities.ReportRequest.update(briefId, { status });
    setBriefs(prev => prev.map(b => b.id === briefId ? { ...b, status } : b));
    setSelected(prev => prev?.id === briefId ? { ...prev, status } : prev);
  }

  const newCount = briefs.filter(b => b.status === "new").length;
  const minDeadline = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];

  return (
    <div style={{ display: "flex", height: "calc(100vh - 73px)", fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif", color: DARK_BLUE, background: GOLD }}>

      {/* Left panel — list */}
      <div style={{ width: 300, borderRight: `1px solid #d8d3c8`, display: "flex", flexDirection: "column", flexShrink: 0, background: GOLD }}>
        <div style={{ padding: "1.25rem 1rem", borderBottom: `2px solid ${BLUE}` }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <h1 style={{ fontSize: 18, fontWeight: 700, color: BLUE, margin: 0 }}>Brief inbox</h1>
            {newCount > 0 && (
              <span style={{
                background: ORANGE, color: "white", borderRadius: "50%",
                width: 20, height: 20, fontSize: 11, fontWeight: 700,
                display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0
              }}>{newCount > 9 ? "9+" : newCount}</span>
            )}
          </div>
          <p style={{ fontSize: 12, color: GREY, margin: "4px 0 0" }}>{briefs.length} brief{briefs.length !== 1 ? "s" : ""} total</p>
        </div>

        <div style={{ overflowY: "auto", flex: 1 }}>
          {loading ? (
            <p style={{ padding: "1rem", color: GREY, fontSize: 13 }}>Loading…</p>
          ) : briefs.length === 0 ? (
            <p style={{ padding: "1rem", color: GREY, fontSize: 13 }}>No briefs yet.</p>
          ) : briefs.map(brief => {
            const st = STATUS_STYLES[brief.status] || STATUS_STYLES.new;
            const isSelected = selected?.id === brief.id;
            return (
              <div key={brief.id} onClick={() => { setSelected(brief); setConvertResult(null); setConfirmDelete(false); }} style={{
                padding: "0.875rem 1rem", cursor: "pointer",
                borderBottom: `1px solid #d8d3c8`,
                background: isSelected ? "#E8EEF6" : "transparent",
                borderLeft: isSelected ? `3px solid ${BLUE}` : "3px solid transparent"
              }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 6 }}>
                  <span style={{ fontSize: 13, fontWeight: 600, color: DARK_BLUE, lineHeight: 1.3 }}>{brief.account || "—"}</span>
                  <span style={{
                    fontSize: 10, padding: "2px 7px", borderRadius: 20, flexShrink: 0,
                    background: st.bg, color: st.color, fontWeight: 700
                  }}>{st.label}</span>
                </div>
                <p style={{ fontSize: 12, color: GREY, margin: "3px 0 0" }}>
                  {JTBD_LABELS[brief.jtbd] || "Brief"}{brief.categories ? ` · ${brief.categories}` : ""}
                </p>
                <p style={{ fontSize: 11, color: GREY, margin: "2px 0 0" }}>
                  {brief.submitted_at ? new Date(brief.submitted_at).toLocaleDateString("en-GB", { day: "numeric", month: "short" }) : "—"}
                  {brief.deadline ? ` · deadline ${brief.deadline}` : ""}
                </p>
              </div>
            );
          })}
        </div>
      </div>

      {/* Right panel — detail */}
      <div style={{ flex: 1, overflowY: "auto", padding: "1.5rem 2rem" }}>
        {!selected ? (
          <p style={{ color: GREY, fontSize: 14 }}>Select a brief to review.</p>
        ) : (
          <>
            {/* Header */}
            <div style={{ borderBottom: `2px solid ${BLUE}`, paddingBottom: "1rem", marginBottom: "1.5rem" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 12 }}>
                <div>
                  <p style={{ fontSize: 11, color: GREY, margin: "0 0 2px", textTransform: "uppercase", letterSpacing: "0.06em" }}>
                    {JTBD_LABELS[selected.jtbd] || "Brief"}
                  </p>
                  <h2 style={{ fontSize: 22, fontWeight: 700, color: BLUE, margin: "0 0 4px" }}>{selected.account}</h2>
                  <p style={{ fontSize: 13, color: GREY, margin: 0 }}>
                    {selected.requester_name || "—"}{selected.requester_email ? ` (${selected.requester_email})` : ""}
                    {selected.submitted_at ? ` · ${new Date(selected.submitted_at).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}` : ""}
                  </p>
                </div>
                <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                  {["new", "in_progress", "delivered"].map(s => (
                    <button key={s} onClick={() => updateStatus(selected.id, s)} style={{
                      background: selected.status === s ? BLUE : "white",
                      color: selected.status === s ? "white" : DARK_BLUE,
                      border: `1px solid ${selected.status === s ? BLUE : "#d8d3c8"}`,
                      borderRadius: 6, padding: "5px 12px", cursor: "pointer",
                      fontSize: 12, fontFamily: "inherit"
                    }}>{STATUS_STYLES[s].label}</button>
                  ))}
                  <div style={{ width: 1, height: 24, background: "#d8d3c8", margin: "0 2px" }} />
                  {!confirmDelete ? (
                    <button onClick={() => setConfirmDelete(true)} style={{
                      background: "white", color: ORANGE,
                      border: `1px solid #d8d3c8`, borderRadius: 6,
                      padding: "5px 12px", cursor: "pointer", fontSize: 12, fontFamily: "inherit"
                    }}>Delete</button>
                  ) : (
                    <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
                      <span style={{ fontSize: 12, color: ORANGE }}>Delete brief?</span>
                      <button onClick={() => deleteBrief(selected.id)} style={{
                        background: ORANGE, color: "white", border: "none",
                        borderRadius: 6, padding: "5px 12px", cursor: "pointer",
                        fontSize: 12, fontFamily: "inherit", fontWeight: 600
                      }}>Yes, delete</button>
                      <button onClick={() => setConfirmDelete(false)} style={{
                        background: "white", color: DARK_BLUE,
                        border: `1px solid #d8d3c8`, borderRadius: 6,
                        padding: "5px 10px", cursor: "pointer", fontSize: 12, fontFamily: "inherit"
                      }}>Cancel</button>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Warnings */}
            {(selected.deadline && selected.deadline < minDeadline || selected.external_data_needed) && (
              <div style={{ marginBottom: "1.5rem", display: "flex", flexDirection: "column", gap: 8 }}>
                {selected.deadline && selected.deadline < minDeadline && (
                  <div style={{ background: "#FEF6EC", borderLeft: `4px solid ${ORANGE}`, borderRadius: 6, padding: "10px 14px", fontSize: 13 }}>
                    <strong style={{ color: ORANGE }}>Tight deadline</strong>
                    <span style={{ color: DARK_BLUE }}> · Requested {selected.deadline} — under 2 weeks away</span>
                  </div>
                )}
                {selected.external_data_needed && (
                  <div style={{ background: "#E8EEF6", borderLeft: `4px solid ${BLUE}`, borderRadius: 6, padding: "10px 14px", fontSize: 13 }}>
                    <strong style={{ color: BLUE }}>External data needed</strong>
                    <span style={{ color: DARK_BLUE }}> · {selected.external_data_needed}</span>
                  </div>
                )}
              </div>
            )}

            {/* Brief fields */}
            <div style={{ background: "white", border: `1px solid #d8d3c8`, borderRadius: 8, padding: "1.25rem", marginBottom: "1.5rem" }}>
              <p style={{ fontSize: 11, color: GREY, textTransform: "uppercase", letterSpacing: "0.06em", margin: "0 0 1rem" }}>Brief details</p>
              {[
                ["Categories", selected.categories],
                ["Region", selected.region],
                ["Deadline", selected.deadline],
                ["Purpose", selected.purpose],
                ["Focus areas / challenges", selected.challenges],
                ["Notes", selected.notes],
              ].filter(r => r[1]).map(([label, value]) => (
                <div key={label} style={{ display: "flex", gap: 12, marginBottom: 10, fontSize: 14 }}>
                  <span style={{ color: GREY, minWidth: 160, flexShrink: 0, paddingTop: 1 }}>{label}</span>
                  <span style={{ color: DARK_BLUE, lineHeight: 1.5, whiteSpace: "pre-line" }}>{value}</span>
                </div>
              ))}
            </div>

            {/* Convert to project */}
            <div style={{ background: "white", border: `1px solid #d8d3c8`, borderRadius: 8, padding: "1.25rem", marginBottom: "1.5rem" }}>
              <p style={{ fontSize: 11, color: GREY, textTransform: "uppercase", letterSpacing: "0.06em", margin: "0 0 0.75rem" }}>Project</p>

              {selected.project_id ? (
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <span style={{ fontSize: 13, color: GREEN, fontWeight: 600 }}>✓ Linked to project</span>
                    <Link to={`/ProjectDetail?id=${selected.project_id}`} style={{
                      fontSize: 13, color: BLUE, textDecoration: "none",
                      border: `1px solid #d8d3c8`, borderRadius: 6, padding: "4px 12px"
                    }}>Open project →</Link>
                  </div>
                  <div>
                    <p style={{ fontSize: 12, color: GREY, margin: "0 0 8px" }}>Need to start over with a fresh project?</p>
                    <button onClick={() => unlinkAndRecreate(selected)} disabled={converting} style={{
                      background: converting ? "#ccc" : "white",
                      color: converting ? GREY : DARK_BLUE,
                      border: `1px solid #d8d3c8`, borderRadius: 6,
                      padding: "7px 14px", cursor: converting ? "default" : "pointer",
                      fontSize: 13, fontFamily: "inherit"
                    }}>
                      {converting ? "Creating project…" : "↺ Recreate project"}
                    </button>
                    {convertResult?.success && (
                      <div style={{ marginTop: 10, background: "#EDF4EA", borderLeft: `4px solid ${GREEN}`, borderRadius: 6, padding: "10px 14px", fontSize: 13 }}>
                        <p style={{ color: GREEN, fontWeight: 600, margin: "0 0 4px" }}>✓ New project created: {convertResult.project_name}</p>
                        <Link to={`/ProjectDetail?id=${convertResult.project_id}`} style={{ color: BLUE, fontSize: 13, display: "inline-block", marginTop: 4 }}>Open project →</Link>
                      </div>
                    )}
                    {convertResult && !convertResult.success && (
                      <p style={{ color: ORANGE, fontSize: 13, marginTop: 8 }}>Error: {convertResult.error}</p>
                    )}
                  </div>
                </div>
              ) : (
                <>
                  <p style={{ fontSize: 13, color: DARK_BLUE, margin: "0 0 1rem", lineHeight: 1.5 }}>
                    Creates a project with all brief fields mapped — specific focus, GNPD time window, meeting context, customer priorities, and deadline warnings pre-filled by AI.
                  </p>
                  <button onClick={() => convertToProject(selected)} disabled={converting} style={{
                    background: converting ? "#ccc" : TEAL,
                    color: "white", border: "none", borderRadius: 6,
                    padding: "10px 20px", cursor: converting ? "default" : "pointer",
                    fontSize: 14, fontWeight: 600, fontFamily: "inherit"
                  }}>
                    {converting ? "Creating project…" : "Convert to project →"}
                  </button>

                  {convertResult?.success && (
                    <div style={{ marginTop: 12, background: "#EDF4EA", borderLeft: `4px solid ${GREEN}`, borderRadius: 6, padding: "10px 14px", fontSize: 13 }}>
                      <p style={{ color: GREEN, fontWeight: 600, margin: "0 0 4px" }}>✓ Project created: {convertResult.project_name}</p>
                      {convertResult.warnings?.length > 0 && (
                        <ul style={{ margin: "4px 0 0", paddingLeft: 16, color: DARK_BLUE }}>
                          {convertResult.warnings.map((w, i) => <li key={i} style={{ fontSize: 12 }}>{w.message}</li>)}
                        </ul>
                      )}
                      <Link to={`/ProjectDetail?id=${convertResult.project_id}`} style={{ color: BLUE, fontSize: 13, display: "inline-block", marginTop: 6 }}>Open project →</Link>
                    </div>
                  )}
                  {convertResult && !convertResult.success && (
                    <p style={{ color: ORANGE, fontSize: 13, marginTop: 8 }}>Error: {convertResult.error}</p>
                  )}
                </>
              )}
            </div>

            {/* Conversation log */}
            {selected.conversation_log?.length > 0 && (
              <div style={{ background: "white", border: `1px solid #d8d3c8`, borderRadius: 8, padding: "1.25rem" }}>
                <p style={{ fontSize: 11, color: GREY, textTransform: "uppercase", letterSpacing: "0.06em", margin: "0 0 1rem" }}>Conversation log</p>
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {selected.conversation_log.filter(m => m.role !== "system").map((m, i) => (
                    <div key={i} style={{
                      alignSelf: m.role === "user" ? "flex-end" : "flex-start",
                      maxWidth: "80%",
                      background: m.role === "user" ? BLUE : GOLD,
                      color: m.role === "user" ? "white" : DARK_BLUE,
                      padding: "8px 12px", borderRadius: 8,
                      borderBottomRightRadius: m.role === "user" ? 2 : 8,
                      borderBottomLeftRadius: m.role === "assistant" ? 2 : 8,
                      fontSize: 13, lineHeight: 1.5,
                      border: m.role === "assistant" ? `1px solid #d8d3c8` : "none"
                    }}>
                      {m.content.replace(/BRIEF_READY[\s\S]*$/, "").trim()}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}