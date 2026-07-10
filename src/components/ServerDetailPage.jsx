import { useState, useMemo, useEffect, useCallback } from "react";
import {
  ResponsiveContainer, Area, Line, XAxis, YAxis, Tooltip, CartesianGrid,
  ComposedChart, ReferenceLine,
} from "recharts";
import {
  ArrowLeft, Server, Cpu, MemoryStick, HardDrive, Network, MonitorCog,
  Clock, Calendar, Activity, Info, ChevronDown,
  Shield, RefreshCw, AlertCircle, TrendingUp, AlertTriangle,
} from "lucide-react";
import {
  EnvBadge, AppBadge, StatutBadge, OsBadge, RoleBadge, ServerStructuredSections,
} from "./ServersView";
import { loadSnapshots, buildTrendChartData } from "../utils/snapshots";
import { gaugeColor } from "../utils/servers";

/* ── Tooltip custom temps réel ── */
function RealTimeTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div style={{
      background: "rgba(17,24,39,0.95)", border: "1px solid rgba(255,255,255,0.1)",
      borderRadius: 10, padding: "10px 14px", fontSize: 12, backdropFilter: "blur(8px)",
      boxShadow: "0 8px 32px rgba(0,0,0,0.4)",
    }}>
      <div style={{ fontWeight: 700, color: "#F3F4F6", marginBottom: 6 }}>{label}</div>
      {payload.map((p, i) => (
        <div key={i} style={{ display: "flex", alignItems: "center", gap: 6, color: p.color, fontSize: 11 }}>
          <div style={{ width: 8, height: 8, borderRadius: 2, background: p.color }} />
          {p.name} : <span style={{ fontWeight: 700, fontFamily: "'JetBrains Mono', monospace" }}>{p.value}%</span>
        </div>
      ))}
    </div>
  );
}

/* ── Carte KPI (CPU / RAM / Disk) ── */
function KpiCard({ icon: Icon, label, value, color, history }) {
  const vals = history.length > 0 ? history : [value];
  const min = Math.min(...vals);
  const max = Math.max(...vals);
  const avg = Math.round(vals.reduce((s, v) => s + v, 0) / vals.length);
  const pctColor = value >= 90 ? "#F87171" : value >= 75 ? "#FB923C" : value >= 50 ? "#FBBF24" : color;

  return (
    <div style={{
      background: "rgba(255,255,255,0.025)", border: "1px solid rgba(255,255,255,0.06)",
      borderRadius: 14, padding: "16px 18px", display: "flex", flexDirection: "column", gap: 10,
    }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <Icon size={14} color={color} />
          <span style={{ fontSize: 11, fontWeight: 700, color: "#9CA3AF", textTransform: "uppercase", letterSpacing: "0.05em" }}>{label}</span>
        </div>
        <span style={{ fontSize: 22, fontWeight: 800, color: pctColor, fontFamily: "'JetBrains Mono', monospace" }}>{value}<span style={{ fontSize: 12, opacity: 0.6 }}>%</span></span>
      </div>
      {/* Barre de progression */}
      <div style={{ height: 6, background: "rgba(255,255,255,0.06)", borderRadius: 4, overflow: "hidden" }}>
        <div style={{ width: `${value}%`, height: "100%", background: pctColor, borderRadius: 4, transition: "width 0.5s ease" }} />
      </div>
      {/* Stats session */}
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, color: "#4B5563" }}>
        <span>min <b style={{ color: "#6B7280", fontFamily: "'JetBrains Mono', monospace" }}>{min}%</b></span>
        <span>moy <b style={{ color: "#6B7280", fontFamily: "'JetBrains Mono', monospace" }}>{avg}%</b></span>
        <span>max <b style={{ color: "#6B7280", fontFamily: "'JetBrains Mono', monospace" }}>{max}%</b></span>
      </div>
    </div>
  );
}

/* ── Graphique métriques avec toggle 24h/1 mois + isolation métriques ── */
function MetricsChart({ server, isMobile }) {
  const [range, setRange] = useState("24h"); /* "24h" | "1m" */
  const [visible, setVisible] = useState({ cpu: true, ram: true, disk: true });
  const [liveTime, setLiveTime] = useState(() => new Date().toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" }));

  useEffect(() => {
    if (range !== "24h") return;
    const id = setInterval(() => setLiveTime(new Date().toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })), 1000);
    return () => clearInterval(id);
  }, [range]);

  const snapshots = useMemo(() => loadSnapshots(), [server]);

  /* Données temps réel : history24h mappé vers les timestamps réels accumulés */
  const data24h = useMemo(() => {
    const h24 = server.history24h || [];
    if (h24.length === 0) return [];
    return h24.map((d) => ({
      time: d.h,
      CPU: d.cpu, RAM: d.ram, Disque: d.disk,
    }));
  }, [server.history24h]);

  /* Données 1 mois : snapshots de capacité filtrés pour ce serveur */
  const data1m = useMemo(() => {
    const pts = snapshots
      .filter(s => s.servers[server.name] != null)
      .map(s => ({
        ts: s.ts,
        time: new Date(s.ts).toLocaleDateString("fr-FR", { day: "2-digit", month: "short" }),
        CPU: s.servers[server.name].cpu,
        RAM: s.servers[server.name].ram,
        Disque: s.servers[server.name].disk,
      }))
      .sort((a, b) => a.ts - b.ts);
    return pts;
  }, [server.name, snapshots]);

  const chartData = range === "24h" ? data24h : data1m;
  const hasData = chartData.length > 0;

  const toggleMetric = (key) => setVisible(v => ({ ...v, [key]: !v[key] }));

  const metricKeys = [
    { key: "cpu", label: "CPU", color: "#818CF8" },
    { key: "ram", label: "RAM", color: "#F472B6" },
    { key: "disk", label: "Disque", color: "#FBBF24" },
  ];

  return (
    <div style={{
      background: "rgba(255,255,255,0.025)", border: "1px solid rgba(255,255,255,0.06)",
      borderRadius: 16, padding: "18px 20px", display: "flex", flexDirection: "column", gap: 12,
    }}>
      {/* En-tête : titre + toggle range + indicateur live */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <Activity size={15} color="#818CF8" />
          <h3 style={{ fontSize: 13, fontWeight: 700, color: "#E5E7EB", margin: 0 }}>
            Métriques {range === "24h" ? "temps réel" : "historique — 1 mois"}
          </h3>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          {range === "24h" && (
            <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 10, color: "#6B7280" }}>
              <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#34D399", boxShadow: "0 0 6px #34D399", animation: "pulse 2s ease-in-out infinite" }} />
              {liveTime}
            </div>
          )}
          {/* Toggle 24h / 1 mois */}
          <div style={{ display: "flex", background: "rgba(255,255,255,0.04)", borderRadius: 8, padding: 2 }}>
            {["24h", "1m"].map(r => (
              <button key={r} onClick={() => setRange(r)} style={{
                padding: "4px 12px", borderRadius: 6, border: "none", cursor: "pointer",
                fontSize: 10, fontWeight: 700, transition: "all 0.15s",
                background: range === r ? "rgba(99,102,241,0.25)" : "transparent",
                color: range === r ? "#A5B4FC" : "#6B7280",
              }}>{r === "1m" ? "1 mois" : "Live"}</button>
            ))}
          </div>
        </div>
      </div>

      {/* Boutons d'isolation des métriques */}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        {metricKeys.map(({ key, label, color }) => (
          <button key={key} onClick={() => toggleMetric(key)} style={{
            display: "inline-flex", alignItems: "center", gap: 5, padding: "4px 10px", borderRadius: 8,
            border: `1px solid ${visible[key] ? `${color}40` : "rgba(255,255,255,0.06)"}`,
            background: visible[key] ? `${color}15` : "transparent",
            color: visible[key] ? color : "#4B5563",
            fontSize: 10, fontWeight: 700, cursor: "pointer", transition: "all 0.15s",
            userSelect: "none",
          }}>
            <span style={{ width: 8, height: 8, borderRadius: 2, background: visible[key] ? color : "#4B5563" }} />
            {label}
          </button>
        ))}
      </div>

      {hasData ? (
        <div style={{ width: "100%", height: isMobile ? 280 : 340 }}>
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={chartData} margin={{ top: 8, right: 12, left: -8, bottom: 0 }}>
              <defs>
                <linearGradient id="mCpu" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#818CF8" stopOpacity={0.3} />
                  <stop offset="100%" stopColor="#818CF8" stopOpacity={0.02} />
                </linearGradient>
                <linearGradient id="mRam" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#F472B6" stopOpacity={0.3} />
                  <stop offset="100%" stopColor="#F472B6" stopOpacity={0.02} />
                </linearGradient>
                <linearGradient id="mDisk" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#FBBF24" stopOpacity={0.3} />
                  <stop offset="100%" stopColor="#FBBF24" stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
              <XAxis dataKey="time" tick={{ fill: "#6B7280", fontSize: 10 }} axisLine={{ stroke: "rgba(255,255,255,0.08)" }} interval={range === "24h" ? 2 : "preserveStartEnd"} />
              <YAxis domain={[0, 100]} tick={{ fill: "#6B7280", fontSize: 10 }} axisLine={{ stroke: "rgba(255,255,255,0.08)" }} unit="%" />
              <Tooltip content={<RealTimeTooltip />} />
              <ReferenceLine y={90} stroke="#F87171" strokeDasharray="5 4" strokeWidth={1}
                label={{ value: "Seuil 90%", position: "insideTopRight", fill: "#F87171", fontSize: 9 }} />
              {visible.cpu && <Area type="monotone" dataKey="CPU" stroke="#818CF8" strokeWidth={2} fill="url(#mCpu)" dot={false} />}
              {visible.ram && <Area type="monotone" dataKey="RAM" stroke="#F472B6" strokeWidth={2} fill="url(#mRam)" dot={false} />}
              {visible.disk && <Area type="monotone" dataKey="Disque" stroke="#FBBF24" strokeWidth={2} fill="url(#mDisk)" dot={false} />}
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      ) : (
        <div style={{ textAlign: "center", padding: 30, color: "#4B5563", fontSize: 12 }}>
          {range === "24h"
            ? "Aucune donnée 24h disponible."
            : "Aucun snapshot sur 1 mois. Les snapshots s'accumulent à chaque chargement — revenez après plusieurs jours."}
        </div>
      )}
    </div>
  );
}

/* ── Graphique de tendance avec projection 3 et 6 mois ── */
const TREND_LINES = [
  { rKey: "cpu_r", pKey: "cpu_p", key: "cpu", color: "#818CF8", label: "CPU" },
  { rKey: "ram_r", pKey: "ram_p", key: "ram", color: "#F472B6", label: "RAM" },
  { rKey: "disk_r", pKey: "disk_p", key: "disk", color: "#FBBF24", label: "Disque" },
];

function TrendChart({ server, snapshots, isMobile }) {
  const [open, setOpen] = useState(true);

  const cur = { cpu: server.cpu, ram: server.ram, disk: server.disk };
  const growth = server.growthRate || 1.5;

  const snap = useMemo(() => {
    const s = buildTrendChartData(server.name, snapshots);
    if (!s || s.spanDays < 7) return null;
    return s;
  }, [server.name, snapshots]);

  let data, breach, m3, m6, subtitle;
  if (snap) {
    const realPts = snap.data.slice(0, snap.snapCount);
    const projPts = snap.data.slice(snap.snapCount);

    if (realPts.length > 0) {
      const lastIdx = realPts.length - 1;
      realPts[lastIdx] = {
        ...realPts[lastIdx],
        cpu_r: cur.cpu, ram_r: cur.ram, disk_r: cur.disk,
        cpu_p: cur.cpu, ram_p: cur.ram, disk_p: cur.disk,
      };
    }

    const projMonths = [30, 60, 90, 120, 150, 180];
    const projData = projMonths.map((days, i) => {
      const offset = i + 1;
      const cpuV = Math.min(100, Math.round((cur.cpu + offset * growth) * 10) / 10);
      const ramV = Math.min(100, Math.round((cur.ram + offset * growth * 0.85) * 10) / 10);
      const diskV = Math.min(100, Math.round((cur.disk + offset * growth * 1.15) * 10) / 10);
      return {
        month: `+${i + 1}m`, cpu: cpuV, ram: ramV, disk: diskV,
        cpu_r: null, ram_r: null, disk_r: null,
        cpu_p: cpuV, ram_p: ramV, disk_p: diskV,
      };
    });

    data = [...realPts, ...projData];
    breach = projData.find(p => p.cpu >= 90 || p.ram >= 90 || p.disk >= 90);
    m3 = projData[2]; m6 = projData[5];
    subtitle = `${snap.snapCount} mesures · ${snap.spanDays}j d'historique`;
  } else {
    data = (server.monthly || []).map((m, i, arr) => {
      const isEdge = !m.projected && arr[i + 1]?.projected;
      const isCurrent = !m.projected && i === 5;
      const cpu = isCurrent ? cur.cpu : m.cpu;
      const ram = isCurrent ? cur.ram : m.ram;
      const disk = isCurrent ? cur.disk : m.disk;
      return {
        month: m.month,
        cpu_r: !m.projected || isEdge ? cpu : null,
        ram_r: !m.projected || isEdge ? ram : null,
        disk_r: !m.projected || isEdge ? disk : null,
        cpu_p: m.projected || isEdge ? cpu : null,
        ram_p: m.projected || isEdge ? ram : null,
        disk_p: m.projected || isEdge ? disk : null,
      };
    });
    breach = (server.monthly || []).find(m => m.projected && (m.cpu >= 90 || m.ram >= 90 || m.disk >= 90));
    const proj = (server.monthly || []).filter(m => m.projected);
    m3 = proj[2] || null; m6 = proj[5] || null;
    subtitle = "12 mois simulés";
  }

  return (
    <div style={{
      background: "rgba(255,255,255,0.025)", border: "1px solid rgba(255,255,255,0.06)",
      borderRadius: 16, padding: "18px 20px", display: "flex", flexDirection: "column", gap: 12,
    }}>
      {/* Titre cliquable */}
      <div
        onClick={() => setOpen(o => !o)}
        style={{ display: "flex", alignItems: "center", justifyContent: "space-between", cursor: "pointer", userSelect: "none" }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <TrendingUp size={15} color={snap ? "#818CF8" : "#6B7280"} />
          <h3 style={{ fontSize: 13, fontWeight: 700, color: snap ? "#A5B4FC" : "#9CA3AF", margin: 0 }}>Tendance & Projection</h3>
          <span style={{ fontSize: 10, color: "#4B5563" }}>{subtitle}</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {breach && (
            <span style={{ fontSize: 10, color: "#F87171", fontWeight: 700, display: "flex", alignItems: "center", gap: 3 }}>
              <AlertTriangle size={11} /> Seuil 90% en {breach.month}
            </span>
          )}
          <ChevronDown size={14} color="#4B5563" style={{ transform: open ? "rotate(180deg)" : "none", transition: "transform 0.2s" }} />
        </div>
      </div>

      {open && (
        <>
          {/* Légende */}
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
            {TREND_LINES.map(({ color, label }) => (
              <span key={label} style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 10, color: "#6B7280" }}>
                <span style={{ width: 14, height: 2.5, background: color, borderRadius: 2, display: "inline-block" }} />
                {label}
              </span>
            ))}
            <span style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 10, color: "#6B7280" }}>
              <span style={{ width: 14, height: 0, borderTop: "2px dashed #6B7280", display: "inline-block" }} />
              Projection
            </span>
          </div>

          <div style={{ height: isMobile ? 200 : 240 }}>
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={data} margin={{ top: 4, right: 4, bottom: 0, left: -20 }}>
                <CartesianGrid stroke="rgba(255,255,255,0.04)" vertical={false} />
                <XAxis dataKey="month" tick={{ fontSize: 9, fill: "#4B5563" }} axisLine={false} tickLine={false} />
                <YAxis domain={[0, 100]} tick={{ fontSize: 9, fill: "#4B5563" }} axisLine={false} tickLine={false} unit="%" />
                <Tooltip
                  contentStyle={{ background: "#111827", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 8, fontSize: 10 }}
                  labelStyle={{ color: "#9CA3AF", marginBottom: 2 }}
                  formatter={(v, key) => {
                    if (v == null) return [null];
                    const labels = { cpu_r: "CPU", ram_r: "RAM", disk_r: "Disque", cpu_p: "CPU (proj.)", ram_p: "RAM (proj.)", disk_p: "Disque (proj.)" };
                    return [`${Math.round(v)}%`, labels[key] || key];
                  }}
                />
                <ReferenceLine y={90} stroke="#F87171" strokeDasharray="5 4" strokeWidth={1}
                  label={{ value: "90%", position: "insideTopRight", fill: "#F87171", fontSize: 8 }} />
                {TREND_LINES.map(({ rKey, pKey, color }) => (
                  <Line key={rKey} type="monotone" dataKey={rKey} stroke={color} strokeWidth={1.8}
                    dot={{ r: snap ? 3 : 0, fill: color }} connectNulls={false} />
                ))}
                {TREND_LINES.map(({ pKey, color }) => (
                  <Line key={pKey} type="monotone" dataKey={pKey} stroke={color} strokeWidth={1.5}
                    strokeDasharray="5 4" dot={false} connectNulls={false} />
                ))}
              </ComposedChart>
            </ResponsiveContainer>
          </div>

          {/* Valeurs projetées +3 et +6 mois */}
          {(m3 || m6) && (
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
              {[m3 && { label: "+3 mois", m: m3 }, m6 && { label: "+6 mois", m: m6 }].filter(Boolean).map(({ label, m }) => (
                <div key={label} style={{
                  background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)",
                  borderRadius: 10, padding: "10px 12px",
                }}>
                  <div style={{ fontSize: 10, color: "#6B7280", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 6 }}>{label}</div>
                  {TREND_LINES.map(({ key, color, label: lbl }) => {
                    const val = m[key] ?? m[`${key}_p`];
                    if (val == null) return null;
                    return (
                      <div key={key} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
                        <span style={{ fontSize: 10, color: "#4B5563" }}>{lbl}</span>
                        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                          <div style={{ width: 48, height: 5, background: "rgba(255,255,255,0.05)", borderRadius: 3, overflow: "hidden" }}>
                            <div style={{ width: `${val}%`, height: "100%", background: val >= 90 ? "#F87171" : val >= 75 ? "#FB923C" : color, borderRadius: 3 }} />
                          </div>
                          <span style={{ fontSize: 11, fontWeight: 700, fontFamily: "'JetBrains Mono', monospace", color: val >= 90 ? "#F87171" : color }}>{val}%</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

/* ── Panneau Snapshots ITCare ── */
function ItcareSnapshotsPanel({ server }) {
  const extraMap = useMemo(() => Object.fromEntries((server.extra || []).map(e => [e.label, e.value])), [server]);
  const itcareId = extraMap["ITCare ID"];
  const itcarePath = extraMap["ITCare Path"];

  /* Snapshots déjà chargés (stockés dans _Snapshots) */
  const storedSnaps = useMemo(() => {
    try { return JSON.parse(extraMap["_Snapshots"] || "null") || []; }
    catch { return []; }
  }, [extraMap]);

  const [snapshots, setSnapshots] = useState(storedSnaps);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [refreshed, setRefreshed] = useState(false);

  useEffect(() => { setSnapshots(storedSnaps); }, [storedSnaps]);

  const handleRefresh = useCallback(async () => {
    if (!itcareId) { setError("ID ITCare non disponible pour ce serveur"); return; }
    let config = null;
    try { config = JSON.parse(localStorage.getItem("capacity-itcare-config")); } catch {}
    if (!config) { setError("Configurez l'authentification ITCare dans Serveurs > Inventaire"); return; }

    let body;
    if (config.authMode === "credentials" && config.clientId && config.clientSecret) {
      body = { clientId: config.clientId, clientSecret: config.clientSecret, instanceId: itcareId, path: itcarePath };
    } else if (config.authMode === "token" && config.token) {
      body = { token: config.token, instanceId: itcareId, path: itcarePath };
    } else {
      setError("Authentification ITCare non configurée");
      return;
    }

    setLoading(true); setError(null);
    try {
      const res = await fetch("/api/itcare-actions", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (json.error && (!json.actions || json.actions.length === 0)) { setError(json.error); }
      else {
        const allActions = json.actions || [];
        /* Filtrer les actions liées aux snapshots (process = vm_create_snapshot / vm_delete_snapshot) */
        const snapActions = allActions
          .filter(a => {
            const proc = (a.process || a.description || a.name || a.type || a.action || "").toLowerCase();
            return proc.includes("snapshot") || proc.includes("snap");
          })
          .sort((a, b) => {
            const da = new Date(a.submittedAt || a.completedAt || a.lastUpdatedAt || 0).getTime();
            const db = new Date(b.submittedAt || b.completedAt || b.lastUpdatedAt || 0).getTime();
            return db - da;
          })
          .slice(0, 2);

        const ACTION_LABELS = {
          vm_create_snapshot: "Création de snapshot",
          vm_delete_snapshot: "Suppression de snapshot",
        };
        const mapped = snapActions.map(s => ({
          name: ACTION_LABELS[s.process] || s.process || s.description || `Action ${s.id || ""}`,
          date: s.submittedAt || s.completedAt || s.lastUpdatedAt || "",
          desc: s.duration ? `Durée: ${s.duration}` : "",
          status: s.status || "",
          creator: s.submittedBy || s.createdBy || "",
          raw: s,
        }));
        setSnapshots(mapped);
        setRefreshed(true);
        if (mapped.length === 0) setError("Aucun événement snapshot trouvé dans l'historique des actions");
      }
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [itcareId, itcarePath]);

  /* Auto-refresh à l'ouverture */
  useEffect(() => {
    if (itcareId) handleRefresh();
  }, [itcareId, handleRefresh]);

  const fmtDate = (d) => {
    if (!d) return "—";
    try {
      const dt = new Date(d);
      const now = new Date();
      const isSameDay = dt.toDateString() === now.toDateString();
      if (isSameDay) return dt.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
      return dt.toLocaleDateString("fr-FR", { day: "2-digit", month: "short", year: "numeric" });
    } catch { return d; }
  };
  const fmtSize = (v) => v != null ? (v >= 1024 ? `${(v / 1024).toFixed(1)} To` : `${v} Go`) : null;

  return (
    <div style={{
      background: "rgba(255,255,255,0.025)", border: "1px solid rgba(255,255,255,0.06)",
      borderRadius: 16, padding: "18px 20px", display: "flex", flexDirection: "column", gap: 12, minWidth: 0, overflow: "hidden",
    }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <Shield size={15} color="#60A5FA" />
          <h3 style={{ fontSize: 13, fontWeight: 700, color: "#E5E7EB", margin: 0 }}>Actions récentes — Snapshots</h3>
          {snapshots.length > 0 && <span style={{ fontSize: 10, color: "#4B5563" }}>({snapshots.length})</span>}
        </div>
        <button onClick={handleRefresh} disabled={loading} style={{
          display: "inline-flex", alignItems: "center", gap: 5, padding: "5px 10px", borderRadius: 8,
          background: loading ? "rgba(96,165,250,0.05)" : "rgba(96,165,250,0.1)",
          border: "1px solid rgba(96,165,250,0.25)", color: loading ? "#4B5563" : "#60A5FA",
          fontSize: 10, fontWeight: 600, cursor: loading ? "default" : "pointer", whiteSpace: "nowrap",
        }}>
          <RefreshCw size={11} className={loading ? "spin" : ""} style={loading ? { animation: "spin 1s linear infinite" } : {}} />
          {loading ? "Chargement…" : "Actualiser"}
        </button>
      </div>

      {error && (
        <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, color: "#F87171", background: "rgba(248,113,113,0.06)", border: "1px solid rgba(248,113,113,0.15)", borderRadius: 8, padding: "8px 10px" }}>
          <AlertCircle size={12} /> {error}
        </div>
      )}

      {refreshed && !error && snapshots.length > 0 && (
        <div style={{ fontSize: 10, color: "#34D399", display: "flex", alignItems: "center", gap: 4 }}>
          <span style={{ width: 5, height: 5, borderRadius: "50%", background: "#34D399" }} /> Données actualisées depuis ITCare
        </div>
      )}

      {snapshots.length === 0 && !error ? (
        <div style={{ textAlign: "center", padding: 24, color: "#4B5563", fontSize: 12 }}>
          Aucun événement snapshot disponible pour ce serveur.
          {!itcareId && <br />}
          {!itcareId && "ID ITCare non disponible — chargez les serveurs depuis ITCare pour activer cette fonctionnalité."}
          {itcareId && <br />}
          {itcareId && "Cliquez sur Actualiser pour récupérer l'historique des actions récentes depuis ITCare."}
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {snapshots.map((s, i) => (
            <div key={i} style={{
              display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 10,
              background: "rgba(96,165,250,0.05)", border: "1px solid rgba(96,165,250,0.15)",
              borderRadius: 10, padding: "10px 12px",
            }}>
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ fontSize: 12, color: "#60A5FA", fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {s.name || `Snapshot ${i + 1}`}
                </div>
                {s.desc && s.desc !== s.name && (
                  <div style={{ fontSize: 10, color: "#6B7280", marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {s.desc}
                  </div>
                )}
                <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 4 }}>
                  {s.date && (
                    <span style={{ fontSize: 10, color: "#4B5563", display: "flex", alignItems: "center", gap: 3 }}>
                      <Calendar size={9} /> {fmtDate(s.date)}
                    </span>
                  )}
                  {s.creator && (
                    <span style={{ fontSize: 10, color: "#4B5563", display: "flex", alignItems: "center", gap: 3 }}>
                      <RefreshCw size={9} /> {s.creator}
                    </span>
                  )}
                  {s.status && (
                    <span style={{
                      fontSize: 9, fontWeight: 700, padding: "1px 6px", borderRadius: 5,
                      background: /ok|complete|success|active|succès|réussi|reussi/i.test(s.status) ? "rgba(52,211,153,0.12)" : "rgba(156,163,175,0.08)",
                      color: /ok|complete|success|active|succès|réussi|reussi/i.test(s.status) ? "#34D399" : "#9CA3AF",
                    }}>{s.status === "SUCCESS" ? "Succès" : s.status}</span>
                  )}
                </div>
              </div>
              {s.size != null && (
                <span style={{ fontSize: 11, color: "#9CA3AF", flexShrink: 0, fontFamily: "'JetBrains Mono', monospace", fontWeight: 600 }}>
                  {fmtSize(s.size)}
                </span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ── Panneau des specs serveur ── */
function ServerSpecsPanel({ server }) {
  const specs = [
    { Icon: MonitorCog,  label: "OS",      value: server.os },
    { Icon: Network,     label: "IP",      value: server.ip },
    ...(server.cores      != null ? [{ Icon: Cpu,         label: "Cores",    value: `${server.cores} vCPU` }] : []),
    ...(server.ramGb      != null ? [{ Icon: MemoryStick, label: "RAM",      value: `${server.ramGb} Go` }] : []),
    ...(server.diskGb     != null ? [{ Icon: HardDrive,   label: "Stockage", value: server.diskGb >= 1024 ? `${(server.diskGb / 1024).toFixed(1)} To` : `${server.diskGb} Go` }] : []),
    ...(server.uptimeDays != null && server.uptimeDays > 0 ? [{ Icon: Clock, label: "Uptime", value: `${server.uptimeDays} jours` }] : []),
    ...(server.createdAt  ? [{ Icon: Calendar, label: "Créé le", value: server.createdAt }] : []),
  ];

  return (
    <div style={{
      background: "rgba(255,255,255,0.025)", border: "1px solid rgba(255,255,255,0.06)",
      borderRadius: 16, padding: "18px 20px", minWidth: 0, overflow: "hidden",
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
        <Info size={15} color="#818CF8" />
        <h3 style={{ fontSize: 13, fontWeight: 700, color: "#E5E7EB", margin: 0 }}>Caractéristiques serveur</h3>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
        {specs.map(({ Icon, label, value }) => (
          <div key={label} style={{
            background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)",
            borderRadius: 10, padding: "8px 10px",
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 9, color: "#6B7280", marginBottom: 3, textTransform: "uppercase", letterSpacing: "0.05em" }}>
              <Icon size={10} /> {label}
            </div>
            <div style={{ fontSize: 12, fontWeight: 600, color: "#E5E7EB", fontFamily: "'JetBrains Mono', monospace" }}>
              {value}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ── Panneau infos complémentaires (collapsible) ── */
function ExtraInfoPanel({ server }) {
  const [open, setOpen] = useState(true);
  const extraItems = (server.extra || []).filter(e => !e.label.startsWith("_"));
  if (extraItems.length === 0) return null;

  return (
    <div style={{
      background: "rgba(255,255,255,0.025)", border: "1px solid rgba(255,255,255,0.06)",
      borderRadius: 16, padding: "18px 20px", minWidth: 0, overflow: "hidden",
    }}>
      <div
        onClick={() => setOpen(o => !o)}
        style={{ display: "flex", alignItems: "center", justifyContent: "space-between", cursor: "pointer", userSelect: "none" }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <Info size={15} color="#6B7280" />
          <h3 style={{ fontSize: 13, fontWeight: 700, color: "#E5E7EB", margin: 0 }}>Informations complémentaires</h3>
          <span style={{ fontSize: 10, color: "#4B5563" }}>({extraItems.length})</span>
        </div>
        <ChevronDown size={14} color="#4B5563" style={{ transform: open ? "rotate(180deg)" : "none", transition: "transform 0.2s" }} />
      </div>
      {open && (
        <div style={{ display: "flex", flexDirection: "column", gap: 5, marginTop: 12 }}>
          {extraItems.map(({ label, value }) => (
            <div key={label} style={{
              display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10,
              background: "rgba(99,102,241,0.05)", border: "1px solid rgba(99,102,241,0.15)",
              borderRadius: 8, padding: "6px 10px",
            }}>
              <span style={{ fontSize: 10, color: "#818CF8", fontWeight: 600, flexShrink: 0 }}>{label}</span>
              <span style={{ fontSize: 11, color: "#E5E7EB", fontFamily: "'JetBrains Mono', monospace", textAlign: "right", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {value}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ── Page de détail serveur (pleine page) ── */
export default function ServerDetailPage({ server, isMobile = false, onBack }) {
  const snapshots = useMemo(() => loadSnapshots(), [server]);

  if (!server) {
    return (
      <div style={{ textAlign: "center", padding: 60, color: "#4B5563" }}>
        <Server size={36} style={{ marginBottom: 10, opacity: 0.3 }} />
        <p style={{ fontSize: 14 }}>Aucun serveur sélectionné</p>
        <button onClick={onBack} style={{
          marginTop: 14, display: "inline-flex", alignItems: "center", gap: 6, padding: "8px 16px", borderRadius: 9,
          background: "rgba(99,102,241,0.1)", border: "1px solid rgba(99,102,241,0.2)",
          color: "#818CF8", fontSize: 12, fontWeight: 600, cursor: "pointer",
        }}>
          <ArrowLeft size={14} /> Retour à l'inventaire
        </button>
      </div>
    );
  }

  const worst = Math.max(server.cpu, server.ram, server.disk);
  const h24 = server.history24h || [];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {/* ── Barre de navigation + badges ── */}
      <div style={{
        display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap",
        background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)",
        borderRadius: 14, padding: "12px 16px",
      }}>
        <button onClick={onBack} style={{
          display: "inline-flex", alignItems: "center", gap: 6, padding: "7px 14px", borderRadius: 9,
          background: "rgba(99,102,241,0.1)", border: "1px solid rgba(99,102,241,0.2)",
          color: "#818CF8", fontSize: 12, fontWeight: 600, cursor: "pointer", whiteSpace: "nowrap",
        }}>
          <ArrowLeft size={14} /> Retour
        </button>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <div style={{
            width: 10, height: 10, borderRadius: "50%",
            background: gaugeColor(worst), boxShadow: `0 0 8px ${gaugeColor(worst)}`,
          }} />
          <span style={{ fontSize: 16, fontWeight: 700, color: "#F3F4F6", fontFamily: "'JetBrains Mono', monospace" }}>
            {server.name}
          </span>
        </div>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
          {server.env && <EnvBadge env={server.env} />}
          {server.app && <AppBadge app={server.app} />}
          {server.statut && <StatutBadge statut={server.statut} />}
          <OsBadge os={server.os} size="md" />
          <RoleBadge role={server.role} />
        </div>
      </div>

      {/* ── KPI cards (CPU / RAM / Disk) ── */}
      <div style={{
        display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr 1fr",
        gap: 12,
      }}>
        <KpiCard icon={Cpu} label="CPU" value={server.cpu} color="#818CF8" history={h24.map(d => d.cpu)} />
        <KpiCard icon={MemoryStick} label="RAM" value={server.ram} color="#F472B6" history={h24.map(d => d.ram)} />
        <KpiCard icon={HardDrive} label="Disque" value={server.disk} color="#FBBF24" history={h24.map(d => d.disk)} />
      </div>

      {/* ── Graphique métriques (pleine largeur) ── */}
      <MetricsChart server={server} isMobile={isMobile} />

      {/* ── Graphique de tendance avec projection (pleine largeur) ── */}
      <TrendChart server={server} snapshots={snapshots} isMobile={isMobile} />

      {/* ── Layout 2 colonnes équilibré ── */}
      <div style={{
        display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr",
        gap: 14, alignItems: "start",
      }}>
        {/* Colonne gauche : specs + snapshots ITCare + infos complémentaires */}
        <div style={{ display: "flex", flexDirection: "column", gap: 14, minWidth: 0 }}>
          <ServerSpecsPanel server={server} />
          <ItcareSnapshotsPanel server={server} />
          <ExtraInfoPanel server={server} />
        </div>

        {/* Colonne droite : sections structurées (patch, backup, volumes) */}
        <div style={{ display: "flex", flexDirection: "column", gap: 14, minWidth: 0 }}>
          <ServerStructuredSections server={server} />
        </div>
      </div>
    </div>
  );
}
