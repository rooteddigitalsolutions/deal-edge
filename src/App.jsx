import { useState, useEffect, useRef } from "react";
import DealAnalyzerV2 from "./DealAnalyzer.jsx";

const TOOLS = [
  {
    id: "deal-analyzer",
    name: "Deal Analyzer",
    status: "live",
    tagline: "Paste a link. Get the full breakdown.",
    desc: "Drop in any Zillow, Redfin, or MLS listing URL and the AI extracts every detail — then runs a complete investment analysis across Buy & Hold, Flip, and BRRRR strategies. Includes rehab cost estimates at 4 levels, ARV comps, rental cash flow projections, and an investor pitch sheet you can share.",
    features: ["Auto-extract from listing URLs", "4-level rehab scenario comparison", "Buy & Hold / Flip / BRRRR scoring", "Investor-ready pitch summary", "Knoxville market data built in"],
    icon: "⚡",
    color: "#e8890c",
  },
  {
    id: "property-scanner",
    name: "Property Scanner",
    status: "beta",
    tagline: "Set your criteria. See what's worth your time.",
    desc: "Define your investment profile — neighborhoods, price range, property type, rehab tolerance, financing terms, and minimum return thresholds. The scanner finds matching properties, ranks them by investment potential, and lets you deep-dive any property with full AI analysis across all strategies.",
    features: ["Custom investor criteria filters", "Ranked results by deal quality", "Per-property AI deep dive", "Days-on-market & price cut signals", "Saved searches & date filtering"],
    icon: "🔍",
    color: "#d4770a",
  },
  {
    id: "sow-builder",
    name: "SOW Builder",
    status: "coming",
    tagline: "Describe the job. Get a professional scope.",
    desc: "Contractors describe a rehab conversationally — \"gut reno, 3/2 ranch, 1,400 sqft, needs new HVAC and full kitchen\" — and the AI generates a structured scope of work with line items, Knoxville-market cost ranges, and a timeline. Exportable as PDF for investors and agents.",
    features: ["Conversational input", "Line-item cost breakdown", "Knoxville labor & material rates", "PDF export", "Timeline estimates"],
    icon: "📋",
    color: "#c06a08",
  },
  {
    id: "listing-writer",
    name: "Listing Writer",
    status: "coming",
    tagline: "Property details in. MLS-ready copy out.",
    desc: "Feed in property specs, photos, and neighborhood context and get polished MLS descriptions, social media captions, email drip copy, and buyer-persona-targeted variations — all from one input. Built for agents who need quality copy fast.",
    features: ["MLS-ready descriptions", "Social media captions", "Multiple buyer personas", "Email sequence copy", "Neighborhood context"],
    icon: "✍️",
    color: "#b35e06",
  },
  {
    id: "bid-compare",
    name: "Bid Comparison",
    status: "coming",
    tagline: "Normalize bids. Pick the right contractor.",
    desc: "Upload multiple contractor bids for a rehab project and AI normalizes them — line-by-line comparison, flags missing scope items, identifies outlier pricing, and recommends the best value. Stop comparing apples to oranges.",
    features: ["Side-by-side normalization", "Missing scope detection", "Outlier pricing flags", "Best value recommendation", "PDF comparison report"],
    icon: "⚖️",
    color: "#a85304",
  },
  {
    id: "portfolio-dash",
    name: "Portfolio Dashboard",
    status: "coming",
    tagline: "All your properties. One clear picture.",
    desc: "For investors with multiple properties — a single dashboard showing cash flow, vacancy, equity position, and AI-generated alerts. Know when rent is below market, when a refi makes sense, or when it's time to sell.",
    features: ["Multi-property overview", "Cash flow tracking", "Market rent alerts", "Refi timing signals", "Equity & appreciation tracking"],
    icon: "📊",
    color: "#964802",
  },
];

const STATUS_BADGES = {
  live: { label: "Live", bg: "rgba(74,222,128,0.1)", color: "#4ade80", border: "rgba(74,222,128,0.2)" },
  beta: { label: "Beta", bg: "rgba(96,165,250,0.1)", color: "#60a5fa", border: "rgba(96,165,250,0.2)" },
  coming: { label: "Coming Soon", bg: "rgba(232,137,12,0.1)", color: "#e8890c", border: "rgba(232,137,12,0.2)" },
};

export default function DealEdgeSite() {
  const [page, setPage] = useState("home");
  const [mobileMenu, setMobileMenu] = useState(false);
  const [scrollY, setScrollY] = useState(0);

  useEffect(() => {
    const onScroll = () => setScrollY(window.scrollY);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const navigate = (p) => {
    setPage(p);
    setMobileMenu(false);
    window.scrollTo(0, 0);
  };

  const navLinks = [
    { id: "home", label: "Home" },
    { id: "tools", label: "Tools" },
    { id: "about", label: "About" },
    { id: "contact", label: "Contact" },
  ];

  return (
    <div style={{ minHeight: "100vh", background: "#080a0c", color: "#d4cdc2", fontFamily: "'Outfit', 'Helvetica Neue', sans-serif" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Outfit:wght@200;300;400;500;600;700;800;900&family=Playfair+Display:wght@400;600;700;800;900&display=swap');
        * { box-sizing: border-box; margin: 0; padding: 0; }
        html { scroll-behavior: smooth; }

        /* NAV */
        .dl-nav {
          position: fixed; top: 0; left: 0; right: 0; z-index: 100;
          padding: 16px 40px; display: flex; justify-content: space-between; align-items: center;
          transition: all 0.3s;
        }
        .dl-nav.scrolled {
          background: rgba(8,10,12,0.92); backdrop-filter: blur(12px);
          border-bottom: 1px solid rgba(232,137,12,0.08);
        }
        .dl-logo {
          font-family: 'Playfair Display', serif; font-size: 22px; font-weight: 800;
          color: #e8890c; cursor: pointer; letter-spacing: -0.5px;
        }
        .dl-logo span { color: #d4cdc2; font-weight: 400; }
        .dl-nav-links { display: flex; gap: 32px; align-items: center; }
        .dl-nav-link {
          font-size: 13px; font-weight: 500; color: #7a756c; cursor: pointer;
          transition: color 0.2s; background: none; border: none;
          font-family: 'Outfit', sans-serif; letter-spacing: 0.5px;
        }
        .dl-nav-link:hover, .dl-nav-link.active { color: #e8890c; }
        .dl-nav-cta {
          padding: 8px 20px; background: linear-gradient(135deg, #e8890c, #c06a08);
          color: #fff; border: none; border-radius: 6px; font-size: 12px;
          font-weight: 600; cursor: pointer; font-family: 'Outfit', sans-serif;
          letter-spacing: 0.5px; transition: all 0.2s;
        }
        .dl-nav-cta:hover { transform: translateY(-1px); box-shadow: 0 4px 16px rgba(232,137,12,0.3); }

        /* MOBILE MENU */
        .dl-hamburger {
          display: none; background: none; border: none; cursor: pointer;
          width: 28px; height: 20px; position: relative; z-index: 110;
        }
        .dl-hamburger span {
          display: block; width: 100%; height: 2px; background: #d4cdc2;
          position: absolute; left: 0; transition: all 0.3s;
        }
        .dl-hamburger span:nth-child(1) { top: 0; }
        .dl-hamburger span:nth-child(2) { top: 9px; }
        .dl-hamburger span:nth-child(3) { top: 18px; }
        .dl-hamburger.open span:nth-child(1) { transform: rotate(45deg); top: 9px; }
        .dl-hamburger.open span:nth-child(2) { opacity: 0; }
        .dl-hamburger.open span:nth-child(3) { transform: rotate(-45deg); top: 9px; }

        .dl-mobile-overlay {
          position: fixed; inset: 0; z-index: 105;
          background: rgba(8,10,12,0.97); backdrop-filter: blur(20px);
          display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 24px;
        }
        .dl-mobile-link {
          font-size: 24px; font-weight: 600; color: #d4cdc2; background: none;
          border: none; cursor: pointer; font-family: 'Outfit', sans-serif;
          transition: color 0.2s;
        }
        .dl-mobile-link:hover { color: #e8890c; }

        @media (max-width: 768px) {
          .dl-nav-links { display: none; }
          .dl-hamburger { display: block; }
          .dl-nav { padding: 14px 20px; }
          .dl-hero-title { font-size: 36px !important; }
          .dl-tools-grid { grid-template-columns: 1fr !important; }
          .dl-about-inner { grid-template-columns: 1fr !important; }
          .dl-footer-inner { flex-direction: column !important; text-align: center; gap: 16px !important; }
        }

        /* HERO */
        .dl-hero {
          min-height: 100vh; display: flex; flex-direction: column; justify-content: center;
          padding: 120px 60px 80px; position: relative; overflow: hidden;
        }
        .dl-hero::before {
          content: ''; position: absolute; top: -200px; right: -200px;
          width: 700px; height: 700px; border-radius: 50%;
          background: radial-gradient(circle, rgba(232,137,12,0.06) 0%, transparent 70%);
          pointer-events: none;
        }
        .dl-hero::after {
          content: ''; position: absolute; bottom: -100px; left: -100px;
          width: 500px; height: 500px; border-radius: 50%;
          background: radial-gradient(circle, rgba(232,137,12,0.03) 0%, transparent 70%);
          pointer-events: none;
        }
        .dl-hero-eyebrow {
          font-size: 11px; font-weight: 700; letter-spacing: 3px;
          text-transform: uppercase; color: #e8890c; margin-bottom: 20px;
          display: flex; align-items: center; gap: 12px;
        }
        .dl-hero-eyebrow::before {
          content: ''; width: 40px; height: 1px; background: #e8890c;
        }
        .dl-hero-title {
          font-family: 'Playfair Display', serif; font-size: 60px; font-weight: 900;
          line-height: 1.08; color: #f0ebe4; max-width: 700px;
          letter-spacing: -1.5px; margin-bottom: 24px;
        }
        .dl-hero-title em { font-style: normal; color: #e8890c; }
        .dl-hero-sub {
          font-size: 17px; font-weight: 300; color: #7a756c;
          max-width: 520px; line-height: 1.7; margin-bottom: 36px;
        }
        .dl-hero-btns { display: flex; gap: 14px; flex-wrap: wrap; }
        .dl-btn-primary {
          padding: 14px 32px; background: linear-gradient(135deg, #e8890c, #c06a08);
          color: #fff; border: none; border-radius: 8px; font-size: 14px;
          font-weight: 600; cursor: pointer; font-family: 'Outfit', sans-serif;
          transition: all 0.2s; letter-spacing: 0.3px;
        }
        .dl-btn-primary:hover { transform: translateY(-2px); box-shadow: 0 8px 24px rgba(232,137,12,0.3); }
        .dl-btn-outline {
          padding: 14px 32px; background: transparent; color: #e8890c;
          border: 1px solid rgba(232,137,12,0.25); border-radius: 8px;
          font-size: 14px; font-weight: 500; cursor: pointer;
          font-family: 'Outfit', sans-serif; transition: all 0.2s;
        }
        .dl-btn-outline:hover { background: rgba(232,137,12,0.05); border-color: #e8890c; }

        /* TOOLS SECTION */
        .dl-section {
          padding: 100px 60px; position: relative;
        }
        .dl-section-eyebrow {
          font-size: 11px; font-weight: 700; letter-spacing: 3px;
          text-transform: uppercase; color: #e8890c; margin-bottom: 12px;
          display: flex; align-items: center; gap: 12px;
        }
        .dl-section-eyebrow::before {
          content: ''; width: 24px; height: 1px; background: #e8890c;
        }
        .dl-section-title {
          font-family: 'Playfair Display', serif; font-size: 38px; font-weight: 800;
          color: #f0ebe4; margin-bottom: 12px; letter-spacing: -1px;
        }
        .dl-section-sub {
          font-size: 15px; color: #5a5549; max-width: 500px; line-height: 1.6; margin-bottom: 48px;
        }

        /* TOOL CARDS */
        .dl-tools-grid {
          display: grid; grid-template-columns: repeat(2, 1fr); gap: 20px;
        }
        .dl-tool-card {
          background: rgba(255,255,255,0.015); border: 1px solid rgba(232,137,12,0.06);
          border-radius: 14px; padding: 28px; transition: all 0.3s;
          cursor: pointer; position: relative; overflow: hidden;
        }
        .dl-tool-card:hover {
          border-color: rgba(232,137,12,0.2);
          transform: translateY(-3px);
          box-shadow: 0 12px 40px rgba(0,0,0,0.3);
        }
        .dl-tool-card::after {
          content: ''; position: absolute; top: 0; right: 0;
          width: 120px; height: 120px;
          background: radial-gradient(circle at top right, rgba(232,137,12,0.04), transparent 70%);
          pointer-events: none;
        }
        .dl-tool-card-head { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 12px; }
        .dl-tool-icon { font-size: 28px; }
        .dl-tool-status {
          font-size: 10px; font-weight: 600; padding: 4px 10px; border-radius: 12px;
          letter-spacing: 0.5px;
        }
        .dl-tool-name {
          font-size: 18px; font-weight: 700; color: #f0ebe4; margin-bottom: 4px;
        }
        .dl-tool-tagline {
          font-size: 13px; font-weight: 400; color: #e8890c; margin-bottom: 12px;
          font-style: italic;
        }
        .dl-tool-desc {
          font-size: 13px; color: #7a756c; line-height: 1.65; margin-bottom: 16px;
        }
        .dl-tool-features {
          display: flex; flex-wrap: wrap; gap: 6px;
        }
        .dl-tool-feat {
          font-size: 10px; padding: 4px 10px; border-radius: 4px;
          background: rgba(232,137,12,0.04); color: #8a8477;
          border: 1px solid rgba(232,137,12,0.06);
        }

        /* ABOUT */
        .dl-about-inner {
          display: grid; grid-template-columns: 280px 1fr; gap: 48px; align-items: start;
        }
        .dl-about-photo {
          width: 280px; height: 320px; border-radius: 12px;
          background: linear-gradient(135deg, rgba(232,137,12,0.08), rgba(232,137,12,0.02));
          border: 1px solid rgba(232,137,12,0.1);
          display: flex; align-items: center; justify-content: center;
          font-size: 80px; overflow: hidden;
        }
        .dl-about-photo img {
          width: 100%; height: 100%; object-fit: cover; border-radius: 12px;
        }
        .dl-about-name {
          font-family: 'Playfair Display', serif; font-size: 28px; font-weight: 800;
          color: #f0ebe4; margin-bottom: 4px;
        }
        .dl-about-role { font-size: 13px; color: #e8890c; margin-bottom: 20px; font-weight: 500; }
        .dl-about-text {
          font-size: 14px; color: #8a8477; line-height: 1.8; margin-bottom: 24px;
        }
        .dl-about-text p { margin-bottom: 14px; }
        .dl-about-text strong { color: #d4cdc2; font-weight: 600; }
        .dl-about-stats {
          display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px; margin-top: 28px;
        }
        .dl-stat {
          padding: 16px; text-align: center; border-radius: 8px;
          background: rgba(232,137,12,0.03); border: 1px solid rgba(232,137,12,0.06);
        }
        .dl-stat-val {
          font-family: 'Playfair Display', serif; font-size: 24px; font-weight: 800; color: #e8890c;
        }
        .dl-stat-lbl {
          font-size: 10px; text-transform: uppercase; letter-spacing: 1.2px; color: #5a5549; margin-top: 4px;
        }

        /* CONTACT */
        .dl-contact-inner {
          max-width: 560px; margin: 0 auto; text-align: center;
        }
        .dl-contact-inner .dl-section-title { margin-bottom: 16px; }

        /* DIVIDER */
        .dl-divider {
          height: 1px; background: linear-gradient(90deg, transparent, rgba(232,137,12,0.12), transparent);
          margin: 0 60px;
        }

        /* FOOTER */
        .dl-footer {
          padding: 32px 60px; border-top: 1px solid rgba(232,137,12,0.06);
        }
        .dl-footer-inner {
          display: flex; justify-content: space-between; align-items: center;
        }
        .dl-footer-copy { font-size: 12px; color: #3d3a35; }
        .dl-footer-links { display: flex; gap: 20px; }
        .dl-footer-link {
          font-size: 12px; color: #5a5549; cursor: pointer; background: none;
          border: none; font-family: 'Outfit', sans-serif; transition: color 0.2s;
        }
        .dl-footer-link:hover { color: #e8890c; }

        /* ANIMATE */
        @keyframes fadeUp { from { opacity: 0; transform: translateY(20px); } to { opacity: 1; transform: translateY(0); } }
        .anim-up { animation: fadeUp 0.6s ease-out forwards; }
        .anim-d1 { animation-delay: 0.1s; opacity: 0; }
        .anim-d2 { animation-delay: 0.2s; opacity: 0; }
        .anim-d3 { animation-delay: 0.3s; opacity: 0; }
        .anim-d4 { animation-delay: 0.4s; opacity: 0; }

        @media (max-width: 768px) {
          .dl-hero { padding: 100px 24px 60px; }
          .dl-section { padding: 60px 24px; }
          .dl-divider { margin: 0 24px; }
          .dl-footer { padding: 24px; }
          .dl-about-stats { grid-template-columns: 1fr; }
        }
      `}</style>

      {/* ═══ NAV ═══ */}
      <nav className={`dl-nav ${scrollY > 60 ? "scrolled" : ""}`}>
        <div className="dl-logo" onClick={() => navigate("home")}>
          Deal<span>Edge</span>
        </div>
        <div className="dl-nav-links">
          {navLinks.map(l => (
            <button key={l.id} className={`dl-nav-link ${page === l.id ? "active" : ""}`}
              onClick={() => navigate(l.id)}>{l.label}</button>
          ))}
          <button className="dl-nav-cta" onClick={() => navigate("deal-analyzer")}>Try Deal Analyzer</button>
        </div>
        <button className={`dl-hamburger ${mobileMenu ? "open" : ""}`}
          onClick={() => setMobileMenu(!mobileMenu)}>
          <span /><span /><span />
        </button>
      </nav>

      {/* Mobile Menu Overlay */}
      {mobileMenu && (
        <div className="dl-mobile-overlay">
          {navLinks.map(l => (
            <button key={l.id} className="dl-mobile-link" onClick={() => navigate(l.id)}>
              {l.label}
            </button>
          ))}
          <button className="dl-btn-primary" onClick={() => navigate("contact")} style={{ marginTop: 12 }}>
            Get Early Access
          </button>
        </div>
      )}

      {/* ═══ HOME PAGE ═══ */}
      {page === "home" && (
        <>
          {/* HERO */}
          <section className="dl-hero">
            <div className="dl-hero-eyebrow anim-up">AI-Powered Real Estate Intelligence</div>
            <h1 className="dl-hero-title anim-up anim-d1">
              See every deal<br />for what it's <em>really</em> worth.
            </h1>
            <p className="dl-hero-sub anim-up anim-d2">
              AI tools built for real estate investors, agents, and contractors. Analyze deals, score properties, estimate rehab costs, and generate investor-ready reports — in seconds, not hours.
            </p>
            <div className="dl-hero-btns anim-up anim-d3">
              <button className="dl-btn-primary" onClick={() => navigate("deal-analyzer")}>Try the Deal Analyzer</button>
              <button className="dl-btn-outline" onClick={() => navigate("tools")}>Explore All Tools</button>
            </div>

            {/* Floating stat badges */}
            <div style={{
              display: "flex", gap: 32, marginTop: 60, flexWrap: "wrap",
              animation: "fadeUp 0.6s ease-out 0.5s forwards", opacity: 0,
            }}>
              {[
                { val: "4", lbl: "Investment Strategies Scored" },
                { val: "30s", lbl: "Listing to Full Analysis" },
                { val: "Knox", lbl: "Market Data Built In" },
              ].map((s, i) => (
                <div key={i} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <div style={{
                    fontFamily: "'Playfair Display', serif", fontSize: 28, fontWeight: 800, color: "#e8890c"
                  }}>{s.val}</div>
                  <div style={{ fontSize: 11, color: "#5a5549", lineHeight: 1.4, maxWidth: 100 }}>{s.lbl}</div>
                </div>
              ))}
            </div>
          </section>

          <div className="dl-divider" />

          {/* TOOLS PREVIEW */}
          <section className="dl-section">
            <div className="dl-section-eyebrow">The Toolkit</div>
            <h2 className="dl-section-title">Six tools. One unfair advantage.</h2>
            <p className="dl-section-sub">
              Each tool solves a specific friction point in the deal lifecycle — from finding properties to closing them.
            </p>

            <div className="dl-tools-grid">
              {TOOLS.map(tool => {
                const badge = STATUS_BADGES[tool.status];
                return (
                  <div key={tool.id} className="dl-tool-card" onClick={() => navigate("tools")}>
                    <div className="dl-tool-card-head">
                      <div className="dl-tool-icon">{tool.icon}</div>
                      <span className="dl-tool-status" style={{
                        background: badge.bg, color: badge.color, border: `1px solid ${badge.border}`
                      }}>{badge.label}</span>
                    </div>
                    <div className="dl-tool-name">{tool.name}</div>
                    <div className="dl-tool-tagline">{tool.tagline}</div>
                    <div className="dl-tool-desc">{tool.desc}</div>
                    <div className="dl-tool-features">
                      {tool.features.slice(0, 3).map((f, i) => (
                        <span key={i} className="dl-tool-feat">{f}</span>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </section>

          <div className="dl-divider" />

          {/* CTA BAND */}
          <section className="dl-section" style={{ textAlign: "center" }}>
            <div style={{ maxWidth: 600, margin: "0 auto" }}>
              <div className="dl-section-eyebrow" style={{ justifyContent: "center" }}>Early Access</div>
              <h2 className="dl-section-title" style={{ marginBottom: 16 }}>
                Built in Knoxville. Expanding everywhere.
              </h2>
              <p style={{ fontSize: 15, color: "#7a756c", lineHeight: 1.7, marginBottom: 32 }}>
                DealEdge is currently tuned for the Knoxville, TN market with local rehab costs, rent data, and neighborhood intelligence baked in. National expansion is on the roadmap.
              </p>
              <div style={{ display: "flex", gap: 14, justifyContent: "center", flexWrap: "wrap" }}>
                <button className="dl-btn-primary" onClick={() => navigate("contact")}>Request Early Access</button>
                <button className="dl-btn-outline" onClick={() => navigate("about")}>About the Founder</button>
              </div>
            </div>
          </section>
        </>
      )}

      {/* ═══ TOOLS PAGE ═══ */}
      {page === "tools" && (
        <section className="dl-section" style={{ paddingTop: 120 }}>
          <div className="dl-section-eyebrow">Platform Tools</div>
          <h2 className="dl-section-title">Every tool you need to move faster.</h2>
          <p className="dl-section-sub">
            From deal discovery to deal close — each tool is purpose-built for how investors, agents, and contractors actually work.
          </p>

          <div style={{ display: "grid", gap: 24 }}>
            {TOOLS.map(tool => {
              const badge = STATUS_BADGES[tool.status];
              return (
                <div key={tool.id} style={{
                  display: "grid", gridTemplateColumns: "1fr 1fr", gap: 32,
                  background: "rgba(255,255,255,0.015)", border: "1px solid rgba(232,137,12,0.06)",
                  borderRadius: 14, padding: 32, transition: "border-color 0.3s",
                }}>
                  <div>
                    <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 12 }}>
                      <span style={{ fontSize: 28 }}>{tool.icon}</span>
                      <div>
                        <div style={{ fontSize: 20, fontWeight: 700, color: "#f0ebe4" }}>{tool.name}</div>
                        <div style={{ fontSize: 12, color: "#e8890c", fontStyle: "italic" }}>{tool.tagline}</div>
                      </div>
                      <span className="dl-tool-status" style={{
                        background: badge.bg, color: badge.color, border: `1px solid ${badge.border}`, marginLeft: "auto"
                      }}>{badge.label}</span>
                    </div>
                    <div style={{ fontSize: 14, color: "#7a756c", lineHeight: 1.7 }}>{tool.desc}</div>
                  </div>
                  <div>
                    <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: 1.5, color: "#5a5549", marginBottom: 12 }}>
                      Key Features
                    </div>
                    {tool.features.map((f, i) => (
                      <div key={i} style={{
                        padding: "8px 14px", marginBottom: 6, borderRadius: 6,
                        background: "rgba(232,137,12,0.03)", border: "1px solid rgba(232,137,12,0.05)",
                        fontSize: 13, color: "#a89e92", display: "flex", alignItems: "center", gap: 8,
                      }}>
                        <span style={{ color: "#e8890c", fontSize: 14 }}>›</span> {f}
                      </div>
                    ))}
                    {tool.status === "live" && (
                      <button className="dl-btn-primary" onClick={() => navigate("deal-analyzer")} style={{ marginTop: 12, width: "100%", padding: 12 }}>
                        Launch Tool →
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* ═══ ABOUT PAGE ═══ */}
      {page === "about" && (
        <section className="dl-section" style={{ paddingTop: 120 }}>
          <div className="dl-section-eyebrow">The Builder</div>
          <h2 className="dl-section-title" style={{ marginBottom: 40 }}>Meet Adam Nicholson</h2>

          <div className="dl-about-inner">
            <div>
              <div className="dl-about-photo">
                <img src="https://rooteddigitalsolutions.com/adam-photo.jpg"
                  alt="Adam Nicholson" onError={e => { e.target.style.display = "none"; e.target.parentNode.textContent = "AN"; }} />
              </div>
              <div className="dl-about-stats">
                <div className="dl-stat">
                  <div className="dl-stat-val">10+</div>
                  <div className="dl-stat-lbl">Years in Business</div>
                </div>
                <div className="dl-stat">
                  <div className="dl-stat-val">AI</div>
                  <div className="dl-stat-lbl">First Approach</div>
                </div>
                <div className="dl-stat">
                  <div className="dl-stat-val">Knox</div>
                  <div className="dl-stat-lbl">Based</div>
                </div>
              </div>
            </div>

            <div>
              <div className="dl-about-name">Adam Nicholson</div>
              <div className="dl-about-role">Founder · Builder · Knoxville, TN</div>

              <div className="dl-about-text">
                <p>
                  I built DealEdge because I got tired of watching investors, agents, and contractors waste hours on deal analysis that should take minutes. The math is predictable. The market data exists. The only thing missing was a tool smart enough to put it all together.
                </p>
                <p>
                  I'm the founder of <strong>Rooted Digital Solutions</strong>, a Knoxville-based digital consultancy where I build websites, marketing automation, and AI-powered tools for small businesses. I've spent <strong>over a decade as an entrepreneur and small business owner</strong> — and that experience shows up in how I build: practical first, impressive second.
                </p>
                <p>
                  DealEdge combines my background in <strong>marketing and business strategy</strong> with modern AI to give real estate professionals tools that actually make them money. Every tool is built with Knoxville market data — real rehab costs, real rent ranges, real neighborhood dynamics — because generic doesn't cut it when real money is on the line.
                </p>
                <p>
                  Whether you're an investor sizing up your next BRRRR, an agent who wants to impress investor clients with polished deal analysis, or a contractor building scopes of work — these tools are designed for how you actually work.
                </p>
              </div>

              <div style={{
                padding: 20, borderRadius: 10,
                background: "linear-gradient(135deg, rgba(232,137,12,0.04), rgba(232,137,12,0.01))",
                border: "1px solid rgba(232,137,12,0.08)", marginTop: 24,
              }}>
                <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: 1.5, color: "#e8890c", marginBottom: 8 }}>
                  Also Building
                </div>
                <div style={{ fontSize: 13, color: "#7a756c", lineHeight: 1.6 }}>
                  <strong style={{ color: "#d4cdc2" }}>Rooted Digital Solutions</strong> — websites, AI tools, and marketing automation for small businesses nationwide.{" "}
                  <a href="https://rooteddigitalsolutions.com" target="_blank" rel="noopener" style={{ color: "#e8890c" }}>rooteddigitalsolutions.com</a>
                </div>
              </div>

              <div style={{ display: "flex", gap: 12, marginTop: 24 }}>
                <button className="dl-btn-primary" onClick={() => navigate("contact")}>Get in Touch</button>
                <a href="mailto:adam@rooteddigitalsolutions.com" className="dl-btn-outline" style={{ textDecoration: "none", display: "inline-flex", alignItems: "center" }}>
                  adam@rooteddigitalsolutions.com
                </a>
              </div>
            </div>
          </div>
        </section>
      )}

      {/* ═══ DEAL ANALYZER PAGE ═══ */}
      {page === "deal-analyzer" && (
        <div style={{ paddingTop: 64 }}>
          <DealAnalyzerV2 />
        </div>
      )}

      {/* ═══ CONTACT PAGE ═══ */}
      {page === "contact" && (
        <section className="dl-section" style={{ paddingTop: 120, minHeight: "80vh", display: "flex", alignItems: "center" }}>
          <div className="dl-contact-inner">
            <div className="dl-section-eyebrow" style={{ justifyContent: "center" }}>Get in Touch</div>
            <h2 className="dl-section-title">Interested in DealEdge?</h2>
            <p style={{ fontSize: 15, color: "#7a756c", lineHeight: 1.7, marginBottom: 36 }}>
              DealEdge is currently in early access. Whether you're an investor, agent, or contractor looking to try the tools — or you're interested in licensing the platform for your market — reach out.
            </p>

            <div style={{ display: "grid", gap: 16, marginBottom: 36 }}>
              {[
                { icon: "🏠", label: "Investors", desc: "Get early access to Deal Analyzer and Property Scanner" },
                { icon: "🤝", label: "Agents", desc: "White-label deal reports for your investor clients" },
                { icon: "🔨", label: "Contractors", desc: "SOW Builder and Bid Comparison tools coming soon" },
                { icon: "💼", label: "Partners", desc: "Licensing DealEdge for other markets? Let's talk." },
              ].map((item, i) => (
                <div key={i} style={{
                  display: "flex", gap: 16, padding: "16px 20px", borderRadius: 10, textAlign: "left",
                  background: "rgba(255,255,255,0.015)", border: "1px solid rgba(232,137,12,0.06)",
                }}>
                  <div style={{ fontSize: 24, flexShrink: 0 }}>{item.icon}</div>
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 600, color: "#f0ebe4" }}>{item.label}</div>
                    <div style={{ fontSize: 12, color: "#7a756c" }}>{item.desc}</div>
                  </div>
                </div>
              ))}
            </div>

            <a href="mailto:adam@rooteddigitalsolutions.com" className="dl-btn-primary"
              style={{ textDecoration: "none", display: "inline-flex", padding: "16px 40px", fontSize: 15 }}>
              Email Adam →
            </a>
            <div style={{ fontSize: 12, color: "#3d3a35", marginTop: 12 }}>adam@rooteddigitalsolutions.com</div>
          </div>
        </section>
      )}

      {/* ═══ FOOTER ═══ */}
      <footer className="dl-footer">
        <div className="dl-footer-inner">
          <div className="dl-footer-copy">
            © 2026 DealEdge · Built by Adam Nicholson · Knoxville, TN
          </div>
          <div className="dl-footer-links">
            {navLinks.map(l => (
              <button key={l.id} className="dl-footer-link" onClick={() => navigate(l.id)}>{l.label}</button>
            ))}
          </div>
        </div>
      </footer>
    </div>
  );
}
