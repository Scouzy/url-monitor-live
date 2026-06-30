import { useState, useMemo, useSyncExternalStore } from "react";
import {
  Cpu, MemoryStick, HardDrive, TrendingUp, AlertTriangle,
  Layers, Eye, Flame, Trophy, Lightbulb, AppWindow,
} from "lucide-react";
import {
  ResponsiveContainer, ComposedChart, Line, XAxis, YAxis, Tooltip,
  CartesianGrid, ReferenceLine, Area,
} from "recharts";
import { getServers, subscribeServers, fleetTrend, distribution, topConsumers, recommendations, gaugeColor, ROLES } from "../utils/servers";
import { loadSnapshots } from "../utils/snapshots";
import { ServerDetail } from "./ServersView";

const METRICS = [
  { id: "cpu",  label: "CPU",    Icon: Cpu,         color: "#818CF8" },
  { id: "ram",  label: "RAM",    Icon: MemoryStick, color: "#EC4899" },
  { id: "disk", label: "Disque", Icon: HardDrive,   color: "#FBBF24" },
];

const SEVERITY_META = {
  critical: { color: "#F87171", bg: "rgba(248,113,113,0.08)", border: "rgba(248,113,113,0.3)", Icon: Flame,         label: "Critique" },
  high:     { color: "#FB923C", bg: "rgba(251,146,60,0.08)",  border: "rgba(251,146,60,0.3)",  Icon: AlertTriangle, label: "Saturation à venir" },
  medium:   { color: "#FBBF24", bg: "rgba(251,191,36,0.06)",  border: "rgba(251,191,36,0.25)", Icon: Eye,           label: "Surveillance" },
  info:     { color: "#34D399", bg: "rgba(52,211,153,0.06)",  border: "rgba(52,211,153,0.25)", Icon: Layers,        label: "Consolidation" },
};

const card = {
  background: "rgba(255,255,255,0.025)",
  border: "1px solid rgba(255,255,255,0.07)",
  borderRadius: 14, padding: 18,
};

const cardTitle = (Icon, text, extra) => (
  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
      <Icon size={14} color="#6B7280" />
      <span style={{ fontSize: 12, fontWeight: 700, color: "#9CA3AF", letterSpacing: "0.06em", textTransform: "uppercase" }}>{text}</span>
    </div>
    {extra}
  </div>
);

export default function CapacityPlanning() {
  const servers = useSyncExternalStore(subscribeServers, getServers);
  const snapshots = useMemo(() => loadSnapshots(), [servers]);
  const [metric, setMetric] = useState("cpu");
  const [selectedServer, setSelectedServer] = useState(null);
  const isAll = metric === "all";
  const meta = METRICS.find(m => m.id === metric) ?? { id: "all", label: "Vue globale", color: "#9CA3AF" };

  const trend = isAll ? [] : fleetTrend(servers, metric);
  const dist  = isAll ? [] : distribution(servers, metric);
  const top5  = isAll ? [] : topConsumers(servers, metric);
  const recos = recommendations(servers);
  const maxDist = isAll ? 1 : Math.max(...dist.map(d => d.count), 1);

  /* Mois de franchissement du seuil pour la flotte */
  const breach = isAll ? null : trend.find(t => (t.projection ?? 0) >= 90);
  const allData = isAll ? METRICS.map(m => {
    const d = distribution(servers, m.id);
    return { ...m, trend: fleetTrend(servers, m.id), dist: d, top5: topConsumers(servers, m.id), maxDist: Math.max(...d.map(x => x.count), 1) };
  }) : null;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>

      {/* Switch métrique */}
      <div style={{ display: "flex", gap: 8 }}>
        {[...METRICS, { id: "all", label: "Tout", Icon: Layers, color: "#9CA3AF" }].map(({ id, label, Icon, color }) => (
          <button key={id} onClick={() => setMetric(id)} style={{
            display: "flex", alignItems: "center", gap: 7, padding: "9px 20px", borderRadius: 11,
            cursor: "pointer", fontSize: 13, fontWeight: metric === id ? 700 : 500,
            background: metric === id ? `${color}1F` : "rgba(255,255,255,0.03)",
            border: `1px solid ${metric === id ? `${color}66` : "rgba(255,255,255,0.07)"}`,
            color: metric === id ? color : "#6B7280", transition: "all 0.15s",
          }}>
            <Icon size={15} /> {label}
          </button>
        ))}
      </div>

      {/* ══ VUE "TOUT" ══ */}
      {isAll && allData && (
        <>
          {/* 3 mini tendances */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 16 }}>
            {allData.map(m => {
              const mb = m.trend.find(t => (t.projection ?? 0) >= 90);
              return (
                <div key={m.id} style={card}>
                  {cardTitle(m.Icon, `Tendance ${m.label}`,
                    mb ? <span style={{ fontSize: 10, fontWeight: 700, color: "#F87171" }}>⚠ {mb.month}</span>
                       : <span style={{ fontSize: 10, color: "#34D399" }}>✓ OK</span>
                  )}
                  <div style={{ height: 130 }}>
                    <ResponsiveContainer width="100%" height="100%">
                      <ComposedChart data={m.trend} margin={{ top: 2, right: 4, bottom: 0, left: -28 }}>
                        <defs>
                          <linearGradient id={`ag_${m.id}`} x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor={m.color} stopOpacity={0.2} />
                            <stop offset="100%" stopColor={m.color} stopOpacity={0} />
                          </linearGradient>
                        </defs>
                        <CartesianGrid stroke="rgba(255,255,255,0.04)" vertical={false} />
                        <XAxis dataKey="month" tick={{ fontSize: 8, fill: "#6B7280" }} axisLine={false} tickLine={false} />
                        <YAxis domain={[0, 100]} tick={{ fontSize: 8, fill: "#6B7280" }} axisLine={false} tickLine={false} unit="%" />
                        <Tooltip contentStyle={{ background: "#1F2937", border: "none", borderRadius: 6, fontSize: 10 }}
                          formatter={(v) => v == null ? "—" : `${v}%`} />
                        <ReferenceLine y={90} stroke="#F87171" strokeDasharray="4 3" strokeWidth={1} />
                        <Area type="monotone" dataKey="réel" stroke="none" fill={`url(#ag_${m.id})`} connectNulls={false} />
                        <Line type="monotone" dataKey="réel" stroke={m.color} strokeWidth={2} dot={{ r: 2, fill: m.color }} connectNulls={false} />
                        <Line type="monotone" dataKey="projection" stroke={m.color} strokeWidth={1.5} strokeDasharray="5 4"
                          dot={{ r: 2, fill: "#0B0F19", stroke: m.color, strokeWidth: 1.5 }} connectNulls={false} />
                      </ComposedChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              );
            })}
          </div>

          {/* 3 distributions */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 16 }}>
            {allData.map(m => (
              <div key={m.id} style={card}>
                {cardTitle(Layers, `Distribution ${m.label}`)}
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {m.dist.map(b => {
                    const bc = b.min >= 90 ? "#F87171" : b.min >= 75 ? "#FB923C" : b.min >= 50 ? "#FBBF24" : m.color;
                    return (
                      <div key={b.label} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <span style={{ width: 52, fontSize: 10, color: "#9CA3AF", fontFamily: "'JetBrains Mono', monospace", flexShrink: 0 }}>{b.label}</span>
                        <div style={{ flex: 1, height: 14, background: "rgba(255,255,255,0.04)", borderRadius: 4, overflow: "hidden" }}>
                          <div style={{ width: `${(b.count / m.maxDist) * 100}%`, height: "100%", background: `linear-gradient(90deg, ${bc}99, ${bc})`, borderRadius: 4, transition: "width 0.5s" }} />
                        </div>
                        <span style={{ width: 20, fontSize: 11, fontWeight: 700, color: b.count > 0 ? bc : "#374151", fontFamily: "'JetBrains Mono', monospace", textAlign: "right", flexShrink: 0 }}>{b.count}</span>
                      </div>
                    );
                  })}
                </div>
                <div style={{ marginTop: 10, fontSize: 10, color: "#4B5563", textAlign: "center" }}>{servers.length} serveurs</div>
              </div>
            ))}
          </div>

          {/* 3 top5 */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 16 }}>
            {allData.map(m => (
              <div key={m.id} style={card}>
                {cardTitle(Trophy, `Top 5 ${m.label}`)}
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  {m.top5.map((s, i) => (
                    <div key={s.id} onClick={() => setSelectedServer(s)}
                      style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 10px", cursor: "pointer", borderRadius: 8,
                        background: i === 0 ? "rgba(248,113,113,0.05)" : "rgba(255,255,255,0.02)",
                        border: `1px solid ${i === 0 ? "rgba(248,113,113,0.2)" : "rgba(255,255,255,0.05)"}`,
                        transition: "background 0.12s",
                      }}
                      onMouseEnter={e => { e.currentTarget.style.background = "rgba(255,255,255,0.05)"; }}
                      onMouseLeave={e => { e.currentTarget.style.background = i === 0 ? "rgba(248,113,113,0.05)" : "rgba(255,255,255,0.02)"; }}
                    >
                      <span style={{ width: 20, height: 20, borderRadius: 6, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center",
                        fontSize: 10, fontWeight: 700, background: i === 0 ? "rgba(248,113,113,0.15)" : "rgba(255,255,255,0.05)",
                        color: i === 0 ? "#F87171" : "#6B7280" }}>{i + 1}</span>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 11, fontWeight: 600, color: "#E5E7EB", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{s.name}</div>
                        {s.app && (
                          <span style={{
                            display: "inline-flex", alignItems: "center", gap: 3, fontSize: 9, fontWeight: 600,
                            padding: "1px 5px", borderRadius: 8,
                            background: "rgba(167,139,250,0.12)", color: "#A78BFA",
                            border: "1px solid rgba(167,139,250,0.3)",
                            maxWidth: 80, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                          }}>
                            <AppWindow size={7} style={{ flexShrink: 0 }} />{s.app}
                          </span>
                        )}
                      </div>
                      <span style={{ fontSize: 12, fontWeight: 700, color: gaugeColor(s[m.id]), fontFamily: "'JetBrains Mono', monospace", flexShrink: 0 }}>{s[m.id]}%</span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {/* ══ VUE MÉTRIQUE UNIQUE ══ */}
      {!isAll && (<>

      {/* Tendance 12 mois */}
      <div style={card}>
        {cardTitle(TrendingUp, `Tendance ${meta.label} — flotte (12 mois)`,
          breach ? (
            <span style={{ fontSize: 11, fontWeight: 700, color: "#F87171", display: "flex", alignItems: "center", gap: 5 }}>
              <AlertTriangle size={12} /> Seuil critique atteint en {breach.month}
            </span>
          ) : (
            <span style={{ fontSize: 11, color: "#34D399" }}>✓ Sous le seuil sur la période projetée</span>
          )
        )}
        <div style={{ height: 240 }}>
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={trend} margin={{ top: 6, right: 12, bottom: 0, left: -24 }}>
              <defs>
                <linearGradient id="trendGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={meta.color} stopOpacity={0.25} />
                  <stop offset="100%" stopColor={meta.color} stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid stroke="rgba(255,255,255,0.05)" vertical={false} />
              <XAxis dataKey="month" tick={{ fontSize: 10, fill: "#6B7280" }} axisLine={false} tickLine={false} />
              <YAxis domain={[0, 100]} tick={{ fontSize: 10, fill: "#6B7280" }} axisLine={false} tickLine={false} unit="%" />
              <Tooltip
                contentStyle={{ background: "#1F2937", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, fontSize: 12 }}
                labelStyle={{ color: "#9CA3AF" }}
                formatter={(v, name) => v == null ? ["—", name] : [`${v}%`, name === "réel" ? "Mesuré" : "Projection"]}
              />
              <ReferenceLine y={90} stroke="#F87171" strokeDasharray="6 4" strokeWidth={1.5}
                label={{ value: "Seuil critique 90%", position: "insideTopRight", fill: "#F87171", fontSize: 10 }} />
              <Area type="monotone" dataKey="réel" stroke="none" fill="url(#trendGrad)" connectNulls={false} />
              <Line type="monotone" dataKey="réel" stroke={meta.color} strokeWidth={2.5}
                dot={{ r: 3, fill: meta.color }} connectNulls={false} />
              <Line type="monotone" dataKey="projection" stroke={meta.color} strokeWidth={2}
                strokeDasharray="6 5" dot={{ r: 3, fill: "#0B0F19", stroke: meta.color, strokeWidth: 1.5 }}
                connectNulls={false} />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
        <div style={{ display: "flex", gap: 18, marginTop: 8, fontSize: 10, color: "#6B7280", justifyContent: "center" }}>
          <span style={{ display: "flex", alignItems: "center", gap: 5 }}>
            <span style={{ width: 18, height: 2.5, background: meta.color, borderRadius: 2 }} /> 6 mois mesurés
          </span>
          <span style={{ display: "flex", alignItems: "center", gap: 5 }}>
            <span style={{ width: 18, height: 0, borderTop: `2.5px dashed ${meta.color}`, borderRadius: 2 }} /> 6 mois projetés
          </span>
          <span style={{ display: "flex", alignItems: "center", gap: 5 }}>
            <span style={{ width: 18, height: 0, borderTop: "2px dashed #F87171" }} /> Seuil 90%
          </span>
        </div>
      </div>

      {/* Distribution + Top 5 */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>

        {/* Distribution */}
        <div style={card}>
          {cardTitle(Layers, `Distribution ${meta.label} par tranche`)}
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {dist.map(b => {
              const barColor = b.min >= 90 ? "#F87171" : b.min >= 75 ? "#FB923C" : b.min >= 50 ? "#FBBF24" : meta.color;
              return (
                <div key={b.label} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <span style={{ width: 56, fontSize: 11, color: "#9CA3AF", fontFamily: "'JetBrains Mono', monospace", flexShrink: 0 }}>
                    {b.label}
                  </span>
                  <div style={{ flex: 1, height: 18, background: "rgba(255,255,255,0.04)", borderRadius: 6, overflow: "hidden" }}>
                    <div style={{
                      width: `${(b.count / maxDist) * 100}%`, height: "100%",
                      background: `linear-gradient(90deg, ${barColor}99, ${barColor})`,
                      borderRadius: 6, transition: "width 0.7s cubic-bezier(0.4,0,0.2,1)",
                      minWidth: b.count > 0 ? 18 : 0,
                    }} />
                  </div>
                  <span style={{ width: 22, fontSize: 12, fontWeight: 700, color: b.count > 0 ? barColor : "#374151", fontFamily: "'JetBrains Mono', monospace", textAlign: "right", flexShrink: 0 }}>
                    {b.count}
                  </span>
                </div>
              );
            })}
          </div>
          <div style={{ marginTop: 12, fontSize: 10, color: "#4B5563", textAlign: "center" }}>
            {servers.length} serveurs au total
          </div>
        </div>

        {/* Top 5 */}
        <div style={card}>
          {cardTitle(Trophy, `Top 5 consommateurs ${meta.label}`)}
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {top5.map((s, i) => (
              <div key={s.id}
                onClick={() => setSelectedServer(s)}
                style={{
                  display: "flex", alignItems: "center", gap: 10, padding: "8px 12px",
                  background: selectedServer?.id === s.id ? "rgba(99,102,241,0.1)" : i === 0 ? "rgba(248,113,113,0.05)" : "rgba(255,255,255,0.02)",
                  border: `1px solid ${selectedServer?.id === s.id ? "rgba(99,102,241,0.4)" : i === 0 ? "rgba(248,113,113,0.2)" : "rgba(255,255,255,0.05)"}`,
                  borderRadius: 10, cursor: "pointer", transition: "background 0.15s, border-color 0.15s",
                }}
                onMouseEnter={e => { if (selectedServer?.id !== s.id) e.currentTarget.style.background = "rgba(255,255,255,0.05)"; }}
                onMouseLeave={e => { if (selectedServer?.id !== s.id) e.currentTarget.style.background = i === 0 ? "rgba(248,113,113,0.05)" : "rgba(255,255,255,0.02)"; }}
              >
                <span style={{
                  width: 22, height: 22, borderRadius: 7, flexShrink: 0,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: 11, fontWeight: 700, fontFamily: "'JetBrains Mono', monospace",
                  background: i === 0 ? "rgba(248,113,113,0.15)" : "rgba(255,255,255,0.05)",
                  color: i === 0 ? "#F87171" : "#6B7280",
                }}>{i + 1}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: "#E5E7EB", fontFamily: "'JetBrains Mono', monospace", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {s.name}
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 5, flexWrap: "wrap", marginTop: 2 }}>
                    <span style={{ fontSize: 9, color: ROLES[s.role].color }}>{ROLES[s.role].label}</span>
                    {s.app && (
                      <span style={{
                        display: "inline-flex", alignItems: "center", gap: 3, fontSize: 9, fontWeight: 600,
                        padding: "1px 6px", borderRadius: 10, flexShrink: 0,
                        background: "rgba(167,139,250,0.12)", color: "#A78BFA",
                        border: "1px solid rgba(167,139,250,0.3)",
                        maxWidth: 90, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                      }}>
                        <AppWindow size={8} style={{ flexShrink: 0 }} />{s.app}
                      </span>
                    )}
                  </div>
                </div>
                <div style={{ width: 80, height: 7, background: "rgba(255,255,255,0.05)", borderRadius: 4, overflow: "hidden", flexShrink: 0 }}>
                  <div style={{
                    width: `${s[metric]}%`, height: "100%",
                    background: gaugeColor(s[metric]), borderRadius: 4,
                    transition: "width 0.6s ease",
                  }} />
                </div>
                <span style={{ width: 38, textAlign: "right", fontSize: 13, fontWeight: 700, color: gaugeColor(s[metric]), fontFamily: "'JetBrains Mono', monospace", flexShrink: 0 }}>
                  {s[metric]}%
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      </>)}

      {/* Recommandations */}
      <div style={{ ...card, border: recos.some(r => r.severity === "critical") ? "1px solid rgba(248,113,113,0.3)" : card.border }}>
        {cardTitle(Lightbulb, `Recommandations automatiques (${recos.length})`)}
        {recos.length === 0 ? (
          <div style={{ padding: "20px 0", textAlign: "center", fontSize: 12, color: "#34D399" }}>
            ✓ Aucune action requise — la capacité est saine
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {recos.map((r, i) => {
              const sm = SEVERITY_META[r.severity];
              return (
                <div key={i} style={{
                  display: "flex", alignItems: "flex-start", gap: 10, padding: "10px 14px",
                  background: sm.bg, border: `1px solid ${sm.border}`, borderRadius: 10,
                  animation: `fadeIn 0.3s ease ${i * 0.05}s both`,
                }}>
                  <sm.Icon size={14} color={sm.color} style={{ marginTop: 1, flexShrink: 0 }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 12, color: "#D1D5DB", lineHeight: 1.5 }}>{r.text}</div>
                  </div>
                  <span style={{
                    fontSize: 9, fontWeight: 700, padding: "2px 8px", borderRadius: 10, flexShrink: 0,
                    background: `${sm.color}1A`, color: sm.color, border: `1px solid ${sm.border}`,
                    textTransform: "uppercase", letterSpacing: "0.05em",
                  }}>{sm.label}</span>
                </div>
              );
            })}
          </div>
        )}
      </div>
      {/* ── Modal détail serveur ── */}
      {selectedServer && (
        <div
          onClick={() => setSelectedServer(null)}
          style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.92)", zIndex: 1000, display: "flex", alignItems: "flex-start", justifyContent: "center", padding: "28px 16px", overflowY: "auto" }}
        >
          <div onClick={e => e.stopPropagation()}>
            <ServerDetail server={selectedServer} snapshots={snapshots} onClose={() => setSelectedServer(null)} width="min(96vw, 960px)"
              overrideStyle={{ background: "#0D1117", border: "1px solid rgba(255,255,255,0.12)", maxHeight: "none" }} />
          </div>
        </div>
      )}
    </div>
  );
}
