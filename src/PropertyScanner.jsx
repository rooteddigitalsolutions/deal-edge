import { useState, useCallback } from "react";

/* ───────────────────────── SAMPLE KNOXVILLE PROPERTIES ───────────────────────── */
const SAMPLE_PROPERTIES = [
  { id: 1, address: "2814 Linden Ave", neighborhood: "North Knoxville", zip: "37914", price: 165000, beds: 3, baths: 1, sqft: 1180, yearBuilt: 1942, lotAcres: 0.18, daysOnMarket: 34, propertyType: "Single Family", condition: "moderate", listDate: "2026-01-30", priceReductions: 1, notes: "Original hardwoods under carpet, knob-and-tube wiring in attic, estate sale. Detached garage. Walking distance to Happy Holler." },
  { id: 2, address: "4407 Skyline Dr", neighborhood: "South Knoxville", zip: "37920", price: 189900, beds: 3, baths: 2, sqft: 1420, yearBuilt: 1958, lotAcres: 0.31, daysOnMarket: 12, propertyType: "Single Family", condition: "light", notes: "Updated electrical, original kitchen and baths. Great views of Smoky Mountains. Near South Knoxville waterfront development.", listDate: "2026-02-21" },
  { id: 3, address: "1012 Churchwell Ave", neighborhood: "4th & Gill", zip: "37917", price: 225000, beds: 4, baths: 2, sqft: 1850, yearBuilt: 1910, lotAcres: 0.14, daysOnMarket: 67, propertyType: "Single Family", condition: "heavy", priceReductions: 2, notes: "Historic Victorian, needs full gut. Foundation issues flagged in previous inspection. Huge upside in hot neighborhood.", listDate: "2025-12-28", listDate: "2025-12-28" },
  { id: 4, address: "5523 Washington Pike", neighborhood: "East Knoxville", zip: "37918", price: 129900, beds: 3, baths: 1, sqft: 1050, yearBuilt: 1965, lotAcres: 0.22, daysOnMarket: 8, propertyType: "Single Family", condition: "moderate", notes: "Brick ranch, solid bones. HVAC 2019. Roof needs replacement within 2 years. Tenant-occupied, lease ends June.", listDate: "2026-02-25" },
  { id: 5, address: "3316 Sutherland Ave", neighborhood: "Bearden", zip: "37919", price: 279000, beds: 3, baths: 2, sqft: 1680, yearBuilt: 1948, lotAcres: 0.24, daysOnMarket: 21, propertyType: "Single Family", condition: "light", notes: "Bearden location near shops/restaurants. Updated HVAC and roof. Kitchen and baths are dated but functional. Large fenced yard.", listDate: "2026-02-12" },
  { id: 6, address: "2201 Cecil Ave", neighborhood: "North Knoxville", zip: "37917", price: 210000, beds: 4, baths: 2, sqft: 1920, yearBuilt: 1925, lotAcres: 0.12, daysOnMarket: 45, propertyType: "Duplex", condition: "moderate", priceReductions: 1, notes: "Up/down duplex — 2/1 each unit. Both units occupied, below-market rents. Separate meters. Needs cosmetic work and porch repair.", listDate: "2026-01-19" },
  { id: 7, address: "6012 Fountain Rd", neighborhood: "Fountain City", zip: "37918", price: 155000, beds: 3, baths: 1.5, sqft: 1240, yearBuilt: 1972, lotAcres: 0.28, daysOnMarket: 5, propertyType: "Single Family", condition: "turnkey", notes: "Recently painted, new LVP flooring throughout. Original cabinets. Quiet street near Fountain City Park.", listDate: "2026-03-01" },
  { id: 8, address: "914 Island Home Ave", neighborhood: "Island Home", zip: "37920", price: 245000, beds: 3, baths: 2, sqft: 1560, yearBuilt: 1936, lotAcres: 0.19, daysOnMarket: 29, propertyType: "Single Family", condition: "light", notes: "Craftsman bungalow in desirable Island Home. Updated plumbing. Kitchen and master bath need refresh. Walk to park and greenway.", listDate: "2026-02-04" },
  { id: 9, address: "3901 Bonny Kate Dr", neighborhood: "South Knoxville", zip: "37920", price: 139000, beds: 2, baths: 1, sqft: 920, yearBuilt: 1955, lotAcres: 0.35, daysOnMarket: 52, propertyType: "Single Family", condition: "heavy", priceReductions: 2, notes: "As-is sale. Fire damage to kitchen — rest of house structurally sound. Large lot with potential for ADU. Investor special.", listDate: "2026-01-12" },
  { id: 10, address: "7220 Karns Valley Dr", neighborhood: "Karns", zip: "37931", price: 199900, beds: 3, baths: 2, sqft: 1380, yearBuilt: 1988, lotAcres: 0.42, daysOnMarket: 16, propertyType: "Single Family", condition: "turnkey", notes: "Move-in ready, recently renovated kitchen. New roof 2024. Good school district. Lower appreciation area but strong rental demand.", listDate: "2026-02-17" },
  { id: 11, address: "1124 Luttrell St", neighborhood: "Mechanicsville", zip: "37921", price: 95000, beds: 2, baths: 1, sqft: 840, yearBuilt: 1940, lotAcres: 0.1, daysOnMarket: 78, propertyType: "Single Family", condition: "heavy", priceReductions: 3, notes: "Vacant lot next door also available ($15k). Needs full renovation. Emerging area near downtown. City incentive zone.", listDate: "2025-12-18" },
  { id: 12, address: "4815 Highland Ave", neighborhood: "West Knoxville", zip: "37919", price: 315000, beds: 4, baths: 2.5, sqft: 2100, yearBuilt: 1975, lotAcres: 0.38, daysOnMarket: 9, propertyType: "Single Family", condition: "light", notes: "Split-level with bonus room. Updated mechanicals. Cosmetic refresh needed — dated finishes. Excellent West Knox location near Turkey Creek.", listDate: "2026-02-24" },
];

const NEIGHBORHOODS = [...new Set(SAMPLE_PROPERTIES.map(p => p.neighborhood))].sort();
const PROPERTY_TYPES = ["Single Family", "Duplex", "Triplex", "Quadplex", "Townhouse", "Condo"];
const CONDITION_LEVELS = [
  { value: "any", label: "Any Condition" },
  { value: "turnkey", label: "Turnkey — I want move-in ready" },
  { value: "light", label: "Light Rehab — cosmetic updates" },
  { value: "moderate", label: "Moderate Rehab — kitchens, baths, mechanicals" },
  { value: "heavy", label: "Heavy / Gut — I'll take on anything" },
];
const CONDITION_RANK = { turnkey: 0, light: 1, moderate: 2, heavy: 3 };

/* ───────────────────────── ANALYSIS PROMPT ───────────────────────── */
const SYSTEM_PROMPT = `You are an expert real estate investment analyst with deep knowledge of markets across the United States. Provide ruthlessly honest, data-grounded analysis tailored to the specific market the property is in.

Use your knowledge of local rehab costs, rent ranges, tax rates, cap rates, vacancy rates, and neighborhood dynamics for whatever market the property is in. Be conservative and flag risks clearly.

For Knoxville, TN area properties, use these precise benchmarks:
- Rehab $/sqft: Cosmetic $8-15 | Light $20-35 | Moderate $40-65 | Heavy $75-120
- Property tax: ~$2.12/$100 assessed (Knox County)
- Insurance: $1,200-2,400/yr | Vacancy: 5-8% | Management: 8-10% | Maintenance: 5-8%
- Cap rates: 6-9% | Closing costs: ~2-3% buy, ~6-8% sell
- Monthly rents: 1BR $800-1,100 | 2BR $1,000-1,400 | 3BR $1,200-1,800 | 4BR $1,500-2,200
- Hot rental areas: North Knox, South Knox, Bearden, Fort Sanders, 4th & Gill
- Appreciating: South Knox, North Knox/Happy Holler, East Knox, Lonsdale, Mechanicsville
- Premium: Sequoyah Hills, Bearden, Farragut (higher entry, lower caps)
- Hard money: 12-14% interest, 2-3 points, 12mo term typical

Respond ONLY with valid JSON. No markdown, no backticks.

{
  "overallScore": number (1-100),
  "dealGrade": "A|B|C|D|F",
  "oneLiner": "string",
  "strategies": {
    "buyAndHold": {
      "score": number (1-100),
      "grade": "A|B|C|D|F",
      "monthlyRent": number,
      "monthlyCashFlow": number,
      "annualCashFlow": number,
      "cashOnCash": number,
      "capRate": number,
      "monthlyExpenses": { "mortgage": number, "taxes": number, "insurance": number, "management": number, "maintenance": number, "vacancy": number },
      "yearOneROI": number,
      "fiveYearEquity": number,
      "verdict": "string"
    },
    "flip": {
      "score": number (1-100),
      "grade": "A|B|C|D|F",
      "arv": number,
      "totalInvestment": number,
      "estimatedProfit": number,
      "roi": number,
      "holdMonths": number,
      "verdict": "string"
    },
    "brrrr": {
      "score": number (1-100),
      "grade": "A|B|C|D|F",
      "arvAfterRehab": number,
      "refinanceAmount": number,
      "cashLeftIn": number,
      "monthlyCashFlowAfterRefi": number,
      "infiniteReturn": boolean,
      "verdict": "string"
    }
  },
  "rehabScenarios": [
    { "level": "Cosmetic", "cost": number, "timeline": "string", "arvImpact": number, "notes": "string" },
    { "level": "Light", "cost": number, "timeline": "string", "arvImpact": number, "notes": "string" },
    { "level": "Moderate", "cost": number, "timeline": "string", "arvImpact": number, "notes": "string" },
    { "level": "Full Gut", "cost": number, "timeline": "string", "arvImpact": number, "notes": "string" }
  ],
  "riskFlags": ["string"],
  "profitMaximizers": ["string"],
  "idealInvestorProfile": "string",
  "bottomLine": "string"
}`;

/* ───────────────────────── UTILS ───────────────────────── */
const fmt = n => n == null || isNaN(n) ? "$0" : "$" + Math.round(n).toLocaleString();
const fmtPct = n => n == null || isNaN(n) ? "0%" : n.toFixed(1) + "%";

const gradeColor = g => ({
  A: "#4ade80", B: "#60a5fa", C: "#facc15", D: "#f97316", F: "#f87171"
}[g] || "#8a8477");

const gradeBg = g => ({
  A: "rgba(74,222,128,0.08)", B: "rgba(96,165,250,0.08)", C: "rgba(250,204,21,0.08)",
  D: "rgba(249,115,22,0.08)", F: "rgba(248,113,113,0.08)"
}[g] || "rgba(138,132,119,0.08)");

/* ───────────────────────── MAIN COMPONENT ───────────────────────── */
export default function PropertyScanner() {
  const [view, setView] = useState("criteria"); // criteria | results | detail
  const [criteria, setCriteria] = useState({
    neighborhoods: [],
    propertyTypes: ["Single Family", "Duplex", "Triplex", "Quadplex", "Townhouse", "Condo"],
    bedsMin: 2, bedsMax: 5,
    bathsMin: 1, bathsMax: 4,
    priceMin: 50000, priceMax: 350000,
    sqftMin: 600, sqftMax: 3000,
    yearMin: 1900, yearMax: 2026,
    lotMin: 0, lotMax: 2,
    maxRehabLevel: "heavy",
    financingType: "conventional",
    downPaymentPct: 20,
    interestRate: 7.0,
    daysOnMarketMax: 180,
    listDateAfter: "",
    minCashOnCash: 0,
    minCapRate: 0,
  });
  const [results, setResults] = useState([]);
  const [notRecommendedResults, setNotRecommendedResults] = useState([]);
  const [selectedProperty, setSelectedProperty] = useState(null);
  const [analysis, setAnalysis] = useState(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [scanCount, setScanCount] = useState(0);
  const [showNotRecommended, setShowNotRecommended] = useState(false);

  const updateCriteria = (k, v) => setCriteria(prev => ({ ...prev, [k]: v }));

  const toggleNeighborhood = n => {
    setCriteria(prev => ({
      ...prev,
      neighborhoods: prev.neighborhoods.includes(n)
        ? prev.neighborhoods.filter(x => x !== n)
        : [...prev.neighborhoods, n]
    }));
  };

  const togglePropertyType = t => {
    setCriteria(prev => ({
      ...prev,
      propertyTypes: prev.propertyTypes.includes(t)
        ? prev.propertyTypes.filter(x => x !== t)
        : [...prev.propertyTypes, t]
    }));
  };

  /* ── FILTER & RANK ── */
  const runScan = useCallback(() => {
    const c = criteria;
    const scored = SAMPLE_PROPERTIES.map(p => {
      let score = 50;
      const reasons = [];
      let matchesCriteria = true;
      if (c.neighborhoods.length > 0 && !c.neighborhoods.includes(p.neighborhood)) { matchesCriteria = false; reasons.push("Outside selected neighborhoods"); }
      if (c.propertyTypes.length > 0 && !c.propertyTypes.includes(p.propertyType)) { matchesCriteria = false; reasons.push(p.propertyType + " not selected"); }
      if (p.beds < c.bedsMin || p.beds > c.bedsMax) { matchesCriteria = false; reasons.push(p.beds + " beds outside range"); }
      if (p.baths < c.bathsMin || p.baths > c.bathsMax) { matchesCriteria = false; reasons.push(p.baths + " baths outside range"); }
      if (p.price < c.priceMin || p.price > c.priceMax) { matchesCriteria = false; reasons.push("$" + p.price.toLocaleString() + " outside budget"); }
      if (p.sqft < c.sqftMin || p.sqft > c.sqftMax) { matchesCriteria = false; reasons.push(p.sqft + " sqft outside range"); }
      if (p.yearBuilt < c.yearMin || p.yearBuilt > c.yearMax) { matchesCriteria = false; reasons.push("Built " + p.yearBuilt + " outside range"); }
      if (p.lotAcres < c.lotMin || p.lotAcres > c.lotMax) { matchesCriteria = false; reasons.push(p.lotAcres + " acres outside range"); }
      if (CONDITION_RANK[p.condition] > CONDITION_RANK[c.maxRehabLevel]) { matchesCriteria = false; reasons.push(p.condition + " rehab exceeds tolerance"); }
      if (p.daysOnMarket > c.daysOnMarketMax) { matchesCriteria = false; reasons.push(p.daysOnMarket + " DOM exceeds max"); }
      if (c.listDateAfter && p.listDate < c.listDateAfter) { matchesCriteria = false; reasons.push("Listed before date filter"); }
      const ppsf = p.price / p.sqft;
      if (ppsf < 100) score += 15; else if (ppsf < 130) score += 10; else if (ppsf < 160) score += 5;
      if (p.daysOnMarket > 60) score += 10; else if (p.daysOnMarket > 30) score += 5;
      if (p.priceReductions) score += p.priceReductions * 5;
      if (["North Knoxville", "South Knoxville", "4th & Gill", "Mechanicsville"].includes(p.neighborhood)) score += 8;
      if (p.propertyType === "Duplex") score += 10;
      if (p.condition === "heavy" && ppsf < 120) score += 10;
      return { ...p, quickScore: Math.min(score, 99), matchesCriteria, reasons };
    });
    const recommended = scored.filter(p => p.matchesCriteria).sort((a, b) => b.quickScore - a.quickScore);
    const notRec = scored.filter(p => !p.matchesCriteria).sort((a, b) => b.quickScore - a.quickScore);
    setResults(recommended);
    setNotRecommendedResults(notRec);
    setScanCount(recommended.length);
    setShowNotRecommended(false);
    setView("results");
  }, [criteria]);

  /* ── AI ANALYSIS ── */
  const analyzeProperty = async (property) => {
    setSelectedProperty(property);
    setAnalysis(null);
    setAnalyzing(true);
    setView("detail");

    const prompt = `Analyze this Knoxville investment property across ALL strategies:

${property.address}, ${property.neighborhood}, Knoxville TN ${property.zip}
Price: $${property.price.toLocaleString()} | ${property.beds}bd/${property.baths}ba | ${property.sqft} sqft
Built: ${property.yearBuilt} | Lot: ${property.lotAcres} acres | Condition: ${property.condition}
Days on Market: ${property.daysOnMarket} | Price Reductions: ${property.priceReductions || 0}
Notes: ${property.notes}

Investor Financing: ${criteria.financingType}, ${criteria.downPaymentPct}% down, ${criteria.interestRate}% rate

Provide rehab scenarios at ALL 4 levels (cosmetic/light/moderate/full gut) with costs, timelines, and ARV impact.
Score Buy & Hold, Flip, and BRRRR strategies independently.`;

    try {
      const response = await fetch("/api/anthropic", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "claude-sonnet-4-20250514",
          max_tokens: 4000,
          system: SYSTEM_PROMPT,
          messages: [{ role: "user", content: prompt }],
        }),
      });
      const data = await response.json();
      const text = data.content?.map(b => b.text || "").join("") || "";
      const clean = text.replace(/```json|```/g, "").trim();
      setAnalysis(JSON.parse(clean));
    } catch (err) {
      console.error(err);
      setAnalysis({ error: true });
    }
    setAnalyzing(false);
  };

  /* ───────────────────────── STYLES ───────────────────────── */
  const S = {
    page: {
      minHeight: "100vh", background: "#0b0f13", color: "#d4cdc2",
      fontFamily: "'DM Sans', 'Helvetica Neue', sans-serif",
    },
  };

  return (
    <div style={S.page}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;600;700&family=Playfair+Display:wght@400;600;700;800;900&display=swap');
        * { box-sizing: border-box; margin: 0; padding: 0; }
        ::-webkit-scrollbar { width: 6px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: rgba(192,122,34,0.3); border-radius: 3px; }

        .ps-header {
          padding: 28px 36px 20px;
          border-bottom: 1px solid rgba(192,122,34,0.12);
          background: linear-gradient(180deg, rgba(192,122,34,0.04) 0%, transparent 100%);
          display: flex; justify-content: space-between; align-items: center;
        }
        .ps-header h1 {
          font-family: 'Playfair Display', Georgia, serif;
          font-size: 24px; font-weight: 800; color: #c07a22;
          letter-spacing: -0.5px;
        }
        .ps-header .sub { color: #6a6358; font-size: 12px; margin-top: 2px; font-weight: 300; }
        .ps-body { padding: 24px 36px 60px; max-width: 1000px; margin: 0 auto; }

        .ps-label {
          font-size: 10px; font-weight: 700; text-transform: uppercase;
          letter-spacing: 1.5px; color: #6a6358; margin-bottom: 6px; display: block;
        }
        .ps-input, .ps-select {
          width: 100%; padding: 9px 12px;
          background: rgba(255,255,255,0.03); border: 1px solid rgba(192,122,34,0.15);
          border-radius: 5px; color: #d4cdc2; font-size: 13px;
          font-family: 'DM Sans', sans-serif; outline: none;
          transition: border-color 0.2s;
        }
        .ps-input:focus, .ps-select:focus { border-color: #c07a22; }
        .ps-input::placeholder { color: #3d3a35; }
        .ps-select option { background: #14191f; color: #d4cdc2; }

        .ps-chip {
          display: inline-flex; align-items: center; padding: 5px 12px;
          border-radius: 20px; font-size: 12px; font-weight: 500;
          border: 1px solid rgba(192,122,34,0.15); color: #8a8477;
          cursor: pointer; transition: all 0.15s; margin: 3px;
          background: transparent;
        }
        .ps-chip:hover { border-color: rgba(192,122,34,0.4); color: #c07a22; }
        .ps-chip.active {
          background: rgba(192,122,34,0.12); border-color: #c07a22;
          color: #c07a22; font-weight: 600;
        }

        .ps-range-row {
          display: grid; grid-template-columns: 1fr auto 1fr; gap: 8px; align-items: end;
        }
        .ps-range-sep { color: #3d3a35; font-size: 13px; padding-bottom: 10px; text-align: center; }

        .ps-section {
          background: rgba(255,255,255,0.018); border: 1px solid rgba(192,122,34,0.08);
          border-radius: 10px; padding: 20px; margin-bottom: 16px;
        }
        .ps-section-title {
          font-family: 'Playfair Display', serif; font-size: 15px;
          color: #c07a22; margin-bottom: 14px; font-weight: 600;
        }

        .ps-btn {
          display: inline-flex; align-items: center; justify-content: center; gap: 8px;
          padding: 13px 28px; border: none; border-radius: 7px;
          font-size: 14px; font-weight: 600; font-family: 'DM Sans', sans-serif;
          cursor: pointer; transition: all 0.2s; letter-spacing: 0.3px;
        }
        .ps-btn-primary {
          background: linear-gradient(135deg, #c07a22, #9a6018); color: #fff;
        }
        .ps-btn-primary:hover { transform: translateY(-1px); box-shadow: 0 6px 20px rgba(192,122,34,0.25); }
        .ps-btn-ghost {
          background: transparent; color: #c07a22;
          border: 1px solid rgba(192,122,34,0.25);
        }
        .ps-btn-ghost:hover { background: rgba(192,122,34,0.06); }

        /* PROPERTY CARD */
        .ps-card {
          background: rgba(255,255,255,0.02); border: 1px solid rgba(192,122,34,0.1);
          border-radius: 10px; padding: 20px; margin-bottom: 12px;
          cursor: pointer; transition: all 0.2s;
        }
        .ps-card:hover { border-color: rgba(192,122,34,0.3); transform: translateY(-1px); }
        .ps-card-head { display: flex; justify-content: space-between; align-items: flex-start; }
        .ps-card-addr { font-size: 15px; font-weight: 600; color: #e8e0d4; }
        .ps-card-hood { font-size: 12px; color: #8a8477; margin-top: 2px; }
        .ps-card-score-badge {
          width: 48px; height: 48px; border-radius: 8px;
          display: flex; align-items: center; justify-content: center;
          font-family: 'Playfair Display', serif; font-size: 20px; font-weight: 800;
          flex-shrink: 0;
        }
        .ps-card-metrics {
          display: flex; gap: 20px; margin-top: 14px; flex-wrap: wrap;
        }
        .ps-card-metric .val { font-size: 14px; font-weight: 600; color: #c07a22; }
        .ps-card-metric .lbl { font-size: 10px; text-transform: uppercase; letter-spacing: 1px; color: #6a6358; }
        .ps-card-tags { display: flex; gap: 6px; margin-top: 10px; flex-wrap: wrap; }
        .ps-card-tag {
          font-size: 10px; padding: 3px 8px; border-radius: 3px;
          background: rgba(192,122,34,0.06); color: #8a8477;
          border: 1px solid rgba(192,122,34,0.08);
        }
        .ps-card-tag.hot { background: rgba(74,222,128,0.06); color: #4ade80; border-color: rgba(74,222,128,0.15); }
        .ps-card-tag.warn { background: rgba(249,115,22,0.06); color: #f97316; border-color: rgba(249,115,22,0.15); }

        /* DETAIL VIEW */
        .ps-detail-header {
          padding: 20px 0; border-bottom: 1px solid rgba(192,122,34,0.1);
          margin-bottom: 20px;
        }
        .ps-strat-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; margin-bottom: 20px; }
        .ps-strat-card {
          padding: 16px; border-radius: 8px; text-align: center;
          border: 1px solid rgba(192,122,34,0.1);
        }
        .ps-strat-card .name { font-size: 11px; text-transform: uppercase; letter-spacing: 1.2px; color: #6a6358; margin-bottom: 8px; }
        .ps-strat-card .grade {
          font-family: 'Playfair Display', serif; font-size: 36px; font-weight: 900;
          line-height: 1;
        }
        .ps-strat-card .scr { font-size: 12px; color: #6a6358; margin-top: 4px; }
        .ps-strat-card .verd { font-size: 12px; color: #8a8477; margin-top: 8px; line-height: 1.5; }

        .ps-detail-table { width: 100%; border-collapse: collapse; font-size: 13px; }
        .ps-detail-table th {
          text-align: left; padding: 8px 10px; font-size: 10px; font-weight: 700;
          text-transform: uppercase; letter-spacing: 1.2px; color: #6a6358;
          border-bottom: 1px solid rgba(192,122,34,0.12);
        }
        .ps-detail-table td {
          padding: 9px 10px; border-bottom: 1px solid rgba(255,255,255,0.03);
          color: #b0a898;
        }
        .ps-detail-table td:first-child { color: #d4cdc2; font-weight: 500; }

        .ps-flag {
          display: flex; gap: 8px; padding: 8px 12px; margin-bottom: 6px;
          border-radius: 5px; font-size: 12px; line-height: 1.5;
        }
        .ps-flag.risk { background: rgba(249,115,22,0.05); color: #f97316; border: 1px solid rgba(249,115,22,0.1); }
        .ps-flag.profit { background: rgba(74,222,128,0.05); color: #4ade80; border: 1px solid rgba(74,222,128,0.1); }

        .ps-spinner {
          width: 40px; height: 40px; border: 3px solid rgba(192,122,34,0.12);
          border-top-color: #c07a22; border-radius: 50%;
          animation: spin 0.7s linear infinite; margin: 0 auto;
        }
        @keyframes spin { to { transform: rotate(360deg); } }

        @media (max-width: 700px) {
          .ps-body { padding: 16px; }
          .ps-strat-grid { grid-template-columns: 1fr; }
          .ps-range-row { grid-template-columns: 1fr; }
          .ps-range-sep { display: none; }
        }
      `}</style>

      {/* HEADER */}
      <div className="ps-header">
        <div>
          <h1>Property Scanner</h1>
          <div className="sub">AI-powered investment analysis across Buy & Hold · Flip · BRRRR · Sample data: Knoxville, TN</div>
        </div>
        {view !== "criteria" && (
          <button className="ps-btn ps-btn-ghost" onClick={() => setView("criteria")}>
            ← Edit Criteria
          </button>
        )}
      </div>

      <div className="ps-body">

        {/* ═══════════ CRITERIA VIEW ═══════════ */}
        {view === "criteria" && (
          <>
            {/* Neighborhoods */}
            <div className="ps-section">
              <div className="ps-section-title">Neighborhoods</div>
              <div style={{ fontSize: 11, color: "#5a5549", marginBottom: 10 }}>
                Select specific areas or leave blank to search all of Knoxville
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 0 }}>
                {NEIGHBORHOODS.map(n => (
                  <button key={n} className={`ps-chip ${criteria.neighborhoods.includes(n) ? "active" : ""}`}
                    onClick={() => toggleNeighborhood(n)}>{n}</button>
                ))}
              </div>
            </div>

            {/* Property Type */}
            <div className="ps-section">
              <div className="ps-section-title">Property Type</div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 0 }}>
                {PROPERTY_TYPES.map(t => (
                  <button key={t} className={`ps-chip ${criteria.propertyTypes.includes(t) ? "active" : ""}`}
                    onClick={() => togglePropertyType(t)}>{t}</button>
                ))}
              </div>
            </div>

            {/* Ranges */}
            <div className="ps-section">
              <div className="ps-section-title">Property Specifications</div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
                {/* Price */}
                <div>
                  <label className="ps-label">Price Range</label>
                  <div className="ps-range-row">
                    <input className="ps-input" type="number" placeholder="Min" value={criteria.priceMin}
                      onChange={e => updateCriteria("priceMin", +e.target.value)} />
                    <span className="ps-range-sep">—</span>
                    <input className="ps-input" type="number" placeholder="Max" value={criteria.priceMax}
                      onChange={e => updateCriteria("priceMax", +e.target.value)} />
                  </div>
                </div>
                {/* Beds */}
                <div>
                  <label className="ps-label">Bedrooms</label>
                  <div className="ps-range-row">
                    <input className="ps-input" type="number" value={criteria.bedsMin}
                      onChange={e => updateCriteria("bedsMin", +e.target.value)} />
                    <span className="ps-range-sep">—</span>
                    <input className="ps-input" type="number" value={criteria.bedsMax}
                      onChange={e => updateCriteria("bedsMax", +e.target.value)} />
                  </div>
                </div>
                {/* Baths */}
                <div>
                  <label className="ps-label">Bathrooms</label>
                  <div className="ps-range-row">
                    <input className="ps-input" type="number" step="0.5" value={criteria.bathsMin}
                      onChange={e => updateCriteria("bathsMin", +e.target.value)} />
                    <span className="ps-range-sep">—</span>
                    <input className="ps-input" type="number" step="0.5" value={criteria.bathsMax}
                      onChange={e => updateCriteria("bathsMax", +e.target.value)} />
                  </div>
                </div>
                {/* Sqft */}
                <div>
                  <label className="ps-label">Square Footage</label>
                  <div className="ps-range-row">
                    <input className="ps-input" type="number" value={criteria.sqftMin}
                      onChange={e => updateCriteria("sqftMin", +e.target.value)} />
                    <span className="ps-range-sep">—</span>
                    <input className="ps-input" type="number" value={criteria.sqftMax}
                      onChange={e => updateCriteria("sqftMax", +e.target.value)} />
                  </div>
                </div>
                {/* Year Built */}
                <div>
                  <label className="ps-label">Year Built</label>
                  <div className="ps-range-row">
                    <input className="ps-input" type="number" value={criteria.yearMin}
                      onChange={e => updateCriteria("yearMin", +e.target.value)} />
                    <span className="ps-range-sep">—</span>
                    <input className="ps-input" type="number" value={criteria.yearMax}
                      onChange={e => updateCriteria("yearMax", +e.target.value)} />
                  </div>
                </div>
                {/* Lot */}
                <div>
                  <label className="ps-label">Lot Size (acres)</label>
                  <div className="ps-range-row">
                    <input className="ps-input" type="number" step="0.05" value={criteria.lotMin}
                      onChange={e => updateCriteria("lotMin", +e.target.value)} />
                    <span className="ps-range-sep">—</span>
                    <input className="ps-input" type="number" step="0.05" value={criteria.lotMax}
                      onChange={e => updateCriteria("lotMax", +e.target.value)} />
                  </div>
                </div>
              </div>
            </div>

            {/* Condition & Timing */}
            <div className="ps-section">
              <div className="ps-section-title">Condition & Timing</div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
                <div>
                  <label className="ps-label">Max Rehab I'll Take On</label>
                  <select className="ps-select" value={criteria.maxRehabLevel}
                    onChange={e => updateCriteria("maxRehabLevel", e.target.value)}>
                    {CONDITION_LEVELS.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
                  </select>
                </div>
                <div>
                  <label className="ps-label">Max Days on Market</label>
                  <input className="ps-input" type="number" value={criteria.daysOnMarketMax}
                    onChange={e => updateCriteria("daysOnMarketMax", +e.target.value)} />
                </div>
                <div>
                  <label className="ps-label">Listed After</label>
                  <input className="ps-input" type="date" value={criteria.listDateAfter}
                    onChange={e => updateCriteria("listDateAfter", e.target.value)} />
                </div>
              </div>
            </div>

            {/* Financing */}
            <div className="ps-section">
              <div className="ps-section-title">Financing Assumptions</div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 16 }}>
                <div>
                  <label className="ps-label">Financing Type</label>
                  <select className="ps-select" value={criteria.financingType}
                    onChange={e => updateCriteria("financingType", e.target.value)}>
                    <option value="conventional">Conventional</option>
                    <option value="hard_money">Hard Money</option>
                    <option value="cash">Cash</option>
                  </select>
                </div>
                <div>
                  <label className="ps-label">Down Payment %</label>
                  <input className="ps-input" type="number" value={criteria.downPaymentPct}
                    onChange={e => updateCriteria("downPaymentPct", +e.target.value)} />
                </div>
                <div>
                  <label className="ps-label">Interest Rate %</label>
                  <input className="ps-input" type="number" step="0.1" value={criteria.interestRate}
                    onChange={e => updateCriteria("interestRate", +e.target.value)} />
                </div>
              </div>
            </div>

            {/* Return Floors */}
            <div className="ps-section">
              <div className="ps-section-title">Minimum Return Thresholds</div>
              <div style={{ fontSize: 11, color: "#5a5549", marginBottom: 10 }}>
                Optional — AI will flag properties below these thresholds
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
                <div>
                  <label className="ps-label">Min Cash-on-Cash Return %</label>
                  <input className="ps-input" type="number" step="0.5" value={criteria.minCashOnCash}
                    onChange={e => updateCriteria("minCashOnCash", +e.target.value)} />
                </div>
                <div>
                  <label className="ps-label">Min Cap Rate %</label>
                  <input className="ps-input" type="number" step="0.5" value={criteria.minCapRate}
                    onChange={e => updateCriteria("minCapRate", +e.target.value)} />
                </div>
              </div>
            </div>

            <button className="ps-btn ps-btn-primary" onClick={runScan}
              style={{ width: "100%", marginTop: 8, padding: "15px 28px", fontSize: 15 }}>
              ⚡ Scan {criteria.neighborhoods.length > 0 ? criteria.neighborhoods.length + " Neighborhood" + (criteria.neighborhoods.length > 1 ? "s" : "") : "All Knoxville"}
            </button>
          </>
        )}

        {/* ═══════════ RESULTS VIEW ═══════════ */}
        {view === "results" && (
          <>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
              <div>
                <span style={{ fontFamily: "'Playfair Display', serif", fontSize: 20, color: "#c07a22", fontWeight: 700 }}>
                  {scanCount} Properties Found
                </span>
                <span style={{ fontSize: 12, color: "#5a5549", marginLeft: 12 }}>
                  Ranked by investment potential
                </span>
              </div>
              <button className="ps-btn ps-btn-ghost" onClick={() => setView("criteria")} style={{ fontSize: 12, padding: "8px 16px" }}>
                Refine Search
              </button>
            </div>

            {results.length === 0 && (
              <div className="ps-section" style={{ textAlign: "center", padding: 40 }}>
                <div style={{ fontSize: 18, color: "#e8890c", fontFamily: "'Playfair Display', serif", fontWeight: 700 }}>No recommended investment opportunities right now.</div>
                <div style={{ fontSize: 13, color: "#6a6358", marginTop: 8, lineHeight: 1.6 }}>None of the current listings match your criteria. Try widening your price range, adding more property types, or adjusting your rehab tolerance.</div>
              </div>
            )}

            {results.map((p, idx) => (
              <div key={p.id} className="ps-card" onClick={() => analyzeProperty(p)}>
                <div className="ps-card-head">
                  <div>
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <span style={{ color: "#3d3a35", fontSize: 12, fontWeight: 700 }}>#{idx + 1}</span>
                      <span className="ps-card-addr">{p.address}</span>
                    </div>
                    <div className="ps-card-hood">{p.neighborhood} · {p.zip}</div>
                  </div>
                  <div className="ps-card-score-badge" style={{
                    background: p.quickScore >= 70 ? "rgba(74,222,128,0.08)" : p.quickScore >= 50 ? "rgba(250,204,21,0.08)" : "rgba(249,115,22,0.08)",
                    border: `1px solid ${p.quickScore >= 70 ? "rgba(74,222,128,0.2)" : p.quickScore >= 50 ? "rgba(250,204,21,0.2)" : "rgba(249,115,22,0.2)"}`,
                    color: p.quickScore >= 70 ? "#4ade80" : p.quickScore >= 50 ? "#facc15" : "#f97316",
                  }}>
                    {p.quickScore}
                  </div>
                </div>

                <div className="ps-card-metrics">
                  <div className="ps-card-metric"><div className="val">{fmt(p.price)}</div><div className="lbl">Price</div></div>
                  <div className="ps-card-metric"><div className="val">{p.beds}/{p.baths}</div><div className="lbl">Bd/Ba</div></div>
                  <div className="ps-card-metric"><div className="val">{p.sqft.toLocaleString()}</div><div className="lbl">Sqft</div></div>
                  <div className="ps-card-metric"><div className="val">${Math.round(p.price / p.sqft)}</div><div className="lbl">$/Sqft</div></div>
                  <div className="ps-card-metric"><div className="val">{p.daysOnMarket}d</div><div className="lbl">DOM</div></div>
                  <div className="ps-card-metric"><div className="val">{p.yearBuilt}</div><div className="lbl">Built</div></div>
                </div>

                <div className="ps-card-tags">
                  <span className="ps-card-tag">{p.condition}</span>
                  <span className="ps-card-tag">{p.propertyType}</span>
                  <span className="ps-card-tag">{p.lotAcres} ac</span>
                  {p.priceReductions > 0 && <span className="ps-card-tag hot">↓ {p.priceReductions} price cut{p.priceReductions > 1 ? "s" : ""}</span>}
                  {p.daysOnMarket > 45 && <span className="ps-card-tag hot">Sitting — motivated?</span>}
                  {["North Knoxville", "South Knoxville", "4th & Gill", "Mechanicsville"].includes(p.neighborhood) && <span className="ps-card-tag hot">↑ Appreciating</span>}
                </div>

                <div style={{ fontSize: 12, color: "#5a5549", marginTop: 10, lineHeight: 1.5 }}>{p.notes}</div>
                <div style={{ fontSize: 11, color: "#c07a22", marginTop: 10, fontWeight: 500 }}>Click for full AI analysis →</div>
              </div>
            ))}

            {/* NOT RECOMMENDED SECTION */}
            {notRecommendedResults.length > 0 && (
              <div style={{ marginTop: 32 }}>
                <button onClick={() => setShowNotRecommended(!showNotRecommended)} style={{
                  width: "100%", padding: "14px 20px", background: "rgba(255,255,255,0.02)",
                  border: "1px solid rgba(138,132,119,0.15)", borderRadius: 8, cursor: "pointer",
                  display: "flex", justifyContent: "space-between", alignItems: "center",
                  fontFamily: "'DM Sans', sans-serif",
                }}>
                  <span style={{ fontSize: 14, color: "#6a6358", fontWeight: 500 }}>
                    {showNotRecommended ? "▾" : "▸"} {notRecommendedResults.length} listings outside your criteria
                  </span>
                  <span style={{ fontSize: 11, color: "#4a4540" }}>
                    {showNotRecommended ? "Hide" : "Show why they were filtered out"}
                  </span>
                </button>

                {showNotRecommended && notRecommendedResults.map((p, idx) => (
                  <div key={p.id} className="ps-card" onClick={() => analyzeProperty(p)}
                    style={{ opacity: 0.7, borderColor: "rgba(138,132,119,0.1)" }}>
                    <div className="ps-card-head">
                      <div>
                        <span className="ps-card-addr">{p.address}</span>
                        <div className="ps-card-hood">{p.neighborhood} · {p.zip}</div>
                      </div>
                      <div className="ps-card-score-badge" style={{
                        background: "rgba(138,132,119,0.08)",
                        border: "1px solid rgba(138,132,119,0.15)",
                        color: "#6a6358",
                      }}>
                        {p.quickScore}
                      </div>
                    </div>

                    <div className="ps-card-metrics">
                      <div className="ps-card-metric"><div className="val" style={{ color: "#6a6358" }}>{fmt(p.price)}</div><div className="lbl">Price</div></div>
                      <div className="ps-card-metric"><div className="val" style={{ color: "#6a6358" }}>{p.beds}/{p.baths}</div><div className="lbl">Bd/Ba</div></div>
                      <div className="ps-card-metric"><div className="val" style={{ color: "#6a6358" }}>{p.sqft.toLocaleString()}</div><div className="lbl">Sqft</div></div>
                      <div className="ps-card-metric"><div className="val" style={{ color: "#6a6358" }}>{p.condition}</div><div className="lbl">Condition</div></div>
                    </div>

                    <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginTop: 8 }}>
                      {p.reasons.map((r, i) => (
                        <span key={i} style={{
                          fontSize: 10, padding: "3px 8px", borderRadius: 3,
                          background: "rgba(249,115,22,0.05)", color: "#f97316",
                          border: "1px solid rgba(249,115,22,0.1)",
                        }}>✕ {r}</span>
                      ))}
                    </div>
                    {p.quickScore >= 65 && (
                      <div style={{ fontSize: 11, color: "#4ade80", marginTop: 8 }}>
                        ★ High investment score despite criteria mismatch — worth a second look?
                      </div>
                    )}
                    <div style={{ fontSize: 11, color: "#5a5549", marginTop: 6, fontWeight: 500 }}>Click for full AI analysis anyway →</div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        {/* ═══════════ DETAIL VIEW ═══════════ */}
        {view === "detail" && selectedProperty && (
          <>
            {/* Back + Header */}
            <button className="ps-btn ps-btn-ghost" onClick={() => setView("results")}
              style={{ marginBottom: 16, fontSize: 12, padding: "7px 14px" }}>
              ← Back to Results
            </button>

            <div className="ps-detail-header">
              <div style={{ fontFamily: "'Playfair Display', serif", fontSize: 22, fontWeight: 700, color: "#e8e0d4" }}>
                {selectedProperty.address}
              </div>
              <div style={{ fontSize: 13, color: "#6a6358", marginTop: 4 }}>
                {selectedProperty.neighborhood} · {selectedProperty.beds}bd/{selectedProperty.baths}ba · {selectedProperty.sqft.toLocaleString()} sqft · Built {selectedProperty.yearBuilt} · {fmt(selectedProperty.price)}
              </div>
            </div>

            {/* Loading */}
            {analyzing && (
              <div style={{ textAlign: "center", padding: 60 }}>
                <div className="ps-spinner" />
                <div style={{ color: "#6a6358", fontSize: 13, marginTop: 16 }}>Running investment analysis across all strategies...</div>
              </div>
            )}

            {/* Error */}
            {analysis?.error && (
              <div className="ps-section" style={{ color: "#f87171", textAlign: "center", padding: 40 }}>
                Analysis failed. Please try again.
              </div>
            )}

            {/* Analysis Results */}
            {analysis && !analysis.error && (
              <>
                {/* Overall Grade + One-liner */}
                <div className="ps-section" style={{ display: "flex", gap: 20, alignItems: "center", marginBottom: 20 }}>
                  <div style={{
                    width: 72, height: 72, borderRadius: 12,
                    background: gradeBg(analysis.dealGrade),
                    border: `2px solid ${gradeColor(analysis.dealGrade)}30`,
                    display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
                    flexShrink: 0,
                  }}>
                    <div style={{ fontFamily: "'Playfair Display', serif", fontSize: 36, fontWeight: 900, color: gradeColor(analysis.dealGrade), lineHeight: 1 }}>
                      {analysis.dealGrade}
                    </div>
                    <div style={{ fontSize: 10, color: "#6a6358" }}>{analysis.overallScore}/100</div>
                  </div>
                  <div style={{ fontSize: 15, color: "#c9c0b4", lineHeight: 1.6 }}>{analysis.oneLiner}</div>
                </div>

                {/* Strategy Cards */}
                <div className="ps-strat-grid">
                  {[
                    { key: "buyAndHold", label: "Buy & Hold" },
                    { key: "flip", label: "Flip" },
                    { key: "brrrr", label: "BRRRR" },
                  ].map(s => {
                    const d = analysis.strategies?.[s.key];
                    if (!d) return null;
                    return (
                      <div key={s.key} className="ps-strat-card" style={{ background: gradeBg(d.grade) }}>
                        <div className="name">{s.label}</div>
                        <div className="grade" style={{ color: gradeColor(d.grade) }}>{d.grade}</div>
                        <div className="scr">Score: {d.score}/100</div>
                        <div className="verd">{d.verdict}</div>
                      </div>
                    );
                  })}
                </div>

                {/* Buy & Hold Detail */}
                {analysis.strategies?.buyAndHold && (() => {
                  const bh = analysis.strategies.buyAndHold;
                  return (
                    <div className="ps-section">
                      <div className="ps-section-title">Buy & Hold — Rental Projection</div>
                      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginBottom: 16 }}>
                        {[
                          { v: fmt(bh.monthlyRent), l: "Monthly Rent" },
                          { v: fmt(bh.monthlyCashFlow), l: "Cash Flow/Mo" },
                          { v: fmtPct(bh.cashOnCash), l: "Cash-on-Cash" },
                          { v: fmtPct(bh.capRate), l: "Cap Rate" },
                        ].map((m, i) => (
                          <div key={i} style={{ textAlign: "center", padding: 12, background: "rgba(192,122,34,0.03)", borderRadius: 6 }}>
                            <div style={{ fontFamily: "'Playfair Display', serif", fontSize: 20, fontWeight: 700, color: "#c07a22" }}>{m.v}</div>
                            <div style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: 1, color: "#6a6358", marginTop: 4 }}>{m.l}</div>
                          </div>
                        ))}
                      </div>
                      {bh.monthlyExpenses && (
                        <table className="ps-detail-table">
                          <thead><tr><th>Monthly Expense</th><th style={{ textAlign: "right" }}>Amount</th></tr></thead>
                          <tbody>
                            {Object.entries(bh.monthlyExpenses).map(([k, v]) => (
                              <tr key={k}><td style={{ textTransform: "capitalize" }}>{k}</td><td style={{ textAlign: "right" }}>{fmt(v)}</td></tr>
                            ))}
                          </tbody>
                        </table>
                      )}
                    </div>
                  );
                })()}

                {/* Flip Detail */}
                {analysis.strategies?.flip && (() => {
                  const fl = analysis.strategies.flip;
                  return (
                    <div className="ps-section">
                      <div className="ps-section-title">Flip Analysis</div>
                      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12 }}>
                        {[
                          { v: fmt(fl.arv), l: "ARV" },
                          { v: fmt(fl.totalInvestment), l: "Total In" },
                          { v: fmt(fl.estimatedProfit), l: "Est. Profit" },
                          { v: fmtPct(fl.roi), l: "ROI" },
                        ].map((m, i) => (
                          <div key={i} style={{ textAlign: "center", padding: 12, background: "rgba(192,122,34,0.03)", borderRadius: 6 }}>
                            <div style={{ fontFamily: "'Playfair Display', serif", fontSize: 20, fontWeight: 700, color: "#c07a22" }}>{m.v}</div>
                            <div style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: 1, color: "#6a6358", marginTop: 4 }}>{m.l}</div>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })()}

                {/* BRRRR Detail */}
                {analysis.strategies?.brrrr && (() => {
                  const br = analysis.strategies.brrrr;
                  return (
                    <div className="ps-section">
                      <div className="ps-section-title">BRRRR Analysis</div>
                      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12 }}>
                        {[
                          { v: fmt(br.arvAfterRehab), l: "Post-Rehab ARV" },
                          { v: fmt(br.refinanceAmount), l: "Refi Amount" },
                          { v: fmt(br.cashLeftIn), l: "Cash Left In" },
                          { v: br.infiniteReturn ? "∞" : fmt(br.monthlyCashFlowAfterRefi), l: br.infiniteReturn ? "Infinite Return" : "Cash Flow/Mo" },
                        ].map((m, i) => (
                          <div key={i} style={{ textAlign: "center", padding: 12, background: "rgba(192,122,34,0.03)", borderRadius: 6 }}>
                            <div style={{ fontFamily: "'Playfair Display', serif", fontSize: 20, fontWeight: 700, color: br.infiniteReturn && i === 3 ? "#4ade80" : "#c07a22" }}>{m.v}</div>
                            <div style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: 1, color: "#6a6358", marginTop: 4 }}>{m.l}</div>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })()}

                {/* Rehab Scenarios */}
                {analysis.rehabScenarios && (
                  <div className="ps-section">
                    <div className="ps-section-title">Rehab Scenarios — 4 Levels</div>
                    <table className="ps-detail-table">
                      <thead>
                        <tr><th>Level</th><th style={{ textAlign: "right" }}>Est. Cost</th><th>Timeline</th><th style={{ textAlign: "right" }}>ARV Impact</th><th>Notes</th></tr>
                      </thead>
                      <tbody>
                        {analysis.rehabScenarios.map((r, i) => (
                          <tr key={i}>
                            <td>{r.level}</td>
                            <td style={{ textAlign: "right", color: "#c07a22" }}>{fmt(r.cost)}</td>
                            <td>{r.timeline}</td>
                            <td style={{ textAlign: "right", color: "#4ade80" }}>{fmt(r.arvImpact)}</td>
                            <td style={{ fontSize: 11, color: "#6a6358" }}>{r.notes}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}

                {/* Risk Flags */}
                {analysis.riskFlags?.length > 0 && (
                  <div className="ps-section">
                    <div className="ps-section-title">Risk Flags</div>
                    {analysis.riskFlags.map((r, i) => (
                      <div key={i} className="ps-flag risk">⚠ {r}</div>
                    ))}
                  </div>
                )}

                {/* Profit Maximizers */}
                {analysis.profitMaximizers?.length > 0 && (
                  <div className="ps-section">
                    <div className="ps-section-title">Ways to Maximize Profit</div>
                    {analysis.profitMaximizers.map((p, i) => (
                      <div key={i} className="ps-flag profit">💡 {p}</div>
                    ))}
                  </div>
                )}

                {/* Ideal Investor + Bottom Line */}
                <div className="ps-section" style={{
                  background: "linear-gradient(135deg, rgba(192,122,34,0.04), rgba(28,47,32,0.08))",
                  border: "1px solid rgba(192,122,34,0.12)",
                }}>
                  <div style={{ marginBottom: 16 }}>
                    <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: 1.5, color: "#c07a22", marginBottom: 6 }}>Ideal Investor Profile</div>
                    <div style={{ fontSize: 14, color: "#c9c0b4", lineHeight: 1.6 }}>{analysis.idealInvestorProfile}</div>
                  </div>
                  <div style={{
                    padding: 20, background: "rgba(28,47,32,0.2)", borderRadius: 8,
                    border: "1px solid rgba(192,122,34,0.1)",
                  }}>
                    <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: 1.5, color: "#c07a22", marginBottom: 8 }}>Bottom Line</div>
                    <div style={{ fontSize: 14, color: "#e8e0d4", lineHeight: 1.7 }}>{analysis.bottomLine}</div>
                  </div>
                </div>
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}
