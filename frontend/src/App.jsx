import { useState, useRef, useEffect, useCallback } from "react";
import ForceGraph2D from "react-force-graph-2d";
import * as d3 from "d3-force";
import "./App.css";

const API_BASE = import.meta.env.VITE_API_URL ?? "http://localhost:8000";

// ── Example messages for quick testing ──────────────────────────────────────
const EXAMPLE_MESSAGES = [
  {
    label: "Phishing SMS",
    text: "URGENT: Your SBI account has been suspended. Verify your KYC immediately at http://sbi-secure-login.xyz or your account will be blocked. Call 9876543210 now.",
  },
  {
    label: "Lottery Scam",
    text: "Congratulations! You have WON ₹50,000 in our lucky draw. Claim your prize by sending your bank account number and IFSC code to prize@win-lottery.net",
  },
  {
    label: "UPI Fraud",
    text: "Dear customer, send ₹1 to verify your UPI ID rahul.fraud@paytm and get ₹5000 cashback. Hurry! Offer expires in 24 hours. Do not ignore this message.",
  },
  {
    label: "Normal Message",
    text: "Hi, are we still meeting for lunch tomorrow at 1pm? Let me know if the time works for you.",
  },
];

// ── Risk helpers ─────────────────────────────────────────────────────────────
const getRiskColor = (risk = 0) => {
  if (risk >= 90) return "#DC143C";
  if (risk >= 70) return "#FF8C00";
  if (risk >= 40) return "#FFBF00";
  if (risk >= 20) return "#a3e635";
  return "#52c41a";
};

const getNodeRadius = (node) => {
  if (node.type === "message") return 14;
  const risk = node.node_risk || 0;
  return 4 + (risk / 100) * 16;
};

// ── Sub-components ────────────────────────────────────────────────────────────

function BarChart({ data, getColor }) {
  const barData = data
    .filter((n) => n.type !== "message")
    .sort((a, b) => (b.node_risk || 0) - (a.node_risk || 0));

  const width = 300;
  const height = 360;
  const margin = { top: 20, right: 20, bottom: 60, left: 50 };
  const innerW = width - margin.left - margin.right;
  const innerH = height - margin.top - margin.bottom;

  if (barData.length === 0) {
    return (
      <div className="empty-chart">No entity data to chart.</div>
    );
  }

  const barWidth = innerW / barData.length - 6;
  const xScale = (i) => margin.left + i * (innerW / barData.length) + 3;
  const yScale = (r) => margin.top + innerH - (r / 100) * innerH;

  return (
    <div>
      <svg width={width} height={height}>
        {/* Axes */}
        <line x1={margin.left} y1={margin.top} x2={margin.left} y2={height - margin.bottom} stroke="#555" />
        <line x1={margin.left} y1={height - margin.bottom} x2={width - margin.right} y2={height - margin.bottom} stroke="#555" />

        {/* Y-axis labels */}
        {[0, 25, 50, 75, 100].map((val) => (
          <g key={val}>
            <line x1={margin.left - 4} x2={margin.left} y1={yScale(val)} y2={yScale(val)} stroke="#555" />
            <text x={margin.left - 8} y={yScale(val) + 4} fontSize="9" textAnchor="end" fill="#aaa">{val}</text>
            <line x1={margin.left} x2={width - margin.right} y1={yScale(val)} y2={yScale(val)} stroke="#2a3a4a" strokeDasharray="3,3" />
          </g>
        ))}

        {/* Bars */}
        {barData.map((d, i) => {
          const x = xScale(i);
          const y = yScale(d.node_risk || 0);
          const h = height - margin.bottom - y;
          return (
            <g key={d.id}>
              <rect x={x} y={y} width={barWidth} height={h} fill={getColor(d.node_risk || 0)} rx="2" />
              <text x={x + barWidth / 2} y={y - 4} fontSize="9" textAnchor="middle" fill="#fff" fontWeight="bold">
                {d.node_risk}
              </text>
              <text
                x={x + barWidth / 2}
                y={height - margin.bottom + 10}
                fontSize="8"
                textAnchor="end"
                fill="#aaa"
                transform={`rotate(-35, ${x + barWidth / 2}, ${height - margin.bottom + 10})`}
              >
                {d.type}
              </text>
            </g>
          );
        })}

        <text x={14} y={height / 2} fontSize="10" fill="#aaa" textAnchor="middle" transform={`rotate(-90 14 ${height / 2})`}>Risk Score</text>
      </svg>
      <div className="chart-caption">Figure 2: Risk Score Distribution by Entity Type</div>
    </div>
  );
}

function RadarChart({ profile }) {
  if (!profile) return <div className="empty-chart">Click a node to see its risk profile.</div>;

  const labels = ["url_reputation", "sender_history", "content_phish", "behavioral_anomalies", "monetary_value", "social_urgency"];
  const names = ["URL Rep.", "Sender Hist.", "Phish Prob.", "Anomalies", "Monetary", "Social Urgency"];
  const size = 280;
  const center = size / 2;
  const radius = center - 55;
  const angleStep = (2 * Math.PI) / labels.length;

  const ptAt = (i, r) => {
    const angle = i * angleStep - Math.PI / 2;
    return { x: center + r * Math.cos(angle), y: center + r * Math.sin(angle) };
  };

  const dataPoints = labels.map((k, i) => ptAt(i, ((profile[k] || 0) / 100) * radius));
  const polyPoints = dataPoints.map((p) => `${p.x},${p.y}`).join(" ");

  const overall = labels.reduce((s, k) => s + (profile[k] || 0), 0) / labels.length;

  return (
    <div>
      <svg width={size} height={size}>
        {[1, 2, 3, 4, 5].map((n) => {
          const r = (n / 5) * radius;
          const pts = labels.map((_, i) => { const p = ptAt(i, r); return `${p.x},${p.y}`; }).join(" ");
          return <polygon key={n} points={pts} fill="none" stroke="#334155" strokeDasharray={n < 5 ? "3,3" : "0"} />;
        })}
        {labels.map((_, i) => {
          const end = ptAt(i, radius);
          return <line key={i} x1={center} y1={center} x2={end.x} y2={end.y} stroke="#334155" />;
        })}
        <polygon points={polyPoints} fill="rgba(255,191,0,0.25)" stroke="#FFBF00" strokeWidth="2" />
        {labels.map((k, i) => {
          const lp = ptAt(i, radius + 22);
          return (
            <g key={i}>
              <text x={lp.x} y={lp.y - 6} fontSize="8" textAnchor="middle" fill="#aaa">{names[i]}</text>
              <text x={lp.x} y={lp.y + 7} fontSize="10" textAnchor="middle" fill="#FFBF00" fontWeight="bold">{profile[k] || 0}</text>
            </g>
          );
        })}
      </svg>
      <div className="overall-score">Overall: {overall.toFixed(1)} / 100</div>
      <div className="chart-caption">Figure 3: Multi-Factor Attack Risk Profile</div>
    </div>
  );
}

function KeywordBadges({ flags }) {
  const all = [
    ...(flags.urgency || []).map((k) => ({ k, cls: "badge-urgency" })),
    ...(flags.financial || []).map((k) => ({ k, cls: "badge-financial" })),
    ...(flags.threat || []).map((k) => ({ k, cls: "badge-threat" })),
  ];
  if (all.length === 0) return null;
  return (
    <div className="keyword-badges">
      <strong>🚩 Flagged keywords:</strong>
      <div className="badge-row">
        {all.map(({ k, cls }) => (
          <span key={k} className={`badge ${cls}`}>{k}</span>
        ))}
      </div>
    </div>
  );
}

function StatsBar({ stats }) {
  if (!stats || stats.total_scans === 0) return null;
  const { total_scans, scam_count, ham_count, scam_rate_pct, risk_distribution } = stats;
  return (
    <div className="stats-bar">
      <div className="stat-item"><span className="stat-val">{total_scans}</span><span className="stat-label">Scans</span></div>
      <div className="stat-item danger"><span className="stat-val">{scam_count}</span><span className="stat-label">Spam</span></div>
      <div className="stat-item success"><span className="stat-val">{ham_count}</span><span className="stat-label">Ham</span></div>
      <div className="stat-item"><span className="stat-val">{scam_rate_pct}%</span><span className="stat-label">Scam Rate</span></div>
      <div className="stat-item danger"><span className="stat-val">{risk_distribution?.high || 0}</span><span className="stat-label">High Risk</span></div>
      <div className="stat-item warning"><span className="stat-val">{risk_distribution?.medium || 0}</span><span className="stat-label">Med Risk</span></div>
      <div className="stat-item success"><span className="stat-val">{risk_distribution?.low || 0}</span><span className="stat-label">Low Risk</span></div>
    </div>
  );
}

// ── Main App ──────────────────────────────────────────────────────────────────
export default function App() {
  const [message, setMessage] = useState("");
  const [result, setResult] = useState(null);
  const [graphData, setGraphData] = useState({ nodes: [], links: [] });
  const [selectedProfile, setSelectedProfile] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [stats, setStats] = useState(null);
  const [copied, setCopied] = useState(false);

  const graphRef = useRef();
  const [graphWidth, setGraphWidth] = useState(760);

  // Callback ref — fires only when the graph container DOM node mounts/unmounts.
  // Avoids the infinite-update problem of a dep-array-free useEffect.
  const containerRef = useCallback((el) => {
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) setGraphWidth(entry.contentRect.width);
    });
    ro.observe(el);
    setGraphWidth(el.offsetWidth);   // seed with current width immediately
    // ResizeObserver is GC'd with the element — no explicit cleanup needed here
  }, []);

  // D3 force config — applied whenever graphData changes (new scan result)
  useEffect(() => {
    const fg = graphRef.current;
    if (!fg) return;

    // Strong charge repulsion so nodes push each other away
    fg.d3Force("charge", d3.forceManyBody().strength(-400));

    // Collision: give each node a clearance equal to its drawn radius + generous padding
    fg.d3Force(
      "collide",
      d3.forceCollide()
        .radius((d) => getNodeRadius(d) + 30)
        .strength(1)
        .iterations(4)          // more iterations = harder boundary enforcement
    );

    // Link distance: sum of both endpoint radii + breathing room
    fg.d3Force("link").distance(
      (link) => getNodeRadius(link.source) + getNodeRadius(link.target) + 80
    );

    // Gentle centering so the graph doesn't drift off-canvas
    fg.d3Force("x", d3.forceX(0).strength(0.05));
    fg.d3Force("y", d3.forceY(0).strength(0.05));

    fg.d3ReheatSimulation();
  }, [graphData]);

  // Keyboard shortcut: Ctrl+Enter to analyze
  useEffect(() => {
    const handler = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "Enter") analyzeMessage();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  });

  const fetchStats = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/stats`);
      if (res.ok) setStats(await res.json());
    } catch (e) { void e; }
  }, []);

  const analyzeMessage = async () => {
    if (!message.trim()) return;
    setLoading(true);
    setError(null);
    setResult(null);
    setGraphData({ nodes: [], links: [] });
    setSelectedProfile(null);

    try {
      const res = await fetch(`${API_BASE}/predict`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err?.detail?.[0]?.msg || err?.detail || `Server error ${res.status}`);
      }

      const data = await res.json();
      setResult(data);

      if (data.graph_data?.nodes) {
        setGraphData(data.graph_data);
        const nonMsg = data.graph_data.nodes.filter((n) => n.type !== "message");
        const topRisk = nonMsg.sort((a, b) => (b.node_risk || 0) - (a.node_risk || 0))[0];
        if (topRisk?.risk_profile) setSelectedProfile(topRisk.risk_profile);
      }

      await fetchStats();
    } catch (e) {
      setError(e.message || "Failed to connect to server.");
    } finally {
      setLoading(false);
    }
  };

  const clearAll = () => {
    setMessage("");
    setResult(null);
    setGraphData({ nodes: [], links: [] });
    setSelectedProfile(null);
    setError(null);
  };

  const copyEntities = () => {
    if (!result?.entities) return;
    const text = Object.entries(result.entities)
      .filter(([, v]) => Array.isArray(v) && v.length)
      .map(([k, v]) => `${k}: ${v.join(", ")}`)
      .join("\n");
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  const handleNodeClick = (node) => {
    if (node.type === "message") return;
    setSelectedProfile(node.risk_profile || null);
  };

  return (
    <div className="app">
      <header className="app-header">
        <div className="header-inner">
          <div className="header-title">
            <span className="header-icon">🛡️</span>
            <div>
              <h1>AI Scam Network Detector</h1>
              <p className="header-sub">ML-powered scam detection with graph entity analysis</p>
            </div>
          </div>
        </div>
      </header>

      <main className="main-content">
        <>
            {/* Input Section */}
            <section className="card input-section">
              <label className="section-label">Message to Analyze</label>
              <textarea
                placeholder="Paste a suspicious message here… (Ctrl+Enter to analyze)"
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                rows={5}
              />

              {/* Example messages */}
              <div className="examples-row">
                <span className="examples-label">Try an example:</span>
                {EXAMPLE_MESSAGES.map((ex) => (
                  <button key={ex.label} className="example-btn" onClick={() => setMessage(ex.text)}>
                    {ex.label}
                  </button>
                ))}
              </div>

              <div className="button-row">
                <button className="btn-primary" onClick={analyzeMessage} disabled={loading || !message.trim()}>
                  {loading ? <span className="spinner" /> : "🔍 Analyze Message"}
                </button>
                <button className="btn-secondary" onClick={clearAll} disabled={loading}>
                  Clear
                </button>
              </div>

              {error && <div className="error-box">⚠️ {error}</div>}
            </section>

            {/* Stats bar (shown after first scan) */}
            <StatsBar stats={stats} />

            {/* Results */}
            {result && (
              <>
                {/* Summary Card */}
                <section className="card result-summary">
                  <div className="summary-grid">
                    <div className="summary-item">
                      <span className="summary-label">Verdict</span>
                      <span className={`verdict-badge ${result.prediction}`}>{result.prediction.toUpperCase()}</span>
                    </div>
                    <div className="summary-item">
                      <span className="summary-label">Confidence</span>
                      <span className="summary-val">{(result.confidence * 100).toFixed(1)}%</span>
                    </div>
                    <div className="summary-item">
                      <span className="summary-label">Risk Level</span>
                      <span className={`risk-badge ${result.risk_level}`}>{result.risk_level}</span>
                    </div>
                    <div className="summary-item">
                      <span className="summary-label">Risk Score</span>
                      <div className="risk-bar-wrap">
                        <div className="risk-bar-bg">
                          <div
                            className="risk-bar-fill"
                            style={{ width: `${result.risk_score_pct}%`, background: getRiskColor(result.risk_score_pct) }}
                          />
                        </div>
                        <span className="risk-val">{result.risk_score_pct}%</span>
                      </div>
                    </div>
                    <div className="summary-item">
                      <span className="summary-label">Entities</span>
                      <span className="summary-val">{result.graph?.total_nodes - 1 || 0}</span>
                    </div>
                    <div className="summary-item">
                      <span className="summary-label">Graph Edges</span>
                      <span className="summary-val">{result.graph?.total_edges || 0}</span>
                    </div>
                  </div>

                  {/* Keyword flags */}
                  {result.keyword_flags && <KeywordBadges flags={result.keyword_flags} />}
                </section>

                {/* Entities panel */}
                {result.entities && Object.keys(result.entities).length > 0 && (
                  <section className="card entities-section">
                    <div className="section-header">
                      <h3>Extracted Entities</h3>
                      <button className="btn-ghost" onClick={copyEntities}>{copied ? "✅ Copied!" : "📋 Copy"}</button>
                    </div>
                    <div className="entity-grid">
                      {Object.entries(result.entities)
                        .filter(([, v]) => Array.isArray(v) && v.length)
                        .map(([type, values]) => (
                          <div key={type} className="entity-group">
                            <span className="entity-type">{type.replace(/_/g, " ")}</span>
                            <div className="entity-values">
                              {values.map((v) => (
                                <span key={v} className="entity-tag">{v}</span>
                              ))}
                            </div>
                          </div>
                        ))}
                    </div>
                  </section>
                )}

                {/* Graph + Charts */}
                <section className="card">
                  <h3 className="section-title">Network Graph <span className="hint">(click a node to inspect its risk profile)</span></h3>
                  <div className="graph-outer" ref={containerRef}>
                    {/* Legend overlay */}
                    <div className="legend">
                      <div className="legend-section">
                        <strong>Node Size</strong>
                        <div className="size-samples">
                          {[10, 50, 100].map((r) => (
                            <div key={r} className="size-item">
                              <span className="dot" style={{ width: getNodeRadius({ type: "entity", node_risk: r }) * 2, height: getNodeRadius({ type: "entity", node_risk: r }) * 2 }} />
                              <span>{r}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                      <div className="legend-section">
                        <strong>Risk Color</strong>
                        {[["Critical", 95], ["High", 75], ["Medium", 55], ["Low", 30], ["Very Low", 10]].map(([label, val]) => (
                          <div key={label} className="color-item">
                            <span className="color-dot" style={{ background: getRiskColor(val) }} />
                            {label}
                          </div>
                        ))}
                      </div>
                    </div>

                    <ForceGraph2D
                      ref={graphRef}
                      graphData={graphData}
                      width={graphWidth}
                      height={Math.max(320, Math.min(560, graphWidth * 0.55))}
                      cooldownTicks={300}
                      cooldownTime={8000}
                      linkDirectionalParticles={2}
                      linkDirectionalParticleWidth={1.5}
                      linkColor={() => "#334155"}
                      onEngineStop={() => graphRef.current?.zoomToFit(400, 40)}
                      onNodeClick={handleNodeClick}
                      nodeCanvasObject={(node, ctx, globalScale) => {
                        const r = getNodeRadius(node);
                        const fontSize = Math.max(10, 12 / globalScale);
                        const color = node.type === "message" ? "#ffffff" : getRiskColor(node.node_risk || 0);

                        ctx.shadowBlur = node.type === "message" ? 18 : node.node_risk > 75 ? 12 : 0;
                        ctx.shadowColor = node.type === "message" ? "#93c5fd" : "#ff4d4f";
                        ctx.fillStyle = color;
                        ctx.beginPath();
                        ctx.arc(node.x, node.y, r, 0, 2 * Math.PI);
                        ctx.fill();
                        ctx.shadowBlur = 0;

                        ctx.font = `${fontSize}px 'Segoe UI', sans-serif`;
                        ctx.fillStyle = node.type === "message" ? "#1e293b" : "#e2e8f0";
                        const label = node.id.length > 20 ? node.id.slice(0, 18) + "…" : node.id;
                        ctx.fillText(label, node.x + r + 3, node.y + 4);
                      }}
                    />
                  </div>
                  <div className="chart-caption">Figure 1: Risk-Weighted Network Map</div>
                </section>

                {/* Bar + Radar side by side */}
                <div className="charts-row">
                  <div className="card chart-card">
                    <h3>Entity Risk Scores</h3>
                    <BarChart data={graphData.nodes} getColor={getRiskColor} />
                  </div>
                  <div className="card chart-card">
                    <h3>Attack Risk Profile</h3>
                    <RadarChart profile={selectedProfile} />
                  </div>
                </div>

                {/* Graph summary + interpretation */}
                <section className="card meaning-section">
                  <h3>📊 Graph Analysis</h3>
                  <p className="meaning-text">{result.graph_summary}</p>
                </section>

                <section className="card interpretation-section">
                  <h3>🔍 Interpretation</h3>
                  <p>
                    <strong>Figure 1 — Network Map:</strong> Node size and color encode entity risk.
                    Larger, darker-red nodes represent higher-risk entities. The white central node is the original message.
                  </p>
                  <p>
                    <strong>Figure 2 — Risk Distribution:</strong> Each bar represents one extracted entity,
                    ranked by risk score. The highest-risk entity is shown first.
                  </p>
                  <p>
                    <strong>Figure 3 — Attack Profile:</strong> The radar chart breaks down <em>why</em> an entity
                    is risky across six dimensions: URL reputation, sender history, phishing probability,
                    behavioral anomalies, monetary value, and social urgency.
                  </p>
                  <p>
                    Overall verdict: <strong className={`inline-risk ${result.risk_level}`}>{result.risk_level} Risk</strong>.{" "}
                    {result.risk_level === "High"
                      ? "This message shows strong indicators of a scam. Do not click links or share personal details."
                      : result.risk_level === "Medium"
                      ? "Exercise caution — some suspicious patterns were detected."
                      : "No major threats detected. The message appears legitimate."}
                  </p>
                </section>
              </>
            )}
        </>
      </main>

      <footer className="app-footer">
        AI Scam Network Detector &mdash; powered by FastAPI + React &nbsp;|&nbsp; For educational purposes only.
      </footer>
    </div>
  );
}
