import { useState, useRef, useEffect } from "react";

/* ─── KNOXVILLE DEFAULTS ─── */
const NEIGHBORHOODS = [
  "Downtown/Old City", "Bearden", "West Knoxville", "South Knoxville",
  "North Knoxville/Happy Holler", "Fountain City", "Powell", "Halls",
  "Farragut", "Karns", "Lonsdale", "Mechanicsville", "Island Home",
  "Sequoyah Hills", "Fort Sanders", "4th & Gill", "Park City",
  "East Knoxville", "Burlington", "Vestal"
];

const CONDITIONS = [
  { value: "turnkey", label: "Turnkey / Cosmetic", desc: "Paint, fixtures, minor updates", icon: "✦" },
  { value: "light", label: "Light Rehab", desc: "Flooring, kitchen/bath refresh, paint", icon: "◈" },
  { value: "moderate", label: "Moderate Rehab", desc: "Full kitchen/bath, flooring, mechanicals", icon: "◆" },
  { value: "heavy", label: "Heavy / Gut", desc: "Full gut, structural, all new systems", icon: "⬥" },
];

const FINANCING = [
  { value: "conventional", label: "Conventional", desc: "30yr fixed" },
  { value: "hard_money", label: "Hard Money", desc: "12mo term" },
  { value: "cash", label: "Cash", desc: "No financing" },
];

/* ─── URL EXTRACTION PROMPT ─── */
const EXTRACT_SYSTEM = `You are a real estate data extraction assistant. The user will give you a property listing URL. Use web search to find the property details from that URL or address.

Extract and return ONLY valid JSON (no markdown, no backticks):
{
  "address": "Full street address",
  "city": "City",
  "state": "State abbreviation",
  "zip": "Zip code",
  "neighborhood": "Neighborhood name if identifiable",
  "askingPrice": number,
  "beds": number,
  "baths": number,
  "sqft": number,
  "yearBuilt": number or null,
  "lotAcres": number or null,
  "propertyType": "Single Family|Duplex|Triplex|Quadplex|Townhouse|Condo",
  "daysOnMarket": number or null,
  "priceReductions": number or 0,
  "hoaFees": number or null,
  "taxesAnnual": number or null,
  "description": "Listing description or key details",
  "features": ["notable feature 1", "notable feature 2"],
  "conditionEstimate": "turnkey|light|moderate|heavy",
  "source": "zillow|redfin|realtor|other"
}

If you cannot find the exact listing, search for the address and fill in what you can find. Be accurate — do not fabricate data.`;

/* ─── ANALYSIS PROMPT ─── */
const ANALYSIS_SYSTEM = `You are an expert real estate investment analyst with deep knowledge of markets across the United States. Provide detailed, realistic deal analysis tailored to the specific market the property is in.

MARKET ANALYSIS APPROACH:
- Use your knowledge of local rehab costs, rent ranges, tax rates, cap rates, and neighborhood dynamics for whatever market the property is in.
- Factor in regional labor costs, material costs, and seasonal considerations.
- Consider local vacancy rates, property management fees, insurance costs, and closing cost norms for that state/county.
- If the property is in the Knoxville, TN area, use these precise local benchmarks:

KNOXVILLE TN BENCHMARKS (use only for Knox County / East TN properties):
- Rehab $/sqft: Cosmetic $8-15 | Light $20-35 | Moderate $40-65 | Heavy $75-120
- Property tax: ~$2.12/$100 assessed (Knox County)
- Insurance: $1,200-2,400/yr | Vacancy: 5-8% | Management: 8-10% | Maintenance: 5-8%
- Cap rates: 6-9% | Closing costs: ~2-3% buy, ~6-8% sell
- Monthly rents: 1BR $800-1,100 | 2BR $1,000-1,400 | 3BR $1,200-1,800 | 4BR $1,500-2,200
- Hot rental areas: North Knox, South Knox, Bearden, Fort Sanders, 4th & Gill
- Appreciating: South Knox, North Knox/Happy Holler, East Knox, Lonsdale, Mechanicsville
- Premium: Sequoyah Hills, Bearden, Farragut (higher entry, lower caps)
- Hard money: 12-14% interest, 2-3 points, 12mo term typical

For ALL markets, be conservative in estimates and flag risks clearly.

GRADING RULES (follow strictly):
- ANY property with negative monthly cash flow on a Buy & Hold basis CANNOT receive higher than a C grade overall, regardless of appreciation potential or location.
- A grade: Strong positive cash flow ($200+/mo), good cap rate (7%+), solid ARV upside, low risk.
- B grade: Positive cash flow, decent cap rate (5-7%), reasonable upside.
- C grade: Break-even to slightly negative cash flow, or significant rehab needed, or high risk factors.
- D grade: Negative cash flow AND limited upside, or major structural/risk issues.
- F grade: Deeply negative cash flow, overpriced relative to market, or fundamentally flawed deal.
- Be brutally honest. Investors lose money on bad grades — don't sugarcoat.

MULTI-UNIT PROPERTIES (Duplex, Triplex, Quadplex):
- Calculate rent for EACH unit separately and show total combined rent.
- If the listing says "2-unit duplex, each unit 2BR/1BA" then estimate rent for BOTH units and add them together.
- Cash flow, cap rate, and all projections should be based on TOTAL rental income from all units.
- Note the per-unit breakdown in your assumptions.
- Multi-family properties are often better investment plays — reflect this in your scoring.

Respond ONLY with valid JSON (no markdown, no backticks):
{
  "propertyOverview": {
    "summary": "2-3 sentence overview",
    "dealGrade": "A|B|C|D|F",
    "dealGradeRationale": "Why this grade"
  },
  "rehabEstimate": {
    "totalLow": number,
    "totalHigh": number,
    "timelineWeeks": "X-Y",
    "lineItems": [{"category": "string", "lowEstimate": number, "highEstimate": number, "notes": "string"}],
    "warnings": ["string"]
  },
  "arvAnalysis": {
    "estimatedARV": number,
    "arvLow": number,
    "arvHigh": number,
    "pricePerSqft": number,
    "methodology": "string",
    "comparableNotes": "string"
  },
  "cashFlowProjection": {
    "estimatedMonthlyRent": number,
    "rentLow": number,
    "rentHigh": number,
    "monthlyExpenses": {"mortgage": number, "taxes": number, "insurance": number, "management": number, "maintenance": number, "vacancy": number},
    "monthlyCashFlow": number,
    "annualCashFlow": number,
    "cashOnCashReturn": number,
    "capRate": number,
    "assumptions": "string"
  },
  "flipAnalysis": {
    "totalInvestment": number,
    "purchasePrice": number,
    "rehabCostMid": number,
    "holdingCosts": number,
    "buyClosingCosts": number,
    "sellClosingCosts": number,
    "estimatedProfit": number,
    "roi": number,
    "holdTimeMonths": number,
    "breakdownNotes": "string"
  },
  "brrrrAnalysis": {
    "arvAfterRehab": number,
    "refinanceAmount": number,
    "cashLeftIn": number,
    "monthlyCashFlowAfterRefi": number,
    "infiniteReturn": boolean,
    "verdict": "string"
  },
  "rehabScenarios": [
    {"level": "Cosmetic", "cost": number, "timeline": "string", "arvImpact": number, "notes": "string"},
    {"level": "Light", "cost": number, "timeline": "string", "arvImpact": number, "notes": "string"},
    {"level": "Moderate", "cost": number, "timeline": "string", "arvImpact": number, "notes": "string"},
    {"level": "Full Gut", "cost": number, "timeline": "string", "arvImpact": number, "notes": "string"}
  ],
  "investorPitch": {
    "headline": "Compelling one-liner",
    "keyMetrics": ["string","string","string","string"],
    "idealFor": "string",
    "riskFactors": ["string","string"],
    "profitMaximizers": ["string","string"],
    "bottomLine": "string"
  }
}`;

/* ─── RENT COMPS PROMPT ─── */
const RENT_COMPS_SYSTEM = `You are a rental market researcher. Your job is to find the most accurate current rental data for a specific address using live web search.

Search strategy (execute ALL of these searches):
1. Search "[address] Zillow rent" or "[address] Zestimate rent" to find the Zillow Rent Zestimate
2. Search "[city] [beds]BR rental comps [zip]" to find active rental listings in that area
3. Search "Rentometer [address]" or "[neighborhood] average rent [beds]BR" for market averages
4. If multifamily, search each unit type separately (e.g. "2BR apartment [neighborhood] rent")

Return ONLY valid JSON (no markdown, no backticks):
{
  "zillowRentZestimate": number or null,
  "rentometerMedian": number or null,
  "marketRentLow": number,
  "marketRentHigh": number,
  "marketRentMid": number,
  "confidence": "high|medium|low",
  "dataSource": "Description of what you found and from where",
  "activeComps": [
    {
      "address": "string",
      "rent": number,
      "beds": number,
      "baths": number,
      "sqft": number or null,
      "source": "zillow|redfin|apartments.com|craigslist|other",
      "notes": "string"
    }
  ],
  "marketNotes": "2-3 sentence summary of rental market conditions for this property type and area",
  "onePercentTest": "Does this property meet the 1% rule at the estimated rent? Brief analysis."
}

Use only data you actually find via search. Do not fabricate rental figures. If you cannot find Zillow Rent Zestimate specifically, note that and use active comps to estimate.`;

/* ─── UTILS ─── */
const fmt = n => n == null || isNaN(n) ? "$0" : "$" + Math.round(n).toLocaleString();
const fmtPct = n => n == null || isNaN(n) ? "0%" : n.toFixed(1) + "%";
const gradeColor = g => ({ A: "#4ade80", B: "#60a5fa", C: "#facc15", D: "#f97316", F: "#f87171" }[g] || "#b5ac9f");
const gradeBg = g => ({ A: "rgba(74,222,128,0.07)", B: "rgba(96,165,250,0.07)", C: "rgba(250,204,21,0.07)", D: "rgba(249,115,22,0.07)", F: "rgba(248,113,113,0.07)" }[g] || "rgba(138,132,119,0.05)");

export default function DealAnalyzerV2({ initialData, onInitialDataConsumed }) {
  // Steps: url → review → options → analyzing → results
  const [step, setStep] = useState("url");
  const [url, setUrl] = useState("");
  const [fetching, setFetching] = useState(false);
  const [fetchError, setFetchError] = useState(null);

  const defaultProperty = {
    address: "", city: "", state: "", zip: "", neighborhood: "",
    askingPrice: "", beds: 3, baths: 2, sqft: "", yearBuilt: "",
    lotAcres: "", propertyType: "Single Family", daysOnMarket: "",
    priceReductions: 0, hoaFees: "", taxesAnnual: "", description: "",
    features: [], conditionEstimate: "moderate", source: "",
  };

  const [property, setProperty] = useState(defaultProperty);
  const updateProp = (k, v) => setProperty(prev => ({ ...prev, [k]: v }));

  // Rent comps state
  const [rentComps, setRentComps] = useState(null);

  // Handle data coming in from Batch Analyzer
  useEffect(() => {
    if (initialData) {
      setProperty({
        address: initialData.address || "",
        city: initialData.city || "",
        state: initialData.state || "TN",
        zip: initialData.zip || "",
        neighborhood: initialData.neighborhood || "",
        askingPrice: initialData.price || initialData.askingPrice || "",
        beds: initialData.beds || 3,
        baths: initialData.baths || 2,
        sqft: initialData.sqft || "",
        yearBuilt: initialData.yearBuilt || "",
        lotAcres: initialData.lotAcres || "",
        propertyType: initialData.propertyType || "Single Family",
        daysOnMarket: initialData.daysOnMarket || "",
        priceReductions: initialData.priceReductions || 0,
        hoaFees: initialData.hoaFees || "",
        taxesAnnual: initialData.taxesAnnual || "",
        description: initialData.description || "",
        features: initialData.features || [],
        conditionEstimate: initialData.conditionEstimate || "moderate",
        source: initialData.source || "batch",
      });
      setRehabLevel(initialData.conditionEstimate || "moderate");
      setUrl(initialData.listingUrl || "");
      setRentComps(null);
      setResult(null);
      setStep("review");
      onInitialDataConsumed?.();
    }
  }, [initialData]); // eslint-disable-line

  const [rehabLevel, setRehabLevel] = useState("moderate");
  const [investorNotes, setInvestorNotes] = useState("");
  const [investmentGoal, setInvestmentGoal] = useState("balanced");
  const [financing, setFinancing] = useState("conventional");
  const [downPct, setDownPct] = useState(20);
  const [rate, setRate] = useState(7.0);
  const [analyzeAllRehab, setAnalyzeAllRehab] = useState(true);

  const [result, setResult] = useState(null);
  const [analysisError, setAnalysisError] = useState(null);
  const [activeTab, setActiveTab] = useState("overview");

  /* ─── FETCH PROPERTY FROM URL ─── */
  const fetchProperty = async () => {
    if (!url.trim()) return;
    setFetching(true);
    setFetchError(null);

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 90000);

      const response = await fetch("/api/anthropic", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "claude-haiku-4-5-20251001",
          max_tokens: 2000,
          system: EXTRACT_SYSTEM,
          messages: [{ role: "user", content: `Extract property details from this listing: ${url.trim()}` }],
          tools: [{ type: "web_search_20250305", name: "web_search" }],
        }),
        signal: controller.signal,
      });

      clearTimeout(timeout);

      if (!response.ok) {
        const errText = await response.text();
        throw new Error(`API returned ${response.status}: ${errText.slice(0, 200)}`);
      }

      const data = await response.json();

      if (data.error) {
        throw new Error(`API error: ${data.error.message || JSON.stringify(data.error)}`);
      }

      const text = data.content?.filter(b => b.type === "text").map(b => b.text).join("") || "";

      if (!text) {
        throw new Error("No text in response. You can enter details manually.");
      }

      const clean = text.replace(/```json|```/g, "").trim();
      const jsonMatch = clean.match(/\{[\s\S]*\}/);
      if (!jsonMatch) throw new Error("Couldn't parse property data from response.");
      const parsed = JSON.parse(jsonMatch[0]);

      setProperty({
        address: parsed.address || "",
        city: parsed.city || "",
        state: parsed.state || "TN",
        zip: parsed.zip || "",
        neighborhood: parsed.neighborhood || "",
        askingPrice: parsed.askingPrice || "",
        beds: parsed.beds || 3,
        baths: parsed.baths || 2,
        sqft: parsed.sqft || "",
        yearBuilt: parsed.yearBuilt || "",
        lotAcres: parsed.lotAcres || "",
        propertyType: parsed.propertyType || "Single Family",
        daysOnMarket: parsed.daysOnMarket || "",
        priceReductions: parsed.priceReductions || 0,
        hoaFees: parsed.hoaFees || "",
        taxesAnnual: parsed.taxesAnnual || "",
        description: parsed.description || "",
        features: parsed.features || [],
        conditionEstimate: parsed.conditionEstimate || "moderate",
        source: parsed.source || "",
      });
      setRehabLevel(parsed.conditionEstimate || "moderate");
      setStep("review");
    } catch (err) {
      console.error("Fetch error:", err);
      let msg = "Couldn't extract property data.";
      if (err.name === "AbortError") {
        msg = "Request timed out. The listing search took too long.";
      } else if (err.message) {
        msg = err.message;
      }
      setFetchError(msg + " You can enter details manually below.");
      setStep("review");
    }
    setFetching(false);
  };

  const [loadingStatus, setLoadingStatus] = useState("");

  /* ─── FETCH LIVE RENT COMPS ─── */
  const fetchRentComps = async (prop) => {
    const addressStr = `${prop.address}, ${prop.city}, ${prop.state} ${prop.zip}`;
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 60000);
      const response = await fetch("/api/anthropic", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "claude-haiku-4-5-20251001",
          max_tokens: 1500,
          system: RENT_COMPS_SYSTEM,
          messages: [{ role: "user", content: `Find current rental comps and Zillow Rent Zestimate for:\n\nAddress: ${addressStr}\nProperty type: ${prop.propertyType}\nBedrooms: ${prop.beds} | Bathrooms: ${prop.baths} | Sqft: ${prop.sqft || "unknown"}\n\nSearch for the Zillow Rent Zestimate for this address, then find 3-5 active comparable rentals in the same neighborhood/zip code.` }],
          tools: [{ type: "web_search_20250305", name: "web_search" }],
        }),
        signal: controller.signal,
      });
      clearTimeout(timeout);
      if (!response.ok) return null;
      const data = await response.json();
      const text = data.content?.filter(b => b.type === "text").map(b => b.text).join("") || "";
      const clean = text.replace(/```json|```/g, "").trim();
      const jsonMatch = clean.match(/\{[\s\S]*\}/);
      if (!jsonMatch) return null;
      return JSON.parse(jsonMatch[0]);
    } catch {
      return null;
    }
  };

  /* ─── RUN ANALYSIS ─── */
  const runAnalysis = async () => {
    setStep("analyzing");
    setResult(null);
    setRentComps(null);
    setAnalysisError(null);
    setActiveTab("overview");

    // ── Step 1: Fetch live rent comps (skip if already fetched for this property) ──
    let comps = rentComps;
    if (!comps) {
      setLoadingStatus("🔍 Searching for live rent comps (Zillow, Rentometer, active listings)...");
      comps = await fetchRentComps(property);
      setRentComps(comps);
    } else {
      setLoadingStatus("📋 Using previously fetched rent comps...");
      await new Promise(r => setTimeout(r, 400)); // brief pause so status is visible
    }

    // ── Step 2: Build prompt with live comps injected ──
    setLoadingStatus("📊 Running full investment analysis...");
    const condLabel = CONDITIONS.find(c => c.value === rehabLevel)?.label || rehabLevel;

    const rentCompsBlock = comps ? `
LIVE RENT COMPS (freshly fetched — use these as your primary rent reference):
- Zillow Rent Zestimate: ${comps.zillowRentZestimate ? "$" + comps.zillowRentZestimate + "/mo" : "Not found"}
- Rentometer Median: ${comps.rentometerMedian ? "$" + comps.rentometerMedian + "/mo" : "Not found"}
- Market Range: $${comps.marketRentLow}–$${comps.marketRentHigh}/mo (mid: $${comps.marketRentMid}/mo)
- Data confidence: ${comps.confidence}
- Source: ${comps.dataSource}
${comps.activeComps?.length > 0 ? `\nActive rental comps found:\n${comps.activeComps.map(c => `  • ${c.address} — $${c.rent}/mo | ${c.beds}bd/${c.baths}ba${c.sqft ? " | " + c.sqft + " sqft" : ""} (${c.source})`).join("\n")}` : ""}
${comps.onePercentTest ? `\n1% Rule check: ${comps.onePercentTest}` : ""}

Use the Zillow Rent Zestimate as your primary rent anchor (if available). Cross-reference with active comps. Do NOT use generic hardcoded ranges — these live comps are the ground truth.` : `
NOTE: Live rent comp fetch did not return data. Use your best market knowledge for rent estimates and clearly note the uncertainty.`;

    const prompt = `Analyze this investment property:

Address: ${property.address}, ${property.city}, ${property.state} ${property.zip}
Neighborhood: ${property.neighborhood || "Not specified"}
Asking Price: $${Number(property.askingPrice).toLocaleString()}
${property.beds}bd / ${property.baths}ba | ${property.sqft} sqft
Year Built: ${property.yearBuilt || "Unknown"}
Lot: ${property.lotAcres ? property.lotAcres + " acres" : "N/A"}
Property Type: ${property.propertyType}
Days on Market: ${property.daysOnMarket || "Unknown"}
Price Reductions: ${property.priceReductions}
HOA: ${property.hoaFees ? "$" + property.hoaFees + "/mo" : "None"}
Annual Taxes: ${property.taxesAnnual ? "$" + property.taxesAnnual : "Estimate based on Knox County rates"}
Description: ${property.description || "None provided"}
Features: ${property.features.length > 0 ? property.features.join(", ") : "None noted"}
${investorNotes ? `\nINVESTOR'S OWN NOTES (factor these heavily into your analysis):\n${investorNotes}` : ""}
${rentCompsBlock}

Investor's Selected Rehab Level: ${condLabel}
Financing: ${financing === "conventional" ? "Conventional 30yr" : financing === "hard_money" ? "Hard Money 12mo" : "Cash"}
Down Payment: ${downPct}%
Interest Rate: ${rate}%

INVESTOR'S PRIMARY GOAL: ${investmentGoal === "cashflow" ? "Monthly cash flow — grade primarily on whether this property generates positive monthly income. Negative cash flow is a deal-breaker." : investmentGoal === "appreciation" ? "Appreciation / equity growth — grade primarily on ARV upside and neighborhood trajectory. Cash flow is secondary but sustained losses are still a major risk." : investmentGoal === "flip" ? "Flip for profit — grade primarily on buy-rehab-sell profit margin and timeline. Rental potential is secondary." : "Balanced — weight cash flow, appreciation, and flip potential equally. Negative cash flow is a serious negative regardless of other factors."}

${analyzeAllRehab ? "ALSO provide all 4 rehab scenario comparisons (cosmetic through full gut)." : ""}
Include BRRRR analysis in addition to Buy & Hold and Flip.`;

    try {
      // Add timeout - 90 seconds
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 90000);

      setLoadingStatus("Waiting for deep analysis (30-60 seconds)...");

      const response = await fetch("/api/anthropic", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "claude-sonnet-4-20250514",
          max_tokens: 4000,
          system: ANALYSIS_SYSTEM,
          messages: [{ role: "user", content: prompt }],
        }),
        signal: controller.signal,
      });

      clearTimeout(timeout);
      setLoadingStatus("Response received — parsing analysis...");

      if (!response.ok) {
        const errText = await response.text();
        throw new Error(`API returned ${response.status}: ${errText.slice(0, 200)}`);
      }

      const data = await response.json();

      if (data.error) {
        throw new Error(`API error: ${data.error.message || JSON.stringify(data.error)}`);
      }

      const text = data.content?.filter(b => b.type === "text").map(b => b.text).join("") || "";

      if (!text) {
        throw new Error("No text content in API response. Content types: " + (data.content || []).map(b => b.type).join(", "));
      }

      setLoadingStatus("Parsing JSON...");
      const clean = text.replace(/```json|```/g, "").trim();
      const jsonMatch = clean.match(/\{[\s\S]*\}/);

      if (!jsonMatch) {
        throw new Error("Could not find JSON in response. First 300 chars: " + clean.slice(0, 300));
      }

      const parsed = JSON.parse(jsonMatch[0]);
      setResult(parsed);
      setStep("results");
    } catch (err) {
      console.error("Analysis error:", err);
      let msg = "Analysis failed";
      if (err.name === "AbortError") {
        msg = "Request timed out after 90 seconds. The AI may be overloaded — try again in a moment.";
      } else {
        msg = err.message || "Unknown error";
      }
      setAnalysisError(msg);
      setStep("options");
    }
  };

  const tabs = [
    { id: "overview", label: "Overview" },
    { id: "rehab", label: "Rehab" },
    { id: "arv", label: "ARV" },
    { id: "cashflow", label: "Rental" },
    { id: "flip", label: "Flip" },
    { id: "brrrr", label: "BRRRR" },
    { id: "scenarios", label: "Scenarios" },
    { id: "pitch", label: "Pitch" },
  ];

  return (
    <div style={{ minHeight: "100vh", background: "#0c1015", color: "#d8d0c4", fontFamily: "'DM Sans', sans-serif" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;600;700&family=Playfair+Display:wght@400;600;700;800;900&display=swap');
        * { box-sizing: border-box; margin: 0; padding: 0; }

        .da2-header {
          padding: 20px 36px; border-bottom: 1px solid rgba(192,122,34,0.1);
          background: linear-gradient(180deg, rgba(192,122,34,0.04) 0%, transparent 100%);
        }
        .da2-header-inner {
          max-width: 920px; margin: 0 auto;
          display: flex; justify-content: space-between; align-items: center;
        }
        .da2-header h1 { font-family: 'Playfair Display', serif; font-size: 22px; font-weight: 800; color: #c07a22; }
        .da2-header .sub { font-size: 12px; color: #a89e92; margin-top: 2px; }
        .da2-body { max-width: 920px; margin: 0 auto; padding: 24px 36px 60px; }

        .da2-url-box {
          background: rgba(192,122,34,0.03); border: 2px dashed rgba(192,122,34,0.15);
          border-radius: 12px; padding: 32px; text-align: center; margin-bottom: 20px;
          transition: border-color 0.3s;
        }
        .da2-url-box:focus-within { border-color: rgba(192,122,34,0.4); }
        .da2-url-input {
          width: 100%; padding: 14px 18px; background: rgba(0,0,0,0.3);
          border: 1px solid rgba(192,122,34,0.15); border-radius: 8px;
          color: #e8e0d4; font-size: 15px; font-family: 'DM Sans', sans-serif;
          outline: none; transition: border-color 0.2s; margin: 16px 0;
        }
        .da2-url-input:focus { border-color: #c07a22; }
        .da2-url-input::placeholder { color: #8a8477; }
        .da2-url-sources { font-size: 11px; color: #a89e92; }
        .da2-url-sources span { display: inline-block; padding: 3px 10px; margin: 2px;
          background: rgba(192,122,34,0.05); border-radius: 12px; border: 1px solid rgba(192,122,34,0.08); }

        .da2-or { text-align: center; color: #8a8477; font-size: 12px; letter-spacing: 3px;
          text-transform: uppercase; margin: 16px 0; position: relative; }
        .da2-or::before, .da2-or::after {
          content: ''; position: absolute; top: 50%; width: 38%; height: 1px;
          background: rgba(192,122,34,0.08);
        }
        .da2-or::before { left: 0; }
        .da2-or::after { right: 0; }

        .da2-section {
          background: rgba(255,255,255,0.018); border: 1px solid rgba(192,122,34,0.08);
          border-radius: 10px; padding: 20px; margin-bottom: 16px;
        }
        .da2-section-title {
          font-family: 'Playfair Display', serif; font-size: 15px; font-weight: 600;
          color: #c07a22; margin-bottom: 14px;
        }
        .da2-label {
          display: block; font-size: 10px; font-weight: 700; text-transform: uppercase;
          letter-spacing: 1.4px; color: #a89e92; margin-bottom: 5px;
        }
        .da2-input, .da2-select {
          width: 100%; padding: 9px 12px; background: rgba(255,255,255,0.03);
          border: 1px solid rgba(192,122,34,0.12); border-radius: 5px;
          color: #d8d0c4; font-size: 13px; font-family: 'DM Sans', sans-serif; outline: none;
        }
        .da2-input:focus, .da2-select:focus { border-color: #c07a22; }
        .da2-input::placeholder { color: #8a8477; }
        .da2-select option { background: #14191f; color: #d8d0c4; }
        .da2-textarea { resize: vertical; min-height: 50px; }
        .da2-grid2 { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; }
        .da2-grid3 { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 14px; }
        .da2-grid4 { display: grid; grid-template-columns: 1fr 1fr 1fr 1fr; gap: 12px; }
        .da2-full { grid-column: 1 / -1; }

        /* Condition Cards */
        .da2-cond-card {
          padding: 12px 14px; border-radius: 8px; cursor: pointer;
          border: 1px solid rgba(192,122,34,0.1); background: rgba(255,255,255,0.015);
          transition: all 0.2s; text-align: center;
        }
        .da2-cond-card:hover { border-color: rgba(192,122,34,0.3); }
        .da2-cond-card.active { border-color: #c07a22; background: rgba(192,122,34,0.06); }
        .da2-cond-card .icon { font-size: 20px; margin-bottom: 4px; }
        .da2-cond-card .name { font-size: 12px; font-weight: 600; color: #d8d0c4; }
        .da2-cond-card .desc { font-size: 10px; color: #a89e92; margin-top: 2px; }

        /* Financing cards */
        .da2-fin-card {
          padding: 10px 14px; border-radius: 6px; cursor: pointer;
          border: 1px solid rgba(192,122,34,0.1); background: rgba(255,255,255,0.015);
          transition: all 0.2s; text-align: center;
        }
        .da2-fin-card:hover { border-color: rgba(192,122,34,0.3); }
        .da2-fin-card.active { border-color: #c07a22; background: rgba(192,122,34,0.06); }
        .da2-fin-card .name { font-size: 13px; font-weight: 600; color: #d8d0c4; }
        .da2-fin-card .desc { font-size: 10px; color: #a89e92; }

        .da2-btn {
          display: inline-flex; align-items: center; justify-content: center; gap: 8px;
          padding: 13px 28px; border: none; border-radius: 7px;
          font-size: 14px; font-weight: 600; font-family: 'DM Sans', sans-serif;
          cursor: pointer; transition: all 0.2s;
        }
        .da2-btn-primary { background: linear-gradient(135deg, #c07a22, #9a6018); color: #fff; }
        .da2-btn-primary:hover { transform: translateY(-1px); box-shadow: 0 6px 20px rgba(192,122,34,0.25); }
        .da2-btn-primary:disabled { opacity: 0.4; cursor: not-allowed; transform: none; box-shadow: none; }
        .da2-btn-ghost { background: transparent; color: #c07a22; border: 1px solid rgba(192,122,34,0.2); }
        .da2-btn-ghost:hover { background: rgba(192,122,34,0.05); }
        .da2-btn-sm { padding: 8px 16px; font-size: 12px; }

        .da2-step-badge {
          display: inline-flex; align-items: center; gap: 8px; padding: 6px 14px;
          border-radius: 20px; font-size: 11px; font-weight: 600; letter-spacing: 0.5px;
          margin-bottom: 16px;
        }
        .da2-step-num {
          width: 20px; height: 20px; border-radius: 50%; display: flex;
          align-items: center; justify-content: center; font-size: 10px; font-weight: 700;
        }

        .da2-fetched-badge {
          display: inline-flex; align-items: center; gap: 6px; padding: 4px 12px;
          border-radius: 12px; font-size: 11px; font-weight: 500;
          background: rgba(74,222,128,0.06); color: #4ade80;
          border: 1px solid rgba(74,222,128,0.12); margin-bottom: 12px;
        }

        .da2-features { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 8px; }
        .da2-feature-tag {
          font-size: 11px; padding: 4px 10px; border-radius: 4px;
          background: rgba(192,122,34,0.05); color: #8a8477;
          border: 1px solid rgba(192,122,34,0.08);
        }

        /* Loading */
        .da2-loading { text-align: center; padding: 60px 20px; }
        .da2-spinner {
          width: 44px; height: 44px; border: 3px solid rgba(192,122,34,0.1);
          border-top-color: #c07a22; border-radius: 50%;
          animation: spin 0.7s linear infinite; margin: 0 auto 16px;
        }
        @keyframes spin { to { transform: rotate(360deg); } }

        /* Tabs */
        .da2-tabs { display: flex; gap: 0; border-bottom: 1px solid rgba(192,122,34,0.1); overflow-x: auto; margin-bottom: 20px; }
        .da2-tab {
          padding: 10px 16px; font-size: 12px; font-weight: 500; color: #a89e92;
          background: none; border: none; border-bottom: 2px solid transparent;
          cursor: pointer; font-family: 'DM Sans', sans-serif; transition: all 0.2s; white-space: nowrap;
        }
        .da2-tab:hover { color: #c07a22; }
        .da2-tab.active { color: #c07a22; border-bottom-color: #c07a22; }

        /* Metric blocks */
        .da2-metrics { display: grid; grid-template-columns: repeat(auto-fit, minmax(130px, 1fr)); gap: 12px; margin-bottom: 18px; }
        .da2-metric {
          text-align: center; padding: 14px 10px; background: rgba(192,122,34,0.03);
          border-radius: 7px; border: 1px solid rgba(192,122,34,0.06);
        }
        .da2-metric .val { font-family: 'Playfair Display', serif; font-size: 20px; font-weight: 700; color: #c07a22; }
        .da2-metric .lbl { font-size: 10px; text-transform: uppercase; letter-spacing: 1px; color: #a89e92; margin-top: 3px; }

        /* Table */
        .da2-table { width: 100%; border-collapse: collapse; font-size: 13px; }
        .da2-table th { text-align: left; padding: 7px 10px; font-size: 10px; font-weight: 700;
          text-transform: uppercase; letter-spacing: 1px; color: #a89e92; border-bottom: 1px solid rgba(192,122,34,0.1); }
        .da2-table td { padding: 9px 10px; border-bottom: 1px solid rgba(255,255,255,0.025); color: #a89e92; }
        .da2-table td:first-child { color: #d8d0c4; font-weight: 500; }
        .da2-table .total td { font-weight: 700; color: #c07a22; border-top: 1px solid rgba(192,122,34,0.15); }

        .da2-flag { display: flex; gap: 8px; padding: 8px 12px; margin-bottom: 6px; border-radius: 5px; font-size: 12px; line-height: 1.5; }
        .da2-flag.risk { background: rgba(249,115,22,0.04); color: #f97316; border: 1px solid rgba(249,115,22,0.08); }
        .da2-flag.profit { background: rgba(74,222,128,0.04); color: #4ade80; border: 1px solid rgba(74,222,128,0.08); }
        .da2-flag.warn { background: rgba(250,204,21,0.04); color: #facc15; border: 1px solid rgba(250,204,21,0.08); }

        .da2-error { padding: 10px 14px; background: rgba(248,113,113,0.06); border: 1px solid rgba(248,113,113,0.15);
          border-radius: 6px; color: #f87171; font-size: 12px; margin: 10px 0; }

        .da2-check { display: flex; align-items: center; gap: 8px; cursor: pointer; font-size: 13px; color: #8a8477; }
        .da2-check input { accent-color: #c07a22; }

        @media (max-width: 640px) {
          .da2-body { padding: 16px; }
          .da2-grid2, .da2-grid3, .da2-grid4 { grid-template-columns: 1fr; }
          .da2-metrics { grid-template-columns: 1fr 1fr; }
        }
      `}</style>

      {/* HEADER */}
      <div className="da2-header">
        <div className="da2-header-inner">
          <div>
            <h1>Deal Analyzer</h1>
            <div className="sub">Paste a listing link → AI extracts details → pick your terms → get the full breakdown</div>
          </div>
          {(step === "review" || step === "options" || step === "results") && (
            <button className="da2-btn da2-btn-ghost da2-btn-sm" onClick={() => { setStep("url"); setResult(null); setUrl(""); setRentComps(null); }}>
              ← New Property
            </button>
          )}
        </div>
      </div>

      <div className="da2-body">

        {/* ═══════ STEP 1: URL INPUT ═══════ */}
        {step === "url" && (
          <>
            <div className="da2-step-badge" style={{ background: "rgba(192,122,34,0.06)", color: "#c07a22" }}>
              <div className="da2-step-num" style={{ background: "#c07a22", color: "#0c1015" }}>1</div>
              Paste a Listing Link
            </div>

            <div className="da2-url-box">
              <div style={{ fontSize: 28, marginBottom: 4 }}>🔗</div>
              <div style={{ fontSize: 15, color: "#d8d0c4", fontWeight: 500 }}>Drop a property listing URL</div>
              <input
                className="da2-url-input"
                placeholder="https://www.zillow.com/homedetails/..."
                value={url}
                onChange={e => setUrl(e.target.value)}
                onKeyDown={e => e.key === "Enter" && fetchProperty()}
              />
              <div className="da2-url-sources">
                Works with <span>Zillow</span> <span>Redfin</span> <span>Realtor.com</span> <span>Any listing URL</span>
              </div>
            </div>

            <button className="da2-btn da2-btn-primary" onClick={fetchProperty}
              disabled={!url.trim() || fetching}
              style={{ width: "100%", padding: "14px", fontSize: 15 }}>
              {fetching ? "Fetching Property Details..." : "⚡ Fetch Property Details"}
            </button>

            {fetching && (
              <div className="da2-loading" style={{ padding: 30 }}>
                <div className="da2-spinner" />
                <div style={{ color: "#a89e92", fontSize: 13 }}>Searching listing and extracting details...</div>
              </div>
            )}

            <div className="da2-or">or enter manually</div>

            <button className="da2-btn da2-btn-ghost" onClick={() => setStep("review")}
              style={{ width: "100%", padding: "12px" }}>
              Enter Property Details Manually
            </button>
          </>
        )}

        {/* ═══════ STEP 2: REVIEW / EDIT DETAILS ═══════ */}
        {step === "review" && (
          <>
            <div className="da2-step-badge" style={{ background: "rgba(96,165,250,0.06)", color: "#60a5fa" }}>
              <div className="da2-step-num" style={{ background: "#60a5fa", color: "#0c1015" }}>2</div>
              Review Property Details
            </div>

            {fetchError && <div className="da2-error">{fetchError}</div>}

            {property.source && (
              <div className="da2-fetched-badge">
                ✓ Auto-filled from {property.source}
                <span style={{ color: "#a89e92", marginLeft: 4 }}>— verify & edit below</span>
              </div>
            )}

            <div className="da2-section">
              <div className="da2-section-title">Property Info</div>
              <div className="da2-grid2">
                <div className="da2-full">
                  <label className="da2-label">Address</label>
                  <input className="da2-input" value={property.address} onChange={e => updateProp("address", e.target.value)} placeholder="123 Main St" />
                </div>
                <div>
                  <label className="da2-label">City</label>
                  <input className="da2-input" value={property.city} onChange={e => updateProp("city", e.target.value)} />
                </div>
                <div className="da2-grid2" style={{ gridColumn: "1 / -1" }}>
                  <div>
                    <label className="da2-label">State</label>
                    <input className="da2-input" value={property.state} onChange={e => updateProp("state", e.target.value)} />
                  </div>
                  <div>
                    <label className="da2-label">Zip</label>
                    <input className="da2-input" value={property.zip} onChange={e => updateProp("zip", e.target.value)} />
                  </div>
                </div>
                <div>
                  <label className="da2-label">Neighborhood</label>
                  <input className="da2-input" value={property.neighborhood} onChange={e => updateProp("neighborhood", e.target.value)}
                    placeholder="e.g. North Knoxville" list="hoods" />
                  <datalist id="hoods">{NEIGHBORHOODS.map(n => <option key={n} value={n} />)}</datalist>
                </div>
                <div>
                  <label className="da2-label">Asking Price ($)</label>
                  <input className="da2-input" type="number" value={property.askingPrice} onChange={e => updateProp("askingPrice", e.target.value)} />
                </div>
              </div>
            </div>

            <div className="da2-section">
              <div className="da2-section-title">Specs</div>
              <div className="da2-grid4">
                <div>
                  <label className="da2-label">Beds</label>
                  <select className="da2-select" value={property.beds} onChange={e => updateProp("beds", +e.target.value)}>
                    {[1,2,3,4,5,6].map(n => <option key={n} value={n}>{n}</option>)}
                  </select>
                </div>
                <div>
                  <label className="da2-label">Baths</label>
                  <select className="da2-select" value={property.baths} onChange={e => updateProp("baths", +e.target.value)}>
                    {[1,1.5,2,2.5,3,3.5,4].map(n => <option key={n} value={n}>{n}</option>)}
                  </select>
                </div>
                <div>
                  <label className="da2-label">Sqft</label>
                  <input className="da2-input" type="number" value={property.sqft} onChange={e => updateProp("sqft", e.target.value)} />
                </div>
                <div>
                  <label className="da2-label">Year Built</label>
                  <input className="da2-input" type="number" value={property.yearBuilt} onChange={e => updateProp("yearBuilt", e.target.value)} />
                </div>
              </div>
              <div className="da2-grid4" style={{ marginTop: 14 }}>
                <div>
                  <label className="da2-label">Lot (acres)</label>
                  <input className="da2-input" type="number" step="0.01" value={property.lotAcres} onChange={e => updateProp("lotAcres", e.target.value)} />
                </div>
                <div>
                  <label className="da2-label">Property Type</label>
                  <select className="da2-select" value={property.propertyType} onChange={e => updateProp("propertyType", e.target.value)}>
                    {["Single Family","Duplex","Triplex","Quadplex","Townhouse","Condo"].map(t => <option key={t}>{t}</option>)}
                  </select>
                </div>
                <div>
                  <label className="da2-label">Days on Market</label>
                  <input className="da2-input" type="number" value={property.daysOnMarket} onChange={e => updateProp("daysOnMarket", e.target.value)} />
                </div>
                <div>
                  <label className="da2-label">Price Cuts</label>
                  <input className="da2-input" type="number" value={property.priceReductions} onChange={e => updateProp("priceReductions", +e.target.value)} />
                </div>
              </div>
              <div className="da2-grid2" style={{ marginTop: 14 }}>
                <div>
                  <label className="da2-label">HOA ($/mo)</label>
                  <input className="da2-input" type="number" value={property.hoaFees} onChange={e => updateProp("hoaFees", e.target.value)} placeholder="0" />
                </div>
                <div>
                  <label className="da2-label">Annual Taxes ($)</label>
                  <input className="da2-input" type="number" value={property.taxesAnnual} onChange={e => updateProp("taxesAnnual", e.target.value)} placeholder="Auto-estimate" />
                </div>
              </div>
            </div>

            {/* Description & Features */}
            {(property.description || property.features.length > 0) && (
              <div className="da2-section">
                <div className="da2-section-title">Listing Details</div>
                {property.description && (
                  <div style={{ fontSize: 13, color: "#8a8477", lineHeight: 1.6, marginBottom: 8 }}>{property.description}</div>
                )}
                {property.features.length > 0 && (
                  <div className="da2-features">
                    {property.features.map((f, i) => <span key={i} className="da2-feature-tag">{f}</span>)}
                  </div>
                )}
              </div>
            )}

            {/* Investor Notes */}
            <div className="da2-section">
              <div className="da2-section-title">Your Intel</div>
              <div style={{ fontSize: 11, color: "#a89e92", marginBottom: 10 }}>
                Anything you know that the listing doesn't say — condition details, seller motivation, neighborhood context, recent sales nearby, inspection notes, planned development, etc.
              </div>
              <textarea
                className="da2-input"
                style={{ minHeight: 100, resize: "vertical", lineHeight: 1.6 }}
                placeholder="e.g. Drove by — roof looks rough, gutters hanging. Neighbor said owner is relocating for work and wants a quick close. Two flips on same street sold for $280k last year. Zoned for ADU potential..."
                value={investorNotes}
                onChange={e => setInvestorNotes(e.target.value)}
              />
            </div>

            <button className="da2-btn da2-btn-primary" onClick={() => setStep("options")}
              disabled={!property.address || !property.askingPrice || !property.sqft}
              style={{ width: "100%", padding: "14px", fontSize: 15, marginTop: 4 }}>
              Continue → Set Rehab & Financing
            </button>
          </>
        )}

        {/* ═══════ STEP 3: REHAB + FINANCING OPTIONS ═══════ */}
        {step === "options" && (
          <>
            <div className="da2-step-badge" style={{ background: "rgba(74,222,128,0.06)", color: "#4ade80" }}>
              <div className="da2-step-num" style={{ background: "#4ade80", color: "#0c1015" }}>3</div>
              Set Your Terms
            </div>

            {/* Property summary */}
            <div style={{ padding: "12px 16px", background: "rgba(192,122,34,0.03)", borderRadius: 8,
              border: "1px solid rgba(192,122,34,0.08)", marginBottom: 20, fontSize: 13, color: "#8a8477" }}>
              <span style={{ color: "#d8d0c4", fontWeight: 600 }}>{property.address}</span>
              {" · "}{property.beds}bd/{property.baths}ba · {Number(property.sqft).toLocaleString()} sqft · {fmt(property.askingPrice)}
              <button className="da2-btn da2-btn-ghost da2-btn-sm" onClick={() => setStep("review")} style={{ float: "right", padding: "4px 10px" }}>Edit</button>
            </div>

            {/* Investment Goal */}
            <div className="da2-section">
              <div className="da2-section-title">Investment Goal</div>
              <div style={{ fontSize: 11, color: "#a89e92", marginBottom: 10 }}>
                This changes how the AI grades the deal — a great cash flow property might be a bad flip, and vice versa.
              </div>
              <div className="da2-grid4">
                {[
                  { value: "cashflow", label: "Cash Flow", desc: "Monthly income is priority", icon: "💰" },
                  { value: "appreciation", label: "Appreciation", desc: "Long-term equity growth", icon: "📈" },
                  { value: "flip", label: "Flip", desc: "Buy, rehab, sell for profit", icon: "🔨" },
                  { value: "balanced", label: "Balanced", desc: "Score all strategies equally", icon: "⚖️" },
                ].map(g => (
                  <div key={g.value} className={`da2-cond-card ${investmentGoal === g.value ? "active" : ""}`}
                    onClick={() => setInvestmentGoal(g.value)}>
                    <div className="icon">{g.icon}</div>
                    <div className="name">{g.label}</div>
                    <div className="desc">{g.desc}</div>
                  </div>
                ))}
              </div>
            </div>

            {/* Rehab Level */}
            <div className="da2-section">
              <div className="da2-section-title">Rehab Scope</div>
              <div className="da2-grid4">
                {CONDITIONS.map(c => (
                  <div key={c.value} className={`da2-cond-card ${rehabLevel === c.value ? "active" : ""}`}
                    onClick={() => setRehabLevel(c.value)}>
                    <div className="icon">{c.icon}</div>
                    <div className="name">{c.label}</div>
                    <div className="desc">{c.desc}</div>
                  </div>
                ))}
              </div>
              <label className="da2-check" style={{ marginTop: 14 }}>
                <input type="checkbox" checked={analyzeAllRehab} onChange={e => setAnalyzeAllRehab(e.target.checked)} />
                Also compare all 4 rehab scenarios side-by-side
              </label>
            </div>

            {/* Financing */}
            <div className="da2-section">
              <div className="da2-section-title">Financing</div>
              <div className="da2-grid3" style={{ marginBottom: 16 }}>
                {FINANCING.map(f => (
                  <div key={f.value} className={`da2-fin-card ${financing === f.value ? "active" : ""}`}
                    onClick={() => setFinancing(f.value)}>
                    <div className="name">{f.label}</div>
                    <div className="desc">{f.desc}</div>
                  </div>
                ))}
              </div>
              {financing !== "cash" && (
                <div className="da2-grid2">
                  <div>
                    <label className="da2-label">Down Payment %</label>
                    <input className="da2-input" type="number" value={downPct} onChange={e => setDownPct(+e.target.value)} />
                  </div>
                  <div>
                    <label className="da2-label">Interest Rate %</label>
                    <input className="da2-input" type="number" step="0.1" value={rate} onChange={e => setRate(+e.target.value)} />
                  </div>
                </div>
              )}
            </div>

            {analysisError && (
              <div className="da2-error" style={{ marginBottom: 12, padding: "14px 16px" }}>
                <div style={{ fontWeight: 600, marginBottom: 4 }}>Analysis Issue</div>
                <div style={{ fontSize: 12, lineHeight: 1.5, wordBreak: "break-word" }}>{analysisError}</div>
              </div>
            )}

            <button className="da2-btn da2-btn-primary" onClick={runAnalysis}
              style={{ width: "100%", padding: "15px", fontSize: 15 }}>
              ⚡ Analyze This Deal
            </button>
          </>
        )}

        {/* ═══════ ANALYZING ═══════ */}
        {step === "analyzing" && (
          <div className="da2-loading">
            <div className="da2-spinner" />
            <div style={{ color: "#e8e0d4", fontSize: 14, fontWeight: 600 }}>{loadingStatus}</div>
            <div style={{ color: "#a89e92", fontSize: 12, marginTop: 8, maxWidth: 380, lineHeight: 1.6 }}>
              {loadingStatus.includes("rent comp") ?
                "Searching Zillow Rent Zestimate, Rentometer, and active rental listings for this address..." :
                "Rehab · ARV · Cash Flow · Flip · BRRRR · Scenarios"}
            </div>
            <button className="da2-btn da2-btn-ghost da2-btn-sm" onClick={() => { setStep("options"); setAnalysisError("Analysis cancelled."); }}
              style={{ marginTop: 16 }}>Cancel</button>
          </div>
        )}

        {/* ═══════ RESULTS ═══════ */}
        {step === "results" && result && (
          <>
            {/* Property header */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 16 }}>
              <div>
                <div style={{ fontFamily: "'Playfair Display', serif", fontSize: 20, fontWeight: 700, color: "#e8e0d4" }}>
                  {property.address}
                </div>
                <div style={{ fontSize: 12, color: "#a89e92", marginTop: 3 }}>
                  {property.neighborhood ? property.neighborhood + " · " : ""}{property.beds}bd/{property.baths}ba · {Number(property.sqft).toLocaleString()} sqft · {fmt(property.askingPrice)}
                </div>
              </div>
              <button className="da2-btn da2-btn-ghost da2-btn-sm" onClick={() => setStep("options")}>← Change Terms</button>
            </div>

            {/* ── LIVE RENT COMPS PANEL ── */}
            {rentComps && (
              <div className="da2-section" style={{ borderColor: "rgba(96,165,250,0.15)", background: "rgba(96,165,250,0.03)", marginBottom: 18 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                  <div style={{ fontFamily: "'Playfair Display', serif", fontSize: 14, fontWeight: 600, color: "#60a5fa" }}>
                    🔍 Live Rent Comps
                  </div>
                  <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                    <button
                      onClick={() => { setRentComps(null); runAnalysis(); }}
                      style={{ fontSize: 10, padding: "3px 9px", borderRadius: 8, background: "transparent",
                        color: "#8a8477", border: "1px solid rgba(255,255,255,0.06)", cursor: "pointer",
                        fontFamily: "'DM Sans', sans-serif" }}
                    >↺ Re-fetch</button>
                    <span style={{ fontSize: 10, padding: "3px 8px", borderRadius: 10, background: "rgba(96,165,250,0.1)", color: "#60a5fa",
                      border: "1px solid rgba(96,165,250,0.2)", fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.5 }}>
                      {rentComps.confidence} confidence
                    </span>
                  </div>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))", gap: 10, marginBottom: 12 }}>
                  {rentComps.zillowRentZestimate && (
                    <div style={{ textAlign: "center", padding: "10px 8px", background: "rgba(96,165,250,0.06)", borderRadius: 7, border: "1px solid rgba(96,165,250,0.1)" }}>
                      <div style={{ fontFamily: "'Playfair Display', serif", fontSize: 18, fontWeight: 700, color: "#60a5fa" }}>{fmt(rentComps.zillowRentZestimate)}</div>
                      <div style={{ fontSize: 9, textTransform: "uppercase", letterSpacing: 1, color: "#a89e92", marginTop: 2 }}>Zillow Zestimate</div>
                    </div>
                  )}
                  {rentComps.rentometerMedian && (
                    <div style={{ textAlign: "center", padding: "10px 8px", background: "rgba(96,165,250,0.06)", borderRadius: 7, border: "1px solid rgba(96,165,250,0.1)" }}>
                      <div style={{ fontFamily: "'Playfair Display', serif", fontSize: 18, fontWeight: 700, color: "#60a5fa" }}>{fmt(rentComps.rentometerMedian)}</div>
                      <div style={{ fontSize: 9, textTransform: "uppercase", letterSpacing: 1, color: "#a89e92", marginTop: 2 }}>Rentometer Median</div>
                    </div>
                  )}
                  <div style={{ textAlign: "center", padding: "10px 8px", background: "rgba(192,122,34,0.04)", borderRadius: 7, border: "1px solid rgba(192,122,34,0.08)" }}>
                    <div style={{ fontFamily: "'Playfair Display', serif", fontSize: 18, fontWeight: 700, color: "#c07a22" }}>{fmt(rentComps.marketRentMid)}/mo</div>
                    <div style={{ fontSize: 9, textTransform: "uppercase", letterSpacing: 1, color: "#a89e92", marginTop: 2 }}>Market Mid</div>
                  </div>
                  <div style={{ textAlign: "center", padding: "10px 8px", background: "rgba(192,122,34,0.04)", borderRadius: 7, border: "1px solid rgba(192,122,34,0.08)" }}>
                    <div style={{ fontFamily: "'Playfair Display', serif", fontSize: 15, fontWeight: 700, color: "#c07a22" }}>{fmt(rentComps.marketRentLow)}–{fmt(rentComps.marketRentHigh)}</div>
                    <div style={{ fontSize: 9, textTransform: "uppercase", letterSpacing: 1, color: "#a89e92", marginTop: 2 }}>Market Range</div>
                  </div>
                </div>
                {rentComps.activeComps?.length > 0 && (
                  <div style={{ marginBottom: 10 }}>
                    <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: 1, color: "#a89e92", marginBottom: 6 }}>Active Comparable Rentals</div>
                    {rentComps.activeComps.map((c, i) => (
                      <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center",
                        padding: "6px 10px", borderRadius: 5, marginBottom: 3,
                        background: "rgba(255,255,255,0.015)", border: "1px solid rgba(255,255,255,0.03)" }}>
                        <div>
                          <div style={{ fontSize: 12, color: "#d8d0c4" }}>{c.address}</div>
                          <div style={{ fontSize: 10, color: "#8a8477" }}>{c.beds}bd/{c.baths}ba{c.sqft ? ` · ${c.sqft} sqft` : ""} · {c.source}</div>
                        </div>
                        <div style={{ fontFamily: "'Playfair Display', serif", fontSize: 15, fontWeight: 700, color: "#4ade80", flexShrink: 0 }}>{fmt(c.rent)}/mo</div>
                      </div>
                    ))}
                  </div>
                )}
                <div style={{ fontSize: 11, color: "#8a8477", lineHeight: 1.5 }}>
                  <span style={{ color: "#a89e92" }}>Source: </span>{rentComps.dataSource}
                </div>
                {rentComps.onePercentTest && (
                  <div style={{ marginTop: 8, fontSize: 11, color: "#b5ac9f", lineHeight: 1.5, padding: "6px 10px",
                    background: "rgba(192,122,34,0.04)", borderRadius: 5, border: "1px solid rgba(192,122,34,0.08)" }}>
                    <strong style={{ color: "#c07a22" }}>1% Rule: </strong>{rentComps.onePercentTest}
                  </div>
                )}
              </div>
            )}

            {/* Grade block */}
            {result.propertyOverview && (
              <div className="da2-section" style={{ display: "flex", gap: 18, alignItems: "center", marginBottom: 18 }}>
                <div style={{
                  width: 68, height: 68, borderRadius: 10, flexShrink: 0,
                  background: gradeBg(result.propertyOverview.dealGrade),
                  border: `2px solid ${gradeColor(result.propertyOverview.dealGrade)}25`,
                  display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
                }}>
                  <div style={{ fontFamily: "'Playfair Display', serif", fontSize: 34, fontWeight: 900,
                    color: gradeColor(result.propertyOverview.dealGrade), lineHeight: 1 }}>
                    {result.propertyOverview.dealGrade}
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: 14, color: "#c9c0b4", lineHeight: 1.6 }}>{result.propertyOverview.summary}</div>
                  <div style={{ fontSize: 12, color: "#b5ac9f", marginTop: 4 }}>{result.propertyOverview.dealGradeRationale}</div>
                </div>
              </div>
            )}

            {/* Tabs */}
            <div className="da2-tabs">
              {tabs.map(t => (
                <button key={t.id} className={`da2-tab ${activeTab === t.id ? "active" : ""}`}
                  onClick={() => setActiveTab(t.id)}>{t.label}</button>
              ))}
            </div>

            {/* OVERVIEW */}
            {activeTab === "overview" && (
              <div className="da2-metrics">
                <div className="da2-metric"><div className="val">{fmt(property.askingPrice)}</div><div className="lbl">Asking Price</div></div>
                {result.arvAnalysis && <div className="da2-metric"><div className="val">{fmt(result.arvAnalysis.estimatedARV)}</div><div className="lbl">Est. ARV</div></div>}
                {result.rehabEstimate && <div className="da2-metric"><div className="val">{fmt(result.rehabEstimate.totalLow)}–{fmt(result.rehabEstimate.totalHigh)}</div><div className="lbl">Rehab Range</div></div>}
                {result.cashFlowProjection && <div className="da2-metric"><div className="val">{fmt(result.cashFlowProjection.monthlyCashFlow)}/mo</div><div className="lbl">Cash Flow</div></div>}
                {result.flipAnalysis && <div className="da2-metric"><div className="val">{fmt(result.flipAnalysis.estimatedProfit)}</div><div className="lbl">Flip Profit</div></div>}
                {result.cashFlowProjection && <div className="da2-metric"><div className="val">{fmtPct(result.cashFlowProjection.capRate)}</div><div className="lbl">Cap Rate</div></div>}
              </div>
            )}

            {/* REHAB */}
            {activeTab === "rehab" && result.rehabEstimate && (
              <div className="da2-section">
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 12 }}>
                  <div className="da2-section-title" style={{ margin: 0 }}>Rehab Cost Estimate</div>
                  <span style={{ fontSize: 12, color: "#a89e92" }}>Timeline: {result.rehabEstimate.timelineWeeks} weeks</span>
                </div>
                <table className="da2-table">
                  <thead><tr><th>Category</th><th style={{textAlign:"right"}}>Low</th><th style={{textAlign:"right"}}>High</th><th>Notes</th></tr></thead>
                  <tbody>
                    {(result.rehabEstimate.lineItems||[]).map((it,i) => (
                      <tr key={i}><td>{it.category}</td><td style={{textAlign:"right"}}>{fmt(it.lowEstimate)}</td><td style={{textAlign:"right"}}>{fmt(it.highEstimate)}</td><td style={{fontSize:11,color:"#a89e92"}}>{it.notes}</td></tr>
                    ))}
                    <tr className="total"><td>Total</td><td style={{textAlign:"right"}}>{fmt(result.rehabEstimate.totalLow)}</td><td style={{textAlign:"right"}}>{fmt(result.rehabEstimate.totalHigh)}</td><td></td></tr>
                  </tbody>
                </table>
                {(result.rehabEstimate.warnings||[]).map((w,i) => <div key={i} className="da2-flag warn" style={{marginTop:8}}>⚠ {w}</div>)}
              </div>
            )}

            {/* ARV */}
            {activeTab === "arv" && result.arvAnalysis && (
              <div className="da2-section">
                <div className="da2-section-title">After Repair Value</div>
                <div className="da2-metrics">
                  <div className="da2-metric"><div className="val">{fmt(result.arvAnalysis.arvLow)}</div><div className="lbl">Low</div></div>
                  <div className="da2-metric"><div className="val">{fmt(result.arvAnalysis.estimatedARV)}</div><div className="lbl">Estimate</div></div>
                  <div className="da2-metric"><div className="val">{fmt(result.arvAnalysis.arvHigh)}</div><div className="lbl">High</div></div>
                  <div className="da2-metric"><div className="val">${result.arvAnalysis.pricePerSqft}/sf</div><div className="lbl">$/Sqft</div></div>
                </div>
                <div style={{ fontSize: 13, color: "#8a8477", lineHeight: 1.7 }}>
                  <p style={{ marginBottom: 8 }}>{result.arvAnalysis.methodology}</p>
                  <p style={{ color: "#a89e92" }}>{result.arvAnalysis.comparableNotes}</p>
                </div>
              </div>
            )}

            {/* CASH FLOW */}
            {activeTab === "cashflow" && result.cashFlowProjection && (() => {
              const cf = result.cashFlowProjection;
              return (
                <div className="da2-section">
                  <div className="da2-section-title">Rental Cash Flow Projection</div>
                  <div className="da2-metrics">
                    <div className="da2-metric"><div className="val">{fmt(cf.estimatedMonthlyRent)}</div><div className="lbl">Rent/Mo</div></div>
                    <div className="da2-metric"><div className="val">{fmt(cf.monthlyCashFlow)}</div><div className="lbl">Cash Flow/Mo</div></div>
                    <div className="da2-metric"><div className="val">{fmtPct(cf.cashOnCashReturn)}</div><div className="lbl">Cash-on-Cash</div></div>
                    <div className="da2-metric"><div className="val">{fmtPct(cf.capRate)}</div><div className="lbl">Cap Rate</div></div>
                  </div>
                  <table className="da2-table">
                    <thead><tr><th>Monthly Expense</th><th style={{textAlign:"right"}}>Amount</th></tr></thead>
                    <tbody>
                      {Object.entries(cf.monthlyExpenses||{}).map(([k,v]) => (
                        <tr key={k}><td style={{textTransform:"capitalize"}}>{k}</td><td style={{textAlign:"right"}}>{fmt(v)}</td></tr>
                      ))}
                      <tr className="total"><td>Total Expenses</td><td style={{textAlign:"right"}}>{fmt(Object.values(cf.monthlyExpenses||{}).reduce((a,b)=>a+b,0))}</td></tr>
                    </tbody>
                  </table>
                  <div style={{ fontSize: 12, color: "#a89e92", marginTop: 12 }}>{cf.assumptions}</div>
                </div>
              );
            })()}

            {/* FLIP */}
            {activeTab === "flip" && result.flipAnalysis && (() => {
              const fl = result.flipAnalysis;
              return (
                <div className="da2-section">
                  <div className="da2-section-title">Flip Analysis</div>
                  <div className="da2-metrics">
                    <div className="da2-metric"><div className="val">{fmt(fl.totalInvestment)}</div><div className="lbl">Total In</div></div>
                    <div className="da2-metric"><div className="val">{fmt(fl.estimatedProfit)}</div><div className="lbl">Est. Profit</div></div>
                    <div className="da2-metric"><div className="val">{fmtPct(fl.roi)}</div><div className="lbl">ROI</div></div>
                    <div className="da2-metric"><div className="val">{fl.holdTimeMonths} mo</div><div className="lbl">Hold Time</div></div>
                  </div>
                  <table className="da2-table">
                    <thead><tr><th>Component</th><th style={{textAlign:"right"}}>Amount</th></tr></thead>
                    <tbody>
                      <tr><td>Purchase Price</td><td style={{textAlign:"right"}}>{fmt(fl.purchasePrice)}</td></tr>
                      <tr><td>Rehab (Mid)</td><td style={{textAlign:"right"}}>{fmt(fl.rehabCostMid)}</td></tr>
                      <tr><td>Holding Costs</td><td style={{textAlign:"right"}}>{fmt(fl.holdingCosts)}</td></tr>
                      <tr><td>Buy Closing</td><td style={{textAlign:"right"}}>{fmt(fl.buyClosingCosts)}</td></tr>
                      <tr><td>Sell Closing</td><td style={{textAlign:"right"}}>{fmt(fl.sellClosingCosts)}</td></tr>
                      <tr className="total"><td>Total Investment</td><td style={{textAlign:"right"}}>{fmt(fl.totalInvestment)}</td></tr>
                    </tbody>
                  </table>
                  <div style={{ fontSize: 12, color: "#a89e92", marginTop: 12 }}>{fl.breakdownNotes}</div>
                </div>
              );
            })()}

            {/* BRRRR */}
            {activeTab === "brrrr" && result.brrrrAnalysis && (() => {
              const br = result.brrrrAnalysis;
              return (
                <div className="da2-section">
                  <div className="da2-section-title">BRRRR Analysis</div>
                  <div className="da2-metrics">
                    <div className="da2-metric"><div className="val">{fmt(br.arvAfterRehab)}</div><div className="lbl">Post-Rehab ARV</div></div>
                    <div className="da2-metric"><div className="val">{fmt(br.refinanceAmount)}</div><div className="lbl">Refi Amount</div></div>
                    <div className="da2-metric"><div className="val">{fmt(br.cashLeftIn)}</div><div className="lbl">Cash Left In</div></div>
                    <div className="da2-metric">
                      <div className="val" style={{ color: br.infiniteReturn ? "#4ade80" : "#c07a22" }}>
                        {br.infiniteReturn ? "∞" : fmt(br.monthlyCashFlowAfterRefi)}
                      </div>
                      <div className="lbl">{br.infiniteReturn ? "Infinite Return" : "Cash Flow/Mo"}</div>
                    </div>
                  </div>
                  <div style={{ fontSize: 13, color: "#8a8477", lineHeight: 1.7 }}>{br.verdict}</div>
                </div>
              );
            })()}

            {/* SCENARIOS */}
            {activeTab === "scenarios" && result.rehabScenarios && (
              <div className="da2-section">
                <div className="da2-section-title">Rehab Scenarios — 4 Levels Compared</div>
                <table className="da2-table">
                  <thead><tr><th>Level</th><th style={{textAlign:"right"}}>Cost</th><th>Timeline</th><th style={{textAlign:"right"}}>ARV Impact</th><th>Notes</th></tr></thead>
                  <tbody>
                    {result.rehabScenarios.map((r,i) => (
                      <tr key={i}>
                        <td>{r.level}</td>
                        <td style={{textAlign:"right",color:"#c07a22"}}>{fmt(r.cost)}</td>
                        <td>{r.timeline}</td>
                        <td style={{textAlign:"right",color:"#4ade80"}}>{fmt(r.arvImpact)}</td>
                        <td style={{fontSize:11,color:"#a89e92"}}>{r.notes}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* PITCH */}
            {activeTab === "pitch" && result.investorPitch && (() => {
              const p = result.investorPitch;
              return (
                <div style={{
                  padding: 28, borderRadius: 12,
                  background: "linear-gradient(135deg, rgba(192,122,34,0.04), rgba(28,47,32,0.08))",
                  border: "1px solid rgba(192,122,34,0.12)",
                }}>
                  <div style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: 2, color: "#b5ac9f", marginBottom: 8 }}>Investor Pitch</div>
                  <div style={{ fontFamily: "'Playfair Display', serif", fontSize: 22, color: "#c07a22", marginBottom: 18, fontWeight: 700 }}>{p.headline}</div>

                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 20 }}>
                    {(p.keyMetrics||[]).map((m,i) => (
                      <div key={i} style={{ padding: "9px 14px", background: "rgba(192,122,34,0.06)", borderRadius: 5,
                        fontSize: 12, color: "#d8d0c4", borderLeft: "3px solid #c07a22" }}>{m}</div>
                    ))}
                  </div>

                  <div style={{ marginBottom: 16 }}>
                    <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: 1.5, color: "#c07a22", marginBottom: 4 }}>Ideal For</div>
                    <div style={{ fontSize: 13, color: "#a89e92", lineHeight: 1.6 }}>{p.idealFor}</div>
                  </div>

                  {(p.riskFactors||[]).length > 0 && (
                    <div style={{ marginBottom: 16 }}>
                      <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: 1.5, color: "#f97316", marginBottom: 4 }}>Risk Factors</div>
                      {p.riskFactors.map((r,i) => <div key={i} className="da2-flag risk">⚠ {r}</div>)}
                    </div>
                  )}

                  {(p.profitMaximizers||[]).length > 0 && (
                    <div style={{ marginBottom: 16 }}>
                      <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: 1.5, color: "#4ade80", marginBottom: 4 }}>Profit Maximizers</div>
                      {p.profitMaximizers.map((m,i) => <div key={i} className="da2-flag profit">💡 {m}</div>)}
                    </div>
                  )}

                  <div style={{
                    padding: 18, background: "rgba(28,47,32,0.2)", borderRadius: 8,
                    border: "1px solid rgba(192,122,34,0.08)",
                  }}>
                    <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: 1.5, color: "#c07a22", marginBottom: 6 }}>Bottom Line</div>
                    <div style={{ fontSize: 14, color: "#e8e0d4", lineHeight: 1.7 }}>{p.bottomLine}</div>
                  </div>
                </div>
              );
            })()}
          </>
        )}
      </div>
    </div>
  );
}
