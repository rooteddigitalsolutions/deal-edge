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

For each property, provide a detailed investment assessment considering:
- Price per sqft relative to the area
- Estimated rental income potential using local market knowledge
- Rehab needs based on age, condition, and description
- Neighborhood appreciation trajectory
- Full expense breakdown (mortgage, taxes, insurance, management, maintenance, vacancy)
- Cap rate calculation
- Flip viability

For Knoxville TN properties, use these benchmarks:
- Rehab $/sqft: Cosmetic $8-15 | Light $20-35 | Moderate $40-65 | Heavy $75-120
- Monthly rents: 1BR $800-1,100 | 2BR $1,000-1,400 | 3BR $1,200-1,800 | 4BR $1,500-2,200
- Cap rates: 6-9% | Property tax: ~$2.12/$100 | Insurance: $100-200/mo | Management: 9% | Maintenance: 6% | Vacancy: 7%

For other markets, use your knowledge of local costs, rents, and tax rates.

For multi-unit properties (duplex, triplex, quad): calculate rent for ALL units combined, not just one unit. Base all cash flow and cap rate projections on total income from all units.

CALCULATE MORTGAGE: Use the investor's financing terms (down payment % and interest rate) provided in the prompt. Monthly mortgage = standard 30yr amortization formula.

GRADING: A = strong positive cash flow + upside. B = positive cash flow, decent returns. C = break-even or slight negative cash flow. D = negative cash flow with limited upside. F = deeply negative or fundamentally flawed. Negative cash flow properties CANNOT be A or B grade regardless of appreciation potential. Be brutally honest.

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
      "grossRentMultiplier": number,
      "onePercentRule": boolean,
      "rehabEstimate": number,
      "rehabLevel": "cosmetic|light|moderate|heavy",
      "arvEstimate": number,
      "flipProfit": number,
      "monthlyCashFlow": number,
      "monthlyExpenses": {
        "mortgage": number,
        "taxes": number,
        "insurance": number,
        "management": number,
        "maintenance": number,
        "vacancy": number,
        "hoa": number
      },
      "totalMonthlyExpenses": number,
      "downPaymentAmount": number,
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

For multi-unit properties (duplex, triplex, quad): calculate rent for ALL units combined and base all projections on total income from all units.

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
const gradeColor = g => ({ A: "#4ade80", B: "#60a5fa", C: "#facc15", D: "#f97316", F: "#f87171" }[g] || "#b5ac9f");
const gradeBg = g => ({ A: "rgba(74,222,128,0.07)", B: "rgba(96,165,250,0.07)", C: "rgba(250,204,21,0.07)", D: "rgba(249,115,22,0.07)", F: "rgba(248,113,113,0.07)" }[g] || "rgba(138,132,119,0.05)");

export default function BatchAnalyzer({ onRunInDealAnalyzer }) {
  const [step, setStep] = useState("url"); // url | extracting | review | analyzing | results | detail
  const [urlText, setUrlText] = useState("");
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
  const [investmentGoal, setInvestmentGoal] = useState("balanced");
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
    const urls = urlText.split("\n").map(u => u.trim()).filter(u => u.length > 10);
    if (urls.length === 0) return;
    setStep("extracting");
    setError(null);
    const extracted = [];

    for (let i = 0; i < Math.min(urls.length, 10); i++) {
      setStatusMsg(`Fetching property ${i + 1} of ${Math.min(urls.length, 10)}...`);
      try {
        // Brief pause between calls to avoid rate limits
        if (i > 0) await new Promise(r => setTimeout(r, 2000));
        const result = await apiCall({
          model: "claude-haiku-4-5-20251001",
          max_tokens: 2000,
          system: EXTRACT_SYSTEM,
          messages: [{ role: "user", content: `Extract property details from this listing: ${urls[i]}` }],
          tools: [{ type: "web_search_20250305", name: "web_search" }],
        });
        if (result.listings && result.listings.length > 0) {
          extracted.push({ ...result.listings[0], listingUrl: urls[i] });
        } else if (result.address) {
          extracted.push({ ...result, listingUrl: urls[i] });
        }
      } catch (err) {
        console.error(`Failed to extract ${urls[i]}:`, err);
        // Continue with remaining URLs
      }
    }

    if (extracted.length === 0) {
      setError("Couldn't extract data from any of the links. Make sure they're public Zillow, Redfin, or Realtor.com listings.");
      setStep("url");
      return;
    }
    setListings(extracted);
    setSearchSummary(`${extracted.length} of ${Math.min(urls.length, 10)} properties extracted`);
    setStep("review");
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
        model: "claude-sonnet-4-20250514",
        max_tokens: 12000,
        system: BATCH_ANALYSIS_SYSTEM,
        messages: [{
          role: "user",
          content: `Analyze these ${listings.length} properties as investments. IMPORTANT: Return analyses in the SAME ORDER as listed below. Include the price, beds, baths, and sqft for each property in your response.\n\nInvestor's primary goal: ${investmentGoal}. ${investmentGoal === "cashflow" ? "Grade primarily on monthly cash flow. Negative cash flow = C or below." : investmentGoal === "flip" ? "Grade primarily on flip profit margin." : investmentGoal === "appreciation" ? "Grade on ARV upside and appreciation. Still penalize heavy cash flow losses." : "Grade on all factors equally. Negative cash flow is a serious negative."}\nInvestor financing: ${financing}, ${downPct}% down, ${rate}% rate.\nMax rehab willingness: ${rehabLabels[maxRehab] || maxRehab}. Flag any properties that need more rehab than this.\n\n${listingSummary}`
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
      // Analysis data for scores/grades, but LISTING data ALWAYS wins for price and specs
      return {
        ...a,
        // These ALWAYS come from the original listing extraction, never from the analysis AI
        price: listing.price || a.price || 0,
        beds: listing.beds || a.beds || 0,
        baths: listing.baths || a.baths || 0,
        sqft: listing.sqft || a.sqft || 0,
        address: listing.address || a.address || "",
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
        .ba-header .sub { font-size: 12px; color: #a89e92; margin-top: 2px; }
        .ba-body { max-width: 960px; margin: 0 auto; padding: 24px 36px 60px; }

        .ba-url-box { background: rgba(232,137,12,0.03); border: 2px dashed rgba(232,137,12,0.15);
          border-radius: 12px; padding: 32px; text-align: center; margin-bottom: 20px; transition: border-color 0.3s; }
        .ba-url-box:focus-within { border-color: rgba(232,137,12,0.4); }
        .ba-url-input { width: 100%; padding: 14px 18px; background: rgba(0,0,0,0.3);
          border: 1px solid rgba(232,137,12,0.15); border-radius: 8px; color: #e8e0d4; font-size: 15px;
          font-family: 'DM Sans', sans-serif; outline: none; margin: 16px 0; }
        .ba-url-input:focus { border-color: #e8890c; }
        .ba-url-input::placeholder { color: #8a8477; }

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
        .ba-metric .lbl { font-size: 9px; text-transform: uppercase; letter-spacing: 1px; color: #a89e92; margin-top: 2px; }

        .ba-grade { width: 52px; height: 52px; border-radius: 8px; display: flex; align-items: center; justify-content: center;
          font-family: 'Playfair Display', serif; font-size: 26px; font-weight: 900; flex-shrink: 0; }

        .ba-tag { font-size: 10px; padding: 3px 8px; border-radius: 3px; display: inline-block; margin: 2px; }
        .ba-tag-risk { background: rgba(249,115,22,0.06); color: #f97316; border: 1px solid rgba(249,115,22,0.1); }
        .ba-tag-good { background: rgba(74,222,128,0.06); color: #4ade80; border: 1px solid rgba(74,222,128,0.1); }
        .ba-tag-strategy { background: rgba(96,165,250,0.06); color: #60a5fa; border: 1px solid rgba(96,165,250,0.1); }

        .ba-sort { display: flex; gap: 6px; flex-wrap: wrap; margin-bottom: 16px; }
        .ba-sort-btn { padding: 6px 14px; border-radius: 20px; font-size: 11px; font-weight: 500;
          border: 1px solid rgba(232,137,12,0.12); color: #b5ac9f; cursor: pointer;
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
        .ba-strat-card .name { font-size: 11px; text-transform: uppercase; letter-spacing: 1.2px; color: #a89e92; margin-bottom: 6px; }
        .ba-strat-card .grade { font-family: 'Playfair Display', serif; font-size: 32px; font-weight: 900; line-height: 1; }
        .ba-strat-card .verd { font-size: 12px; color: #8a8477; margin-top: 8px; line-height: 1.5; }

        .ba-table { width: 100%; border-collapse: collapse; font-size: 13px; }
        .ba-table th { text-align: left; padding: 7px 10px; font-size: 10px; font-weight: 700;
          text-transform: uppercase; letter-spacing: 1px; color: #a89e92; border-bottom: 1px solid rgba(232,137,12,0.1); }
        .ba-table td { padding: 9px 10px; border-bottom: 1px solid rgba(255,255,255,0.025); color: #a89e92; }

        .ba-fin-row { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 12px; }
        .ba-fin-card { padding: 10px 14px; border-radius: 6px; cursor: pointer; text-align: center;
          border: 1px solid rgba(232,137,12,0.1); background: rgba(255,255,255,0.015); transition: all 0.2s; }
        .ba-fin-card:hover { border-color: rgba(232,137,12,0.3); }
        .ba-fin-card.active { border-color: #e8890c; background: rgba(232,137,12,0.06); }
        .ba-fin-card .name { font-size: 13px; font-weight: 600; color: #d8d0c4; }
        .ba-fin-card .desc { font-size: 10px; color: #a89e92; }
        .ba-input { width: 100%; padding: 9px 12px; background: rgba(255,255,255,0.03);
          border: 1px solid rgba(232,137,12,0.12); border-radius: 5px; color: #d8d0c4; font-size: 13px;
          font-family: 'DM Sans', sans-serif; outline: none; }
        .ba-label { display: block; font-size: 10px; font-weight: 700; text-transform: uppercase;
          letter-spacing: 1.4px; color: #a89e92; margin-bottom: 5px; }

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
          <div className="sub">Paste up to 10 listing links → AI scores and ranks every property</div>
        </div>
        {step !== "url" && (
          <button className="ba-btn ba-btn-ghost ba-btn-sm" onClick={() => { setStep("url"); setListings([]); setAnalyses([]); setUrlText(""); setError(null); }}>
            ← New Search
          </button>
        )}
      </div>

      <div className="ba-body">
        {/* STEP 1: PASTE LINKS */}
        {step === "url" && (
          <>
            <div className="ba-url-box">
              <div style={{ fontSize: 28, marginBottom: 4 }}>🔗</div>
              <div style={{ fontSize: 15, color: "#d8d0c4", fontWeight: 500 }}>Paste property listing links</div>
              <div style={{ fontSize: 12, color: "#b5ac9f", marginTop: 4 }}>
                One link per line — up to 10 properties. Find listings on Zillow, Redfin, or Realtor.com and paste the URLs here.
              </div>
              <textarea
                className="ba-url-input"
                style={{ minHeight: 180, resize: "vertical", lineHeight: 1.8, fontFamily: "'DM Sans', sans-serif", fontSize: 13 }}
                placeholder={"https://www.zillow.com/homedetails/123-main-st/12345_zpid/\nhttps://www.zillow.com/homedetails/456-oak-ave/67890_zpid/\nhttps://www.redfin.com/TN/Knoxville/789-elm-st/home/12345\n..."}
                value={urlText}
                onChange={e => setUrlText(e.target.value)}
              />
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 8 }}>
                <div style={{ fontSize: 11, color: "#b5ac9f" }}>
                  Works with <span style={{ padding: "2px 8px", background: "rgba(232,137,12,0.05)", borderRadius: 10, border: "1px solid rgba(232,137,12,0.08)", margin: "0 2px" }}>Zillow</span>
                  <span style={{ padding: "2px 8px", background: "rgba(232,137,12,0.05)", borderRadius: 10, border: "1px solid rgba(232,137,12,0.08)", margin: "0 2px" }}>Redfin</span>
                  <span style={{ padding: "2px 8px", background: "rgba(232,137,12,0.05)", borderRadius: 10, border: "1px solid rgba(232,137,12,0.08)", margin: "0 2px" }}>Realtor.com</span>
                </div>
                <div style={{ fontSize: 12, color: "#e8890c", fontWeight: 600 }}>
                  {urlText.split("\n").filter(u => u.trim().length > 10).length} / 10 links
                </div>
              </div>
            </div>
            {error && <div className="ba-error">{error}</div>}
            <button className="ba-btn ba-btn-primary" onClick={extractListings}
              disabled={urlText.split("\n").filter(u => u.trim().length > 10).length === 0}
              style={{ width: "100%", padding: 14, fontSize: 15 }}>
              ⚡ Fetch {urlText.split("\n").filter(u => u.trim().length > 10).length} Properties
            </button>
          </>
        )}

        {/* EXTRACTING */}
        {step === "extracting" && (
          <div style={{ textAlign: "center", padding: 60 }}>
            <div className="ba-spinner" />
            <div style={{ color: "#8a8477", fontSize: 14 }}>{statusMsg}</div>
            <div style={{ color: "#a89e92", fontSize: 12, marginTop: 4 }}>This can take 30-60 seconds</div>
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
              {searchSummary && <div style={{ fontSize: 13, color: "#a89e92", marginTop: 4 }}>{searchSummary}</div>}
            </div>

            {/* Listing preview cards — editable prices */}
            <div className="ba-section">
              <div className="ba-section-title">Listings to Analyze</div>
              <div style={{ fontSize: 11, color: "#b5ac9f", marginBottom: 10 }}>
                Verify the prices below are correct — edit any that look wrong before analyzing.
              </div>
              {listings.map((l, i) => (
                <div key={i} style={{
                  padding: "10px 14px", marginBottom: 6, borderRadius: 6,
                  background: "rgba(232,137,12,0.02)", border: "1px solid rgba(232,137,12,0.05)",
                  display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12,
                }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: "#d8d0c4" }}>{l.address}</div>
                    <div style={{ fontSize: 11, color: "#b5ac9f" }}>
                      {l.city}, {l.state} · {l.beds}bd/{l.baths}ba · {l.sqft?.toLocaleString()} sqft
                    </div>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                    <span style={{ color: "#e8890c", fontWeight: 600, fontSize: 14 }}>$</span>
                    <input
                      type="number"
                      value={l.price || ""}
                      onChange={e => {
                        const updated = [...listings];
                        updated[i] = { ...updated[i], price: +e.target.value };
                        setListings(updated);
                      }}
                      style={{
                        width: 110, padding: "6px 8px", background: "rgba(0,0,0,0.3)",
                        border: "1px solid rgba(232,137,12,0.15)", borderRadius: 4,
                        color: "#e8890c", fontFamily: "'Playfair Display', serif", fontSize: 15,
                        fontWeight: 700, textAlign: "right", outline: "none",
                      }}
                    />
                  </div>
                </div>
              ))}
            </div>

            {/* Investment Goal */}
            <div className="ba-section">
              <div className="ba-section-title">Investment Goal</div>
              <div style={{ fontSize: 11, color: "#b5ac9f", marginBottom: 10 }}>
                This changes how properties are graded — a great cash flow property might be a bad flip.
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 8 }}>
                {[
                  { value: "cashflow", label: "Cash Flow", desc: "Monthly income first", icon: "💰" },
                  { value: "appreciation", label: "Appreciation", desc: "Long-term growth", icon: "📈" },
                  { value: "flip", label: "Flip", desc: "Buy-rehab-sell profit", icon: "🔨" },
                  { value: "balanced", label: "Balanced", desc: "All strategies equal", icon: "⚖️" },
                ].map(g => (
                  <div key={g.value} onClick={() => setInvestmentGoal(g.value)} style={{
                    padding: "12px 10px", borderRadius: 8, cursor: "pointer", textAlign: "center",
                    border: `1px solid ${investmentGoal === g.value ? "#e8890c" : "rgba(232,137,12,0.1)"}`,
                    background: investmentGoal === g.value ? "rgba(232,137,12,0.06)" : "rgba(255,255,255,0.015)",
                    transition: "all 0.2s",
                  }}>
                    <div style={{ fontSize: 18, marginBottom: 4 }}>{g.icon}</div>
                    <div style={{ fontSize: 12, fontWeight: 600, color: "#d8d0c4" }}>{g.label}</div>
                    <div style={{ fontSize: 10, color: "#b5ac9f", marginTop: 2 }}>{g.desc}</div>
                  </div>
                ))}
              </div>
            </div>

            {/* Rehab Scope */}
            <div className="ba-section">
              <div className="ba-section-title">Max Rehab You'll Take On</div>
              <div style={{ fontSize: 11, color: "#a89e92", marginBottom: 10 }}>
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
                    <div style={{ fontSize: 10, color: "#a89e92", marginTop: 2 }}>{r.desc}</div>
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
            <div style={{ color: "#a89e92", fontSize: 12, marginTop: 4 }}>Scoring investment potential across all strategies</div>
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
                <div style={{ fontSize: 12, color: "#a89e92", marginTop: 4 }}>{analyses.length} properties analyzed · Click any for deep dive</div>
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
              <span style={{ fontSize: 11, color: "#a89e92", padding: "6px 0" }}>Sort by:</span>
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
                      <span style={{ color: "#8a8477", fontSize: 12, fontWeight: 700 }}>#{idx + 1}</span>
                      <span style={{ fontSize: 15, fontWeight: 600, color: "#e8e0d4" }}>{p.address}</span>
                    </div>
                    <div style={{ fontSize: 12, color: "#a89e92", marginTop: 2 }}>
                      {p.city}, {p.state} · {p.beds}bd/{p.baths}ba · {p.sqft?.toLocaleString()} sqft
                    </div>
                  </div>
                  <div className="ba-grade" style={{ background: gradeBg(p.grade), border: `1px solid ${gradeColor(p.grade)}25`, color: gradeColor(p.grade) }}>
                    {p.grade}
                  </div>
                </div>

                {/* Primary metrics */}
                <div className="ba-metrics" style={{ marginTop: 12 }}>
                  <div className="ba-metric"><div className="val">{fmt(p.price)}</div><div className="lbl">Price</div></div>
                  <div className="ba-metric"><div className="val">{fmt(p.estimatedMonthlyRent)}</div><div className="lbl">Rent/Mo</div></div>
                  <div className="ba-metric">
                    <div className="val" style={{ color: p.monthlyCashFlow >= 500 ? "#4ade80" : p.monthlyCashFlow >= 0 ? "#facc15" : "#f87171" }}>
                      {fmt(p.monthlyCashFlow)}
                    </div>
                    <div className="lbl">Cash Flow/Mo</div>
                  </div>
                  <div className="ba-metric"><div className="val">{fmtPct(p.estimatedCapRate)}</div><div className="lbl">Cap Rate</div></div>
                  <div className="ba-metric"><div className="val">{fmt(p.flipProfit)}</div><div className="lbl">Flip Profit</div></div>
                  <div className="ba-metric"><div className="val">{p.investmentScore}</div><div className="lbl">Score</div></div>
                </div>

                {/* Expense breakdown */}
                {p.monthlyExpenses && (
                  <div style={{ marginTop: 10, padding: "10px 12px", borderRadius: 7,
                    background: "rgba(255,255,255,0.015)", border: "1px solid rgba(255,255,255,0.03)" }}>
                    <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: 1, color: "#a89e92", marginBottom: 8 }}>
                      Monthly Expense Breakdown
                    </div>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(100px, 1fr))", gap: 6 }}>
                      {[
                        { key: "mortgage", label: "Mortgage" },
                        { key: "taxes", label: "Taxes" },
                        { key: "insurance", label: "Insurance" },
                        { key: "management", label: "Mgmt" },
                        { key: "maintenance", label: "Maint." },
                        { key: "vacancy", label: "Vacancy" },
                        ...(p.monthlyExpenses.hoa > 0 ? [{ key: "hoa", label: "HOA" }] : []),
                      ].map(({ key, label }) => p.monthlyExpenses[key] > 0 && (
                        <div key={key} style={{ display: "flex", justifyContent: "space-between", alignItems: "center",
                          padding: "4px 8px", borderRadius: 4, background: "rgba(255,255,255,0.015)" }}>
                          <span style={{ fontSize: 10, color: "#8a8477" }}>{label}</span>
                          <span style={{ fontSize: 11, color: "#d8d0c4", fontWeight: 500 }}>{fmt(p.monthlyExpenses[key])}</span>
                        </div>
                      ))}
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between", marginTop: 6, padding: "5px 8px",
                      borderTop: "1px solid rgba(232,137,12,0.08)" }}>
                      <span style={{ fontSize: 10, fontWeight: 700, color: "#e8890c" }}>TOTAL EXPENSES</span>
                      <span style={{ fontSize: 11, fontWeight: 700, color: "#e8890c" }}>{fmt(p.totalMonthlyExpenses || Object.values(p.monthlyExpenses || {}).reduce((a, b) => a + (b || 0), 0))}/mo</span>
                    </div>
                  </div>
                )}

                {/* Deal badges row */}
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 10, alignItems: "center" }}>
                  <span className="ba-tag ba-tag-strategy">{p.bestStrategy}</span>
                  {p.onePercentRule !== undefined && (
                    <span className="ba-tag" style={p.onePercentRule
                      ? { background: "rgba(74,222,128,0.06)", color: "#4ade80", border: "1px solid rgba(74,222,128,0.12)" }
                      : { background: "rgba(248,113,113,0.06)", color: "#f87171", border: "1px solid rgba(248,113,113,0.12)" }}>
                      {p.onePercentRule ? "✓ 1% Rule" : "✗ 1% Rule"}
                    </span>
                  )}
                  {p.grossRentMultiplier && (
                    <span className="ba-tag" style={{ background: "rgba(192,122,34,0.06)", color: "#c07a22", border: "1px solid rgba(192,122,34,0.12)" }}>
                      GRM {p.grossRentMultiplier.toFixed(1)}×
                    </span>
                  )}
                  {p.topStrength && <span className="ba-tag ba-tag-good">✓ {p.topStrength}</span>}
                  {(p.riskFlags || []).slice(0, 2).map((r, i) => (
                    <span key={i} className="ba-tag ba-tag-risk">⚠ {r}</span>
                  ))}
                </div>

                <div style={{ fontSize: 13, color: "#8a8477", lineHeight: 1.5, marginTop: 8 }}>{p.oneLiner}</div>

                {/* Footer actions */}
                <div style={{ display: "flex", gap: 8, marginTop: 12, paddingTop: 10,
                  borderTop: "1px solid rgba(255,255,255,0.04)", alignItems: "center" }}>
                  <div style={{ fontSize: 11, color: "#e8890c", fontWeight: 500, flex: 1 }}>Click card for deep dive analysis →</div>
                  {onRunInDealAnalyzer && (
                    <button
                      onClick={e => { e.stopPropagation(); onRunInDealAnalyzer(p); }}
                      style={{
                        padding: "6px 14px", borderRadius: 6, fontSize: 11, fontWeight: 700,
                        background: "rgba(192,122,34,0.12)", color: "#c07a22",
                        border: "1px solid rgba(192,122,34,0.3)", cursor: "pointer",
                        fontFamily: "'DM Sans', sans-serif", letterSpacing: 0.3,
                        transition: "all 0.15s", flexShrink: 0,
                      }}
                      onMouseEnter={e => { e.target.style.background = "rgba(192,122,34,0.22)"; e.target.style.borderColor = "#c07a22"; }}
                      onMouseLeave={e => { e.target.style.background = "rgba(192,122,34,0.12)"; e.target.style.borderColor = "rgba(192,122,34,0.3)"; }}
                    >
                      ⚡ Run in Deal Analyzer
                    </button>
                  )}
                </div>
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
              <div style={{ fontSize: 13, color: "#a89e92", marginTop: 4 }}>
                {selectedProperty.city}, {selectedProperty.state} · {selectedProperty.beds}bd/{selectedProperty.baths}ba · {selectedProperty.sqft?.toLocaleString()} sqft · {fmt(selectedProperty.price)}
              </div>
            </div>

            {deepLoading && (
              <div style={{ textAlign: "center", padding: 60 }}>
                <div className="ba-spinner" />
                <div style={{ color: "#b5ac9f", fontSize: 13 }}>Running deep investment analysis...</div>
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
                      <div style={{ fontSize: 12, color: "#a89e92", marginTop: 4 }}>{deepAnalysis.overview.rationale}</div>
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
