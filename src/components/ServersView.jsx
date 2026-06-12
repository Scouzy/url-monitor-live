import { useState, useMemo, useSyncExternalStore } from "react";
import {
  Server, Search, X, Cpu, MemoryStick, HardDrive, Globe,
  Database, Boxes, Zap, Clock, Network, MonitorCog, Info, AppWindow,
  TrendingUp, AlertTriangle, ChevronDown, Calendar, Activity,
} from "lucide-react";
import {
  ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, CartesianGrid,
  ComposedChart, Line, ReferenceLine,
} from "recharts";
import { getServers, subscribeServers, ROLES, gaugeColor } from "../utils/servers";
import { loadSnapshots, lastDelta, buildTrendChartData } from "../utils/snapshots";
import ServerGauge from "./ServerGauge";

const ROLE_ICONS = { web: Globe, bdd: Database, applicatif: Boxes, cache: Zap };

/* Couleur d'environnement par motif */
const ENV_COLORS = [
  [/pr[ée]?.?prod|staging/i, "#FB923C"],
  [/prod/i, "#F87171"],
  [/recette|qualif|uat/i, "#FBBF24"],
  [/test|integration|int\b/i, "#22D3EE"],
  [/dev/i, "#34D399"],
];
const envColor = (env) => {
  for (const [re, c] of ENV_COLORS) if (re.test(env)) return c;
  return "#9CA3AF";
};

function EnvBadge({ env }) {
  const color = envColor(env);
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 4, fontSize: 10, fontWeight: 700,
      padding: "2px 8px", borderRadius: 12, textTransform: "uppercase", letterSpacing: "0.03em",
      background: `${color}1A`, color, border: `1px solid ${color}40`,
      maxWidth: 130, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
    }}>
      {env}
    </span>
  );
}

function AppBadge({ app }) {
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 4, fontSize: 10, fontWeight: 600,
      padding: "2px 8px", borderRadius: 12,
      background: "rgba(167,139,250,0.12)", color: "#A78BFA", border: "1px solid rgba(167,139,250,0.35)",
      maxWidth: 140, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
    }}>
      <AppWindow size={10} style={{ flexShrink: 0 }} /> {app}
    </span>
  );
}

function StatutBadge({ statut }) {
  const s = String(statut).toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  let color, bg;
  if (/running|actif|encours|ok|up|operationnel|active/.test(s)) { color = "#34D399"; bg = "rgba(52,211,153,0.12)"; }
  else if (/stop|arret|inactif|down|off|eteint|stopped/.test(s))  { color = "#F87171"; bg = "rgba(248,113,113,0.12)"; }
  else if (/maint/.test(s))                                        { color = "#FB923C"; bg = "rgba(251,146,60,0.12)";  }
  else if (/warn|alert|alerte/.test(s))                            { color = "#FBBF24"; bg = "rgba(251,191,36,0.12)"; }
  else                                                             { color = "#9CA3AF"; bg = "rgba(156,163,175,0.1)"; }
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 4, fontSize: 9, fontWeight: 700,
      padding: "2px 7px", borderRadius: 6, textTransform: "uppercase", letterSpacing: "0.04em",
      background: bg, border: `1px solid ${color}40`, color, whiteSpace: "nowrap",
    }}>
      <span style={{ width: 5, height: 5, borderRadius: "50%", background: color, flexShrink: 0, boxShadow: `0 0 4px ${color}` }} />
      {statut}
    </span>
  );
}

function RoleBadge({ role }) {
  const meta = ROLES[role];
  const Icon = ROLE_ICONS[role];
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 4, fontSize: 10, fontWeight: 600,
      padding: "2px 8px", borderRadius: 12,
      background: `${meta.color}1A`, color: meta.color, border: `1px solid ${meta.color}40`,
    }}>
      <Icon size={10} /> {meta.label}
    </span>
  );
}

/* ── Courbe 24h d'une ressource ── */
function ResourceChart({ data, dataKey, color, label }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ fontSize: 11, fontWeight: 600, color: "#9CA3AF", marginBottom: 6, display: "flex", justifyContent: "space-between" }}>
        <span>{label} — dernières 24h</span>
        <span style={{ color, fontFamily: "'JetBrains Mono', monospace" }}>
          max {Math.max(...data.map(d => d[dataKey]))}%
        </span>
      </div>
      <div style={{ height: 90 }}>
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 2, right: 4, bottom: 0, left: -32 }}>
            <defs>
              <linearGradient id={`grad-${dataKey}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={color} stopOpacity={0.35} />
                <stop offset="100%" stopColor={color} stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid stroke="rgba(255,255,255,0.04)" vertical={false} />
            <XAxis dataKey="h" tick={{ fontSize: 8, fill: "#4B5563" }} interval={3} axisLine={false} tickLine={false} />
            <YAxis domain={[0, 100]} tick={{ fontSize: 8, fill: "#4B5563" }} axisLine={false} tickLine={false} />
            <Tooltip
              contentStyle={{ background: "#1F2937", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, fontSize: 11 }}
              labelStyle={{ color: "#9CA3AF" }}
              formatter={(v) => [`${v}%`, label]}
            />
            <Area type="monotone" dataKey={dataKey} stroke={color} strokeWidth={1.5}
              fill={`url(#grad-${dataKey})`} dot={false} />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

const TREND_LINES = [
  { rKey: "cpu_r",  pKey: "cpu_p",  color: "#818CF8", label: "CPU" },
  { rKey: "ram_r",  pKey: "ram_p",  color: "#F472B6", label: "RAM" },
  { rKey: "disk_r", pKey: "disk_p", color: "#FBBF24", label: "Disque" },
];

/* ── Delta badge : évolution depuis le dernier chargement ── */
function DeltaBadge({ delta }) {
  if (!delta) return null;
  const items = [
    { key: "cpu",  label: "CPU",    color: "#818CF8" },
    { key: "ram",  label: "RAM",    color: "#F472B6" },
    { key: "disk", label: "Disque", color: "#FBBF24" },
  ].filter(i => delta[i.key] != null && delta[i.key] !== 0);
  if (items.length === 0) return null;
  return (
    <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginTop: 8, paddingTop: 8, borderTop: "1px solid rgba(255,255,255,0.04)" }}>
      {items.map(({ key, label }) => {
        const v = delta[key];
        const up = v > 0;
        return (
          <span key={key} style={{
            fontSize: 9, fontWeight: 700, padding: "2px 6px", borderRadius: 6,
            background: up ? "rgba(248,113,113,0.12)" : "rgba(52,211,153,0.12)",
            color: up ? "#F87171" : "#34D399",
            border: `1px solid ${up ? "rgba(248,113,113,0.25)" : "rgba(52,211,153,0.25)"}`,
            display: "flex", alignItems: "center", gap: 2,
          }}>
            {up ? "↑" : "↓"} {label} {up ? "+" : ""}{v}%
          </span>
        );
      })}
    </div>
  );
}

/* ── Tendance — données réelles (snapshots) ou simulées (fallback) ── */
function ServerTrend({ server, snapshots }) {
  const [open, setOpen] = useState(true);

  /* Essayer les données réelles d'abord */
  const snap = useMemo(() => buildTrendChartData(server.name, snapshots), [server.name, snapshots]);

  let data, breach, m3, m6, subtitle;
  if (snap) {
    data     = snap.data;
    breach   = snap.breach;
    m3       = snap.proj3m;
    m6       = snap.proj6m;
    subtitle = snap.spanDays < 1
      ? `${snap.snapCount} mesures (aujourd'hui)`
      : `${snap.snapCount} mesures · ${snap.spanDays}j d'historique`;
  } else {
    /* Fallback : données simulées monthly */
    data = (server.monthly || []).map((m, i, arr) => {
      const isEdge = !m.projected && arr[i + 1]?.projected;
      return {
        month: m.month,
        cpu_r:  !m.projected || isEdge ? m.cpu  : null,
        ram_r:  !m.projected || isEdge ? m.ram  : null,
        disk_r: !m.projected || isEdge ? m.disk : null,
        cpu_p:  m.projected  || isEdge ? m.cpu  : null,
        ram_p:  m.projected  || isEdge ? m.ram  : null,
        disk_p: m.projected  || isEdge ? m.disk : null,
      };
    });
    breach = (server.monthly || []).find(m => m.projected && (m.cpu >= 90 || m.ram >= 90 || m.disk >= 90));
    const proj = (server.monthly || []).filter(m => m.projected);
    m3 = proj[2] || null;
    m6 = proj[5] || null;
    subtitle = "12 mois simulés";
  }

  return (
    <div style={{ marginTop: 18 }}>
      {/* Titre cliquable */}
      <div
        onClick={() => setOpen(o => !o)}
        style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          cursor: "pointer", marginBottom: open ? 10 : 0,
          padding: "6px 0", borderTop: "1px solid rgba(255,255,255,0.06)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <TrendingUp size={12} color={snap ? "#818CF8" : "#6B7280"} />
          <span style={{ fontSize: 10, fontWeight: 700, color: snap ? "#A5B4FC" : "#9CA3AF", textTransform: "uppercase", letterSpacing: "0.06em" }}>
            Tendance
          </span>
          <span style={{ fontSize: 9, color: "#4B5563" }}>{subtitle}</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {breach && (
            <span style={{ fontSize: 9, color: "#F87171", fontWeight: 700, display: "flex", alignItems: "center", gap: 3 }}>
              <AlertTriangle size={9} /> Seuil 90% en {breach.month}
            </span>
          )}
          <ChevronDown size={12} color="#4B5563"
            style={{ transform: open ? "rotate(180deg)" : "none", transition: "transform 0.2s" }} />
        </div>
      </div>

      {open && (
        <>
          {/* Légende */}
          <div style={{ display: "flex", gap: 12, marginBottom: 6, flexWrap: "wrap" }}>
            {TREND_LINES.map(({ color, label }) => (
              <span key={label} style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 9, color: "#6B7280" }}>
                <span style={{ width: 14, height: 2.5, background: color, borderRadius: 2, display: "inline-block" }} />
                {label}
              </span>
            ))}
            <span style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 9, color: "#6B7280" }}>
              <span style={{ width: 14, height: 0, borderTop: "2px dashed #6B7280", display: "inline-block" }} />
              Projection
            </span>
          </div>

          <div style={{ height: 160 }}>
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={data} margin={{ top: 4, right: 4, bottom: 0, left: -28 }}>
                <CartesianGrid stroke="rgba(255,255,255,0.04)" vertical={false} />
                <XAxis dataKey="month" tick={{ fontSize: 8, fill: "#4B5563" }} axisLine={false} tickLine={false} />
                <YAxis domain={[0, 100]} tick={{ fontSize: 8, fill: "#4B5563" }} axisLine={false} tickLine={false} unit="%" />
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
                  <>
                    <Line key={rKey} type="monotone" dataKey={rKey} stroke={color} strokeWidth={1.8}
                      dot={{ r: snap ? 3 : 0, fill: color }} connectNulls={false} />
                    <Line key={pKey} type="monotone" dataKey={pKey} stroke={color} strokeWidth={1.5}
                      strokeDasharray="5 4" dot={false} connectNulls={false} />
                  </>
                ))}
              </ComposedChart>
            </ResponsiveContainer>
          </div>

          {/* Valeurs projetées à +3 et +6 mois */}
          {(m3 || m6) && (
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6, marginTop: 8 }}>
              {[m3 && { label: "+3 mois", m: m3 }, m6 && { label: "+6 mois", m: m6 }].filter(Boolean).map(({ label, m }) => (
                <div key={label} style={{
                  background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)",
                  borderRadius: 9, padding: "7px 10px",
                }}>
                  <div style={{ fontSize: 9, color: "#6B7280", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 5 }}>{label}</div>
                  {[
                    { key: "cpu",  color: "#818CF8", lbl: "CPU" },
                    { key: "ram",  color: "#F472B6", lbl: "RAM" },
                    { key: "disk", color: "#FBBF24", lbl: "Disque" },
                  ].map(({ key, color, lbl }) => {
                    const val = m[key] ?? m[`${key}_p`];
                    if (val == null) return null;
                    return (
                      <div key={key} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 3 }}>
                        <span style={{ fontSize: 9, color: "#4B5563" }}>{lbl}</span>
                        <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                          <div style={{ width: 42, height: 4, background: "rgba(255,255,255,0.05)", borderRadius: 3, overflow: "hidden" }}>
                            <div style={{ width: `${val}%`, height: "100%", background: val >= 90 ? "#F87171" : val >= 75 ? "#FB923C" : color, borderRadius: 3 }} />
                          </div>
                          <span style={{ fontSize: 10, fontWeight: 700, fontFamily: "'JetBrains Mono', monospace", color: val >= 90 ? "#F87171" : color }}>{val}%</span>
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

/* ── Panneau de détail ── */
export function ServerDetail({ server, snapshots, onClose, width = 360, overrideStyle = {} }) {
  const [extraOpen, setExtraOpen] = useState(true);
  const specs = [
    { Icon: MonitorCog,  label: "OS",      value: server.os },
    { Icon: Network,     label: "IP",      value: server.ip },
    ...(server.cores      != null ? [{ Icon: Cpu,         label: "Cores",    value: `${server.cores} vCPU` }] : []),
    ...(server.ramGb      != null ? [{ Icon: MemoryStick, label: "RAM",      value: `${server.ramGb} Go` }] : []),
    ...(server.diskGb     != null ? [{ Icon: HardDrive,   label: "Stockage", value: server.diskGb >= 1024 ? `${server.diskGb / 1024} To` : `${server.diskGb} Go` }] : []),
    ...(server.uptimeDays != null && server.uptimeDays > 0 ? [{ Icon: Clock, label: "Uptime", value: `${server.uptimeDays} jours` }] : []),
    ...(server.createdAt  ? [{ Icon: Calendar, label: "Cr\u00e9é le", value: server.createdAt }] : []),
  ];

  return (
    <div style={{
      width, flexShrink: 0, background: "rgba(255,255,255,0.025)",
      border: "1px solid rgba(255,255,255,0.08)", borderRadius: 14,
      padding: 18, alignSelf: "flex-start", position: "sticky", top: 0,
      maxHeight: "calc(100vh - 80px)", overflowY: "auto",
      animation: "slideIn 0.25s ease",
      ...overrideStyle,
    }}>
      {/* En-tête */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <Server size={16} color={ROLES[server.role].color} />
          <span style={{ fontSize: 15, fontWeight: 700, color: "#F3F4F6" }}>{server.name}</span>
        </div>
        <button onClick={onClose} style={{ background: "none", border: "none", color: "#6B7280", cursor: "pointer", display: "flex" }}>
          <X size={16} />
        </button>
      </div>
      <div style={{ marginBottom: 14, display: "flex", gap: 6, flexWrap: "wrap" }}>
        {server.env && <EnvBadge env={server.env} />}
        {server.app && <AppBadge app={server.app} />}
        {server.statut && <StatutBadge statut={server.statut} />}
        <RoleBadge role={server.role} />
      </div>

      {/* Specs */}
      <div style={{
        display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 18,
      }}>
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

      {/* Courbes 24h */}
      <ResourceChart data={server.history24h} dataKey="cpu"  color="#818CF8" label="CPU" />
      <ResourceChart data={server.history24h} dataKey="ram"  color="#F472B6" label="RAM" />
      <ResourceChart data={server.history24h} dataKey="disk" color="#FBBF24" label="Disque" />

      {/* Tendance */}
      <ServerTrend server={server} snapshots={snapshots} />

      {/* Colonnes supplémentaires importées (Excel / API) */}
      {server.extra?.length > 0 && (
        <div style={{ marginTop: 18 }}>
          <div
            onClick={() => setExtraOpen(o => !o)}
            style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 5, fontSize: 10, color: "#6B7280", marginBottom: extraOpen ? 8 : 0, textTransform: "uppercase", letterSpacing: "0.06em", cursor: "pointer", padding: "4px 0", borderTop: "1px solid rgba(255,255,255,0.06)", userSelect: "none" }}
          >
            <span style={{ display: "flex", alignItems: "center", gap: 5 }}>
              <Info size={11} /> Informations complémentaires
              <span style={{ fontSize: 9, color: "#4B5563", fontWeight: 400, textTransform: "none", letterSpacing: 0 }}>({server.extra.length})</span>
            </span>
            <ChevronDown size={12} color="#4B5563" style={{ transform: extraOpen ? "rotate(180deg)" : "none", transition: "transform 0.2s" }} />
          </div>
          {extraOpen && (
            <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
              {server.extra.map(({ label, value }) => (
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
      )}
    </div>
  );
}

/* Filtres par environnement */
const ENV_FILTERS = [
  { id: "all",        label: "Tous",       test: null },
  { id: "production", label: "Production", test: (env) => /prod/i.test(env) && !/pr[ée]?.?prod/i.test(env) },
  { id: "qa",         label: "QA",         test: (env) => /qa|qualif|test|dev/i.test(env) },
  { id: "recette",    label: "Recette",    test: (env) => /recette|uat|pr[ée]?.?prod|staging/i.test(env) },
];

/* ── Vue principale ── */
export default function ServersView() {
  const servers     = useSyncExternalStore(subscribeServers, getServers);
  const snapshots   = useMemo(() => loadSnapshots(), [servers]);
  const [filterText, setFilterText] = useState("");
  const [filterEnv, setFilterEnv]   = useState("all");
  const [selectedId, setSelectedId] = useState(null);

  const envFilter = ENV_FILTERS.find(f => f.id === filterEnv);
  const filtered = servers.filter(s => {
    if (envFilter?.test && !(s.env && envFilter.test(s.env))) return false;
    if (filterText) {
      const q = filterText.toLowerCase();
      if (!s.name.toLowerCase().includes(q) && !(s.app || "").toLowerCase().includes(q) && !(s.statut || "").toLowerCase().includes(q)) return false;
    }
    return true;
  });

  const selected = servers.find(s => s.id === selectedId);

  return (
    <div style={{ display: "flex", gap: 16, alignItems: "flex-start" }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        {/* Filtres */}
        <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap", alignItems: "center" }}>
          <div style={{
            flex: 1, minWidth: 180, display: "flex", alignItems: "center", gap: 7,
            background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.07)",
            borderRadius: 9, padding: "6px 12px",
          }}>
            <Search size={13} color="#4B5563" style={{ flexShrink: 0 }} />
            <input value={filterText} onChange={e => setFilterText(e.target.value)}
              placeholder="Filtrer par nom ou application…"
              style={{ flex: 1, background: "transparent", border: "none", color: "#E5E7EB", fontSize: 12, fontFamily: "'JetBrains Mono', monospace", outline: "none" }} />
            {filterText && (
              <button onClick={() => setFilterText("")} style={{ background: "none", border: "none", color: "#4B5563", cursor: "pointer", display: "flex", padding: 0 }}>
                <X size={12} />
              </button>
            )}
          </div>
          {ENV_FILTERS.map(({ id, label }) => (
            <button key={id} onClick={() => setFilterEnv(id)} style={{
              padding: "6px 12px", borderRadius: 20, fontSize: 11, cursor: "pointer",
              fontWeight: filterEnv === id ? 700 : 400,
              border: `1px solid ${filterEnv === id ? "rgba(99,102,241,0.4)" : "rgba(255,255,255,0.07)"}`,
              background: filterEnv === id ? "rgba(99,102,241,0.18)" : "rgba(255,255,255,0.03)",
              color: filterEnv === id ? "#A5B4FC" : "#6B7280", transition: "all 0.15s",
            }}>{label}</button>
          ))}
          <span style={{ fontSize: 11, color: "#4B5563" }}>{filtered.length} / {servers.length}</span>
        </div>

        {/* Grille serveurs */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 12 }}>
          {filtered.map((s, i) => {
            const isSel = s.id === selectedId;
            const worst = Math.max(s.cpu, s.ram, s.disk);
            return (
              <div key={s.id}
                onClick={() => setSelectedId(isSel ? null : s.id)}
                style={{
                  background: isSel ? "rgba(99,102,241,0.08)" : "rgba(255,255,255,0.025)",
                  border: `1px solid ${isSel ? "rgba(99,102,241,0.45)" : "rgba(255,255,255,0.07)"}`,
                  borderRadius: 14, padding: 16, cursor: "pointer",
                  transition: "border-color 0.15s, background 0.15s, transform 0.1s",
                  animation: `fadeIn 0.3s ease ${i * 0.04}s both`,
                }}
                onMouseEnter={e => { if (!isSel) e.currentTarget.style.borderColor = "rgba(255,255,255,0.18)"; }}
                onMouseLeave={e => { if (!isSel) e.currentTarget.style.borderColor = "rgba(255,255,255,0.07)"; }}
              >
                {/* En-tête card */}
                <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 12, gap: 6, flexWrap: "wrap" }}>
                  <div style={{ display: "flex", alignItems: "flex-start", gap: 8 }}>
                    <div style={{
                      width: 8, height: 8, borderRadius: "50%", flexShrink: 0, marginTop: 4,
                      background: gaugeColor(worst),
                      boxShadow: `0 0 6px ${gaugeColor(worst)}`,
                    }} />
                    <span style={{ fontSize: 13, fontWeight: 700, color: "#F3F4F6", fontFamily: "'JetBrains Mono', monospace", wordBreak: "break-word", lineHeight: 1.35 }}>
                      {s.name}
                    </span>
                  </div>
                  <div style={{ display: "flex", gap: 4, flexWrap: "wrap", justifyContent: "flex-end", flexShrink: 0 }}>
                    {s.env ? <EnvBadge env={s.env} /> : <RoleBadge role={s.role} />}
                    {s.app && <AppBadge app={s.app} />}
                  </div>
                </div>

                {/* Jauges */}
                <div style={{ display: "flex", justifyContent: "space-around" }}>
                  <ServerGauge value={s.cpu}  label="CPU" />
                  <ServerGauge value={s.ram}  label="RAM" />
                  <ServerGauge value={s.disk} label="Disque" />
                </div>
                {/* Delta depuis le dernier chargement */}
                <DeltaBadge delta={lastDelta(s.name, snapshots)} />

                {/* Pied */}
                <div style={{ marginTop: 12, paddingTop: 10, borderTop: "1px solid rgba(255,255,255,0.05)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    {s.statut && <StatutBadge statut={s.statut} />}
                    <span style={{ fontSize: 10, color: "#4B5563", fontFamily: "'JetBrains Mono', monospace" }}>{s.ip}</span>
                  </div>
                  <span style={{ fontSize: 10, color: "#4B5563", fontFamily: "'JetBrains Mono', monospace" }}>
                    {s.cores != null ? `${s.cores} vCPU · ${s.ramGb} Go` : s.os && s.os !== "—" ? s.os : ""}
                  </span>
                </div>
              </div>
            );
          })}
        </div>

        {filtered.length === 0 && (
          <div style={{ padding: "48px 0", textAlign: "center", color: "#4B5563", fontSize: 12 }}>
            <Server size={28} style={{ display: "block", margin: "0 auto 10px", opacity: 0.3 }} />
            Aucun serveur ne correspond au filtre
          </div>
        )}
      </div>

      {/* Panneau détail */}
      {selected && <ServerDetail server={selected} snapshots={snapshots} onClose={() => setSelectedId(null)} />}
    </div>
  );
}
