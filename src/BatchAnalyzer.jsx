import { useState } from "react";

const EXTRACT_SYSTEM = `You are a real estate data extraction assistant. The user will give you a Zillow or Redfin search results URL. Use web search to find the listings on that page.

Extract as many individual property listings as you can find from that search. Return ONLY valid JSON (no markdown, no backticks):
{
  "searchSummary": "Brief description of the search area and filters",
  "totalFound": number,
  "listings": [
    {
      "address": "Full street address",
      "city": "City",
      "state": "State",
      "zip": "Zip",
      "price": number,
      "beds": number,
      "baths": number,
      "sqft": number,
      "yearBuilt": number or null,
      "lotAcres": number or null,
      "propertyType": "Single Family|Duplex|Townhouse|Condo|Multi-Family",
      "daysOnMarket": number or null,
      "priceReductions": number or 0,
      "description": "Brief listing notes",
      "listingUrl": "Direct URL to the listing if available",
      "conditionEstimate": "turnkey|light|moderate|heavy"
    }
  ]
}

Extract every listing you can find. If you can only find a subset, note how many total were on the search page. Be accurate — do not fabricate listings.`;

const BATCH_ANALYSIS_SYSTEM = `You are an expert real estate investment analyst with deep knowledge of US markets. Analyze each property and score it as an investment.

For each property, provide a quick investment assessment considering:
- Price per sqft relative to the area
- Estimated rental income potential
- Rehab needs based on age and condition
- Neighborhood appreciation trajectory
- Cap rate potential
- Flip viability

For Knoxville TN properties, use these benchmarks:
- Rehab $/sqft: Cosmetic $8-15 | Light $20-35 | Moderate $40-65 | Heavy $75-120
- Monthly rents: 1BR $800-1,100 | 2BR $1,000-1,400 | 3BR $1,200-1,800 | 4BR $1,500-2,200
- Cap rates: 6-9%

For other markets, use your knowledge of local costs and rents.

Respond ONLY with valid JSON (no markdown, no backticks):
{
  "marketOverview": "2-3 sentence overview of this market for investors",
  "analyses": [
    {
      "address": "matching address from input",
      "price": number,
      "beds": number,
      "baths": number,
      "sqft": number,
      "investmentScore": number (1-100),
      "grade": "A|B|C|D|F",
      "estimatedMonthlyRent": number,
      "estimatedCapRate": number,
      "rehabEstimate": number,
      "rehabLevel": "cosmetic|light|moderate|heavy",
      "arvEstimate": number,
      "flipProfit": number,
      "monthlyCashFlow": number,
      "bestStrategy": "Buy & Hold|Flip|BRRRR",
      "oneLiner": "One sentence verdict",
      "riskFlags": ["string"],
      "topStrength": "Best thing about this deal"
    }
  ]
}`;

const DEEP_ANALYSIS_SYSTEM = `You are an expert real estate investment analyst. Provide a thorough investment analysis for this specific property.

IMPORTANT: Use web search to look up this property's listing to get full details — photos, description, condition notes, comparable sales, neighborhood data. Combine what you find with the data provided.

Use your knowledge of the local market for rehab costs, rents, taxes, and cap rates. For Knoxville TN, use precise local benchmarks.

Respond ONLY with valid JSON (no markdown, no backticks):
{
  "overview": { "summary": "string", "dealGrade": "A|B|C|D|F", "rationale": "string" },
  "strategies": {
    "buyAndHold": { "score": number, "grade": "A|B|C|D|F", "monthlyRent": number, "monthlyCashFlow": number, "cashOnCash": number, "capRate": number, "verdict": "string" },
    "flip": { "score": number, "grade": "A|B|C|D|F", "arv": number, "totalInvestment": number, "estimatedProfit": number, "roi": number, "holdMonths": number, "verdict": "string" },
    "brrrr": { "score": number, "grade": "A|B|C|D|F", "arvAfterRehab": number, "refinanceAmount": number, "cashLeftIn": number, "monthlyCashFlowAfterRefi": number, "infiniteReturn": boolean, "verdict": "string" }
  },
  "rehabEstimate": { "totalLow": number, "totalHigh": number, "timelineWeeks": "string", "lineItems": [{"category": "string", "estimate": number}] },
  "riskFlags": ["string"],
  "profitMaximizers": ["string"],
  "bottomLine": "string"
}`;

const fmt = n => n == null || isNaN(n) ? "$0" : "$" + Math.round(n).toLocaleString();
const fmtPct = n => n == null || isNaN(n) ? "0%" : n.toFixed(1) + "%";
const gradeColor = g => ({ A: "#4ade80", B: "#60a5fa", C: "#facc15", D: "#f97316", F: "#f87171" }[g] || "#6a6358");
const gradeBg = g => ({ A: "rgba(74,222,128,0.07)", B: "rgba(96,165,250,0.07)", C: "rgba(250,204,21,0.07)", D: "rgba(249,115,22,0.07)", F: "rgba(248,113,113,0.07)" }[g] || "rgba(138,132,119,0.05)");

export default function BatchAnalyzer() {
  const [step, setStep] = useState("url"); // url | extracting | review | analyzing | results | detail
  const [url, setUrl] = useState("");
  const [error, setError] = useState(null);
  const [listings, setListings] = useState([]);
  const [searchSummary, setSearchSummary] = useState("");
  const [analyses, setAnalyses] = useState([]);
  const [marketOverview, setMarketOverview] = useState("");
  const [statusMsg, setStatusMsg] = useState("");
  const [financing, setFinancing] = useState("conventional");
  const [downPct, setDownPct] = useState(20);
  const [rate, setRate] = useState(7.0);
  const [maxRehab, setMaxRehab] = useState("heavy");
  const [sortBy, setSortBy] = useState("score");

  // Deep dive
  const [selectedProperty, setSelectedProperty] = useState(null);
  const [deepAnalysis, setDeepAnalysis] = useState(null);
  const [deepLoading, setDeepLoading] = useState(false);

  const apiCall = async (body, retries = 3) => {
    for (let attempt = 0; attempt < retries; attempt++) {
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 120000);
        const response = await fetch("/api/anthropic", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
          signal: controller.signal,
        });
        clearTimeout(timeout);

        // Retry on rate limit
        if (response.status === 429) {
          const waitSec = Math.min(15 * (attempt + 1), 45);
          setStatusMsg(`Rate limited — waiting ${waitSec}s before retry (${attempt + 1}/${retries})...`);
          await new Promise(r => setTimeout(r, waitSec * 1000));
          continue;
        }

        if (!response.ok) {
          const errText = await response.text();
          throw new Error(`API returned ${response.status}: ${errText.slice(0, 300)}`);
        }
        const data = await response.json();
        if (data.error) throw new Error(data.error.message || JSON.stringify(data.error));
        const text = data.content?.filter(b => b.type === "text").map(b => b.text).join("") || "";
        if (!text) throw new Error("No text in response");
        const clean = text.replace(/```json|```/g, "").trim();
        const jsonMatch = clean.match(/\{[\s\S]*\}/);
        if (!jsonMatch) throw new Error("Could not parse response");
        return JSON.parse(jsonMatch[0]);
      } catch (err) {
        if (err.name === "AbortError") throw new Error("Request timed out");
        if (attempt === retries - 1) throw err;
      }
    }
    throw new Error("Failed after multiple retries");
  };

  const extractListings = async () => {
    if (!url.trim()) return;
    setStep("extracting");
    setError(null);
    setStatusMsg("Searching listing page...");
    try {
      const result = await apiCall({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 4000,
        system: EXTRACT_SYSTEM,
        messages: [{ role: "user", content: `Extract all property listings from this search results page: ${url.trim()}` }],
        tools: [{ type: "web_search_20250305", name: "web_search" }],
      });
      if (!result.listings || result.listings.length === 0) {
        throw new Error("No listings found at that URL. Try a different search link.");
      }
      setListings(result.listings);
      setSearchSummary(result.searchSummary || "");
      setStep("review");
    } catch (err) {
      setError(err.name === "AbortError" ? "Request timed out — try a smaller search." : err.message);
      setStep("url");
    }
  };

  const runBatchAnalysis = async () => {
    setStep("analyzing");
    setStatusMsg("Preparing analysis...");
    setError(null);

    // Brief pause to avoid rate limits from the extraction call
    await new Promise(r => setTimeout(r, 3000));
    setStatusMsg(`Analyzing ${listings.length} properties...`);

    try {
      const listingSummary = listings.map((l, i) =>
        `${i + 1}. ${l.address}, ${l.city}, ${l.state} ${l.zip} — $${l.price?.toLocaleString()} — ${l.beds}bd/${l.baths}ba — ${l.sqft} sqft — Built ${l.yearBuilt || "unknown"} — ${l.conditionEstimate || "unknown"} condition — ${l.description || ""}`
      ).join("\n");

      const rehabLabels = { turnkey: "Turnkey/Cosmetic only", light: "Light rehab", moderate: "Moderate rehab", heavy: "Heavy/Gut rehab" };
      const result = await apiCall({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 4000,
        system: BATCH_ANALYSIS_SYSTEM,
        messages: [{
          role: "user",
          content: `Analyze these ${listings.length} properties as investments. IMPORTANT: Return analyses in the SAME ORDER as listed below. Include the price, beds, baths, and sqft for each property in your response.\n\nInvestor financing: ${financing}, ${downPct}% down, ${rate}% rate.\nMax rehab willingness: ${rehabLabels[maxRehab] || maxRehab}. Flag any properties that need more rehab than this — they may still be good deals but note the rehab exceeds the investor's preference.\n\n${listingSummary}`
        }],
      });

      setAnalyses(result.analyses || []);
      setMarketOverview(result.marketOverview || "");
      setStep("results");
    } catch (err) {
      setError(err.message);
      setStep("review");
    }
  };

  const runDeepDive = async (property, analysis) => {
    setSelectedProperty({ ...property, ...analysis });
    setDeepAnalysis(null);
    setDeepLoading(true);
    setStep("detail");
    try {
      const result = await apiCall({
        model: "claude-sonnet-4-20250514",
        max_tokens: 4000,
        system: DEEP_ANALYSIS_SYSTEM,
        messages: [{
          role: "user",
          content: `Full investment analysis:\n\n${property.address}, ${property.city || ""}, ${property.state || ""} ${property.zip || ""}\nPrice: $${(property.price || 0).toLocaleString()} | ${property.beds || "?"}bd/${property.baths || "?"}ba | ${property.sqft || "?"} sqft\nBuilt: ${property.yearBuilt || "Unknown"} | Condition: ${property.conditionEstimate || property.rehabLevel || "Unknown"}\nLot: ${property.lotAcres ? property.lotAcres + " acres" : "Unknown"}\nDays on Market: ${property.daysOnMarket || "Unknown"}\n${property.description || ""}\n${property.listingUrl ? "Listing URL: " + property.listingUrl : ""}\n\nBatch analysis scored this ${property.investmentScore || "?"}/100 (${property.grade || "?"}) — best strategy: ${property.bestStrategy || "Unknown"}\n\nFinancing: ${financing}, ${downPct}% down, ${rate}% rate\nMax rehab willingness: ${maxRehab}`
        }],
        tools: [{ type: "web_search_20250305", name: "web_search" }],
      });
      setDeepAnalysis(result);
    } catch (err) {
      setDeepAnalysis({ error: err.message });
    }
    setDeepLoading(false);
  };

  const getSortedResults = () => {
    const merged = analyses.map((a, idx) => {
      const listing = idx < listings.length ? listings[idx] : {};
      // Combine: listing data first, then analysis data on top, with explicit fallbacks for key fields
      return {
        ...listing,
        ...a,
        price: a.price || listing.price || 0,
        beds: a.beds || listing.beds || 0,
        baths: a.baths || listing.baths || 0,
        sqft: a.sqft || listing.sqft || 0,
        city: listing.city || a.city || "",
        state: listing.state || a.state || "",
        zip: listing.zip || a.zip || "",
        yearBuilt: listing.yearBuilt || a.yearBuilt || null,
        conditionEstimate: a.rehabLevel || listing.conditionEstimate || "",
        description: listing.description || a.description || "",
        listingUrl: listing.listingUrl || "",
        lotAcres: listing.lotAcres || null,
        daysOnMarket: listing.daysOnMarket || null,
        _listingIndex: idx,
      };
    });
    if (sortBy === "score") return merged.sort((a, b) => (b.investmentScore || 0) - (a.investmentScore || 0));
    if (sortBy === "price") return merged.sort((a, b) => (a.price || 0) - (b.price || 0));
    if (sortBy === "cashflow") return merged.sort((a, b) => (b.monthlyCashFlow || 0) - (a.monthlyCashFlow || 0));
    if (sortBy === "caprate") return merged.sort((a, b) => (b.estimatedCapRate || 0) - (a.estimatedCapRate || 0));
    if (sortBy === "flip") return merged.sort((a, b) => (b.flipProfit || 0) - (a.flipProfit || 0));
    return merged;
  };

  return (
    <div style={{ minHeight: "100vh", background: "#0c1015", color: "#d8d0c4", fontFamily: "'DM Sans', sans-serif" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;600;700&family=Playfair+Display:wght@400;600;700;800;900&display=swap');
        * { box-sizing: border-box; margin: 0; padding: 0; }

        .ba-header { padding: 24px 36px; border-bottom: 1px solid rgba(232,137,12,0.1);
          background: linear-gradient(180deg, rgba(232,137,12,0.04) 0%, transparent 100%);
          display: flex; justify-content: space-between; align-items: center; }
        .ba-header h1 { font-family: 'Playfair Display', serif; font-size: 22px; font-weight: 800; color: #e8890c; }
        .ba-header .sub { font-size: 12px; color: #5a5549; margin-top: 2px; }
        .ba-body { max-width: 960px; margin: 0 auto; padding: 24px 36px 60px; }

        .ba-url-box { background: rgba(232,137,12,0.03); border: 2px dashed rgba(232,137,12,0.15);
          border-radius: 12px; padding: 32px; text-align: center; margin-bottom: 20px; transition: border-color 0.3s; }
        .ba-url-box:focus-within { border-color: rgba(232,137,12,0.4); }
        .ba-url-input { width: 100%; padding: 14px 18px; background: rgba(0,0,0,0.3);
          border: 1px solid rgba(232,137,12,0.15); border-radius: 8px; color: #e8e0d4; font-size: 15px;
          font-family: 'DM Sans', sans-serif; outline: none; margin: 16px 0; }
        .ba-url-input:focus { border-color: #e8890c; }
        .ba-url-input::placeholder { color: #3d3a35; }

        .ba-btn { display: inline-flex; align-items: center; justify-content: center; gap: 8px;
          padding: 13px 28px; border: none; border-radius: 7px; font-size: 14px; font-weight: 600;
          font-family: 'DM Sans', sans-serif; cursor: pointer; transition: all 0.2s; }
        .ba-btn-primary { background: linear-gradient(135deg, #e8890c, #c06a08); color: #fff; }
        .ba-btn-primary:hover { transform: translateY(-1px); box-shadow: 0 6px 20px rgba(232,137,12,0.25); }
        .ba-btn-primary:disabled { opacity: 0.4; cursor: not-allowed; transform: none; }
        .ba-btn-ghost { background: transparent; color: #e8890c; border: 1px solid rgba(232,137,12,0.2); }
        .ba-btn-ghost:hover { background: rgba(232,137,12,0.05); }
        .ba-btn-sm { padding: 8px 16px; font-size: 12px; }

        .ba-section { background: rgba(255,255,255,0.018); border: 1px solid rgba(232,137,12,0.08);
          border-radius: 10px; padding: 20px; margin-bottom: 16px; }
        .ba-section-title { font-family: 'Playfair Display', serif; font-size: 15px; font-weight: 600;
          color: #e8890c; margin-bottom: 14px; }

        .ba-card { background: rgba(255,255,255,0.02); border: 1px solid rgba(232,137,12,0.08);
          border-radius: 10px; padding: 20px; margin-bottom: 12px; cursor: pointer; transition: all 0.2s; }
        .ba-card:hover { border-color: rgba(232,137,12,0.25); transform: translateY(-2px); box-shadow: 0 8px 24px rgba(0,0,0,0.3); }

        .ba-metrics { display: grid; grid-template-columns: repeat(auto-fit, minmax(110px, 1fr)); gap: 10px; margin: 12px 0; }
        .ba-metric { text-align: center; padding: 10px 8px; background: rgba(232,137,12,0.03); border-radius: 6px; }
        .ba-metric .val { font-family: 'Playfair Display', serif; font-size: 17px; font-weight: 700; color: #e8890c; }
        .ba-metric .lbl { font-size: 9px; text-transform: uppercase; letter-spacing: 1px; color: #5a5549; margin-top: 2px; }

        .ba-grade { width: 52px; height: 52px; border-radius: 8px; display: flex; align-items: center; justify-content: center;
          font-family: 'Playfair Display', serif; font-size: 26px; font-weight: 900; flex-shrink: 0; }

        .ba-tag { font-size: 10px; padding: 3px 8px; border-radius: 3px; display: inline-block; margin: 2px; }
        .ba-tag-risk { background: rgba(249,115,22,0.06); color: #f97316; border: 1px solid rgba(249,115,22,0.1); }
        .ba-tag-good { background: rgba(74,222,128,0.06); color: #4ade80; border: 1px solid rgba(74,222,128,0.1); }
        .ba-tag-strategy { background: rgba(96,165,250,0.06); color: #60a5fa; border: 1px solid rgba(96,165,250,0.1); }

        .ba-sort { display: flex; gap: 6px; flex-wrap: wrap; margin-bottom: 16px; }
        .ba-sort-btn { padding: 6px 14px; border-radius: 20px; font-size: 11px; font-weight: 500;
          border: 1px solid rgba(232,137,12,0.12); color: #6a6358; cursor: pointer;
          background: transparent; font-family: 'DM Sans', sans-serif; transition: all 0.15s; }
        .ba-sort-btn:hover { border-color: rgba(232,137,12,0.3); color: #e8890c; }
        .ba-sort-btn.active { background: rgba(232,137,12,0.1); border-color: #e8890c; color: #e8890c; font-weight: 600; }

        .ba-spinner { width: 44px; height: 44px; border: 3px solid rgba(232,137,12,0.1);
          border-top-color: #e8890c; border-radius: 50%; animation: spin 0.7s linear infinite; margin: 0 auto 16px; }
        @keyframes spin { to { transform: rotate(360deg); } }

        .ba-error { padding: 12px 16px; background: rgba(248,113,113,0.06); border: 1px solid rgba(248,113,113,0.15);
          border-radius: 6px; color: #f87171; font-size: 12px; margin: 10px 0; }

        .ba-flag { display: flex; gap: 8px; padding: 8px 12px; margin-bottom: 6px; border-radius: 5px; font-size: 12px; line-height: 1.5; }
        .ba-flag.risk { background: rgba(249,115,22,0.04); color: #f97316; border: 1px solid rgba(249,115,22,0.08); }
        .ba-flag.profit { background: rgba(74,222,128,0.04); color: #4ade80; border: 1px solid rgba(74,222,128,0.08); }

        .ba-strat-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; margin-bottom: 20px; }
        .ba-strat-card { padding: 16px; border-radius: 8px; text-align: center; border: 1px solid rgba(232,137,12,0.08); }
        .ba-strat-card .name { font-size: 11px; text-transform: uppercase; letter-spacing: 1.2px; color: #5a5549; margin-bottom: 6px; }
        .ba-strat-card .grade { font-family: 'Playfair Display', serif; font-size: 32px; font-weight: 900; line-height: 1; }
        .ba-strat-card .verd { font-size: 12px; color: #8a8477; margin-top: 8px; line-height: 1.5; }

        .ba-table { width: 100%; border-collapse: collapse; font-size: 13px; }
        .ba-table th { text-align: left; padding: 7px 10px; font-size: 10px; font-weight: 700;
          text-transform: uppercase; letter-spacing: 1px; color: #5a5549; border-bottom: 1px solid rgba(232,137,12,0.1); }
        .ba-table td { padding: 9px 10px; border-bottom: 1px solid rgba(255,255,255,0.025); color: #a89e92; }

        .ba-fin-row { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 12px; }
        .ba-fin-card { padding: 10px 14px; border-radius: 6px; cursor: pointer; text-align: center;
          border: 1px solid rgba(232,137,12,0.1); background: rgba(255,255,255,0.015); transition: all 0.2s; }
        .ba-fin-card:hover { border-color: rgba(232,137,12,0.3); }
        .ba-fin-card.active { border-color: #e8890c; background: rgba(232,137,12,0.06); }
        .ba-fin-card .name { font-size: 13px; font-weight: 600; color: #d8d0c4; }
        .ba-fin-card .desc { font-size: 10px; color: #5a5549; }
        .ba-input { width: 100%; padding: 9px 12px; background: rgba(255,255,255,0.03);
          border: 1px solid rgba(232,137,12,0.12); border-radius: 5px; color: #d8d0c4; font-size: 13px;
          font-family: 'DM Sans', sans-serif; outline: none; }
        .ba-label { display: block; font-size: 10px; font-weight: 700; text-transform: uppercase;
          letter-spacing: 1.4px; color: #5a5549; margin-bottom: 5px; }

        @media (max-width: 640px) {
          .ba-body { padding: 16px; }
          .ba-fin-row { grid-template-columns: 1fr; }
          .ba-strat-grid { grid-template-columns: 1fr; }
          .ba-metrics { grid-template-columns: 1fr 1fr; }
        }
      `}</style>

      <div className="ba-header">
        <div>
          <h1>Batch Analyzer</h1>
          <div className="sub">Paste a Zillow or Redfin search link → AI analyzes every listing as an investment</div>
        </div>
        {step !== "url" && (
          <button className="ba-btn ba-btn-ghost ba-btn-sm" onClick={() => { setStep("url"); setListings([]); setAnalyses([]); setUrl(""); setError(null); }}>
            ← New Search
          </button>
        )}
      </div>

      <div className="ba-body">
        {/* STEP 1: URL */}
        {step === "url" && (
          <>
            <div className="ba-url-box">
              <div style={{ fontSize: 28, marginBottom: 4 }}>🔍</div>
              <div style={{ fontSize: 15, color: "#d8d0c4", fontWeight: 500 }}>Paste a search results link</div>
              <div style={{ fontSize: 12, color: "#5a5549", marginTop: 4 }}>Run a search on Zillow or Redfin, then copy the URL from your browser and paste it here</div>
              <input className="ba-url-input"
                placeholder="https://www.zillow.com/knoxville-tn/?searchQueryState=..."
                value={url}
                onChange={e => setUrl(e.target.value)}
                onKeyDown={e => e.key === "Enter" && extractListings()} />
              <div style={{ fontSize: 11, color: "#4a4540" }}>
                Works with <span style={{ padding: "2px 8px", background: "rgba(232,137,12,0.05)", borderRadius: 10, border: "1px solid rgba(232,137,12,0.08)", margin: "0 2px" }}>Zillow</span>
                <span style={{ padding: "2px 8px", background: "rgba(232,137,12,0.05)", borderRadius: 10, border: "1px solid rgba(232,137,12,0.08)", margin: "0 2px" }}>Redfin</span>
                <span style={{ padding: "2px 8px", background: "rgba(232,137,12,0.05)", borderRadius: 10, border: "1px solid rgba(232,137,12,0.08)", margin: "0 2px" }}>Realtor.com</span>
              </div>
            </div>
            {error && <div className="ba-error">{error}</div>}
            <button className="ba-btn ba-btn-primary" onClick={extractListings} disabled={!url.trim()}
              style={{ width: "100%", padding: 14, fontSize: 15 }}>
              ⚡ Find Listings
            </button>
          </>
        )}

        {/* EXTRACTING */}
        {step === "extracting" && (
          <div style={{ textAlign: "center", padding: 60 }}>
            <div className="ba-spinner" />
            <div style={{ color: "#8a8477", fontSize: 14 }}>{statusMsg}</div>
            <div style={{ color: "#4a4540", fontSize: 12, marginTop: 4 }}>This can take 30-60 seconds</div>
            <button className="ba-btn ba-btn-ghost ba-btn-sm" onClick={() => { setStep("url"); setError("Cancelled."); }} style={{ marginTop: 20 }}>Cancel</button>
          </div>
        )}

        {/* STEP 2: REVIEW LISTINGS + SET FINANCING */}
        {step === "review" && (
          <>
            <div style={{ marginBottom: 20 }}>
              <span style={{ fontFamily: "'Playfair Display', serif", fontSize: 22, color: "#e8890c", fontWeight: 700 }}>
                {listings.length} Listings Found
              </span>
              {searchSummary && <div style={{ fontSize: 13, color: "#5a5549", marginTop: 4 }}>{searchSummary}</div>}
            </div>

            {/* Listing preview cards */}
            <div className="ba-section">
              <div className="ba-section-title">Listings to Analyze</div>
              {listings.map((l, i) => (
                <div key={i} style={{
                  padding: "10px 14px", marginBottom: 6, borderRadius: 6,
                  background: "rgba(232,137,12,0.02)", border: "1px solid rgba(232,137,12,0.05)",
                  display: "flex", justifyContent: "space-between", alignItems: "center",
                }}>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 600, color: "#d8d0c4" }}>{l.address}</div>
                    <div style={{ fontSize: 11, color: "#5a5549" }}>
                      {l.city}, {l.state} · {l.beds}bd/{l.baths}ba · {l.sqft?.toLocaleString()} sqft
                    </div>
                  </div>
                  <div style={{ fontFamily: "'Playfair Display', serif", fontSize: 16, fontWeight: 700, color: "#e8890c" }}>
                    {fmt(l.price)}
                  </div>
                </div>
              ))}
            </div>

            {/* Rehab Scope */}
            <div className="ba-section">
              <div className="ba-section-title">Max Rehab You'll Take On</div>
              <div style={{ fontSize: 11, color: "#5a5549", marginBottom: 10 }}>
                The AI estimates each property's rehab level based on age, price vs. comps, and listing details. Properties exceeding your tolerance will be flagged.
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 8 }}>
                {[
                  { value: "turnkey", label: "Turnkey", desc: "Paint & fixtures", icon: "✦" },
                  { value: "light", label: "Light", desc: "Flooring, refresh", icon: "◈" },
                  { value: "moderate", label: "Moderate", desc: "Kitchen, bath, mechanicals", icon: "◆" },
                  { value: "heavy", label: "Heavy / Gut", desc: "Full renovation", icon: "⬥" },
                ].map(r => (
                  <div key={r.value} onClick={() => setMaxRehab(r.value)} style={{
                    padding: "12px 10px", borderRadius: 8, cursor: "pointer", textAlign: "center",
                    border: `1px solid ${maxRehab === r.value ? "#e8890c" : "rgba(232,137,12,0.1)"}`,
                    background: maxRehab === r.value ? "rgba(232,137,12,0.06)" : "rgba(255,255,255,0.015)",
                    transition: "all 0.2s",
                  }}>
                    <div style={{ fontSize: 18, marginBottom: 4 }}>{r.icon}</div>
                    <div style={{ fontSize: 12, fontWeight: 600, color: "#d8d0c4" }}>{r.label}</div>
                    <div style={{ fontSize: 10, color: "#5a5549", marginTop: 2 }}>{r.desc}</div>
                  </div>
                ))}
              </div>
            </div>

            {/* Financing */}
            <div className="ba-section">
              <div className="ba-section-title">Your Financing</div>
              <div className="ba-fin-row" style={{ marginBottom: 14 }}>
                {[
                  { value: "conventional", label: "Conventional", desc: "30yr fixed" },
                  { value: "hard_money", label: "Hard Money", desc: "12mo term" },
                  { value: "cash", label: "Cash", desc: "No financing" },
                ].map(f => (
                  <div key={f.value} className={`ba-fin-card ${financing === f.value ? "active" : ""}`}
                    onClick={() => setFinancing(f.value)}>
                    <div className="name">{f.label}</div>
                    <div className="desc">{f.desc}</div>
                  </div>
                ))}
              </div>
              {financing !== "cash" && (
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                  <div>
                    <label className="ba-label">Down Payment %</label>
                    <input className="ba-input" type="number" value={downPct} onChange={e => setDownPct(+e.target.value)} />
                  </div>
                  <div>
                    <label className="ba-label">Interest Rate %</label>
                    <input className="ba-input" type="number" step="0.1" value={rate} onChange={e => setRate(+e.target.value)} />
                  </div>
                </div>
              )}
            </div>

            {error && <div className="ba-error">{error}</div>}
            <button className="ba-btn ba-btn-primary" onClick={runBatchAnalysis}
              style={{ width: "100%", padding: 15, fontSize: 15 }}>
              ⚡ Analyze All {listings.length} Properties
            </button>
          </>
        )}

        {/* ANALYZING */}
        {step === "analyzing" && (
          <div style={{ textAlign: "center", padding: 60 }}>
            <div className="ba-spinner" />
            <div style={{ color: "#8a8477", fontSize: 14 }}>{statusMsg}</div>
            <div style={{ color: "#4a4540", fontSize: 12, marginTop: 4 }}>Scoring investment potential across all strategies</div>
          </div>
        )}

        {/* STEP 3: RANKED RESULTS */}
        {step === "results" && (
          <>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 16 }}>
              <div>
                <span style={{ fontFamily: "'Playfair Display', serif", fontSize: 22, color: "#e8890c", fontWeight: 700 }}>
                  Investment Rankings
                </span>
                <div style={{ fontSize: 12, color: "#5a5549", marginTop: 4 }}>{analyses.length} properties analyzed · Click any for deep dive</div>
              </div>
              <button className="ba-btn ba-btn-ghost ba-btn-sm" onClick={() => setStep("review")}>← Change Terms</button>
            </div>

            {marketOverview && (
              <div style={{ padding: "12px 16px", background: "rgba(232,137,12,0.03)", borderRadius: 8,
                border: "1px solid rgba(232,137,12,0.06)", marginBottom: 20, fontSize: 13, color: "#8a8477", lineHeight: 1.6 }}>
                {marketOverview}
              </div>
            )}

            {/* Sort controls */}
            <div className="ba-sort">
              <span style={{ fontSize: 11, color: "#5a5549", padding: "6px 0" }}>Sort by:</span>
              {[
                { id: "score", label: "Investment Score" },
                { id: "price", label: "Price ↑" },
                { id: "cashflow", label: "Cash Flow" },
                { id: "caprate", label: "Cap Rate" },
                { id: "flip", label: "Flip Profit" },
              ].map(s => (
                <button key={s.id} className={`ba-sort-btn ${sortBy === s.id ? "active" : ""}`}
                  onClick={() => setSortBy(s.id)}>{s.label}</button>
              ))}
            </div>

            {getSortedResults().map((p, idx) => (
              <div key={idx} className="ba-card" onClick={() => runDeepDive(p, p)}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <span style={{ color: "#3d3a35", fontSize: 12, fontWeight: 700 }}>#{idx + 1}</span>
                      <span style={{ fontSize: 15, fontWeight: 600, color: "#e8e0d4" }}>{p.address}</span>
                    </div>
                    <div style={{ fontSize: 12, color: "#5a5549", marginTop: 2 }}>
                      {p.city}, {p.state} · {p.beds}bd/{p.baths}ba · {p.sqft?.toLocaleString()} sqft
                    </div>
                  </div>
                  <div className="ba-grade" style={{ background: gradeBg(p.grade), border: `1px solid ${gradeColor(p.grade)}25`, color: gradeColor(p.grade) }}>
                    {p.grade}
                  </div>
                </div>

                <div className="ba-metrics">
                  <div className="ba-metric"><div className="val">{fmt(p.price)}</div><div className="lbl">Price</div></div>
                  <div className="ba-metric"><div className="val">{fmt(p.estimatedMonthlyRent)}</div><div className="lbl">Rent/Mo</div></div>
                  <div className="ba-metric"><div className="val">{fmt(p.monthlyCashFlow)}</div><div className="lbl">Cash Flow</div></div>
                  <div className="ba-metric"><div className="val">{fmtPct(p.estimatedCapRate)}</div><div className="lbl">Cap Rate</div></div>
                  <div className="ba-metric"><div className="val">{fmt(p.flipProfit)}</div><div className="lbl">Flip Profit</div></div>
                  <div className="ba-metric"><div className="val">{p.investmentScore}</div><div className="lbl">Score</div></div>
                </div>

                <div style={{ fontSize: 13, color: "#8a8477", lineHeight: 1.5, marginBottom: 8 }}>{p.oneLiner}</div>

                <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                  <span className="ba-tag ba-tag-strategy">{p.bestStrategy}</span>
                  {p.topStrength && <span className="ba-tag ba-tag-good">✓ {p.topStrength}</span>}
                  {(p.riskFlags || []).slice(0, 2).map((r, i) => (
                    <span key={i} className="ba-tag ba-tag-risk">⚠ {r}</span>
                  ))}
                </div>

                <div style={{ fontSize: 11, color: "#e8890c", marginTop: 10, fontWeight: 500 }}>Click for full analysis →</div>
              </div>
            ))}
          </>
        )}

        {/* DEEP DIVE */}
        {step === "detail" && selectedProperty && (
          <>
            <button className="ba-btn ba-btn-ghost ba-btn-sm" onClick={() => setStep("results")} style={{ marginBottom: 16 }}>
              ← Back to Rankings
            </button>

            <div style={{ marginBottom: 20 }}>
              <div style={{ fontFamily: "'Playfair Display', serif", fontSize: 22, fontWeight: 700, color: "#e8e0d4" }}>
                {selectedProperty.address}
              </div>
              <div style={{ fontSize: 13, color: "#5a5549", marginTop: 4 }}>
                {selectedProperty.city}, {selectedProperty.state} · {selectedProperty.beds}bd/{selectedProperty.baths}ba · {selectedProperty.sqft?.toLocaleString()} sqft · {fmt(selectedProperty.price)}
              </div>
            </div>

            {deepLoading && (
              <div style={{ textAlign: "center", padding: 60 }}>
                <div className="ba-spinner" />
                <div style={{ color: "#6a6358", fontSize: 13 }}>Running deep investment analysis...</div>
              </div>
            )}

            {deepAnalysis?.error && (
              <div className="ba-error">{deepAnalysis.error}</div>
            )}

            {deepAnalysis && !deepAnalysis.error && (
              <>
                {deepAnalysis.overview && (
                  <div className="ba-section" style={{ display: "flex", gap: 18, alignItems: "center" }}>
                    <div className="ba-grade" style={{
                      width: 68, height: 68, background: gradeBg(deepAnalysis.overview.dealGrade),
                      border: `2px solid ${gradeColor(deepAnalysis.overview.dealGrade)}25`,
                      color: gradeColor(deepAnalysis.overview.dealGrade), fontSize: 34,
                    }}>{deepAnalysis.overview.dealGrade}</div>
                    <div>
                      <div style={{ fontSize: 14, color: "#c9c0b4", lineHeight: 1.6 }}>{deepAnalysis.overview.summary}</div>
                      <div style={{ fontSize: 12, color: "#5a5549", marginTop: 4 }}>{deepAnalysis.overview.rationale}</div>
                    </div>
                  </div>
                )}

                {deepAnalysis.strategies && (
                  <div className="ba-strat-grid">
                    {[
                      { key: "buyAndHold", label: "Buy & Hold" },
                      { key: "flip", label: "Flip" },
                      { key: "brrrr", label: "BRRRR" },
                    ].map(s => {
                      const d = deepAnalysis.strategies[s.key];
                      if (!d) return null;
                      return (
                        <div key={s.key} className="ba-strat-card" style={{ background: gradeBg(d.grade) }}>
                          <div className="name">{s.label}</div>
                          <div className="grade" style={{ color: gradeColor(d.grade) }}>{d.grade}</div>
                          <div className="verd">{d.verdict}</div>
                        </div>
                      );
                    })}
                  </div>
                )}

                {deepAnalysis.rehabEstimate && (
                  <div className="ba-section">
                    <div className="ba-section-title">Rehab Estimate</div>
                    <div className="ba-metrics" style={{ marginBottom: 12 }}>
                      <div className="ba-metric"><div className="val">{fmt(deepAnalysis.rehabEstimate.totalLow)}</div><div className="lbl">Low</div></div>
                      <div className="ba-metric"><div className="val">{fmt(deepAnalysis.rehabEstimate.totalHigh)}</div><div className="lbl">High</div></div>
                      <div className="ba-metric"><div className="val">{deepAnalysis.rehabEstimate.timelineWeeks}</div><div className="lbl">Weeks</div></div>
                    </div>
                    {deepAnalysis.rehabEstimate.lineItems && (
                      <table className="ba-table">
                        <thead><tr><th>Category</th><th style={{ textAlign: "right" }}>Estimate</th></tr></thead>
                        <tbody>
                          {deepAnalysis.rehabEstimate.lineItems.map((item, i) => (
                            <tr key={i}><td>{item.category}</td><td style={{ textAlign: "right", color: "#e8890c" }}>{fmt(item.estimate)}</td></tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                  </div>
                )}

                {deepAnalysis.riskFlags?.length > 0 && (
                  <div className="ba-section">
                    <div className="ba-section-title">Risk Flags</div>
                    {deepAnalysis.riskFlags.map((r, i) => <div key={i} className="ba-flag risk">⚠ {r}</div>)}
                  </div>
                )}

                {deepAnalysis.profitMaximizers?.length > 0 && (
                  <div className="ba-section">
                    <div className="ba-section-title">Profit Maximizers</div>
                    {deepAnalysis.profitMaximizers.map((p, i) => <div key={i} className="ba-flag profit">💡 {p}</div>)}
                  </div>
                )}

                {deepAnalysis.bottomLine && (
                  <div style={{
                    padding: 20, borderRadius: 10,
                    background: "linear-gradient(135deg, rgba(232,137,12,0.04), rgba(28,47,32,0.08))",
                    border: "1px solid rgba(232,137,12,0.1)",
                  }}>
                    <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: 1.5, color: "#e8890c", marginBottom: 6 }}>Bottom Line</div>
                    <div style={{ fontSize: 14, color: "#e8e0d4", lineHeight: 1.7 }}>{deepAnalysis.bottomLine}</div>
                  </div>
                )}
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}
