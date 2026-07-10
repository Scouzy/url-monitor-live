import { useState, useMemo } from "react";
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  PieChart, Pie, Cell, LineChart, Line, AreaChart, Area, Legend,
} from "recharts";
import {
  RefreshCw, Loader2, AlertTriangle, Calendar, TrendingUp, TrendingDown,
  Wrench, Ticket, Zap, CheckCircle2, Clock, BarChart3, PieChart as PieIcon,
  Activity, Award, ChevronDown,
} from "lucide-react";

const MEP_KEYWORDS = /\b(?:prod|production|pr[ée]?[- ]?prod(?:uction)?|pp)\b/i;

/* ── Palette de couleurs ── */
const COLORS = {
  green:   "#34D399",
  yellow:  "#FBBF24",
  orange:  "#FB923C",
  red:     "#F87171",
  indigo:  "#818CF8",
  violet:  "#A78BFA",
  cyan:    "#22D3EE",
  pink:    "#F472B6",
  blue:    "#60A5FA",
  emerald: "#10B981",
  amber:   "#F59E0B",
  rose:    "#FB7185",
};
const PIE_COLORS = ["#34D399", "#FBBF24", "#FB923C", "#F87171", "#818CF8", "#A78BFA", "#22D3EE", "#F472B6"];

/* ── Périodes ── */
const PERIODS = [
  { id: "monthly",    label: "Mensuel" },
  { id: "quarterly",  label: "Trimestriel" },
  { id: "yearly",     label: "Annuel" },
];

function formatDate(d) {
  if (!d) return "—";
  try {
    const date = typeof d === "string" ? new Date(d) : d;
    return new Intl.DateTimeFormat("fr-FR", { day: "2-digit", month: "short", year: "numeric" }).format(date);
  } catch { return String(d); }
}

const MONTH_LABELS = ["Jan", "Fév", "Mar", "Avr", "Mai", "Juin", "Juil", "Août", "Sep", "Oct", "Nov", "Déc"];

/* ── Tooltip custom ── */
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

/* ── Carte de KPI ── */
function KpiCard({ icon: Icon, label, value, sub, color, trend }) {
  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 12, padding: "14px 16px", borderRadius: 14,
      background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)",
      position: "relative", overflow: "hidden",
    }}>
      <div style={{
        position: "absolute", right: -10, top: -10, width: 60, height: 60, borderRadius: "50%",
        background: `${color}08`,
      }} />
      <div style={{
        width: 40, height: 40, borderRadius: 11, flexShrink: 0,
        display: "flex", alignItems: "center", justifyContent: "center",
        background: `${color}15`, border: `1px solid ${color}30`,
      }}>
        <Icon size={18} color={color} />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 22, fontWeight: 800, color: "#F3F4F6", fontFamily: "'JetBrains Mono', monospace", lineHeight: 1.1 }}>
          {value}
        </div>
        <div style={{ fontSize: 10, color: "#6B7280", textTransform: "uppercase", letterSpacing: "0.04em", marginTop: 2 }}>{label}</div>
        {sub && <div style={{ fontSize: 10, color, marginTop: 2, display: "flex", alignItems: "center", gap: 3 }}>
          {trend === "up" ? <TrendingUp size={9} /> : trend === "down" ? <TrendingDown size={9} /> : null}{sub}
        </div>}
      </div>
    </div>
  );
}

/* ── Carte de graphique ── */
function ChartCard({ title, icon: Icon, children, height = 300 }) {
  return (
    <div style={{
      background: "rgba(255,255,255,0.025)", border: "1px solid rgba(255,255,255,0.06)",
      borderRadius: 16, padding: "18px 20px", display: "flex", flexDirection: "column", gap: 12,
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <Icon size={15} color="#818CF8" />
        <h3 style={{ fontSize: 13, fontWeight: 700, color: "#E5E7EB", margin: 0 }}>{title}</h3>
      </div>
      <div style={{ width: "100%", height }}>
        {children}
      </div>
    </div>
  );
}

/* ── Vue principale ── */
export default function InterventionStats({ isMobile = false, tickets = [], loading = false, error = null, lastLoad = null, onRefresh }) {
  const [period, setPeriod] = useState("monthly");

  /* ── Données filtrées : demandes uniquement (interventions) ── */
  const interventions = useMemo(() => tickets.filter(t => t.isIntervention), [tickets]);
  const mepTickets = useMemo(() => interventions.filter(t => MEP_KEYWORDS.test(t.subject || '')), [interventions]);

  /* ── KPIs globaux ── */
  const kpis = useMemo(() => {
    const total = interventions.length;
    const mep = mepTickets.length;
    const inProgress = interventions.filter(t => /in.progress|progress/i.test(t.status || "")).length;
    const closed = interventions.filter(t => /closed|resolved|cancel|done|complete/i.test(t.status || "")).length;
    const open = total - closed;
    const closeRate = total > 0 ? Math.round((closed / total) * 100) : 0;
    return { total, mep, inProgress, closed, open, closeRate };
  }, [interventions, mepTickets]);

  /* Génère tous les mois entre juillet 2025 et maintenant */
  const monthBuckets = useMemo(() => {
    const buckets = [];
    const start = new Date(2025, 6, 1);
    const now = new Date();
    const cursor = new Date(start);
    while (cursor <= now) {
      const key = `${cursor.getFullYear()}-${String(cursor.getMonth()).padStart(2, "0")}`;
      const label = `${MONTH_LABELS[cursor.getMonth()]} ${String(cursor.getFullYear()).slice(2)}`;
      buckets.push({ key, label, total: 0, mep: 0, closed: 0, open: 0, inProgress: 0 });
      cursor.setMonth(cursor.getMonth() + 1);
    }
    return buckets;
  }, []);

  const quarterBuckets = useMemo(() => {
    const buckets = [];
    const now = new Date();
    const nowQ = Math.floor(now.getMonth() / 3);
    for (let y = 2025; y <= now.getFullYear(); y++) {
      const qStart = (y === 2025) ? 2 : 0;
      const qEnd = (y === now.getFullYear()) ? nowQ : 3;
      for (let q = qStart; q <= qEnd; q++) {
        buckets.push({ key: `${y}-Q${q + 1}`, label: `T${q + 1} ${y}`, total: 0, mep: 0, closed: 0, open: 0, inProgress: 0 });
      }
    }
    return buckets;
  }, []);

  const yearBuckets = useMemo(() => {
    const buckets = [];
    const now = new Date();
    for (let y = 2025; y <= now.getFullYear(); y++) {
      buckets.push({ key: String(y), label: String(y), total: 0, mep: 0, closed: 0, open: 0, inProgress: 0 });
    }
    return buckets;
  }, []);

  /* ── Données par période ── */
  const chartData = useMemo(() => {
    if (interventions.length === 0) return { bar: [], pie: [], line: [], area: [] };

    const buckets = period === "monthly" ? monthBuckets : period === "quarterly" ? quarterBuckets : yearBuckets;
    const groups = {};
    buckets.forEach(b => { groups[b.key] = { ...b }; });

    interventions.forEach(t => {
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
      if (MEP_KEYWORDS.test(t.subject || '')) groups[key].mep++;
      if (/closed|resolved|cancel|done|complete/i.test(t.status || "")) groups[key].closed++;
      else if (/in.progress|progress/i.test(t.status || "")) groups[key].inProgress++;
      else groups[key].open++;
    });

    const sorted = buckets.map(b => groups[b.key]).filter(Boolean);

    const bar = sorted.map(g => ({ name: g.label, Total: g.total, MEP: g.mep, "En cours": g.inProgress, Clos: g.closed }));
    const line = sorted.map(g => ({ name: g.label, Total: g.total, MEP: g.mep }));
    const area = sorted.map(g => ({ name: g.label, Ouverts: g.open, "En cours": g.inProgress, Clos: g.closed }));

    const statusGroups = {};
    interventions.forEach(t => {
      const s = t.status || "inconnu";
      statusGroups[s] = (statusGroups[s] || 0) + 1;
    });
    const pie = Object.entries(statusGroups).map(([name, value]) => ({ name, value }));

    return { bar, pie, line, area };
  }, [interventions, period, monthBuckets, quarterBuckets, yearBuckets]);

  /* ── Top services ── */
  const topServices = useMemo(() => {
    const groups = {};
    interventions.forEach(t => {
      const s = t.service || "Non spécifié";
      groups[s] = (groups[s] || 0) + 1;
    });
    return Object.entries(groups).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([name, value]) => ({ name, value }));
  }, [interventions]);

  /* ── Évolution mensuelle MEP vs non-MEP ── */
  const mepComparison = useMemo(() => {
    if (interventions.length === 0) return [];
    const groups = {};
    monthBuckets.forEach(b => { groups[b.key] = { name: b.label, MEP: 0, Autres: 0 }; });
    interventions.forEach(t => {
      const d = t.createdAt ? new Date(t.createdAt) : null;
      if (!d || isNaN(d)) return;
      const key = `${d.getFullYear()}-${String(d.getMonth()).padStart(2, "0")}`;
      if (!groups[key]) return;
      if (MEP_KEYWORDS.test(t.subject || '')) groups[key].MEP++;
      else groups[key].Autres++;
    });
    return monthBuckets.map(b => groups[b.key]).filter(Boolean);
  }, [interventions, monthBuckets]);

  if (loading && tickets.length === 0) {
    return (
      <div style={{ textAlign: "center", padding: 60, color: "#4B5563" }}>
        <Loader2 size={28} className="spin" style={{ marginBottom: 12 }} />
        <p style={{ fontSize: 13 }}>Chargement des statistiques…</p>
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

  if (interventions.length === 0) {
    return (
      <div style={{
        textAlign: "center", padding: "50px 20px", color: "#4B5563",
        background: "rgba(255,255,255,0.02)", borderRadius: 14, border: "1px dashed rgba(255,255,255,0.08)",
      }}>
        <BarChart3 size={36} style={{ marginBottom: 10, opacity: 0.3 }} />
        <p style={{ fontSize: 14, marginBottom: 4 }}>Aucune intervention à analyser</p>
        <p style={{ fontSize: 12 }}>Cliquez sur « Actualiser » pour récupérer les tickets depuis ITCare.</p>
        <button onClick={onRefresh} style={{
          marginTop: 14, display: "inline-flex", alignItems: "center", gap: 6, padding: "8px 16px", borderRadius: 9,
          background: "rgba(52,211,153,0.1)", border: "1px solid rgba(52,211,153,0.2)",
          color: "#34D399", fontSize: 12, fontWeight: 600, cursor: "pointer",
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
          background: "rgba(52,211,153,0.1)", border: "1px solid rgba(52,211,153,0.2)",
          color: "#34D399", fontSize: 12, fontWeight: 600, cursor: loading ? "wait" : "pointer",
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

        {/* Sélecteur de période */}
        <div style={{ display: "flex", borderRadius: 9, overflow: "hidden", border: "1px solid rgba(255,255,255,0.08)", flexShrink: 0 }}>
          {PERIODS.map(({ id, label }) => (
            <button key={id} onClick={() => setPeriod(id)} style={{
              padding: "6px 14px", cursor: "pointer", fontSize: 11, fontWeight: period === id ? 700 : 400, border: "none",
              background: period === id ? "rgba(99,102,241,0.25)" : "rgba(255,255,255,0.03)",
              color: period === id ? "#A5B4FC" : "#6B7280", transition: "all 0.15s", whiteSpace: "nowrap",
            }}>{label}</button>
          ))}
        </div>
      </div>

      {/* ── KPIs ── */}
      <div style={{
        display: "grid", gridTemplateColumns: isMobile ? "repeat(2, 1fr)" : "repeat(auto-fit, minmax(170px, 1fr))",
        gap: 10,
      }}>
        <KpiCard icon={Wrench} label="Total interventions" value={kpis.total} color={COLORS.green} />
        <KpiCard icon={Zap} label="MEP (PROD/PP)" value={kpis.mep} color={COLORS.violet}
          sub={`${kpis.total > 0 ? Math.round(kpis.mep / kpis.total * 100) : 0}% du total`} />
        <KpiCard icon={Clock} label="En cours" value={kpis.inProgress} color={COLORS.orange} />
        <KpiCard icon={CheckCircle2} label="Clos" value={kpis.closed} color={COLORS.indigo}
          sub={`${kpis.closeRate}% taux de clôture`} trend="up" />
        <KpiCard icon={Activity} label="Ouverts" value={kpis.open} color={COLORS.yellow} />
      </div>

      {/* ── Ligne 1 : Bar chart + Pie chart ── */}
      <div style={{
        display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1.6fr 1fr",
        gap: 14,
      }}>
        <ChartCard title={`Interventions par période (${PERIODS.find(p => p.id === period)?.label.toLowerCase()})`} icon={BarChart3} height={isMobile ? 260 : 320}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData.bar} margin={{ top: 8, right: 10, left: -16, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
              <XAxis dataKey="name" tick={{ fill: "#6B7280", fontSize: 11 }} axisLine={{ stroke: "rgba(255,255,255,0.08)" }} />
              <YAxis tick={{ fill: "#6B7280", fontSize: 11 }} axisLine={{ stroke: "rgba(255,255,255,0.08)" }} />
              <Tooltip content={<CustomTooltip />} cursor={{ fill: "rgba(255,255,255,0.03)" }} />
              <Legend wrapperStyle={{ fontSize: 11, color: "#6B7280" }} />
              <Bar dataKey="Total" fill={COLORS.green} radius={[6, 6, 0, 0]} maxBarSize={50} />
              <Bar dataKey="MEP" fill={COLORS.violet} radius={[6, 6, 0, 0]} maxBarSize={50} />
              <Bar dataKey="En cours" fill={COLORS.orange} radius={[6, 6, 0, 0]} maxBarSize={50} />
              <Bar dataKey="Clos" fill={COLORS.indigo} radius={[6, 6, 0, 0]} maxBarSize={50} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Répartition par statut" icon={PieIcon} height={isMobile ? 260 : 320}>
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={chartData.pie}
                cx="50%" cy="50%"
                innerRadius={isMobile ? 50 : 65}
                outerRadius={isMobile ? 80 : 100}
                paddingAngle={3}
                dataKey="value"
              >
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

      {/* ── Ligne 2 : Area chart (stacked) + Line chart ── */}
      <div style={{
        display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr",
        gap: 14,
      }}>
        <ChartCard title="Évolution des statuts (empilé)" icon={Activity} height={isMobile ? 240 : 300}>
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={chartData.area} margin={{ top: 8, right: 10, left: -16, bottom: 0 }}>
              <defs>
                <linearGradient id="gOpen" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={COLORS.yellow} stopOpacity={0.5} />
                  <stop offset="100%" stopColor={COLORS.yellow} stopOpacity={0.05} />
                </linearGradient>
                <linearGradient id="gProgress" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={COLORS.orange} stopOpacity={0.5} />
                  <stop offset="100%" stopColor={COLORS.orange} stopOpacity={0.05} />
                </linearGradient>
                <linearGradient id="gClosed" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={COLORS.indigo} stopOpacity={0.5} />
                  <stop offset="100%" stopColor={COLORS.indigo} stopOpacity={0.05} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
              <XAxis dataKey="name" tick={{ fill: "#6B7280", fontSize: 11 }} axisLine={{ stroke: "rgba(255,255,255,0.08)" }} />
              <YAxis tick={{ fill: "#6B7280", fontSize: 11 }} axisLine={{ stroke: "rgba(255,255,255,0.08)" }} />
              <Tooltip content={<CustomTooltip />} />
              <Legend wrapperStyle={{ fontSize: 11, color: "#6B7280" }} />
              <Area type="monotone" dataKey="Ouverts" stackId="1" stroke={COLORS.yellow} fill="url(#gOpen)" strokeWidth={2} />
              <Area type="monotone" dataKey="En cours" stackId="1" stroke={COLORS.orange} fill="url(#gProgress)" strokeWidth={2} />
              <Area type="monotone" dataKey="Clos" stackId="1" stroke={COLORS.indigo} fill="url(#gClosed)" strokeWidth={2} />
            </AreaChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Évolution MEP vs autres" icon={TrendingUp} height={isMobile ? 240 : 300}>
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={mepComparison} margin={{ top: 8, right: 10, left: -16, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
              <XAxis dataKey="name" tick={{ fill: "#6B7280", fontSize: 11 }} axisLine={{ stroke: "rgba(255,255,255,0.08)" }} />
              <YAxis tick={{ fill: "#6B7280", fontSize: 11 }} axisLine={{ stroke: "rgba(255,255,255,0.08)" }} />
              <Tooltip content={<CustomTooltip />} />
              <Legend wrapperStyle={{ fontSize: 11, color: "#6B7280" }} />
              <Line type="monotone" dataKey="MEP" stroke={COLORS.violet} strokeWidth={3} dot={{ fill: COLORS.violet, r: 4 }} activeDot={{ r: 6 }} />
              <Line type="monotone" dataKey="Autres" stroke={COLORS.green} strokeWidth={3} dot={{ fill: COLORS.green, r: 4 }} activeDot={{ r: 6 }} />
            </LineChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>

      {/* ── Ligne 3 : Top services (bar horizontal) ── */}
      {topServices.length > 0 && (
        <ChartCard title="Top services par nombre d'interventions" icon={Award} height={isMobile ? 240 : 280}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={topServices} layout="vertical" margin={{ top: 4, right: 20, left: 10, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" horizontal={false} />
              <XAxis type="number" tick={{ fill: "#6B7280", fontSize: 11 }} axisLine={{ stroke: "rgba(255,255,255,0.08)" }} />
              <YAxis type="category" dataKey="name" tick={{ fill: "#9CA3AF", fontSize: 11 }} axisLine={{ stroke: "rgba(255,255,255,0.08)" }} width={120} />
              <Tooltip content={<CustomTooltip />} cursor={{ fill: "rgba(255,255,255,0.03)" }} />
              <Bar dataKey="value" name="Interventions" radius={[0, 6, 6, 0]} maxBarSize={28}>
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
