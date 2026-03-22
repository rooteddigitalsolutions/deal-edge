import { useState } from "react";
import DealAnalyzerV2 from "./DealAnalyzer";
import BatchAnalyzer from "./BatchAnalyzer";
import MontaukTools from "./MontaukTools";

export default function App() {
  const [activeTab, setActiveTab] = useState("deal");
  const [pendingDealData, setPendingDealData] = useState(null);
  const [flashBatch, setFlashBatch] = useState(false);

  const handleRunInDealAnalyzer = (propertyData) => {
    setPendingDealData(propertyData);
    setActiveTab("deal");
    setFlashBatch(true);
    setTimeout(() => setFlashBatch(false), 800);
  };

  return (
    <div style={{ minHeight: "100vh", background: "#0c1015", fontFamily: "'DM Sans', sans-serif" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;600;700&family=Playfair+Display:wght@400;600;700;800&display=swap');
        * { box-sizing: border-box; margin: 0; padding: 0; }

        .app-nav {
          display: flex;
          align-items: stretch;
          gap: 0;
          border-bottom: 1px solid rgba(192,122,34,0.1);
          background: rgba(12, 16, 21, 0.98);
          position: sticky;
          top: 0;
          z-index: 100;
          padding: 0 36px;
        }

        .app-tab {
          padding: 16px 24px;
          font-size: 13px;
          font-weight: 600;
          font-family: 'DM Sans', sans-serif;
          color: #8a8477;
          background: none;
          border: none;
          border-bottom: 2px solid transparent;
          cursor: pointer;
          letter-spacing: 0.3px;
          transition: all 0.2s;
          display: flex;
          align-items: center;
          gap: 7px;
          white-space: nowrap;
          margin-bottom: -1px;
        }
        .app-tab:hover { color: #c07a22; }
        .app-tab.active {
          color: #c07a22;
          border-bottom-color: #c07a22;
        }
        .app-tab .tab-icon { font-size: 15px; }
        .app-tab .tab-badge {
          width: 7px; height: 7px; border-radius: 50%;
          background: #4ade80;
          animation: pulse 1.5s ease-in-out infinite;
        }
        .app-tab.montauk-tab { color: #8a8477; }
        .app-tab.montauk-tab:hover { color: #C8A84B; }
        .app-tab.montauk-tab.active {
          color: #C8A84B;
          border-bottom-color: #C8A84B;
        }

        @keyframes pulse {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.5; transform: scale(0.75); }
        }

        .app-brand {
          display: flex;
          align-items: center;
          gap: 10px;
          padding: 14px 28px 14px 0;
          margin-right: 8px;
          border-right: 1px solid rgba(192,122,34,0.1);
          flex-shrink: 0;
        }
        .app-brand .logo-mark {
          width: 28px; height: 28px;
          background: linear-gradient(135deg, #c07a22, #9a6018);
          border-radius: 6px;
          display: flex; align-items: center; justify-content: center;
          font-size: 14px;
        }
        .app-brand .logo-text {
          font-family: 'Playfair Display', serif;
          font-size: 15px;
          font-weight: 700;
          color: #c07a22;
          letter-spacing: 0.3px;
          line-height: 1;
        }
        .app-brand .logo-text span {
          color: #e8e4d8;
          font-weight: 400;
        }
        .app-brand .logo-sub {
          font-size: 9px;
          color: #8a8477;
          letter-spacing: 1.5px;
          text-transform: uppercase;
          margin-top: 2px;
        }

        .nav-divider {
          width: 1px;
          background: rgba(192,122,34,0.08);
          margin: 12px 8px;
          flex-shrink: 0;
        }

        .app-flash-indicator {
          position: fixed;
          top: 60px;
          left: 50%;
          transform: translateX(-50%);
          background: rgba(192,122,34,0.95);
          color: #fff;
          padding: 8px 20px;
          border-radius: 20px;
          font-size: 12px;
          font-weight: 600;
          z-index: 200;
          animation: slideDown 0.3s ease;
          box-shadow: 0 4px 16px rgba(192,122,34,0.3);
        }
        @keyframes slideDown {
          from { opacity: 0; transform: translateX(-50%) translateY(-10px); }
          to { opacity: 1; transform: translateX(-50%) translateY(0); }
        }

        @media (max-width: 640px) {
          .app-nav { padding: 0 16px; }
          .app-brand .logo-text { font-size: 13px; }
          .app-brand .logo-sub { display: none; }
          .app-tab { padding: 14px 14px; font-size: 12px; }
          .app-tab .tab-icon { display: none; }
        }
      `}</style>

      {flashBatch && (
        <div className="app-flash-indicator">⚡ Property loaded in Deal Analyzer</div>
      )}

      {/* ── Nav ── */}
      <nav className="app-nav">
        <div className="app-brand">
          <div className="logo-mark">⚡</div>
          <div>
            <div className="logo-text">DealEdge<span>.io</span></div>
            <div className="logo-sub">AI Deal Tools</div>
          </div>
        </div>

        <button
          className={`app-tab ${activeTab === "deal" ? "active" : ""}`}
          onClick={() => setActiveTab("deal")}
        >
          <span className="tab-icon">🔍</span>
          Deal Analyzer
          {pendingDealData && activeTab !== "deal" && <span className="tab-badge" />}
        </button>

        <button
          className={`app-tab ${activeTab === "batch" ? "active" : ""}`}
          onClick={() => setActiveTab("batch")}
        >
          <span className="tab-icon">⚡</span>
          Batch Analyzer
        </button>

        <div className="nav-divider" />

        <button
          className={`app-tab montauk-tab ${activeTab === "montauk" ? "active" : ""}`}
          onClick={() => setActiveTab("montauk")}
        >
          <span className="tab-icon">🏗️</span>
          Montauk Tools
        </button>
      </nav>

      {/* ── Content ── */}
      <div style={{ display: activeTab === "deal" ? "block" : "none" }}>
        <DealAnalyzerV2
          initialData={pendingDealData}
          onInitialDataConsumed={() => setPendingDealData(null)}
        />
      </div>

      <div style={{ display: activeTab === "batch" ? "block" : "none" }}>
        <BatchAnalyzer onRunInDealAnalyzer={handleRunInDealAnalyzer} />
      </div>

      <div style={{ display: activeTab === "montauk" ? "block" : "none" }}>
        <MontaukTools />
      </div>
    </div>
  );
}
