import { useState } from "react";

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

const SYSTEM_PARCEL = `You are an expert real estate and land research analyst. When given a parcel address, provide a thorough research summary as if you've analyzed all available public data. Respond ONLY with valid JSON using this exact schema:

{
  "address": "cleaned full address",
  "parcel_summary": "2-3 sentence plain English overview of this parcel and its potential",
  "zoning": {
    "classification": "e.g. R-1, C-2, A-1, etc.",
    "description": "what this zoning allows",
    "notes": "any relevant zoning notes or overlays"
  },
  "land_details": {
    "estimated_acreage": "estimate if known",
    "topography": "flat, sloped, wooded, etc. based on typical conditions for the area",
    "utilities": "typical utility availability for area",
    "road_frontage": "assessment"
  },
  "flood_zone": {
    "status": "Low Risk" | "Moderate Risk" | "High Risk" | "Unknown",
    "zone_code": "e.g. Zone X, Zone AE, etc.",
    "notes": "any relevant flood notes"
  },
  "market_data": {
    "estimated_land_value": "dollar range estimate",
    "price_per_acre": "estimate",
    "recent_area_sales": ["brief description of comparable land sales in the area"],
    "market_trend": "Appreciating" | "Stable" | "Declining",
    "trend_notes": "why the market is moving this direction"
  },
  "development_potential": {
    "score": number between 1 and 10,
    "verdict": "High Potential" | "Moderate Potential" | "Low Potential",
    "best_uses": ["use 1", "use 2", "use 3"],
    "permitting_complexity": "Low" | "Medium" | "High",
    "notes": "key development considerations"
  },
  "growth_signals": ["signal 1", "signal 2", "signal 3"],
  "red_flags": ["flag 1", "flag 2"],
  "acquisition_notes": "2-3 sentences with specific actionable advice for an investor looking to acquire this parcel",
  "data_confidence": "High" | "Medium" | "Low",
  "confidence_note": "brief note on data reliability"
}

Be specific and useful. Use real knowledge about the area, typical zoning patterns, and market conditions. If the address is in Tennessee, apply specific Tennessee market knowledge. Return ONLY valid JSON.`;

const statusColor = {
  "Low Risk": "#52c77a",
  "Moderate Risk": "#C8A84B",
  "High Risk": "#c75252",
  "Unknown": "#6b7a6e",
  "Appreciating": "#52c77a",
  "Stable": "#C8A84B",
  "Declining": "#c75252",
  "High Potential": "#52c77a",
  "Moderate Potential": "#C8A84B",
  "Low Potential": "#c75252",
};

function Badge({ label, value, color }) {
  return (
    <div style={{ display: "inline-flex", alignItems: "center", gap: 6, background: `${color}15`, border: `1px solid ${color}40`, borderRadius: 2, padding: "3px 10px" }}>
      {label && <span style={{ fontSize: 10, color: "#6b7a6e", fontFamily: "'IBM Plex Mono',monospace", letterSpacing: 1 }}>{label}</span>}
      <span style={{ fontSize: 12, fontWeight: 700, color, fontFamily: "'Syne',sans-serif" }}>{value}</span>
    </div>
  );
}

function Section({ title, children }) {
  return (
    <div style={{ background: "#141c15", border: "1px solid #1e2d20", borderRadius: 2, padding: 20 }}>
      <div style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: 10, letterSpacing: 2, color: "#C8A84B", textTransform: "uppercase", marginBottom: 14, paddingBottom: 10, borderBottom: "1px solid #1e2d20" }}>
        {title}
      </div>
      {children}
    </div>
  );
}

function InfoRow({ label, value, mono }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", padding: "8px 0", borderBottom: "1px solid #1a221b" }}>
      <span style={{ fontSize: 11, color: "#6b7a6e", fontFamily: "'IBM Plex Mono',monospace", letterSpacing: 1, textTransform: "uppercase", flexShrink: 0, marginRight: 12, paddingTop: 1 }}>{label}</span>
      <span style={{ fontSize: 13, color: "#e8e4d8", textAlign: "right", fontFamily: mono ? "'IBM Plex Mono',monospace" : "'DM Sans',sans-serif", fontWeight: mono ? 500 : 400 }}>{value || "—"}</span>
    </div>
  );
}

function BulletList({ items, color = "#C8A84B" }) {
  if (!items?.length) return <span style={{ fontSize: 13, color: "#6b7a6e", fontStyle: "italic" }}>None identified</span>;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {items.map((item, i) => (
        <div key={i} style={{ display: "flex", gap: 10, fontSize: 13, color: "#e8e4d8", lineHeight: 1.5 }}>
          <div style={{ width: 5, height: 5, borderRadius: "50%", background: color, marginTop: 7, flexShrink: 0 }} />
          {item}
        </div>
      ))}
    </div>
  );
}

export default function ParcelResearch() {
  const [address, setAddress] = useState("");
  const [notes, setNotes] = useState("");
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  async function research() {
    if (!address.trim()) { setError("Please enter a parcel address."); return; }
    setError(null); setLoading(true); setResult(null);

    const prompt = `Research this parcel for a real estate investor:\nAddress: ${address}\nAdditional context: ${notes || "None provided"}\n\nProvide a comprehensive analysis.`;

    try {
      const data = await callClaude({
        model: "claude-sonnet-4-20250514",
        max_tokens: 2000,
        system: SYSTEM_PARCEL,
        messages: [{ role: "user", content: prompt }],
      });
      const raw = data.content?.[0]?.text || "{}";
      setResult(JSON.parse(raw.replace(/```json|```/g, "").trim()));
    } catch (e) {
      setError("Research failed — " + e.message);
    }
    setLoading(false);
  }

  const devScore = result?.development_potential?.score;
  const devColor = devScore >= 7 ? "#52c77a" : devScore >= 4 ? "#C8A84B" : "#c75252";

  const inputStyle = {
    background: "#141c15",
    border: "1px solid #1e2d20",
    color: "#e8e4d8",
    padding: "11px 14px",
    borderRadius: 2,
    fontFamily: "'DM Sans',sans-serif",
    fontSize: 14,
    outline: "none",
    width: "100%",
    transition: "border-color 0.2s",
  };

  return (
    <div style={{ display: "grid", gridTemplateColumns: "360px 1fr", height: "calc(100vh - 160px)" }}>

      {/* ── Input Panel ── */}
      <div style={{ borderRight: "1px solid #1e2d20", padding: 28, overflowY: "auto", background: "#0f1510", display: "flex", flexDirection: "column", gap: 20 }}>
        <div>
          <div style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: 10, letterSpacing: 2, color: "#C8A84B", textTransform: "uppercase", paddingBottom: 10, borderBottom: "1px solid #1e2d20", marginBottom: 18 }}>
            Parcel Lookup
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <div>
              <label style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: 10, letterSpacing: 1.5, color: "#6b7a6e", textTransform: "uppercase", display: "block", marginBottom: 6 }}>
                Parcel Address or Location
              </label>
              <input
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && research()}
                placeholder="123 Oak Ridge Hwy, Knoxville, TN"
                style={inputStyle}
              />
            </div>

            <div>
              <label style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: 10, letterSpacing: 1.5, color: "#6b7a6e", textTransform: "uppercase", display: "block", marginBottom: 6 }}>
                Additional Context <span style={{ color: "#3a4a3c" }}>(optional)</span>
              </label>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="e.g. 2.5 acres, owner says agricultural, adjacent to new subdivision..."
                style={{ ...inputStyle, resize: "vertical", minHeight: 80, lineHeight: 1.55 }}
              />
            </div>
          </div>
        </div>

        {error && (
          <div style={{ fontSize: 12, color: "#c75252", fontFamily: "'IBM Plex Mono',monospace", padding: "10px 12px", background: "rgba(199,82,82,0.06)", border: "1px solid rgba(199,82,82,0.2)", borderRadius: 2 }}>
            {error}
          </div>
        )}

        <button
          onClick={research}
          disabled={loading}
          style={{ background: "#C8A84B", color: "#080c0a", border: "none", padding: "13px 20px", borderRadius: 2, fontFamily: "'Syne',sans-serif", fontWeight: 700, fontSize: 14, cursor: loading ? "not-allowed" : "pointer", opacity: loading ? 0.5 : 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}
        >
          {loading ? "Researching…" : "🔎 Research This Parcel"}
        </button>

        {/* What this tool covers */}
        <div style={{ background: "#141c15", border: "1px solid #1e2d20", borderRadius: 2, padding: 16 }}>
          <div style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: 9, letterSpacing: 1.5, color: "#6b7a6e", textTransform: "uppercase", marginBottom: 12 }}>What You Get</div>
          {["Zoning classification & allowed uses", "Flood zone status", "Estimated land value & comps", "Development potential score", "Growth signals & market trend", "Acquisition notes & red flags"].map((item, i) => (
            <div key={i} style={{ display: "flex", gap: 8, fontSize: 12, color: "#6b7a6e", padding: "5px 0", borderBottom: i < 5 ? "1px solid #1a221b" : "none" }}>
              <span style={{ color: "#C8A84B" }}>→</span> {item}
            </div>
          ))}
        </div>

        <div style={{ fontSize: 11, color: "#3a4a3c", fontFamily: "'IBM Plex Mono',monospace", lineHeight: 1.6, letterSpacing: 0.3 }}>
          AI-synthesized research. Verify zoning and flood data with county records before closing.
        </div>
      </div>

      {/* ── Results Panel ── */}
      <div style={{ padding: 28, overflowY: "auto", display: "flex", flexDirection: "column", gap: 20 }}>

        {/* Loading */}
        {loading && (
          <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 16 }}>
            <div style={{ width: 34, height: 34, border: "2px solid #1e2d20", borderTopColor: "#C8A84B", borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />
            <div style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: 11, letterSpacing: 2, color: "#6b7a6e", textTransform: "uppercase", textAlign: "center" }}>
              Pulling parcel data…
            </div>
          </div>
        )}

        {/* Empty state */}
        {!loading && !result && (
          <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 12, opacity: 0.3 }}>
            <div style={{ fontSize: 48 }}>🌿</div>
            <div style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: 12, letterSpacing: 2, color: "#6b7a6e", textAlign: "center" }}>
              Enter a parcel address<br />to run research
            </div>
          </div>
        )}

        {/* Results */}
        {result && !loading && (
          <>
            {/* Header */}
            <div style={{ background: "#0f1510", border: "1px solid #1e2d20", borderRadius: 2, padding: "18px 22px", display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16 }}>
              <div>
                <div style={{ fontFamily: "'Syne',sans-serif", fontWeight: 700, fontSize: 17, color: "#f0ede5", marginBottom: 6 }}>{result.address}</div>
                <div style={{ fontSize: 13, color: "#8a8477", lineHeight: 1.65, maxWidth: 560 }}>{result.parcel_summary}</div>
              </div>
              <div style={{ flexShrink: 0, display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
                <div style={{ width: 72, height: 72, borderRadius: "50%", border: `2px solid ${devColor}`, background: "#141c15", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
                  <span style={{ fontFamily: "'Syne',sans-serif", fontWeight: 800, fontSize: 26, color: devColor, lineHeight: 1 }}>{devScore ?? "–"}</span>
                  <span style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: 8, color: "#6b7a6e", letterSpacing: 1 }}>/10</span>
                </div>
                <div style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: 9, letterSpacing: 1, color: devColor, textTransform: "uppercase", textAlign: "center" }}>Dev Score</div>
              </div>
            </div>

            {/* Two-column grid */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>

              {/* Zoning */}
              <Section title="Zoning">
                <div style={{ marginBottom: 10 }}>
                  <Badge value={result.zoning?.classification} color="#C8A84B" />
                </div>
                <InfoRow label="Allows" value={result.zoning?.description} />
                {result.zoning?.notes && <InfoRow label="Notes" value={result.zoning?.notes} />}
              </Section>

              {/* Flood Zone */}
              <Section title="Flood Zone">
                <div style={{ marginBottom: 10 }}>
                  <Badge value={result.flood_zone?.status} color={statusColor[result.flood_zone?.status] || "#6b7a6e"} />
                  {result.flood_zone?.zone_code && <Badge value={result.flood_zone?.zone_code} color="#6b7a6e" />}
                </div>
                {result.flood_zone?.notes && (
                  <div style={{ fontSize: 13, color: "#8a8477", lineHeight: 1.6 }}>{result.flood_zone.notes}</div>
                )}
              </Section>

              {/* Land Details */}
              <Section title="Land Details">
                <InfoRow label="Est. Acreage" value={result.land_details?.estimated_acreage} mono />
                <InfoRow label="Topography" value={result.land_details?.topography} />
                <InfoRow label="Utilities" value={result.land_details?.utilities} />
                <InfoRow label="Road Frontage" value={result.land_details?.road_frontage} />
              </Section>

              {/* Market Data */}
              <Section title="Market Data">
                <div style={{ display: "flex", gap: 6, marginBottom: 12, flexWrap: "wrap" }}>
                  <Badge label="Trend" value={result.market_data?.market_trend} color={statusColor[result.market_data?.market_trend] || "#C8A84B"} />
                </div>
                <InfoRow label="Est. Land Value" value={result.market_data?.estimated_land_value} mono />
                <InfoRow label="Per Acre" value={result.market_data?.price_per_acre} mono />
                {result.market_data?.trend_notes && (
                  <div style={{ fontSize: 12, color: "#6b7a6e", marginTop: 10, lineHeight: 1.6, fontStyle: "italic" }}>{result.market_data.trend_notes}</div>
                )}
              </Section>
            </div>

            {/* Area Comps */}
            {result.market_data?.recent_area_sales?.length > 0 && (
              <Section title="Comparable Area Sales">
                <BulletList items={result.market_data.recent_area_sales} color="#C8A84B" />
              </Section>
            )}

            {/* Development Potential */}
            <Section title="Development Potential">
              <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 14, flexWrap: "wrap" }}>
                <Badge value={result.development_potential?.verdict} color={statusColor[result.development_potential?.verdict] || "#C8A84B"} />
                <Badge label="Permitting" value={result.development_potential?.permitting_complexity} color={result.development_potential?.permitting_complexity === "Low" ? "#52c77a" : result.development_potential?.permitting_complexity === "Medium" ? "#C8A84B" : "#c75252"} />
              </div>
              <div style={{ marginBottom: 14 }}>
                <div style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: 9, letterSpacing: 1.5, color: "#6b7a6e", textTransform: "uppercase", marginBottom: 8 }}>Best Uses</div>
                <BulletList items={result.development_potential?.best_uses} color="#52c77a" />
              </div>
              {result.development_potential?.notes && (
                <div style={{ fontSize: 13, color: "#8a8477", lineHeight: 1.65, marginTop: 10, paddingTop: 10, borderTop: "1px solid #1e2d20" }}>{result.development_potential.notes}</div>
              )}
            </Section>

            {/* Two column — Growth Signals + Red Flags */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
              <Section title="Growth Signals">
                <BulletList items={result.growth_signals} color="#52c77a" />
              </Section>
              <Section title="Red Flags">
                <BulletList items={result.red_flags} color="#c75252" />
              </Section>
            </div>

            {/* Acquisition Notes */}
            <Section title="Acquisition Notes">
              <div style={{ fontSize: 14, color: "#e8e4d8", lineHeight: 1.75 }}>{result.acquisition_notes}</div>
            </Section>

            {/* Confidence */}
            <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 14px", background: "#0f1510", border: "1px solid #1a221b", borderRadius: 2 }}>
              <Badge label="Data Confidence" value={result.data_confidence} color={result.data_confidence === "High" ? "#52c77a" : result.data_confidence === "Medium" ? "#C8A84B" : "#c75252"} />
              <span style={{ fontSize: 12, color: "#6b7a6e", fontFamily: "'IBM Plex Mono',monospace" }}>{result.confidence_note}</span>
            </div>
          </>
        )}
      </div>

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
