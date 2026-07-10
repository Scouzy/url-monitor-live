import { useState, useMemo } from "react";
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  PieChart, Pie, Cell, LineChart, Line, AreaChart, Area, Legend, RadialBarChart, RadialBar,
} from "recharts";
import {
  RefreshCw, Loader2, AlertTriangle, TrendingUp, TrendingDown,
  Ticket, Zap, CheckCircle2, Clock, BarChart3, PieChart as PieIcon,
  Activity, Award, Flame, Shield, AlertOctagon, Layers,
} from "lucide-react";

const MEP_KEYWORDS = /\b(?:prod|production|pr[ée]?[- ]?prod(?:uction)?|pp)\b/i;

const COLORS = {
  green:   "#34D399",
  yellow:  "#FBBF24",
  orange:  "#FB923C",
  red:     "#F87171",
  rose:    "#FB7185",
  indigo:  "#818CF8",
  violet:  "#A78BFA",
  cyan:    "#22D3EE",
  pink:    "#F472B6",
  blue:    "#60A5FA",
  emerald: "#10B981",
  amber:   "#F59E0B",
};
const PIE_COLORS = ["#F87171", "#FB923C", "#FBBF24", "#34D399", "#818CF8", "#A78BFA", "#22D3EE", "#F472B6"];

const PERIODS = [
  { id: "monthly",    label: "Mensuel" },
  { id: "quarterly",  label: "Trimestriel" },
  { id: "yearly",     label: "Annuel" },
];

const MONTH_LABELS = ["Jan", "Fév", "Mar", "Avr", "Mai", "Juin", "Juil", "Août", "Sep", "Oct", "Nov", "Déc"];

const PRIORITY_META = {
  critical: { label: "Critique", color: "#F87171" },
  high:     { label: "Haute",    color: "#FB923C" },
  medium:   { label: "Moyenne",  color: "#FBBF24" },
  low:      { label: "Basse",    color: "#34D399" },
};

function getPriorityMeta(priority) {
  if (!priority) return null;
  const p = String(priority).toLowerCase().trim();
  /* Correspondances directes */
  for (const [key, meta] of Object.entries(PRIORITY_META)) {
    if (p.includes(key) || p.includes(meta.label.toLowerCase())) return meta;
  }
  /* Valeurs numériques ITCare : 1 = critique, 2 = haute, 3 = moyenne, 4 = basse */
  const numMatch = p.match(/\b([1-4])\b/);
  if (numMatch) {
    const map = { "1": PRIORITY_META.critical, "2": PRIORITY_META.high, "3": PRIORITY_META.medium, "4": PRIORITY_META.low };
    return map[numMatch[1]] || null;
  }
  /* P1/P2/P3/P4 */
  const pMatch = p.match(/\bp([1-4])\b/);
  if (pMatch) {
    const map = { "1": PRIORITY_META.critical, "2": PRIORITY_META.high, "3": PRIORITY_META.medium, "4": PRIORITY_META.low };
    return map[pMatch[1]] || null;
  }
  /* urgent / normal / low */
  if (p.includes("urgent") || p.includes("immediate")) return PRIORITY_META.critical;
  if (p.includes("normal") || p.includes("standard")) return PRIORITY_META.medium;
  if (p.includes("minor") || p.includes("cosmetic")) return PRIORITY_META.low;
  return null;
}

function CustomTooltip({ active, payload, label }) {
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
          {p.name} : <span style={{ fontWeight: 700, fontFamily: "'JetBrains Mono', monospace" }}>{p.value}</span>
        </div>
      ))}
    </div>
  );
}

function KpiCard({ icon: Icon, label, value, sub, color, trend }) {
  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 12, padding: "14px 16px", borderRadius: 14,
      background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)",
      position: "relative", overflow: "hidden",
    }}>
      <div style={{ position: "absolute", right: -10, top: -10, width: 60, height: 60, borderRadius: "50%", background: `${color}08` }} />
      <div style={{
        width: 40, height: 40, borderRadius: 11, flexShrink: 0,
        display: "flex", alignItems: "center", justifyContent: "center",
        background: `${color}15`, border: `1px solid ${color}30`,
      }}>
        <Icon size={18} color={color} />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 22, fontWeight: 800, color: "#F3F4F6", fontFamily: "'JetBrains Mono', monospace", lineHeight: 1.1 }}>{value}</div>
        <div style={{ fontSize: 10, color: "#6B7280", textTransform: "uppercase", letterSpacing: "0.04em", marginTop: 2 }}>{label}</div>
        {sub && <div style={{ fontSize: 10, color, marginTop: 2, display: "flex", alignItems: "center", gap: 3 }}>
          {trend === "up" ? <TrendingUp size={9} /> : trend === "down" ? <TrendingDown size={9} /> : null}{sub}
        </div>}
      </div>
    </div>
  );
}

function ChartCard({ title, icon: Icon, children, height = 300 }) {
  return (
    <div style={{
      background: "rgba(255,255,255,0.025)", border: "1px solid rgba(255,255,255,0.06)",
      borderRadius: 16, padding: "18px 20px", display: "flex", flexDirection: "column", gap: 12,
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <Icon size={15} color="#F87171" />
        <h3 style={{ fontSize: 13, fontWeight: 700, color: "#E5E7EB", margin: 0 }}>{title}</h3>
      </div>
      <div style={{ width: "100%", height }}>{children}</div>
    </div>
  );
}

export default function IncidentStats({ isMobile = false, tickets = [], loading = false, error = null, lastLoad = null, onRefresh }) {
  const [period, setPeriod] = useState("monthly");

  const incidents = useMemo(() => tickets.filter(t => !t.isIntervention), [tickets]);

  const kpis = useMemo(() => {
    const total = incidents.length;
    const critical = incidents.filter(t => getPriorityMeta(t.priority)?.label === "Critique").length;
    const high = incidents.filter(t => getPriorityMeta(t.priority)?.label === "Haute").length;
    const inProgress = incidents.filter(t => /in.progress|progress/i.test(t.status || "")).length;
    const closed = incidents.filter(t => /closed|resolved|cancel|done|complete/i.test(t.status || "")).length;
    const open = total - closed;
    const closeRate = total > 0 ? Math.round((closed / total) * 100) : 0;
    const criticalRate = total > 0 ? Math.round((critical / total) * 100) : 0;
    return { total, critical, high, inProgress, closed, open, closeRate, criticalRate };
  }, [incidents]);

  /* Génère tous les mois entre juillet 2025 et maintenant */
  const monthBuckets = useMemo(() => {
    const buckets = [];
    const start = new Date(2025, 6, 1); /* juillet 2025 */
    const now = new Date();
    const cursor = new Date(start);
    while (cursor <= now) {
      const key = `${cursor.getFullYear()}-${String(cursor.getMonth()).padStart(2, "0")}`;
      const label = `${MONTH_LABELS[cursor.getMonth()]} ${String(cursor.getFullYear()).slice(2)}`;
      buckets.push({ key, label, total: 0, critical: 0, high: 0, medium: 0, low: 0, closed: 0, open: 0, inProgress: 0 });
      cursor.setMonth(cursor.getMonth() + 1);
    }
    return buckets;
  }, []);

  /* Génère tous les trimestres entre T3 2025 et maintenant */
  const quarterBuckets = useMemo(() => {
    const buckets = [];
    const startYear = 2025;
    const startQ = 2; /* T3 2025 (index 2 = 3eme trimestre) */
    const now = new Date();
    const nowQ = Math.floor(now.getMonth() / 3);
    for (let y = startYear; y <= now.getFullYear(); y++) {
      const qStart = (y === startYear) ? startQ : 0;
      const qEnd = (y === now.getFullYear()) ? nowQ : 3;
      for (let q = qStart; q <= qEnd; q++) {
        const key = `${y}-Q${q + 1}`;
        const label = `T${q + 1} ${y}`;
        buckets.push({ key, label, total: 0, critical: 0, high: 0, medium: 0, low: 0, closed: 0, open: 0, inProgress: 0 });
      }
    }
    return buckets;
  }, []);

  /* Génère les années de 2025 à maintenant */
  const yearBuckets = useMemo(() => {
    const buckets = [];
    const now = new Date();
    for (let y = 2025; y <= now.getFullYear(); y++) {
      buckets.push({ key: String(y), label: String(y), total: 0, critical: 0, high: 0, medium: 0, low: 0, closed: 0, open: 0, inProgress: 0 });
    }
    return buckets;
  }, []);

  const chartData = useMemo(() => {
    if (incidents.length === 0) return { bar: [], barPriority: [], pie: [], piePriority: [], area: [], line: [] };

    const buckets = period === "monthly" ? monthBuckets : period === "quarterly" ? quarterBuckets : yearBuckets;
    const groups = {};
    buckets.forEach(b => { groups[b.key] = { ...b }; });

    incidents.forEach(t => {
      const d = t.createdAt ? new Date(t.createdAt) : null;
      if (!d || isNaN(d)) return;
      let key;
      if (period === "monthly") {
        key = `${d.getFullYear()}-${String(d.getMonth()).padStart(2, "0")}`;
      } else if (period === "quarterly") {
        const q = Math.floor(d.getMonth() / 3);
        key = `${d.getFullYear()}-Q${q + 1}`;
      } else {
        key = String(d.getFullYear());
      }
      if (!groups[key]) return;
      groups[key].total++;
      const pm = getPriorityMeta(t.priority);
      if (pm) {
        if (pm.label === "Critique") groups[key].critical++;
        else if (pm.label === "Haute") groups[key].high++;
        else if (pm.label === "Moyenne") groups[key].medium++;
        else if (pm.label === "Basse") groups[key].low++;
      }
      if (/closed|resolved|cancel|done|complete/i.test(t.status || "")) groups[key].closed++;
      else if (/in.progress|progress/i.test(t.status || "")) groups[key].inProgress++;
      else groups[key].open++;
    });

    const sorted = buckets.map(b => groups[b.key]).filter(Boolean);

    const bar = sorted.map(g => ({ name: g.label, Total: g.total, "En cours": g.inProgress, Clos: g.closed }));
    const barPriority = sorted.map(g => ({ name: g.label, Critique: g.critical, Haute: g.high, Moyenne: g.medium, Basse: g.low }));
    const line = sorted.map(g => ({ name: g.label, Total: g.total, Critique: g.critical }));
    const area = sorted.map(g => ({ name: g.label, Ouverts: g.open, "En cours": g.inProgress, Clos: g.closed }));

    const statusGroups = {};
    incidents.forEach(t => {
      const s = t.status || "inconnu";
      statusGroups[s] = (statusGroups[s] || 0) + 1;
    });
    const pie = Object.entries(statusGroups).map(([name, value]) => ({ name, value }));

    const priorityGroups = {};
    incidents.forEach(t => {
      const pm = getPriorityMeta(t.priority);
      const label = pm ? pm.label : "Non définie";
      priorityGroups[label] = (priorityGroups[label] || 0) + 1;
    });
    const piePriority = Object.entries(priorityGroups).map(([name, value]) => ({ name, value }));

    return { bar, barPriority, pie, piePriority, area, line };
  }, [incidents, period, monthBuckets, quarterBuckets, yearBuckets]);

  const topServices = useMemo(() => {
    const groups = {};
    incidents.forEach(t => {
      const s = t.service || "Non spécifié";
      groups[s] = (groups[s] || 0) + 1;
    });
    return Object.entries(groups).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([name, value]) => ({ name, value }));
  }, [incidents]);

  const monthlyTrend = useMemo(() => {
    if (incidents.length === 0) return [];
    const groups = {};
    monthBuckets.forEach(b => { groups[b.key] = { name: b.label, Incidents: 0, Critiques: 0 }; });
    incidents.forEach(t => {
      const d = t.createdAt ? new Date(t.createdAt) : null;
      if (!d || isNaN(d)) return;
      const key = `${d.getFullYear()}-${String(d.getMonth()).padStart(2, "0")}`;
      if (!groups[key]) return;
      groups[key].Incidents++;
      if (getPriorityMeta(t.priority)?.label === "Critique") groups[key].Critiques++;
    });
    return monthBuckets.map(b => groups[b.key]).filter(Boolean);
  }, [incidents, monthBuckets]);

  if (loading && tickets.length === 0) {
    return (
      <div style={{ textAlign: "center", padding: 60, color: "#4B5563" }}>
        <Loader2 size={28} className="spin" style={{ marginBottom: 12 }} />
        <p style={{ fontSize: 13 }}>Chargement des statistiques d'incidents…</p>
      </div>
    );
  }

  if (error && tickets.length === 0) {
    return (
      <div style={{
        display: "flex", alignItems: "center", gap: 8, padding: "14px 18px", borderRadius: 12,
        background: "rgba(248,113,113,0.08)", border: "1px solid rgba(248,113,113,0.2)",
        color: "#F87171", fontSize: 13,
      }}>
        <AlertTriangle size={16} style={{ flexShrink: 0 }} />
        {error}
      </div>
    );
  }

  if (incidents.length === 0) {
    return (
      <div style={{
        textAlign: "center", padding: "50px 20px", color: "#4B5563",
        background: "rgba(255,255,255,0.02)", borderRadius: 14, border: "1px dashed rgba(255,255,255,0.08)",
      }}>
        <AlertOctagon size={36} style={{ marginBottom: 10, opacity: 0.3 }} />
        <p style={{ fontSize: 14, marginBottom: 4 }}>Aucun incident à analyser</p>
        <p style={{ fontSize: 12 }}>Cliquez sur « Actualiser » pour récupérer les tickets depuis ITCare.</p>
        <button onClick={onRefresh} style={{
          marginTop: 14, display: "inline-flex", alignItems: "center", gap: 6, padding: "8px 16px", borderRadius: 9,
          background: "rgba(248,113,113,0.1)", border: "1px solid rgba(248,113,113,0.2)",
          color: "#F87171", fontSize: 12, fontWeight: 600, cursor: "pointer",
        }}>
          <RefreshCw size={13} /> Actualiser
        </button>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {/* ── Barre d'actions ── */}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
        <button onClick={onRefresh} disabled={loading} style={{
          display: "inline-flex", alignItems: "center", gap: 6, padding: "7px 14px", borderRadius: 9,
          background: "rgba(248,113,113,0.1)", border: "1px solid rgba(248,113,113,0.2)",
          color: "#F87171", fontSize: 12, fontWeight: 600, cursor: loading ? "wait" : "pointer",
          whiteSpace: "nowrap",
        }}>
          {loading ? <Loader2 size={13} className="spin" /> : <RefreshCw size={13} />}
          {isMobile ? "" : " Actualiser"}
        </button>

        {lastLoad && (
          <span style={{ fontSize: 10, color: "#4B5563", display: "flex", alignItems: "center", gap: 5 }}>
            <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#34D399", boxShadow: "0 0 6px #34D399", animation: "pulse 2s ease-in-out infinite" }} />
            {new Date(lastLoad).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}
          </span>
        )}

        <div style={{ flex: 1 }} />

        <div style={{ display: "flex", borderRadius: 9, overflow: "hidden", border: "1px solid rgba(255,255,255,0.08)", flexShrink: 0 }}>
          {PERIODS.map(({ id, label }) => (
            <button key={id} onClick={() => setPeriod(id)} style={{
              padding: "6px 14px", cursor: "pointer", fontSize: 11, fontWeight: period === id ? 700 : 400, border: "none",
              background: period === id ? "rgba(248,113,113,0.25)" : "rgba(255,255,255,0.03)",
              color: period === id ? "#FCA5A5" : "#6B7280", transition: "all 0.15s", whiteSpace: "nowrap",
            }}>{label}</button>
          ))}
        </div>
      </div>

      {/* ── KPIs ── */}
      <div style={{
        display: "grid", gridTemplateColumns: isMobile ? "repeat(2, 1fr)" : "repeat(auto-fit, minmax(170px, 1fr))",
        gap: 10,
      }}>
        <KpiCard icon={Ticket} label="Total incidents" value={kpis.total} color={COLORS.yellow} />
        <KpiCard icon={Flame} label="Critiques" value={kpis.critical} color={COLORS.red}
          sub={`${kpis.criticalRate}% du total`} />
        <KpiCard icon={AlertOctagon} label="Haute priorité" value={kpis.high} color={COLORS.orange} />
        <KpiCard icon={Clock} label="En cours" value={kpis.inProgress} color={COLORS.amber} />
        <KpiCard icon={CheckCircle2} label="Clos" value={kpis.closed} color={COLORS.indigo}
          sub={`${kpis.closeRate}% taux de clôture`} trend="up" />
        <KpiCard icon={Activity} label="Ouverts" value={kpis.open} color={COLORS.rose} />
      </div>

      {/* ── Ligne 1 : Bar chart (total/statut) + Pie chart (statut) ── */}
      <div style={{
        display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1.6fr 1fr",
        gap: 14,
      }}>
        <ChartCard title={`Incidents par période (${PERIODS.find(p => p.id === period)?.label.toLowerCase()})`} icon={BarChart3} height={isMobile ? 260 : 320}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData.bar} margin={{ top: 8, right: 10, left: -16, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
              <XAxis dataKey="name" tick={{ fill: "#6B7280", fontSize: 11 }} axisLine={{ stroke: "rgba(255,255,255,0.08)" }} />
              <YAxis tick={{ fill: "#6B7280", fontSize: 11 }} axisLine={{ stroke: "rgba(255,255,255,0.08)" }} />
              <Tooltip content={<CustomTooltip />} cursor={{ fill: "rgba(255,255,255,0.03)" }} />
              <Legend wrapperStyle={{ fontSize: 11, color: "#6B7280" }} />
              <Bar dataKey="Total" fill={COLORS.yellow} radius={[6, 6, 0, 0]} maxBarSize={50} />
              <Bar dataKey="En cours" fill={COLORS.orange} radius={[6, 6, 0, 0]} maxBarSize={50} />
              <Bar dataKey="Clos" fill={COLORS.indigo} radius={[6, 6, 0, 0]} maxBarSize={50} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Répartition par statut" icon={PieIcon} height={isMobile ? 260 : 320}>
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie data={chartData.pie} cx="50%" cy="50%" innerRadius={isMobile ? 50 : 65} outerRadius={isMobile ? 80 : 100} paddingAngle={3} dataKey="value">
                {chartData.pie.map((_, i) => (
                  <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} stroke="rgba(17,24,39,0.8)" strokeWidth={2} />
                ))}
              </Pie>
              <Tooltip content={<CustomTooltip />} />
              <Legend wrapperStyle={{ fontSize: 10, color: "#6B7280" }} />
            </PieChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>

      {/* ── Ligne 2 : Bar chart par priorité + Pie chart par priorité ── */}
      <div style={{
        display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1.6fr 1fr",
        gap: 14,
      }}>
        <ChartCard title="Incidents par priorité et période" icon={Layers} height={isMobile ? 260 : 320}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData.barPriority} margin={{ top: 8, right: 10, left: -16, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
              <XAxis dataKey="name" tick={{ fill: "#6B7280", fontSize: 11 }} axisLine={{ stroke: "rgba(255,255,255,0.08)" }} />
              <YAxis tick={{ fill: "#6B7280", fontSize: 11 }} axisLine={{ stroke: "rgba(255,255,255,0.08)" }} />
              <Tooltip content={<CustomTooltip />} cursor={{ fill: "rgba(255,255,255,0.03)" }} />
              <Legend wrapperStyle={{ fontSize: 11, color: "#6B7280" }} />
              <Bar dataKey="Critique" stackId="a" fill={COLORS.red} radius={[0, 0, 0, 0]} maxBarSize={50} />
              <Bar dataKey="Haute" stackId="a" fill={COLORS.orange} radius={[0, 0, 0, 0]} maxBarSize={50} />
              <Bar dataKey="Moyenne" stackId="a" fill={COLORS.yellow} radius={[0, 0, 0, 0]} maxBarSize={50} />
              <Bar dataKey="Basse" stackId="a" fill={COLORS.green} radius={[6, 6, 0, 0]} maxBarSize={50} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Répartition par priorité" icon={Shield} height={isMobile ? 260 : 320}>
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie data={chartData.piePriority} cx="50%" cy="50%" innerRadius={isMobile ? 50 : 65} outerRadius={isMobile ? 80 : 100} paddingAngle={3} dataKey="value">
                {chartData.piePriority.map((entry, i) => {
                  const colorMap = { "Critique": COLORS.red, "Haute": COLORS.orange, "Moyenne": COLORS.yellow, "Basse": COLORS.green, "Non définie": COLORS.indigo };
                  return <Cell key={i} fill={colorMap[entry.name] || PIE_COLORS[i % PIE_COLORS.length]} stroke="rgba(17,24,39,0.8)" strokeWidth={2} />;
                })}
              </Pie>
              <Tooltip content={<CustomTooltip />} />
              <Legend wrapperStyle={{ fontSize: 10, color: "#6B7280" }} />
            </PieChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>

      {/* ── Ligne 3 : Area chart (stacked statuts) + Line chart (total vs critiques) ── */}
      <div style={{
        display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr",
        gap: 14,
      }}>
        <ChartCard title="Évolution des statuts (empilé)" icon={Activity} height={isMobile ? 240 : 300}>
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={chartData.area} margin={{ top: 8, right: 10, left: -16, bottom: 0 }}>
              <defs>
                <linearGradient id="iOpen" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={COLORS.rose} stopOpacity={0.5} />
                  <stop offset="100%" stopColor={COLORS.rose} stopOpacity={0.05} />
                </linearGradient>
                <linearGradient id="iProgress" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={COLORS.orange} stopOpacity={0.5} />
                  <stop offset="100%" stopColor={COLORS.orange} stopOpacity={0.05} />
                </linearGradient>
                <linearGradient id="iClosed" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={COLORS.indigo} stopOpacity={0.5} />
                  <stop offset="100%" stopColor={COLORS.indigo} stopOpacity={0.05} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
              <XAxis dataKey="name" tick={{ fill: "#6B7280", fontSize: 11 }} axisLine={{ stroke: "rgba(255,255,255,0.08)" }} />
              <YAxis tick={{ fill: "#6B7280", fontSize: 11 }} axisLine={{ stroke: "rgba(255,255,255,0.08)" }} />
              <Tooltip content={<CustomTooltip />} />
              <Legend wrapperStyle={{ fontSize: 11, color: "#6B7280" }} />
              <Area type="monotone" dataKey="Ouverts" stackId="1" stroke={COLORS.rose} fill="url(#iOpen)" strokeWidth={2} />
              <Area type="monotone" dataKey="En cours" stackId="1" stroke={COLORS.orange} fill="url(#iProgress)" strokeWidth={2} />
              <Area type="monotone" dataKey="Clos" stackId="1" stroke={COLORS.indigo} fill="url(#iClosed)" strokeWidth={2} />
            </AreaChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Évolution : total vs critiques" icon={TrendingUp} height={isMobile ? 240 : 300}>
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={monthlyTrend} margin={{ top: 8, right: 10, left: -16, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
              <XAxis dataKey="name" tick={{ fill: "#6B7280", fontSize: 11 }} axisLine={{ stroke: "rgba(255,255,255,0.08)" }} />
              <YAxis tick={{ fill: "#6B7280", fontSize: 11 }} axisLine={{ stroke: "rgba(255,255,255,0.08)" }} />
              <Tooltip content={<CustomTooltip />} />
              <Legend wrapperStyle={{ fontSize: 11, color: "#6B7280" }} />
              <Line type="monotone" dataKey="Incidents" stroke={COLORS.yellow} strokeWidth={3} dot={{ fill: COLORS.yellow, r: 4 }} activeDot={{ r: 6 }} />
              <Line type="monotone" dataKey="Critiques" stroke={COLORS.red} strokeWidth={3} dot={{ fill: COLORS.red, r: 4 }} activeDot={{ r: 6 }} />
            </LineChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>

      {/* ── Ligne 4 : Top services impactés ── */}
      {topServices.length > 0 && (
        <ChartCard title="Top services impactés par les incidents" icon={Award} height={isMobile ? 240 : 280}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={topServices} layout="vertical" margin={{ top: 4, right: 20, left: 10, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" horizontal={false} />
              <XAxis type="number" tick={{ fill: "#6B7280", fontSize: 11 }} axisLine={{ stroke: "rgba(255,255,255,0.08)" }} />
              <YAxis type="category" dataKey="name" tick={{ fill: "#9CA3AF", fontSize: 11 }} axisLine={{ stroke: "rgba(255,255,255,0.08)" }} width={120} />
              <Tooltip content={<CustomTooltip />} cursor={{ fill: "rgba(255,255,255,0.03)" }} />
              <Bar dataKey="value" name="Incidents" radius={[0, 6, 6, 0]} maxBarSize={28}>
                {topServices.map((_, i) => (
                  <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
      )}
    </div>
  );
}
