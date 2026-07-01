import { useState, useMemo, useSyncExternalStore } from "react";
import {
  Cpu, MemoryStick, HardDrive, TrendingUp, AlertTriangle,
  Layers, Eye, Flame, Trophy, Lightbulb, AppWindow,
  X, CheckCircle, ClipboardList, GitBranch, Network,
} from "lucide-react";
import {
  ResponsiveContainer, ComposedChart, Line, XAxis, YAxis, Tooltip,
  CartesianGrid, ReferenceLine, Area,
} from "recharts";
import { getServers, subscribeServers, fleetTrend, distribution, topConsumers, recommendations, gaugeColor, ROLES } from "../utils/servers";
import { loadSnapshots } from "../utils/snapshots";
import { ServerDetail } from "./ServersView";
import { loadImpacts } from "../utils/appImpactStorage";
import { makeTodo, loadTodos, saveTodos } from "../utils/todoStorage";
import { makeWorkflow, makeStep, loadWorkflows, saveWorkflows } from "../utils/workflowStorage";

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

/* ── Étapes workflow d'incident capacité (8 étapes) ── */
const CAPACITY_WF_STEPS = [
  { title: "Vérifier les métriques",               type: "check",    responsible: "IT",               duration: "10min", description: "Confirmer les valeurs CPU/RAM/Disque en cours sur le serveur concerné" },
  { title: "Identifier les applications impactées", type: "check",    responsible: "IT / Chef projet",  duration: "15min", description: "Lister toutes les applis hébergées sur ce serveur et évaluer l'impact métier" },
  { title: "Notifier les équipes",                 type: "notify",   responsible: "Chef de projet",    duration: "5min",  description: "Informer les équipes métier et IT de la situation de saturation" },
  { title: "Analyser la cause racine",             type: "action",   responsible: "IT",               duration: "20min", description: "Identifier le processus ou la tendance à l'origine de la saturation" },
  { title: "Définir le plan de remédiation",       type: "approval", responsible: "IT / DSSI",         duration: "30min", description: "Choisir l'action corrective : nettoyage, extension RAM/Disk, migration de charge ou upgrade planifié" },
  { title: "Mettre en œuvre la remédiation",       type: "script",   responsible: "IT",               duration: "1h",    description: "Exécuter l'action corrective validée" },
  { title: "Vérifier post-action",                 type: "check",    responsible: "IT",               duration: "15min", description: "Confirmer que les métriques sont revenues à un niveau acceptable (< 75%)" },
  { title: "Documenter l'incident",                type: "action",   responsible: "IT",               duration: "10min", description: "Rédiger le compte-rendu, les actions et les leçons apprises" },
];

/* ── Modal Plan d'action ── */
function PlanActionModal({ reco, servers, onClose }) {
  const [done, setDone] = useState({ todo: false, wf: false });
  const sm = SEVERITY_META[reco.severity];
  const prio = reco.severity === "critical" || reco.severity === "high" ? "high" : "medium";

  const wfName = `Incident capacité – ${reco.server || "Flotte"} (${sm.label})`;
  const [existingWf] = useState(() => loadWorkflows().find(wf => wf.name === wfName) || null);

  const server = reco.server ? servers.find(s => s.name === reco.server) : null;
  const directApp = server?.app || null;

  const impactedApps = useMemo(() => {
    const result = new Set();
    if (directApp) result.add(directApp);
    try {
      const { dependencies } = loadImpacts();
      if (directApp) {
        dependencies.filter(d => d.to === directApp && d.type === "depends_on").forEach(d => result.add(d.from));
      }
    } catch {}
    return [...result];
  }, [directApp]);

  const createTodo = () => {
    const todos = loadTodos();
    const t = makeTodo({ title: `Incident capacité – ${reco.server || "Flotte"}`, description: reco.text, type: "capacity", priority: prio, source: "Capacity Planning" });
    saveTodos([...todos, t]);
    setDone(d => ({ ...d, todo: true }));
  };

  const activateWorkflow = () => {
    const next = loadWorkflows().map(wf =>
      wf.id === existingWf.id ? { ...wf, status: "active", updatedAt: new Date().toISOString() } : wf
    );
    saveWorkflows(next);
    setDone(d => ({ ...d, wf: true }));
  };

  const createWorkflow = () => {
    const wfs = loadWorkflows();
    const steps = CAPACITY_WF_STEPS.map(s => makeStep(s));
    const wf = makeWorkflow({ name: wfName, description: reco.text, wfType: "generic", steps });
    saveWorkflows([...wfs, wf]);
    setDone(d => ({ ...d, wf: true }));
  };

  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.88)", zIndex: 2000, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
      <div onClick={e => e.stopPropagation()} style={{ background: "#0D1117", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 16, width: "100%", maxWidth: 520, boxShadow: "0 32px 64px rgba(0,0,0,0.9)" }}>
        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "16px 20px", borderBottom: "1px solid rgba(255,255,255,0.07)" }}>
          <sm.Icon size={15} color={sm.color} />
          <span style={{ fontSize: 14, fontWeight: 700, color: "#F3F4F6", flex: 1 }}>Plan d'action</span>
          <span style={{ fontSize: 9, fontWeight: 700, padding: "2px 9px", borderRadius: 10, background: sm.bg, color: sm.color, border: `1px solid ${sm.border}`, textTransform: "uppercase", letterSpacing: "0.05em" }}>{sm.label}</span>
          <button onClick={onClose} style={{ background: "none", border: "none", color: "#4B5563", cursor: "pointer", display: "flex", padding: 4 }}><X size={14} /></button>
        </div>
        <div style={{ padding: "16px 20px", display: "flex", flexDirection: "column", gap: 14 }}>
          {/* Alerte */}
          <div style={{ background: sm.bg, border: `1px solid ${sm.border}`, borderRadius: 10, padding: "10px 14px", fontSize: 12, color: "#D1D5DB", lineHeight: 1.6 }}>
            {reco.text}
          </div>
          {/* Applications impactées */}
          <div>
            <div style={{ fontSize: 10, fontWeight: 700, color: "#6B7280", textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 8, display: "flex", alignItems: "center", gap: 5 }}>
              <Network size={10} /> Applications impactées
            </div>
            {impactedApps.length > 0 ? (
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                {impactedApps.map(app => (
                  <span key={app} style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 11, fontWeight: 600, padding: "4px 10px", borderRadius: 10, background: "rgba(167,139,250,0.12)", color: "#A78BFA", border: "1px solid rgba(167,139,250,0.3)" }}>
                    <AppWindow size={10} /> {app}
                  </span>
                ))}
              </div>
            ) : (
              <div style={{ fontSize: 11, color: "#374151", fontStyle: "italic" }}>Aucune application associée — vérifiez la colonne &laquo;&nbsp;Application&nbsp;&raquo; dans l'import serveurs</div>
            )}
          </div>
          {/* Actions */}
          <div>
            <div style={{ fontSize: 10, fontWeight: 700, color: "#6B7280", textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 8 }}>Actions rapides</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <button onClick={createTodo} disabled={done.todo} style={{
                display: "flex", alignItems: "center", gap: 10, padding: "10px 14px", borderRadius: 10,
                cursor: done.todo ? "default" : "pointer",
                background: done.todo ? "rgba(52,211,153,0.08)" : "rgba(251,146,60,0.08)",
                border: `1px solid ${done.todo ? "rgba(52,211,153,0.3)" : "rgba(251,146,60,0.3)"}`,
                color: done.todo ? "#34D399" : "#FB923C", fontSize: 12, fontWeight: 600,
              }}>
                {done.todo ? <CheckCircle size={14} /> : <ClipboardList size={14} />}
                <div style={{ flex: 1, textAlign: "left" }}>
                  <div>{done.todo ? "Tâche créée ✓" : "Créer une tâche dans la TodoList"}</div>
                  {!done.todo && <div style={{ fontSize: 10, opacity: 0.7, fontWeight: 400, marginTop: 1 }}>Priorité {prio === "high" ? "haute" : "moyenne"} · type Capacité</div>}
                </div>
              </button>
              {existingWf ? (
                <button onClick={done.wf ? undefined : activateWorkflow} disabled={done.wf} style={{
                  display: "flex", alignItems: "center", gap: 10, padding: "10px 14px", borderRadius: 10,
                  cursor: done.wf ? "default" : "pointer",
                  background: done.wf ? "rgba(52,211,153,0.08)" : "rgba(251,191,36,0.08)",
                  border: `1px solid ${done.wf ? "rgba(52,211,153,0.3)" : "rgba(251,191,36,0.3)"}`,
                  color: done.wf ? "#34D399" : "#FBBF24", fontSize: 12, fontWeight: 600,
                }}>
                  {done.wf ? <CheckCircle size={14} /> : <GitBranch size={14} />}
                  <div style={{ flex: 1, textAlign: "left", minWidth: 0 }}>
                    <div>{done.wf ? "Workflow activé ✓" : "Activer le workflow existant"}</div>
                    {!done.wf && <div style={{ fontSize: 10, opacity: 0.7, fontWeight: 400, marginTop: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{existingWf.name}</div>}
                  </div>
                </button>
              ) : (
                <button onClick={done.wf ? undefined : createWorkflow} disabled={done.wf} style={{
                  display: "flex", alignItems: "center", gap: 10, padding: "10px 14px", borderRadius: 10,
                  cursor: done.wf ? "default" : "pointer",
                  background: done.wf ? "rgba(52,211,153,0.08)" : "rgba(99,102,241,0.08)",
                  border: `1px solid ${done.wf ? "rgba(52,211,153,0.3)" : "rgba(99,102,241,0.3)"}`,
                  color: done.wf ? "#34D399" : "#818CF8", fontSize: 12, fontWeight: 600,
                }}>
                  {done.wf ? <CheckCircle size={14} /> : <GitBranch size={14} />}
                  <div style={{ flex: 1, textAlign: "left" }}>
                    <div>{done.wf ? "Workflow généré ✓" : "Générer un Workflow d'intervention"}</div>
                    {!done.wf && <div style={{ fontSize: 10, opacity: 0.7, fontWeight: 400, marginTop: 1 }}>8 étapes · vérification → remédiation → documentation</div>}
                  </div>
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function CapacityPlanning() {
  const servers = useSyncExternalStore(subscribeServers, getServers);
  const snapshots = useMemo(() => loadSnapshots(), [servers]);
  const [metric, setMetric] = useState("cpu");
  const [selectedServer, setSelectedServer] = useState(null);
  const [actionReco, setActionReco] = useState(null);
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
                  <button onClick={() => setActionReco(r)} style={{
                    display: "flex", alignItems: "center", gap: 5, padding: "4px 10px", borderRadius: 8, cursor: "pointer",
                    background: "rgba(99,102,241,0.1)", border: "1px solid rgba(99,102,241,0.3)",
                    color: "#818CF8", fontSize: 10, fontWeight: 600, flexShrink: 0, whiteSpace: "nowrap",
                  }}>
                    <ClipboardList size={10} /> Plan d'action
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>
      {/* ── Modal Plan d'action ── */}
      {actionReco && <PlanActionModal reco={actionReco} servers={servers} onClose={() => setActionReco(null)} />}

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
