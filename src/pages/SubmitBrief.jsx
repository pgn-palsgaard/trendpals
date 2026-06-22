import { useState, useRef, useEffect } from "react";
import { base44 } from "@/api/base44Client";

const BLUE = "#1D428A";
const DARK_BLUE = "#1D2B47";
const GOLD = "#F7F4EE";
const TEAL = "#22566E";
const ORANGE = "#C15338";
const GREY = "#969696";

const JTBD_OPTIONS = [
  { id: "prepare_customer_meeting", icon: "🤝", label: "Prepare customer meeting", desc: "We have a meeting and need market insight" },
  { id: "build_trend_deck", icon: "📊", label: "Build a trend deck", desc: "Trend presentation for a region or customer" },
  { id: "understand_market", icon: "🔍", label: "Understand a market", desc: "What's happening in a category right now?" },
  { id: "support_innovation_pipeline", icon: "🧪", label: "Innovation pipeline", desc: "Working on an application and need data" },
  { id: "other", icon: "💬", label: "Other", desc: "Describe freely what you're looking for" }
];

const GREETINGS = {
  prepare_customer_meeting: "Hi! Tell me about the meeting — feel free to paste an email or describe it in your own words. I'll figure out what's missing.",
  build_trend_deck: "Hi! Tell me about the deck — which category, region, and who is it for?",
  understand_market: "Hi! Which market or category do you want to understand better? Tell me what you know and what you're looking for.",
  support_innovation_pipeline: "Hi! Describe what you're working on — the application, category, and what data you specifically need.",
  other: "Hi! Describe what you need — as briefly or in as much detail as feels natural."
};

export default function SubmitBrief() {
  const [step, setStep] = useState("jtbd");
  const [selectedJtbd, setSelectedJtbd] = useState(null);
  const [messages, setMessages] = useState([]);
  const [inputText, setInputText] = useState("");
  const [loading, setLoading] = useState(false);
  const [brief, setBrief] = useState(null);
  const [conversationLog, setConversationLog] = useState([]);
  const chatEndRef = useRef(null);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  function selectJtbd(jtbd) {
    setSelectedJtbd(jtbd);
    const greeting = GREETINGS[jtbd];
    setMessages([{ role: "assistant", content: greeting }]);
    setConversationLog([{ role: "assistant", content: greeting }]);
    setStep("chat");
  }

  async function sendMessage() {
    if (!inputText.trim() || loading) return;
    const userMsg = { role: "user", content: inputText.trim() };
    const newMessages = [...messages, userMsg];
    const newLog = [...conversationLog, userMsg];
    setMessages(newMessages);
    setConversationLog(newLog);
    setInputText("");
    setLoading(true);

    try {
      const apiMessages = newMessages.map(m => ({ role: m.role, content: m.content }));
      const result = await base44.functions.invoke("processAIBrief", { messages: apiMessages, jtbd: selectedJtbd });
      const reply = result.data?.reply || "";
      const assistantMsg = { role: "assistant", content: reply };

      if (reply.includes("BRIEF_READY")) {
        const jsonMatch = reply.match(/BRIEF_READY\s*(\{[\s\S]*?\})\s*$/);
        if (jsonMatch) {
          try {
            const extracted = JSON.parse(jsonMatch[1]);
            setBrief(extracted);
            const visibleReply = reply.replace(/BRIEF_READY[\s\S]*$/, "").trim();
            setMessages(prev => [...prev, {
              role: "assistant",
              content: (visibleReply || "I have everything I need.") + " Review the brief draft below."
            }]);
            setConversationLog(prev => [...prev, assistantMsg]);
            setStep("review");
          } catch {
            setMessages(prev => [...prev, assistantMsg]);
          }
        }
      } else {
        setMessages(prev => [...prev, assistantMsg]);
        setConversationLog(prev => [...prev, assistantMsg]);
      }
    } catch {
      setMessages(prev => [...prev, { role: "assistant", content: "Something went wrong. Please try again." }]);
    }
    setLoading(false);
  }

  function handleKey(e) {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(); }
  }

  async function submitBrief() {
    if (!brief) return;
    setLoading(true);
    try {
      await base44.entities.ReportRequest.create({
        requester_name: brief.requester_name || "Unknown",
        requester_email: brief.requester_email || "",
        account: brief.account || "Unknown",
        jtbd: selectedJtbd,
        categories: Array.isArray(brief.categories) ? brief.categories.join(", ") : (brief.categories || ""),
        region: brief.region || "",
        deadline: brief.deadline || null,
        purpose: brief.purpose || "",
        challenges: brief.challenges || "",
        notes: [
          brief.notes,
          brief.gnpd_history_window ? `Product launch history: ${brief.gnpd_history_window}` : null,
        ].filter(Boolean).join("\n\n") || "",
        external_data_needed: brief.external_data_needed || "",
        status: "new",
        submitted_at: new Date().toISOString(),
        conversation_log: conversationLog,
      });
      setStep("done");
    } catch (e) {
      alert("Submission failed — " + (e.message || "please try again."));
    }
    setLoading(false);
  }

  const minDeadline = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
  const isTightDeadline = brief?.deadline && brief.deadline < minDeadline;

  const stepKeys = ["jtbd", "chat", "review"];
  const stepLabels = ["What do you need?", "Tell us more", "Review & submit"];

  return (
    <div style={{ maxWidth: 680, margin: "0 auto", padding: "2rem 1rem", fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif", color: DARK_BLUE }}>

      {/* Header */}
      <div style={{ borderBottom: `2px solid ${BLUE}`, paddingBottom: "1rem", marginBottom: "2rem" }}>
        <p style={{ fontSize: 11, color: GREY, margin: "0 0 4px", textTransform: "uppercase", letterSpacing: "0.08em" }}>Market Intelligence</p>
        <h1 style={{ fontSize: 24, fontWeight: 700, color: BLUE, margin: 0 }}>Submit a brief</h1>
        <p style={{ fontSize: 14, color: DARK_BLUE, margin: "6px 0 0", opacity: 0.7 }}>Tell us what you need — paste an email, describe a meeting, or write freely.</p>
      </div>

      {/* Step indicator */}
      {step !== "done" && (
        <div style={{ display: "flex", alignItems: "center", marginBottom: "1.5rem" }}>
          {stepLabels.map((label, i) => {
            const active = step === stepKeys[i];
            const done = (step === "chat" && i === 0) || (step === "review" && i <= 1);
            return (
              <div key={i} style={{ display: "flex", alignItems: "center", flex: i < 2 ? 1 : "none" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <div style={{
                    width: 22, height: 22, borderRadius: "50%",
                    background: done || active ? BLUE : "#e0dcd4",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    fontSize: 11, color: done || active ? "white" : GREY, fontWeight: 600, flexShrink: 0
                  }}>{done ? "✓" : i + 1}</div>
                  <span style={{ fontSize: 12, color: active ? BLUE : GREY, fontWeight: active ? 600 : 400, whiteSpace: "nowrap" }}>{label}</span>
                </div>
                {i < 2 && <div style={{ flex: 1, height: 1, background: "#e0dcd4", margin: "0 8px" }} />}
              </div>
            );
          })}
        </div>
      )}

      {/* Step 1: JTBD */}
      {step === "jtbd" && (
        <div>
          <p style={{ fontSize: 13, color: GREY, marginBottom: "1rem" }}>Select the option that best describes your need:</p>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))", gap: 10 }}>
            {JTBD_OPTIONS.map(opt => (
              <button key={opt.id} onClick={() => selectJtbd(opt.id)} style={{
                background: GOLD, border: `1px solid #d8d3c8`,
                borderRadius: 8, padding: "1rem", cursor: "pointer",
                textAlign: "left", transition: "border-color 0.15s", outline: "none"
              }}
              onMouseEnter={e => e.currentTarget.style.borderColor = BLUE}
              onMouseLeave={e => e.currentTarget.style.borderColor = "#d8d3c8"}>
                <span style={{ fontSize: 20, display: "block", marginBottom: 8 }}>{opt.icon}</span>
                <span style={{ fontSize: 13, fontWeight: 600, color: BLUE, display: "block", marginBottom: 4 }}>{opt.label}</span>
                <span style={{ fontSize: 12, color: DARK_BLUE, opacity: 0.7, lineHeight: 1.4 }}>{opt.desc}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Step 2: Chat */}
      {(step === "chat" || step === "review") && (
        <div>
          <div style={{
            background: GOLD, border: `1px solid #d8d3c8`, borderRadius: 8,
            padding: "1rem", maxHeight: 360, overflowY: "auto", marginBottom: 12,
            display: "flex", flexDirection: "column", gap: 10
          }}>
            {messages.map((m, i) => (
              <div key={i} style={{
                alignSelf: m.role === "user" ? "flex-end" : "flex-start",
                maxWidth: "85%",
                background: m.role === "user" ? BLUE : "white",
                color: m.role === "user" ? "white" : DARK_BLUE,
                padding: "10px 14px", borderRadius: 10,
                borderBottomRightRadius: m.role === "user" ? 3 : 10,
                borderBottomLeftRadius: m.role === "assistant" ? 3 : 10,
                fontSize: 14, lineHeight: 1.6,
                border: m.role === "assistant" ? `1px solid #d8d3c8` : "none"
              }}>
                {m.content.split("\n").map((line, j, arr) => (
                  <span key={j}>{line}{j < arr.length - 1 && <br />}</span>
                ))}
              </div>
            ))}
            {loading && (
              <div style={{
                alignSelf: "flex-start", background: "white", border: `1px solid #d8d3c8`,
                borderRadius: 10, borderBottomLeftRadius: 3, padding: "10px 14px",
                fontSize: 14, color: GREY
              }}>Thinking…</div>
            )}
            <div ref={chatEndRef} />
          </div>

          {step === "chat" && (
            <div style={{ display: "flex", gap: 8 }}>
              <textarea
                value={inputText}
                onChange={e => setInputText(e.target.value)}
                onKeyDown={handleKey}
                placeholder="Write here, or paste an email directly..."
                style={{
                  flex: 1, resize: "none", fontSize: 14, padding: "10px 12px",
                  borderRadius: 6, border: `1px solid #d8d3c8`, minHeight: 64,
                  fontFamily: "inherit", background: "#ffffff", color: DARK_BLUE,
                  outline: "none"
                }}
              />
              <button onClick={sendMessage} disabled={loading || !inputText.trim()} style={{
                background: loading || !inputText.trim() ? "#ccc" : BLUE,
                color: "white", border: "none", borderRadius: 6,
                padding: "0 18px", cursor: loading || !inputText.trim() ? "default" : "pointer",
                fontSize: 14, alignSelf: "flex-end", height: 40, fontFamily: "inherit"
              }}>Send →</button>
            </div>
          )}
        </div>
      )}

      {/* Step 3: Review */}
      {step === "review" && brief && (
        <div style={{ marginTop: "1.5rem" }}>
          <div style={{ borderTop: `2px solid ${BLUE}`, paddingTop: "1.5rem", marginBottom: "1rem" }}>
            <p style={{ fontSize: 11, color: GREY, margin: "0 0 1rem", textTransform: "uppercase", letterSpacing: "0.06em" }}>Brief summary</p>
            {[
              ["What do you need?", JTBD_OPTIONS.find(j => j.id === selectedJtbd)?.label],
              ["Customer / account", brief.account],
              ["Categories", brief.categories],
              ["Region", brief.region],
              ["Deadline", brief.deadline],
              ["Purpose", brief.purpose],
              ["Focus areas", brief.challenges],
              ["Product launch history", brief.gnpd_history_window],
              ["Requested by", [brief.requester_name, brief.requester_email].filter(Boolean).join(" — ")],
              ["Notes", brief.notes]
            ].filter(r => r[1]).map(([label, value]) => (
              <div key={label} style={{ display: "flex", gap: 12, marginBottom: 10, fontSize: 14 }}>
                <span style={{ color: GREY, minWidth: 150, flexShrink: 0 }}>{label}</span>
                <span style={{ color: DARK_BLUE, fontWeight: 600 }}>{value}</span>
              </div>
            ))}
          </div>

          {brief.external_data_needed && (
            <div style={{
              background: "#FEF6EC", border: `1px solid ${ORANGE}`,
              borderLeft: `4px solid ${ORANGE}`,
              borderRadius: 6, padding: "12px 14px", marginBottom: 10, fontSize: 13
            }}>
              <p style={{ fontWeight: 600, color: ORANGE, margin: "0 0 4px" }}>External data likely needed</p>
              <p style={{ color: DARK_BLUE, margin: 0 }}>{brief.external_data_needed}</p>
            </div>
          )}

          {isTightDeadline && (
            <div style={{
              background: "#FEF6EC", border: `1px solid ${ORANGE}`,
              borderLeft: `4px solid ${ORANGE}`,
              borderRadius: 6, padding: "12px 14px", marginBottom: 10, fontSize: 13
            }}>
              <p style={{ fontWeight: 600, color: ORANGE, margin: "0 0 4px" }}>Tight deadline flagged</p>
              <p style={{ color: DARK_BLUE, margin: 0 }}>The requested deadline ({brief.deadline}) is under 2 weeks. Minimum lead time is 2–3 weeks.</p>
            </div>
          )}

          <button onClick={submitBrief} disabled={loading} style={{
            background: loading ? "#ccc" : TEAL,
            color: "white", border: "none", borderRadius: 6,
            padding: "12px 24px", cursor: loading ? "default" : "pointer",
            fontSize: 14, fontWeight: 600, marginTop: 8, fontFamily: "inherit"
          }}>
            {loading ? "Submitting…" : "Submit brief →"}
          </button>
        </div>
      )}

      {/* Done */}
      {step === "done" && (
        <div style={{
          background: GOLD, border: `1px solid #d8d3c8`,
          borderLeft: `4px solid ${TEAL}`,
          borderRadius: 8, padding: "1.5rem", marginTop: "1rem"
        }}>
          <p style={{ fontSize: 16, fontWeight: 600, color: TEAL, margin: "0 0 8px" }}>✓ Brief submitted</p>
          <p style={{ fontSize: 14, color: DARK_BLUE, margin: "0 0 10px" }}>
            Brief for <strong>{brief?.account || "your request"}</strong> has been received.
          </p>
          <p style={{ fontSize: 13, color: DARK_BLUE, margin: 0, lineHeight: 1.6 }}>
            The team will review the brief, identify any external data that needs to be procured (e.g. from Mintel), and confirm the timeline with you before work begins. You'll hear back within 1–2 business days.
          </p>
        </div>
      )}

      <div style={{ marginTop: 40, fontSize: 12, color: GREY, textAlign: "center" }}>
        Palsgaard A/S · Market Intelligence · Internal use only
      </div>
    </div>
  );
}