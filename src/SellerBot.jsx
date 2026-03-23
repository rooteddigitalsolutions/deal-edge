import { useState, useRef, useEffect } from "react";

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

const SYSTEM_BOT = `You are a professional acquisitions assistant for a real estate investment and development company. Your job is to qualify property sellers in a warm, conversational, efficient way.

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

export default function SellerBot() {
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
      setHistory([{ role: "assistant", content: reply }]);
      setMessages([{ role: "bot", text: cleanReply(reply) }]);
    } catch {
      setMessages([{ role: "bot", text: "Hey! What's the address of the property you're looking to sell?" }]);
    }
    setLoading(false);
  }

  function cleanReply(text) {
    return text.replace(/\{[\s\S]*?"collected"[\s\S]*?\}/g, "").replace(/SCORE:.*$/im, "").trim();
  }

  function extractLead(text) {
    const match = text.match(/\{[\s\S]*?"collected"[\s\S]*?\}/);
    if (match) {
      try { const d = JSON.parse(match[0]); if (d.collected) setLead(d); } catch (_) {}
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
    if (textareaRef.current) textareaRef.current.style.height = "auto";
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
    } catch {
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
  const scoreLabel = score === null ? "Awaiting Data" : score >= 8 ? "🔥 HOT LEAD" : score >= 5 ? "⚡ WARM LEAD" : "❄️ COLD LEAD";

  const s = {
    mono: { fontFamily: "'IBM Plex Mono',monospace" },
    display: { fontFamily: "'Syne',sans-serif" },
  };

  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 340px", height: "calc(100vh - 113px)" }}>
      {/* Chat */}
      <div style={{ display: "flex", flexDirection: "column", borderRight: "1px solid rgba(192,122,34,0.1)" }}>
        <div style={{ padding: "16px 28px", borderBottom: "1px solid rgba(192,122,34,0.1)", display: "flex", alignItems: "center", gap: 12, background: "rgba(12,16,21,0.6)" }}>
          <div style={{ width: 34, height: 34, background: "rgba(192,122,34,0.12)", border: "1px solid rgba(192,122,34,0.2)", borderRadius: 4, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16 }}>🏡</div>
          <div>
            <div style={{ ...s.display, fontWeight: 700, fontSize: 13, color: "#f0ede5" }}>Seller Intake Bot</div>
            <div style={{ fontSize: 11, color: "#52c77a", display: "flex", alignItems: "center", gap: 5 }}>
              <span style={{ width: 5, height: 5, borderRadius: "50%", background: "#52c77a", display: "inline-block" }} />
              Online · Pre-qualifying sellers
            </div>
          </div>
        </div>

        <div style={{ flex: 1, overflowY: "auto", padding: "22px 28px", display: "flex", flexDirection: "column", gap: 12, scrollbarWidth: "thin" }}>
          {messages.map((m, i) => (
            <div key={i} style={{ display: "flex", gap: 10, flexDirection: m.role === "user" ? "row-reverse" : "row" }}>
              <div style={{ width: 26, height: 26, borderRadius: 3, background: m.role === "bot" ? "rgba(192,122,34,0.1)" : "rgba(61,122,82,0.15)", border: `1px solid ${m.role === "bot" ? "rgba(192,122,34,0.18)" : "rgba(61,122,82,0.25)"}`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, flexShrink: 0, marginTop: 2 }}>
                {m.role === "bot" ? "🏡" : "👤"}
              </div>
              <div style={{ maxWidth: "72%", padding: "10px 14px", borderRadius: 2, fontSize: 14, lineHeight: 1.65, background: m.role === "bot" ? "rgba(255,255,255,0.03)" : "rgba(61,122,82,0.08)", border: `1px solid ${m.role === "bot" ? "rgba(192,122,34,0.08)" : "rgba(61,122,82,0.18)"}`, color: "#c8c4b8", borderBottomLeftRadius: m.role === "bot" ? 0 : 2, borderBottomRightRadius: m.role === "user" ? 0 : 2 }}>
                {m.text}
              </div>
            </div>
          ))}
          {loading && (
            <div style={{ display: "flex", gap: 10 }}>
              <div style={{ width: 26, height: 26, borderRadius: 3, background: "rgba(192,122,34,0.1)", border: "1px solid rgba(192,122,34,0.18)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12 }}>🏡</div>
              <div style={{ padding: "12px 14px", background: "rgba(255,255,255,0.03)", border: "1px solid rgba(192,122,34,0.08)", borderRadius: "2px 2px 2px 0", display: "flex", gap: 4, alignItems: "center" }}>
                {[0, 0.2, 0.4].map((d, i) => <div key={i} style={{ width: 5, height: 5, borderRadius: "50%", background: "#8a8477", animation: `bounce 1.2s ${d}s infinite` }} />)}
              </div>
            </div>
          )}
          <div ref={bottomRef} />
        </div>

        <div style={{ padding: "14px 28px", borderTop: "1px solid rgba(192,122,34,0.1)", display: "flex", gap: 10, alignItems: "flex-end" }}>
          <textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => { setInput(e.target.value); e.target.style.height = "auto"; e.target.style.height = Math.min(e.target.scrollHeight, 120) + "px"; }}
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }}
            placeholder="Type your response..."
            rows={1}
            style={{ flex: 1, background: "rgba(255,255,255,0.03)", border: "1px solid rgba(192,122,34,0.12)", color: "#c8c4b8", padding: "10px 14px", borderRadius: 2, fontFamily: "'DM Sans',sans-serif", fontSize: 14, outline: "none", resize: "none", minHeight: 42, lineHeight: 1.5 }}
          />
          <button onClick={send} disabled={loading || !input.trim()} style={{ background: "#c07a22", color: "#0c1015", border: "none", padding: "10px 16px", borderRadius: 2, fontFamily: "'DM Sans',sans-serif", fontWeight: 700, fontSize: 13, cursor: "pointer", height: 42, opacity: loading || !input.trim() ? 0.4 : 1 }}>
            Send ↑
          </button>
        </div>
      </div>

      {/* Lead Panel */}
      <div style={{ padding: 20, overflowY: "auto", background: "rgba(255,255,255,0.01)", display: "flex", flexDirection: "column", gap: 14 }}>
        <div style={{ ...s.mono, fontSize: 10, letterSpacing: 2, color: "#c07a22", textTransform: "uppercase", paddingBottom: 10, borderBottom: "1px solid rgba(192,122,34,0.1)" }}>Lead Intelligence</div>

        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", padding: "14px 0" }}>
          <div style={{ width: 88, height: 88, borderRadius: "50%", border: `2px solid ${scoreColor}`, background: "rgba(255,255,255,0.02)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", transition: "border-color 0.5s" }}>
            <span style={{ ...s.display, fontWeight: 800, fontSize: 28, color: scoreColor, lineHeight: 1, transition: "color 0.5s" }}>{score ?? "–"}</span>
            <span style={{ ...s.mono, fontSize: 9, color: "#6b7a6e", letterSpacing: 1 }}>/ 10</span>
          </div>
          <div style={{ marginTop: 8, ...s.display, fontWeight: 700, fontSize: 12, letterSpacing: 1, textTransform: "uppercase", color: scoreColor, transition: "color 0.5s" }}>{scoreLabel}</div>
        </div>

        {[["address", "Property Address"], ["condition", "Condition"], ["price", "Asking Price"], ["timeline", "Timeline"]].map(([key, label]) => (
          <div key={key} style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(192,122,34,0.08)", borderRadius: 2, padding: "9px 12px" }}>
            <div style={{ ...s.mono, fontSize: 9, letterSpacing: 1.5, color: "#6b7a6e", textTransform: "uppercase", marginBottom: 3 }}>{label}</div>
            <div style={{ fontSize: 13, color: lead[key] ? "#c8c4b8" : "#4a5a4c", fontStyle: lead[key] ? "normal" : "italic" }}>{lead[key] || "Not yet collected"}</div>
          </div>
        ))}

        {summary && (
          <div style={{ background: "rgba(192,122,34,0.05)", border: "1px solid rgba(192,122,34,0.15)", borderRadius: 2, padding: 12 }}>
            <div style={{ ...s.mono, fontSize: 9, letterSpacing: 1.5, color: "#c07a22", textTransform: "uppercase", marginBottom: 6 }}>Lead Summary</div>
            <div style={{ fontSize: 13, color: "#c8c4b8", lineHeight: 1.7 }}>{summary}</div>
          </div>
        )}

        <button onClick={reset} style={{ background: "transparent", border: "1px solid rgba(192,122,34,0.1)", color: "#6b7a6e", padding: 8, borderRadius: 2, ...s.mono, fontSize: 10, letterSpacing: 1.5, cursor: "pointer", textTransform: "uppercase" }}>
          ↺ Reset Conversation
        </button>
      </div>

      <style>{`@keyframes bounce { 0%,80%,100%{transform:translateY(0);opacity:0.4} 40%{transform:translateY(-5px);opacity:1} }`}</style>
    </div>
  );
}
