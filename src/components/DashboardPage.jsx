import { Globe, Wifi, WifiOff, Zap, Server, AlertTriangle, CheckCircle, KeyRound, Clock, Shield, Activity, Layers, AppWindow } from "lucide-react";
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid } from "recharts";
import { getStatus, STATUS } from "../constants";
import LoginPanel from "./LoginPanel";

/* ── Helpers ──────────────────────────────────────────────── */
function getDomain(url) {
  try { return new URL(url).hostname; } catch { return url; }
}

function sslColor(d) {
  if (d <= 0) return "#F87171";
  if (d <= 3) return "#F87171";
  if (d <= 10) return "#FBBF24";
  return "#34D399";
}

/* ── Petits composants ─────────────────────────────────────── */
function SectionTitle({ children }) {
  return (
    <div style={{ fontSize: 11, color: "#6B7280", letterSpacing: "0.1em", textTransform: "uppercase", fontWeight: 600, marginBottom: 12, display: "flex", alignItems: "center", gap: 8 }}>
      <div style={{ height: 1, width: 16, background: "rgba(255,255,255,0.1)", flexShrink: 0 }} />
      {children}
      <div style={{ height: 1, flex: 1, background: "rgba(255,255,255,0.06)" }} />
    </div>
  );
}

function Panel({ children, style = {} }) {
  return (
    <div style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 12, overflow: "hidden", ...style }}>
      {children}
    </div>
  );
}

function PanelRow({ children, last }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "9px 14px", borderBottom: last ? "none" : "1px solid rgba(255,255,255,0.05)" }}>
      {children}
    </div>
  );
}

function EmptyPanel({ icon: Icon, text }) {
  return (
    <div style={{ padding: "26px 14px", textAlign: "center" }}>
      <Icon size={22} style={{ display: "block", margin: "0 auto 8px", opacity: 0.2 }} color="#9CA3AF" />
      <div style={{ fontSize: 11, color: "#4B5563" }}>{text}</div>
    </div>
  );
}

function KpiCard({ icon: Icon, label, value, sub, accent, bar, barMax }) {
  const pct = (bar !== undefined && barMax > 0) ? Math.min(100, (bar / barMax) * 100) : null;
  return (
    <div style={{ flex: 1, minWidth: 110, background: "rgba(255,255,255,0.025)", border: `1px solid ${accent}22`, borderRadius: 14, padding: "13px 15px", position: "relative", overflow: "hidden" }}>
      <div style={{ position: "absolute", top: -14, right: -14, width: 56, height: 56, borderRadius: "50%", background: `${accent}08` }} />
      <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 9 }}>
        <div style={{ width: 24, height: 24, borderRadius: 7, background: `${accent}18`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
          <Icon size={12} color={accent} />
        </div>
        <span style={{ fontSize: 10, color: "#6B7280", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em" }}>{label}</span>
      </div>
      <div style={{ fontSize: 26, fontWeight: 800, color: accent, fontFamily: "'JetBrains Mono', monospace", lineHeight: 1 }}>{value}</div>
      {sub && <div style={{ fontSize: 10, color: "#4B5563", marginTop: 5 }}>{sub}</div>}
      {pct !== null && (
        <div style={{ height: 3, background: "rgba(255,255,255,0.06)", borderRadius: 2, overflow: "hidden", marginTop: 8 }}>
          <div style={{ width: `${pct}%`, height: "100%", background: accent, borderRadius: 2, transition: "width 0.5s ease" }} />
        </div>
      )}
    </div>
  );
}

/* ── Tooltip personnalisé pour le pie chart ─────────────────── */
function CustomTooltip({ active, payload }) {
  if (!active || !payload?.length) return null;
  const { name, value, color } = payload[0].payload;
  return (
    <div style={{ background: "#111827", border: `1px solid ${color}40`, borderRadius: 8, padding: "7px 12px", fontSize: 12 }}>
      <span style={{ color, fontWeight: 700 }}>{name}</span>
      <span style={{ color: "#9CA3AF", marginLeft: 8 }}>{value}</span>
    </div>
  );
}

/* ── Tooltip pour le bar chart ─────────────────────────────── */
function BarTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div style={{ background: "#111827", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, padding: "7px 12px", fontSize: 11 }}>
      <div style={{ color: "#E5E7EB", marginBottom: 3 }}>{label}</div>
      <div style={{ color: "#FBBF24", fontWeight: 700 }}>{payload[0].value} ms</div>
    </div>
  );
}

/* ── Badge source serveur ─────────────────────────────────────── */
function SourceBadge({ server }) {
  const live  = !!server.lastVpsCheck;
  const src   = server.source;
  const label = live ? "live" : src === "api" ? "itcare" : src === "excel" ? "excel" : src === "demo" ? "démo" : src || "—";
  const color = live ? "#34D399" : src === "demo" ? "#6B7280" : "#60A5FA";
  const bg    = live ? "rgba(52,211,153,0.1)" : src === "demo" ? "rgba(107,114,128,0.1)" : "rgba(96,165,250,0.1)";
  const border= live ? "rgba(52,211,153,0.25)" : src === "demo" ? "rgba(107,114,128,0.2)" : "rgba(96,165,250,0.25)";
  return (
    <span style={{ fontSize: 8, fontWeight: 700, padding: "1px 5px", borderRadius: 5, color, background: bg, border: `1px solid ${border}`, textTransform: "uppercase", letterSpacing: "0.05em", flexShrink: 0 }}>
      {live ? "● " : ""}{label}
    </span>
  );
}

/* ── Composant principal ────────────────────────────────────── */
export default function DashboardPage({ groups = [], allUrls = [], allServers = [], incidentLog = [], capacitySettings = {} }) {
  const isUp = u => { const s = getStatus(u); return s === STATUS.ONLINE || s === STATUS.SLOW; };

  /* Stats URLs */
  const totalUrls    = allUrls.length;
  const onlineUrls   = allUrls.filter(isUp).length;
  const offlineUrls  = allUrls.filter(u => getStatus(u) === STATUS.OFFLINE).length;
  const slowUrls     = allUrls.filter(u => getStatus(u) === STATUS.SLOW).length;
  const pendingUrls  = allUrls.filter(u => getStatus(u) === STATUS.PENDING).length;
  const checkedUrls  = allUrls.filter(u => u.responseTime != null);
  const avgResponse  = checkedUrls.length > 0 ? Math.round(checkedUrls.reduce((s, u) => s + u.responseTime, 0) / checkedUrls.length) : 0;
  const uptimePct    = totalUrls > 0 ? Math.round((onlineUrls / totalUrls) * 100) : 0;

  /* Stats serveurs */
  const totalServers = allServers.length;
  const { cpuThreshold = 90, ramThreshold = 90, diskThreshold = 90 } = capacitySettings;
  const serverAlerts = allServers.filter(s => (s.cpu ?? 0) >= cpuThreshold || (s.ram ?? 0) >= ramThreshold || (s.disk ?? 0) >= diskThreshold).length;
  const avgCpu  = totalServers > 0 ? Math.round(allServers.reduce((s, sv) => s + (sv.cpu  ?? 0), 0) / totalServers) : 0;
  const avgRam  = totalServers > 0 ? Math.round(allServers.reduce((s, sv) => s + (sv.ram  ?? 0), 0) / totalServers) : 0;
  const avgDisk = totalServers > 0 ? Math.round(allServers.reduce((s, sv) => s + (sv.disk ?? 0), 0) / totalServers) : 0;

  /* Stats incidents */
  const pannes       = incidentLog.filter(e => e.type === "offline").length;
  const retabs       = incidentLog.filter(e => e.type === "online").length;
  const sslAlerts    = incidentLog.filter(e => e.type === "ssl_expiry").length;
  const recentEventsGrouped = (() => {
    const reversed = [...incidentLog].reverse();
    const map = new Map();
    const result = [];
    reversed.forEach(e => {
      const key = `${e.url}||${e.type}`;
      if (!map.has(key)) {
        const entry = { ...e, count: 1 };
        map.set(key, entry);
        result.push(entry);
      } else {
        map.get(key).count++;
      }
    });
    return result.slice(0, 8);
  })();

  /* SSL expirations proches */
  const sslExpiring = allUrls
    .filter(u => u.sslInfo && u.sslInfo.daysLeft != null && u.sslInfo.daysLeft <= 30)
    .sort((a, b) => a.sslInfo.daysLeft - b.sslInfo.daysLeft)
    .slice(0, 6);

  /* Top lentes */
  const topSlow = [...checkedUrls].sort((a, b) => b.responseTime - a.responseTime).slice(0, 6);
  const maxResp = topSlow[0]?.responseTime || 1;
  const topSlowChart = topSlow.map(u => ({ name: getDomain(u.url).slice(0, 18), ms: u.responseTime }));

  /* Top pannes par URL */
  const incidentsByUrl = {};
  incidentLog.filter(e => e.type === "offline").forEach(e => { incidentsByUrl[e.url] = (incidentsByUrl[e.url] || 0) + 1; });
  const topIncidents = Object.entries(incidentsByUrl).sort((a, b) => b[1] - a[1]).slice(0, 5);

  /* Top 5 par métrique — classement purement par valeur décroissante */
  const sortTop5 = (key) => [...allServers]
    .sort((a, b) => (b[key] ?? 0) - (a[key] ?? 0))
    .slice(0, 5);
  const top5Cpu  = sortTop5("cpu");
  const top5Ram  = sortTop5("ram");
  const top5Disk = sortTop5("disk");
  const hasLiveData = allServers.some(s => s.lastVpsCheck || s.source !== "demo");

  /* Distributions CPU / RAM / Disque par tranche */
  const TRANCHES = [
    { label: "0–25%",   min: 0,  max: 25,  opacity: 0.35 },
    { label: "25–50%",  min: 25, max: 50,  opacity: 0.55 },
    { label: "50–75%",  min: 50, max: 75,  opacity: 0.75 },
    { label: "75–90%",  min: 75, max: 90,  opacity: 0.90 },
    { label: "90–100%", min: 90, max: 101, opacity: 1.00 },
  ];
  const makeTranches = (key, accent) => TRANCHES.map(t => ({
    ...t,
    color: accent,
    count: allServers.filter(s => (s[key] ?? 0) >= t.min && (s[key] ?? 0) < t.max).length,
  }));
  const cpuTranches  = makeTranches("cpu",  "#818CF8");
  const ramTranches  = makeTranches("ram",  "#F472B6");
  const diskTranches = makeTranches("disk", "#FBBF24");
  const maxCpu  = Math.max(...cpuTranches.map(t => t.count),  1);
  const maxRam  = Math.max(...ramTranches.map(t => t.count),  1);
  const maxDisk = Math.max(...diskTranches.map(t => t.count), 1);

  /* Groupes (non-global) */
  const groupStats = groups.filter(g => !g.isGlobal).map(g => ({
    name: g.name,
    total: g.urls.length,
    online: g.urls.filter(isUp).length,
    offline: g.urls.filter(u => getStatus(u) === STATUS.OFFLINE).length,
  }));

  /* Données pie chart */
  const pieData = [
    { name: "En ligne",   value: onlineUrls,  color: "#34D399" },
    { name: "Hors ligne", value: offlineUrls, color: "#F87171" },
    { name: "Lent",       value: slowUrls,    color: "#FBBF24" },
    { name: "En attente", value: pendingUrls, color: "#4B5563" },
  ].filter(d => d.value > 0);

  const eventColors = { offline: "#F87171", online: "#34D399", ssl_expiry: "#FBBF24", server_alert: "#FB923C", capacity_alert: "#818CF8" };
  const eventLabels = { offline: "Panne", online: "Rétabli", ssl_expiry: "SSL", server_alert: "Serveur", capacity_alert: "Capacité" };
  const uptimeColor = uptimePct >= 90 ? "#34D399" : uptimePct >= 70 ? "#FBBF24" : "#F87171";

  /* Dernier check URL pour l'indicateur live */
  const lastUrlCheck = allUrls
    .map(u => u.lastCheck ? new Date(u.lastCheck).getTime() : 0)
    .reduce((max, t) => Math.max(max, t), 0);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 26, paddingBottom: 24 }}>

      {/* ── Zone d'authentification ── */}
      <div style={{ display: "flex", justifyContent: "flex-end", alignItems: "center", gap: 10 }}>
        <LoginPanel groups={groups} />
      </div>

      {/* ── Indicateur live ── */}
      {lastUrlCheck > 0 && (
        <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 10, color: "#6B7280" }}>
          <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#34D399", boxShadow: "0 0 6px #34D399", animation: "pulse 2s ease-in-out infinite" }} />
          Données en temps réel — dernier check {new Date(lastUrlCheck).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
        </div>
      )}

      {/* ══ LIGNE 1 : Vue d'ensemble URL ══════════════════════════ */}
      <div style={{ display: "flex", gap: 20, alignItems: "stretch", flexWrap: "wrap" }}>

        {/* Donut + uptime */}
        <Panel style={{ padding: "18px 20px", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", minWidth: 180, gap: 8 }}>
          <div style={{ fontSize: 11, color: "#6B7280", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.08em" }}>Disponibilité</div>
          <div style={{ position: "relative", width: 120, height: 120 }}>
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={pieData.length > 0 ? pieData : [{ name: "Aucun", value: 1, color: "#1F2937" }]}
                  cx="50%" cy="50%" innerRadius={38} outerRadius={54}
                  dataKey="value" startAngle={90} endAngle={-270} strokeWidth={0}>
                  {(pieData.length > 0 ? pieData : [{ color: "#1F2937" }]).map((entry, i) => (
                    <Cell key={i} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip content={<CustomTooltip />} />
              </PieChart>
            </ResponsiveContainer>
            <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", pointerEvents: "none" }}>
              <span style={{ fontSize: 20, fontWeight: 800, color: uptimeColor, fontFamily: "'JetBrains Mono', monospace", lineHeight: 1 }}>{uptimePct}%</span>
              <span style={{ fontSize: 9, color: "#4B5563", marginTop: 2 }}>uptime</span>
            </div>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 4, width: "100%" }}>
            {pieData.map(d => (
              <div key={d.name} style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                  <div style={{ width: 8, height: 8, borderRadius: 2, background: d.color, flexShrink: 0 }} />
                  <span style={{ fontSize: 10, color: "#9CA3AF" }}>{d.name}</span>
                </div>
                <span style={{ fontSize: 10, fontWeight: 700, color: d.color, fontFamily: "'JetBrains Mono', monospace" }}>{d.value}</span>
              </div>
            ))}
          </div>
        </Panel>

        {/* KPI cards */}
        <div style={{ flex: 1, display: "flex", gap: 12, flexWrap: "wrap", alignContent: "flex-start" }}>
          <KpiCard icon={Globe}      label="Total URLs"    value={totalUrls}                                   accent="#6366F1" />
          <KpiCard icon={Wifi}       label="En ligne"      value={onlineUrls}   bar={onlineUrls}  barMax={totalUrls} accent="#34D399" />
          <KpiCard icon={WifiOff}    label="Hors ligne"    value={offlineUrls}  bar={offlineUrls} barMax={totalUrls} accent="#F87171" />
          <KpiCard icon={Clock}      label="Lents"         value={slowUrls}     bar={slowUrls}    barMax={totalUrls} accent="#FBBF24" />
          <KpiCard icon={Zap}        label="Réponse moy."  value={avgResponse > 0 ? `${avgResponse}ms` : "—"}  accent="#818CF8" />
          <KpiCard icon={Server}     label="Serveurs"      value={totalServers}                                accent="#A78BFA" />
          <KpiCard icon={AlertTriangle} label="Alertes serv." value={serverAlerts} accent={serverAlerts > 0 ? "#F87171" : "#34D399"} />
          <KpiCard icon={Activity}   label="Pannes total"  value={pannes}                                      accent="#FB923C" />
        </div>
      </div>

      {/* ══ LIGNE 2 : Serveurs + Événements récents ══════════════ */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>

        {/* Serveurs */}
        <div>
          <SectionTitle>Ressources serveurs</SectionTitle>
          {totalServers === 0 ? (
            <Panel><EmptyPanel icon={Server} text="Aucun serveur enregistré" /></Panel>
          ) : (
            <Panel>
              {[
                { label: "CPU moyen",    value: avgCpu,  threshold: cpuThreshold,  color: "#F87171", ok: "#818CF8" },
                { label: "RAM moyenne",  value: avgRam,  threshold: ramThreshold,  color: "#F87171", ok: "#EC4899" },
                { label: "Disque moyen", value: avgDisk, threshold: diskThreshold, color: "#F87171", ok: "#FBBF24" },
              ].map(({ label, value, threshold, color, ok }, i) => {
                const bar_color = value >= threshold ? color : ok;
                return (
                  <div key={i} style={{ padding: "11px 15px", borderBottom: i < 2 ? "1px solid rgba(255,255,255,0.05)" : "none" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                      <span style={{ fontSize: 11, color: "#9CA3AF" }}>{label}</span>
                      <span style={{ fontSize: 12, fontWeight: 700, color: bar_color, fontFamily: "'JetBrains Mono', monospace" }}>{value}%</span>
                    </div>
                    <div style={{ height: 6, background: "rgba(255,255,255,0.06)", borderRadius: 3, overflow: "hidden" }}>
                      <div style={{ width: `${value}%`, height: "100%", background: bar_color, borderRadius: 3, transition: "width 0.5s" }} />
                    </div>
                    {value >= threshold && (
                      <div style={{ fontSize: 9, color: color, marginTop: 4, fontWeight: 600 }}>⚠ Seuil critique dépassé ({threshold}%)</div>
                    )}
                  </div>
                );
              })}
              <div style={{ padding: "8px 15px", display: "flex", justifyContent: "space-between", alignItems: "center", background: "rgba(255,255,255,0.015)" }}>
                <span style={{ fontSize: 10, color: "#6B7280" }}>{totalServers} serveur{totalServers > 1 ? "s" : ""} monitorés</span>
                {serverAlerts > 0 && <span style={{ fontSize: 10, fontWeight: 700, color: "#F87171" }}>{serverAlerts} en alerte</span>}
              </div>
            </Panel>
          )}
        </div>

        {/* Événements récents */}
        <div>
          <SectionTitle>Événements récents</SectionTitle>
          <Panel>
            {recentEventsGrouped.length === 0 ? (
              <EmptyPanel icon={CheckCircle} text="Aucun événement enregistré" />
            ) : recentEventsGrouped.map((e, i) => {
              const color = eventColors[e.type] || "#9CA3AF";
              return (
                <PanelRow key={e.id} last={i === recentEventsGrouped.length - 1}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
                    <div style={{ width: 7, height: 7, borderRadius: "50%", background: color, flexShrink: 0 }} />
                    <span style={{ fontSize: 11, color: "#D1D5DB", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {getDomain(e.url)}
                    </span>
                    {e.count > 1 && (
                      <span style={{ fontSize: 10, fontWeight: 800, color, background: `${color}18`,
                        border: `1px solid ${color}30`, borderRadius: 7, padding: "1px 7px", flexShrink: 0 }}>
                        ×{e.count}
                      </span>
                    )}
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 7, flexShrink: 0, marginLeft: 8 }}>
                    <span style={{ fontSize: 10, fontWeight: 700, color, padding: "2px 8px", borderRadius: 10, background: `${color}18`, border: `1px solid ${color}28` }}>
                      {eventLabels[e.type] || e.type}
                    </span>
                    <span style={{ fontSize: 10, color: "#4B5563", fontFamily: "'JetBrains Mono', monospace" }}>
                      {new Date(e.ts).toLocaleString("fr-FR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}
                    </span>
                  </div>
                </PanelRow>
              );
            })}
          </Panel>
        </div>
      </div>

      {/* ══ BANNIÈRE DONNÉES DÉMO ════════════════════════════ */}
      {totalServers > 0 && !hasLiveData && (
        <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 16px", borderRadius: 10, background: "rgba(251,191,36,0.06)", border: "1px solid rgba(251,191,36,0.2)" }}>
          <AlertTriangle size={14} color="#FBBF24" style={{ flexShrink: 0 }} />
          <span style={{ fontSize: 12, color: "#FBBF24", fontWeight: 600 }}>Données démo actives</span>
          <span style={{ fontSize: 11, color: "#9CA3AF" }}>— Importez un fichier Excel/ITCare ou configurez des agents VPS pour afficher des métriques réelles.</span>
        </div>
      )}

      {/* ══ TOP 5 CONSOMMATEURS ════════════════════════════════ */}
      {totalServers > 0 && (
        <div>
          <SectionTitle>Top 5 — Consommateurs de ressources</SectionTitle>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 16 }}>
            {[
              { label: "CPU",    data: top5Cpu,  key: "cpu",  color: "#818CF8" },
              { label: "RAM",    data: top5Ram,  key: "ram",  color: "#EC4899" },
              { label: "Disque", data: top5Disk, key: "disk", color: "#FBBF24" },
            ].map(({ label, data, key, color }) => (
              <Panel key={key}>
                <div style={{ padding: "9px 14px", borderBottom: "1px solid rgba(255,255,255,0.06)", display: "flex", alignItems: "center", gap: 7 }}>
                  <div style={{ width: 7, height: 7, borderRadius: "50%", background: color, boxShadow: `0 0 6px ${color}` }} />
                  <span style={{ fontSize: 11, fontWeight: 700, color, textTransform: "uppercase", letterSpacing: "0.08em" }}>{label}</span>
                </div>
                {data.length === 0 ? (
                  <EmptyPanel icon={Server} text="Aucune donnée" />
                ) : data.map((s, i) => {
                  const val = s[key] ?? 0;
                  const barColor = val >= 90 ? "#F87171" : val >= 75 ? "#FB923C" : val >= 50 ? "#FBBF24" : color;
                  return (
                    <div key={s.id} style={{ padding: "7px 14px", borderBottom: i < data.length - 1 ? "1px solid rgba(255,255,255,0.04)" : "none" }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 6, minWidth: 0 }}>
                          <span style={{ fontSize: 10, fontWeight: 700, color: "#374151", width: 16, flexShrink: 0 }}>#{i + 1}</span>
                          <span style={{ fontSize: 11, color: "#D1D5DB", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 90, flexShrink: 0 }}>{s.name}</span>
                          {s.app && (
                            <span style={{ display: "inline-flex", alignItems: "center", gap: 3, fontSize: 9, fontWeight: 600, padding: "1px 6px", borderRadius: 10, flexShrink: 0, background: "rgba(167,139,250,0.12)", color: "#A78BFA", border: "1px solid rgba(167,139,250,0.3)", maxWidth: 80, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                              <AppWindow size={8} style={{ flexShrink: 0 }} />{s.app}
                            </span>
                          )}
                          <SourceBadge server={s} />
                        </div>
                        <span style={{ fontSize: 12, fontWeight: 800, color: barColor, fontFamily: "'JetBrains Mono', monospace", flexShrink: 0, marginLeft: 8 }}>{val}%</span>
                      </div>
                      <div style={{ height: 4, background: "rgba(255,255,255,0.05)", borderRadius: 2, overflow: "hidden" }}>
                        <div style={{ width: `${val}%`, height: "100%", background: `linear-gradient(90deg, ${barColor}99, ${barColor})`, borderRadius: 2, transition: "width 0.4s ease" }} />
                      </div>
                    </div>
                  );
                })}
              </Panel>
            ))}
          </div>
        </div>
      )}

      {/* ══ DISTRIBUTIONS CPU / RAM / DISQUE ════════════════════ */}
      {totalServers > 0 && (
        <div>
          <SectionTitle>
            <Layers size={12} style={{ marginRight: 2, flexShrink: 0 }} />
            Distribution par tranche — CPU · RAM · Disque
          </SectionTitle>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 14 }}>
            {[
              { label: "CPU",    tranches: cpuTranches,  maxVal: maxCpu,  accent: "#818CF8" },
              { label: "RAM",    tranches: ramTranches,  maxVal: maxRam,  accent: "#F472B6" },
              { label: "Disque", tranches: diskTranches, maxVal: maxDisk, accent: "#FBBF24" },
            ].map(({ label, tranches, maxVal, accent }) => (
              <Panel key={label} style={{ padding: "14px 16px 10px" }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: accent, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 10 }}>{label}</div>
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {tranches.map(t => {
                    const pct = (t.count / maxVal) * 100;
                    return (
                      <div key={t.label} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                        <span style={{ fontSize: 10, color: "#6B7280", width: 52, flexShrink: 0, fontFamily: "'JetBrains Mono', monospace" }}>
                          {t.label}
                        </span>
                        <div style={{ flex: 1, height: 16, background: "rgba(255,255,255,0.04)", borderRadius: 4, overflow: "hidden" }}>
                          <div style={{
                            width: `${pct}%`, height: "100%",
                            background: t.count > 0 ? t.color : "transparent",
                            opacity: t.count > 0 ? t.opacity : 1,
                            borderRadius: 4, transition: "width 0.5s ease",
                          }} />
                        </div>
                        <span style={{ fontSize: 11, fontWeight: 700, color: t.count > 0 ? t.color : "#374151", opacity: t.count > 0 ? t.opacity + 0.1 : 1, fontFamily: "'JetBrains Mono', monospace", width: 26, textAlign: "right", flexShrink: 0 }}>
                          {t.count}
                        </span>
                      </div>
                    );
                  })}
                </div>
                <div style={{ textAlign: "center", fontSize: 9, color: "#4B5563", marginTop: 10 }}>
                  {totalServers} serveur{totalServers > 1 ? "s" : ""}
                </div>
              </Panel>
            ))}
          </div>
        </div>
      )}

      {/* ══ LIGNE 3 : Groupes + SSL + Top pannes ════════════════ */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 20 }}>

        {/* Groupes */}
        <div>
          <SectionTitle>Groupes</SectionTitle>
          <Panel>
            {groupStats.length === 0 ? (
              <EmptyPanel icon={Globe} text="Aucun groupe" />
            ) : groupStats.map((g, i) => (
              <div key={i} style={{ padding: "9px 14px", borderBottom: i < groupStats.length - 1 ? "1px solid rgba(255,255,255,0.05)" : "none" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 5 }}>
                  <span style={{ fontSize: 12, color: "#E5E7EB", fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 110 }}>{g.name}</span>
                  <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
                    {g.offline > 0 && (
                      <span style={{ fontSize: 9, color: "#F87171", fontWeight: 700, background: "rgba(248,113,113,0.12)", padding: "1px 6px", borderRadius: 8 }}>
                        {g.offline} ↓
                      </span>
                    )}
                    <span style={{ fontSize: 10, color: "#6B7280", fontFamily: "'JetBrains Mono', monospace" }}>{g.online}/{g.total}</span>
                  </div>
                </div>
                <div style={{ height: 4, background: "rgba(255,255,255,0.06)", borderRadius: 2, overflow: "hidden" }}>
                  <div style={{
                    width: g.total > 0 ? `${(g.online / g.total) * 100}%` : "0%",
                    height: "100%",
                    background: g.offline === 0 ? "#34D399" : (g.online === 0 ? "#F87171" : "#FBBF24"),
                    borderRadius: 2, transition: "width 0.5s",
                  }} />
                </div>
              </div>
            ))}
          </Panel>
        </div>

        {/* SSL */}
        <div>
          <SectionTitle>SSL — Expirations ≤30j</SectionTitle>
          <Panel>
            {sslExpiring.length === 0 ? (
              <EmptyPanel icon={Shield} text="Aucun certificat à risque" />
            ) : sslExpiring.map((u, i) => {
              const d = u.sslInfo.daysLeft;
              const color = sslColor(d);
              return (
                <PanelRow key={u.id || i} last={i === sslExpiring.length - 1}>
                  <span style={{ fontSize: 11, color: "#D1D5DB", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 130 }}>
                    {getDomain(u.url)}
                  </span>
                  <span style={{ fontSize: 11, fontWeight: 700, color, fontFamily: "'JetBrains Mono', monospace", flexShrink: 0, background: `${color}15`, padding: "2px 8px", borderRadius: 8 }}>
                    {d <= 0 ? "Expiré !" : `${d}j`}
                  </span>
                </PanelRow>
              );
            })}
          </Panel>
        </div>

        {/* Top pannes */}
        <div>
          <SectionTitle>Top pannes — URLs</SectionTitle>
          <Panel>
            {topIncidents.length === 0 ? (
              <EmptyPanel icon={CheckCircle} text="Aucune panne enregistrée" />
            ) : topIncidents.map(([url, count], i) => (
              <PanelRow key={i} last={i === topIncidents.length - 1}>
                <span style={{ fontSize: 11, color: "#D1D5DB", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 130 }}>
                  {getDomain(url)}
                </span>
                <span style={{ fontSize: 13, fontWeight: 800, color: "#F87171", fontFamily: "'JetBrains Mono', monospace", flexShrink: 0 }}>×{count}</span>
              </PanelRow>
            ))}
          </Panel>
        </div>

        {/* Stats incidents */}
        <div>
          <SectionTitle>Bilan incidents</SectionTitle>
          <Panel style={{ padding: "14px 15px", display: "flex", flexDirection: "column", gap: 12 }}>
            {[
              { label: "Pannes détectées",  value: pannes,    color: "#F87171" },
              { label: "Rétablissements",   value: retabs,    color: "#34D399" },
              { label: "Alertes SSL",       value: sslAlerts, color: "#FBBF24" },
              { label: "Alertes Serveurs",  value: incidentLog.filter(e => e.type === "server_alert").length,   color: "#FB923C" },
              { label: "Alertes Capacité",  value: incidentLog.filter(e => e.type === "capacity_alert").length, color: "#818CF8" },
            ].map(s => (
              <div key={s.label}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                  <span style={{ fontSize: 10, color: "#9CA3AF" }}>{s.label}</span>
                  <span style={{ fontSize: 11, fontWeight: 700, color: s.color, fontFamily: "'JetBrains Mono', monospace" }}>{s.value}</span>
                </div>
                <div style={{ height: 3, background: "rgba(255,255,255,0.06)", borderRadius: 2, overflow: "hidden" }}>
                  <div style={{
                    width: incidentLog.length > 0 ? `${Math.min(100, (s.value / incidentLog.length) * 100)}%` : "0%",
                    height: "100%", background: s.color, borderRadius: 2,
                  }} />
                </div>
              </div>
            ))}
          </Panel>
        </div>
      </div>

      {/* ══ LIGNE 4 : URLs les plus lentes ══════════════════════ */}
      {topSlowChart.length > 0 && (
        <div>
          <SectionTitle>URLs les plus lentes (temps de réponse)</SectionTitle>
          <Panel style={{ padding: "16px 10px 10px" }}>
            <ResponsiveContainer width="100%" height={160}>
              <BarChart data={topSlowChart} layout="vertical" margin={{ left: 0, right: 40, top: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" horizontal={false} />
                <XAxis type="number" tick={{ fontSize: 10, fill: "#4B5563" }} axisLine={false} tickLine={false} unit="ms" />
                <YAxis type="category" dataKey="name" tick={{ fontSize: 10, fill: "#9CA3AF" }} axisLine={false} tickLine={false} width={110} />
                <Tooltip content={<BarTooltip />} cursor={{ fill: "rgba(255,255,255,0.03)" }} />
                <Bar dataKey="ms" radius={[0, 4, 4, 0]} maxBarSize={16}>
                  {topSlowChart.map((entry, i) => (
                    <Cell key={i} fill={entry.ms > 2000 ? "#F87171" : entry.ms > 1000 ? "#FBBF24" : "#34D399"} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </Panel>
        </div>
      )}

    </div>
  );
}
