import { useState, useRef, useEffect } from "react";

// ── Calls the deal-edge CF worker — no API key in the browser ──
async function callClaude(body) {
  const res = await fetch("/api/anthropic", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "API error");
  return data;
}

// ── SYSTEM PROMPTS ─────────────────────────────────────────────
const SYSTEM_BOT = `You are a professional acquisitions assistant for Montauk Solutions LLC, a real estate investment and development company based in Knoxville, TN. Your job is to qualify property sellers in a warm, conversational, efficient way.

Your goal: collect exactly these four data points, one at a time, in a natural conversation:
1. Property address
2. Property condition (distressed, needs work, move-in ready, vacant land, etc.)
3. Their asking price or price expectation
4. Their timeline to sell (ASAP, 30 days, flexible, etc.)

Rules:
- Be conversational and warm but efficient.
- Ask ONE question at a time. Never stack multiple questions.
- Acknowledge what they share before moving to the next question.
- After you have all four data points, end your message with this exact JSON block on its own line (no markdown):
{"collected":true,"address":"...","condition":"...","price":"...","timeline":"..."}
Then add: SCORE: X/10 | SUMMARY: two sentence summary for the acquisitions team.
- Score 8-10: motivated seller, urgent timeline, distressed property
- Score 5-7: reasonable but not urgent
- Score 1-4: low motivation, high price, not distressed

Start by greeting the seller and asking for the property address.`;

const SYSTEM_ANALYZER = `You are an expert real estate deal analyzer for Montauk Solutions LLC in Knoxville, TN. Respond ONLY with valid JSON, no markdown, no explanation outside the JSON.

Use this schema exactly:
{"verdict":"GO"|"NO-GO"|"MAYBE","verdict_reason":"one sentence","max_offer":number,"offer_range_low":number,"offer_range_high":number,"projected_net":number,"roi_percent":number,"analysis":"2-3 paragraph plain-English deal analysis","risks":["risk1","risk2","risk3"],"notes":"additional conditions or notes"}

Rules:
- Fix & Flip: Max Offer = (ARV × 0.70) − Repairs
- Buy & Hold: Max Offer = (ARV × 0.75) − Repairs
- Wholesale: Max Offer = (ARV × 0.65) − Repairs
- Land/Develop: factor in development costs and exit ARV
- BRRRR: evaluate based on rental income and refi potential
- Be direct. If it's a bad deal, say so.`;

const fmt = (n) => "$" + Math.round(n).toLocaleString();

// ── SELLER INTAKE BOT ──────────────────────────────────────────
function SellerBot() {
  const [messages, setMessages] = useState([]);
  const [history, setHistory] = useState([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [lead, setLead] = useState({ address: null, condition: null, price: null, timeline: null });
  const [score, setScore] = useState(null);
  const [summary, setSummary] = useState(null);
  const bottomRef = useRef(null);
  const textareaRef = useRef(null);

  useEffect(() => { startBot(); }, []);
  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages, loading]);

  async function startBot() {
    setLoading(true);
    try {
      const data = await callClaude({
        model: "claude-sonnet-4-20250514",
        max_tokens: 600,
        system: SYSTEM_BOT,
        messages: [{ role: "user", content: "Start the conversation." }],
      });
      const reply = data.content?.[0]?.text || "Hey! What's the address of the property you're looking to sell?";
      const cleaned = cleanReply(reply);
      setHistory([{ role: "assistant", content: reply }]);
      setMessages([{ role: "bot", text: cleaned }]);
    } catch (e) {
      setMessages([{ role: "bot", text: "Hey! What's the address of the property you're looking to sell?" }]);
    }
    setLoading(false);
  }

  function cleanReply(text) {
    return text
      .replace(/\{[\s\S]*?"collected"[\s\S]*?\}/g, "")
      .replace(/SCORE:.*$/im, "")
      .trim();
  }

  function extractLead(text) {
    const match = text.match(/\{[\s\S]*?"collected"[\s\S]*?\}/);
    if (match) {
      try {
        const d = JSON.parse(match[0]);
        if (d.collected) setLead(d);
      } catch (_) {}
    }
    const scoreMatch = text.match(/SCORE:\s*(\d+)/i);
    const summaryMatch = text.match(/SUMMARY:\s*(.+?)(?:\n|$)/is);
    if (scoreMatch) setScore(parseInt(scoreMatch[1]));
    if (summaryMatch) setSummary(summaryMatch[1].trim());
  }

  async function send() {
    const text = input.trim();
    if (!text || loading) return;
    setInput("");
    textareaRef.current.style.height = "auto";

    const newHistory = [...history, { role: "user", content: text }];
    setHistory(newHistory);
    setMessages((m) => [...m, { role: "user", text }]);
    setLoading(true);

    try {
      const data = await callClaude({
        model: "claude-sonnet-4-20250514",
        max_tokens: 800,
        system: SYSTEM_BOT,
        messages: newHistory,
      });
      const reply = data.content?.[0]?.text || "Thanks. Can you tell me more?";
      extractLead(reply);
      setHistory((h) => [...h, { role: "assistant", content: reply }]);
      setMessages((m) => [...m, { role: "bot", text: cleanReply(reply) }]);
    } catch (e) {
      setMessages((m) => [...m, { role: "bot", text: "Connection issue — please try again." }]);
    }
    setLoading(false);
  }

  function reset() {
    setMessages([]); setHistory([]); setInput("");
    setLead({ address: null, condition: null, price: null, timeline: null });
    setScore(null); setSummary(null);
    startBot();
  }

  const scoreColor = score === null ? "#6b7a6e" : score >= 8 ? "#52c77a" : score >= 5 ? "#C8A84B" : "#c75252";
  const scoreLabel = score === null ? "Awaiting" : score >= 8 ? "🔥 HOT LEAD" : score >= 5 ? "⚡ WARM LEAD" : "❄️ COLD LEAD";

  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 340px", height: "calc(100vh - 160px)" }}>
      {/* Chat */}
      <div style={{ display: "flex", flexDirection: "column", borderRight: "1px solid #1e2d20" }}>
        {/* Chat header */}
        <div style={{ padding: "18px 28px", borderBottom: "1px solid #1e2d20", display: "flex", alignItems: "center", gap: 12, background: "#0f1510" }}>
          <div style={{ width: 36, height: 36, background: "rgba(200,168,75,0.12)", border: "1px solid rgba(200,168,75,0.25)", borderRadius: 4, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18 }}>🏡</div>
          <div>
            <div style={{ fontFamily: "'Syne',sans-serif", fontWeight: 700, fontSize: 14, color: "#f0ede5" }}>Montauk Acquisitions Bot</div>
            <div style={{ fontSize: 11, color: "#52c77a", display: "flex", alignItems: "center", gap: 5 }}>
              <span style={{ width: 5, height: 5, borderRadius: "50%", background: "#52c77a", display: "inline-block" }} />
              Online · Pre-qualifying sellers
            </div>
          </div>
        </div>

        {/* Messages */}
        <div style={{ flex: 1, overflowY: "auto", padding: "24px 28px", display: "flex", flexDirection: "column", gap: 14, scrollbarWidth: "thin" }}>
          {messages.map((m, i) => (
            <div key={i} style={{ display: "flex", gap: 10, flexDirection: m.role === "user" ? "row-reverse" : "row" }}>
              <div style={{ width: 28, height: 28, borderRadius: 3, background: m.role === "bot" ? "rgba(200,168,75,0.12)" : "rgba(61,122,82,0.18)", border: `1px solid ${m.role === "bot" ? "rgba(200,168,75,0.2)" : "rgba(61,122,82,0.3)"}`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, flexShrink: 0, marginTop: 2 }}>
                {m.role === "bot" ? "🏡" : "👤"}
              </div>
              <div style={{ maxWidth: "72%", padding: "11px 15px", borderRadius: 2, fontSize: 14, lineHeight: 1.65, background: m.role === "bot" ? "#141c15" : "rgba(61,122,82,0.12)", border: `1px solid ${m.role === "bot" ? "#1e2d20" : "rgba(61,122,82,0.22)"}`, color: "#e8e4d8", borderBottomLeftRadius: m.role === "bot" ? 0 : 2, borderBottomRightRadius: m.role === "user" ? 0 : 2 }}>
                {m.text}
              </div>
            </div>
          ))}
          {loading && (
            <div style={{ display: "flex", gap: 10 }}>
              <div style={{ width: 28, height: 28, borderRadius: 3, background: "rgba(200,168,75,0.12)", border: "1px solid rgba(200,168,75,0.2)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13 }}>🏡</div>
              <div style={{ padding: "14px 16px", background: "#141c15", border: "1px solid #1e2d20", borderRadius: "2px 2px 2px 0", display: "flex", gap: 4, alignItems: "center" }}>
                {[0, 0.2, 0.4].map((d, i) => (
                  <div key={i} style={{ width: 6, height: 6, borderRadius: "50%", background: "#6b7a6e", animation: `bounce 1.2s ${d}s infinite` }} />
                ))}
              </div>
            </div>
          )}
          <div ref={bottomRef} />
        </div>

        {/* Input */}
        <div style={{ padding: "16px 28px", borderTop: "1px solid #1e2d20", display: "flex", gap: 10, alignItems: "flex-end" }}>
          <textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => { setInput(e.target.value); e.target.style.height = "auto"; e.target.style.height = Math.min(e.target.scrollHeight, 120) + "px"; }}
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }}
            placeholder="Type your response..."
            rows={1}
            style={{ flex: 1, background: "#141c15", border: "1px solid #1e2d20", color: "#e8e4d8", padding: "11px 14px", borderRadius: 2, fontFamily: "'DM Sans',sans-serif", fontSize: 14, outline: "none", resize: "none", minHeight: 44, lineHeight: 1.5 }}
          />
          <button onClick={send} disabled={loading || !input.trim()} style={{ background: "#C8A84B", color: "#080c0a", border: "none", padding: "11px 18px", borderRadius: 2, fontFamily: "'Syne',sans-serif", fontWeight: 700, fontSize: 13, cursor: "pointer", height: 44, opacity: loading || !input.trim() ? 0.4 : 1 }}>
            Send ↑
          </button>
        </div>
      </div>

      {/* Lead Panel */}
      <div style={{ padding: 20, overflowY: "auto", background: "#0f1510", display: "flex", flexDirection: "column", gap: 16 }}>
        <div style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: 10, letterSpacing: 2, color: "#C8A84B", textTransform: "uppercase", paddingBottom: 10, borderBottom: "1px solid #1e2d20" }}>Lead Intelligence</div>

        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", padding: "16px 0" }}>
          <div style={{ width: 96, height: 96, borderRadius: "50%", border: `2px solid ${scoreColor}`, background: "#141c15", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", transition: "border-color 0.5s" }}>
            <span style={{ fontFamily: "'Syne',sans-serif", fontWeight: 800, fontSize: 30, color: scoreColor, lineHeight: 1, transition: "color 0.5s" }}>{score ?? "–"}</span>
            <span style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: 9, color: "#6b7a6e", letterSpacing: 1 }}>/ 10</span>
          </div>
          <div style={{ marginTop: 10, fontFamily: "'Syne',sans-serif", fontWeight: 700, fontSize: 13, letterSpacing: 1, textTransform: "uppercase", color: scoreColor, transition: "color 0.5s" }}>{scoreLabel}</div>
        </div>

        {[["address", "Property Address"], ["condition", "Condition"], ["price", "Asking Price"], ["timeline", "Timeline"]].map(([key, label]) => (
          <div key={key} style={{ background: "#141c15", border: "1px solid #1e2d20", borderRadius: 2, padding: "10px 12px" }}>
            <div style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: 9, letterSpacing: 1.5, color: "#6b7a6e", textTransform: "uppercase", marginBottom: 4 }}>{label}</div>
            <div style={{ fontSize: 13, color: lead[key] ? "#e8e4d8" : "#6b7a6e", fontStyle: lead[key] ? "normal" : "italic" }}>{lead[key] || "Not yet collected"}</div>
          </div>
        ))}

        {summary && (
          <div style={{ background: "rgba(200,168,75,0.06)", border: "1px solid rgba(200,168,75,0.18)", borderRadius: 2, padding: 12 }}>
            <div style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: 9, letterSpacing: 1.5, color: "#C8A84B", textTransform: "uppercase", marginBottom: 6 }}>Acquisitions Summary</div>
            <div style={{ fontSize: 13, color: "#e8e4d8", lineHeight: 1.7 }}>{summary}</div>
          </div>
        )}

        <button onClick={reset} style={{ background: "transparent", border: "1px solid #1e2d20", color: "#6b7a6e", padding: 9, borderRadius: 2, fontFamily: "'IBM Plex Mono',monospace", fontSize: 10, letterSpacing: 1.5, cursor: "pointer", textTransform: "uppercase" }}>
          ↺ Reset Conversation
        </button>
      </div>

      <style>{`@keyframes bounce { 0%,80%,100%{transform:translateY(0);opacity:0.4} 40%{transform:translateY(-5px);opacity:1} }`}</style>
    </div>
  );
}

// ── DEAL ANALYZER ──────────────────────────────────────────────
function DealAnalyzer() {
  const [form, setForm] = useState({ address: "", type: "", arv: "", repairs: "", repairDesc: "", asking: "", exit: "", market: "" });
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  async function analyze() {
    if (!form.arv || !form.repairs) { setError("Please enter at least ARV and repair estimate."); return; }
    setError(null); setLoading(true); setResult(null);
    const prompt = `Analyze this real estate deal:
Address: ${form.address || "Not provided"}
Property Type: ${form.type || "Not specified"}
ARV: $${parseInt(form.arv).toLocaleString()}
Estimated Repairs: $${parseInt(form.repairs).toLocaleString()}
Repair Description: ${form.repairDesc || "Not provided"}
Seller Asking Price: ${form.asking ? "$" + parseInt(form.asking).toLocaleString() : "Not provided"}
Exit Strategy: ${form.exit || "Not specified"}
Market Notes: ${form.market || "Knoxville, TN"}`;

    try {
      const data = await callClaude({ model: "claude-sonnet-4-20250514", max_tokens: 1500, system: SYSTEM_ANALYZER, messages: [{ role: "user", content: prompt }] });
      const raw = data.content?.[0]?.text || "{}";
      setResult(JSON.parse(raw.replace(/```json|```/g, "").trim()));
    } catch (e) {
      setError("Analysis failed — " + e.message);
    }
    setLoading(false);
  }

  const inputStyle = { background: "#141c15", border: "1px solid #1e2d20", color: "#e8e4d8", padding: "10px 13px", borderRadius: 2, fontFamily: "'DM Sans',sans-serif", fontSize: 14, outline: "none", width: "100%" };
  const labelStyle = { fontFamily: "'IBM Plex Mono',monospace", fontSize: 10, letterSpacing: 1.5, color: "#6b7a6e", textTransform: "uppercase", display: "block", marginBottom: 5 };

  return (
    <div style={{ display: "grid", gridTemplateColumns: "400px 1fr", height: "calc(100vh - 160px)" }}>
      {/* Form */}
      <div style={{ borderRight: "1px solid #1e2d20", padding: 28, overflowY: "auto", background: "#0f1510", display: "flex", flexDirection: "column", gap: 18 }}>
        <div style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: 10, letterSpacing: 2, color: "#C8A84B", textTransform: "uppercase", paddingBottom: 10, borderBottom: "1px solid #1e2d20" }}>Property Details</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 13 }}>
          {[["address", "Property Address", "text", "123 Main St, Knoxville, TN"], ["arv", "Estimated ARV", "number", "250000"], ["repairs", "Estimated Repairs", "number", "45000"], ["asking", "Seller Asking Price", "number", "180000"]].map(([k, label, type, ph]) => (
            <div key={k}>
              <label style={labelStyle}>{label}</label>
              <div style={{ position: "relative" }}>
                {(k === "arv" || k === "repairs" || k === "asking") && <span style={{ position: "absolute", left: 13, top: "50%", transform: "translateY(-50%)", color: "#6b7a6e", fontFamily: "'IBM Plex Mono',monospace", fontSize: 13 }}>$</span>}
                <input type={type} value={form[k]} onChange={set(k)} placeholder={ph} style={{ ...inputStyle, paddingLeft: (k === "arv" || k === "repairs" || k === "asking") ? 24 : 13 }} />
              </div>
            </div>
          ))}
          <div>
            <label style={labelStyle}>Property Type</label>
            <select value={form.type} onChange={set("type")} style={{ ...inputStyle }}>
              <option value="">Select type</option>
              {["Single Family Residential", "Multi-Family (2–4 units)", "Land / Vacant Lot", "Commercial", "Mobile Home"].map((o) => <option key={o}>{o}</option>)}
            </select>
          </div>
          <div>
            <label style={labelStyle}>Exit Strategy</label>
            <select value={form.exit} onChange={set("exit")} style={{ ...inputStyle }}>
              <option value="">Select strategy</option>
              {["Fix & Flip", "Buy & Hold / Rental", "Wholesale", "Develop / Build", "BRRRR"].map((o) => <option key={o}>{o}</option>)}
            </select>
          </div>
          <div>
            <label style={labelStyle}>Repair Description</label>
            <textarea value={form.repairDesc} onChange={set("repairDesc")} placeholder="e.g. New roof, HVAC, cosmetic only..." style={{ ...inputStyle, resize: "vertical", minHeight: 72, lineHeight: 1.5 }} />
          </div>
          <div>
            <label style={labelStyle}>Market Notes</label>
            <textarea value={form.market} onChange={set("market")} placeholder="e.g. East Knox, near new developments..." style={{ ...inputStyle, resize: "vertical", minHeight: 60, lineHeight: 1.5 }} />
          </div>
        </div>
        {error && <div style={{ fontSize: 12, color: "#c75252", fontFamily: "'IBM Plex Mono',monospace" }}>{error}</div>}
        <button onClick={analyze} disabled={loading} style={{ background: "#C8A84B", color: "#080c0a", border: "none", padding: "13px 20px", borderRadius: 2, fontFamily: "'Syne',sans-serif", fontWeight: 700, fontSize: 14, cursor: loading ? "not-allowed" : "pointer", opacity: loading ? 0.5 : 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
          {loading ? "Analyzing…" : "⚡ Run Deal Analysis"}
        </button>
      </div>

      {/* Results */}
      <div style={{ padding: 28, overflowY: "auto", display: "flex", flexDirection: "column", gap: 20 }}>
        {loading && (
          <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 14 }}>
            <div style={{ width: 34, height: 34, border: "2px solid #1e2d20", borderTopColor: "#C8A84B", borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />
            <div style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: 11, letterSpacing: 2, color: "#6b7a6e", textTransform: "uppercase" }}>Analyzing deal…</div>
          </div>
        )}

        {!loading && !result && (
          <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 12, opacity: 0.35 }}>
            <div style={{ fontSize: 44 }}>📊</div>
            <div style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: 12, letterSpacing: 2, color: "#6b7a6e", textAlign: "center" }}>Fill in the deal details<br />and run your analysis</div>
          </div>
        )}

        {result && (() => {
          const vc = result.verdict === "GO" ? { bg: "rgba(82,199,122,0.07)", border: "rgba(82,199,122,0.35)", color: "#52c77a", icon: "✅" } : result.verdict === "NO-GO" ? { bg: "rgba(199,82,82,0.07)", border: "rgba(199,82,82,0.3)", color: "#c75252", icon: "🚫" } : { bg: "rgba(200,168,75,0.07)", border: "rgba(200,168,75,0.3)", color: "#C8A84B", icon: "⚠️" };
          const netColor = result.projected_net > 30000 ? "#52c77a" : result.projected_net > 10000 ? "#C8A84B" : "#c75252";
          return (
            <>
              {/* Verdict */}
              <div style={{ background: vc.bg, border: `2px solid ${vc.border}`, borderRadius: 2, padding: "18px 22px", display: "flex", alignItems: "center", gap: 14 }}>
                <div style={{ fontSize: 30 }}>{vc.icon}</div>
                <div>
                  <div style={{ fontFamily: "'Syne',sans-serif", fontWeight: 800, fontSize: 20, letterSpacing: 1, textTransform: "uppercase", color: vc.color }}>{result.verdict}</div>
                  <div style={{ fontSize: 13, color: "#6b7a6e", marginTop: 2 }}>{result.verdict_reason}</div>
                </div>
              </div>

              {/* Numbers */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 2 }}>
                {[["Offer Range", `${fmt(result.offer_range_low)}`, `to ${fmt(result.offer_range_high)}`, "#e8e4d8"],
                  ["Max Offer", fmt(result.max_offer), "ceiling price", "#C8A84B"],
                  ["Projected Net", fmt(result.projected_net), `${result.roi_percent?.toFixed(1)}% ROI`, netColor]].map(([label, val, sub, color]) => (
                  <div key={label} style={{ background: "#141c15", border: "1px solid #1e2d20", borderRadius: 2, padding: "16px 14px" }}>
                    <div style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: 9, letterSpacing: 1.5, color: "#6b7a6e", textTransform: "uppercase", marginBottom: 5 }}>{label}</div>
                    <div style={{ fontFamily: "'Syne',sans-serif", fontWeight: 700, fontSize: 20, color, letterSpacing: -0.5 }}>{val}</div>
                    <div style={{ fontSize: 11, color: "#6b7a6e", marginTop: 2 }}>{sub}</div>
                  </div>
                ))}
              </div>

              {/* Analysis */}
              <div style={{ background: "#141c15", border: "1px solid #1e2d20", borderRadius: 2, padding: 18 }}>
                <div style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: 10, letterSpacing: 2, color: "#C8A84B", textTransform: "uppercase", marginBottom: 12, paddingBottom: 10, borderBottom: "1px solid #1e2d20" }}>Deal Analysis</div>
                <div style={{ fontSize: 14, color: "#e8e4d8", lineHeight: 1.75, whiteSpace: "pre-line" }}>{result.analysis}</div>
              </div>

              {/* Risks */}
              {result.risks?.length > 0 && (
                <div style={{ background: "#141c15", border: "1px solid #1e2d20", borderRadius: 2, padding: 18 }}>
                  <div style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: 10, letterSpacing: 2, color: "#C8A84B", textTransform: "uppercase", marginBottom: 12, paddingBottom: 10, borderBottom: "1px solid #1e2d20" }}>Risk Factors</div>
                  {result.risks.map((r, i) => (
                    <div key={i} style={{ display: "flex", gap: 10, padding: "8px 0", borderBottom: i < result.risks.length - 1 ? "1px solid #1e2d20" : "none", fontSize: 13, color: "#e8e4d8" }}>
                      <div style={{ width: 6, height: 6, borderRadius: "50%", background: "#C8A84B", marginTop: 6, flexShrink: 0 }} />
                      {r}
                    </div>
                  ))}
                </div>
              )}

              {result.notes && (
                <div style={{ background: "#141c15", border: "1px solid #1e2d20", borderRadius: 2, padding: 18 }}>
                  <div style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: 10, letterSpacing: 2, color: "#C8A84B", textTransform: "uppercase", marginBottom: 10, paddingBottom: 10, borderBottom: "1px solid #1e2d20" }}>Notes</div>
                  <div style={{ fontSize: 14, color: "#e8e4d8", lineHeight: 1.7 }}>{result.notes}</div>
                </div>
              )}
            </>
          );
        })()}
      </div>

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

// ── MAIN EXPORT ────────────────────────────────────────────────
export default function MontaukTools() {
  const [activeTab, setActiveTab] = useState("bot");

  const tabStyle = (id) => ({
    fontFamily: "'Syne',sans-serif",
    fontSize: 13,
    fontWeight: 600,
    letterSpacing: 0.5,
    color: activeTab === id ? "#C8A84B" : "#6b7a6e",
    padding: "16px 24px",
    background: "none",
    border: "none",
    borderBottom: `2px solid ${activeTab === id ? "#C8A84B" : "transparent"}`,
    cursor: "pointer",
    marginBottom: -1,
    display: "flex",
    alignItems: "center",
    gap: 8,
  });

  return (
    <div style={{ background: "#080c0a", minHeight: "100vh", color: "#e8e4d8" }}>
      {/* Page Header */}
      <div style={{ padding: "20px 32px", borderBottom: "1px solid #1e2d20", background: "#0f1510", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div>
          <div style={{ fontFamily: "'Syne',sans-serif", fontWeight: 800, fontSize: 16, color: "#f0ede5", letterSpacing: -0.3 }}>
            MONTAUK <span style={{ color: "#C8A84B" }}>SOLUTIONS</span>
          </div>
          <div style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: 10, color: "#6b7a6e", letterSpacing: 1.5, marginTop: 2 }}>AI ACQUISITIONS TOOLS</div>
        </div>
        <div style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: 10, color: "#C8A84B", border: "1px solid rgba(200,168,75,0.3)", padding: "3px 10px", borderRadius: 2, letterSpacing: 1.5 }}>BETA</div>
      </div>

      {/* Tabs */}
      <div style={{ display: "flex", padding: "0 32px", borderBottom: "1px solid #1e2d20", background: "#0f1510" }}>
        <button style={tabStyle("bot")} onClick={() => setActiveTab("bot")}>
          <span style={{ width: 6, height: 6, borderRadius: "50%", background: "currentColor", opacity: activeTab === "bot" ? 1 : 0.4 }} />
          Seller Intake Bot
        </button>
        <button style={tabStyle("analyzer")} onClick={() => setActiveTab("analyzer")}>
          <span style={{ width: 6, height: 6, borderRadius: "50%", background: "currentColor", opacity: activeTab === "analyzer" ? 1 : 0.4 }} />
          Deal Analyzer
        </button>
      </div>

      {/* Panels */}
      {activeTab === "bot" && <SellerBot />}
      {activeTab === "analyzer" && <DealAnalyzer />}
    </div>
  );
}
