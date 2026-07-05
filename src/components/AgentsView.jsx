import { useState, useSyncExternalStore, useCallback } from "react";
import {
  Activity, Cpu, MemoryStick, HardDrive, Wifi, RefreshCw,
  ChevronDown, ChevronRight, FolderOpen, AlertTriangle,
  CheckCircle, Clock, Monitor, Server, Network,
} from "lucide-react";
import {
  loadVpsAgents, fetchVpsMetrics, subscribeAgents,
  getAllAgentMetrics, setAgentMetrics, setAgentError,
} from "../utils/vpsAgents";
import { patchServerMetrics } from "../utils/servers";

/* ── helpers ─────────────────────────────────────────────────────────────── */

function gaugeColor(v) {
  if (v >= 90) return "#F87171";
  if (v >= 75) return "#FB923C";
  if (v >= 50) return "#FBBF24";
  return "#34D399";
}

function Gauge({ value = 0, label, size = 52 }) {
  const r    = (size - 8) / 2;
  const circ = 2 * Math.PI * r;
  const fill = circ * (1 - Math.min(value, 100) / 100);
  const clr  = gaugeColor(value);
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
      <svg width={size} height={size} style={{ transform: "rotate(-90deg)" }}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth={6} />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={clr} strokeWidth={6}
          strokeDasharray={circ} strokeDashoffset={fill} strokeLinecap="round"
          style={{ transition: "stroke-dashoffset 0.6s ease" }} />
      </svg>
      <div style={{ marginTop: -size - 2, height: size, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", pointerEvents: "none" }}>
        <span style={{ fontSize: 12, fontWeight: 800, color: clr, fontFamily: "monospace" }}>{value}%</span>
      </div>
      <span style={{ fontSize: 9, color: "#6B7280", textTransform: "uppercase", letterSpacing: "0.06em" }}>{label}</span>
    </div>
  );
}

function MiniBar({ value = 0, label, detail }) {
  const clr = gaugeColor(value);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
        <span style={{ fontSize: 10, color: "#6B7280" }}>{label}</span>
        <span style={{ fontSize: 11, fontWeight: 700, color: clr, fontFamily: "monospace" }}>{value}%</span>
      </div>
      <div style={{ height: 4, borderRadius: 2, background: "rgba(255,255,255,0.06)", overflow: "hidden" }}>
        <div style={{ height: "100%", width: `${Math.min(value, 100)}%`, background: clr, borderRadius: 2, transition: "width 0.5s ease" }} />
      </div>
      {detail && <span style={{ fontSize: 9, color: "#374151" }}>{detail}</span>}
    </div>
  );
}

function RelTime({ ts }) {
  if (!ts) return <span style={{ color: "#374151" }}>—</span>;
  const diff = Math.floor((Date.now() - ts) / 1000);
  const txt  = diff < 60 ? `il y a ${diff}s` : diff < 3600 ? `il y a ${Math.floor(diff / 60)}min` : `il y a ${Math.floor(diff / 3600)}h`;
  return <span style={{ color: "#6B7280", fontSize: 10 }}>{txt}</span>;
}

/* ── Carte agent ─────────────────────────────────────────────────────────── */

function AgentCard({ agent, entry, onRefresh, refreshing }) {
  const [open, setOpen] = useState(false);
  const data   = entry?.data;
  const status = entry?.status || "unknown";
  const lastSeen = entry?.lastSeen;

  const dotColor = status === "ok" ? "#34D399" : status === "error" ? "#F87171" : "#4B5563";
  const dotGlow  = status === "ok"  ? "0 0 6px #34D399" : status === "error" ? "0 0 6px #F87171" : "none";

  return (
    <div style={{ background: "#0D1117", border: `1px solid ${status === "error" ? "rgba(248,113,113,0.25)" : status === "ok" ? "rgba(52,211,153,0.15)" : "rgba(255,255,255,0.07)"}`, borderRadius: 14, overflow: "hidden" }}>

      {/* En-tête */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "14px 16px", cursor: "pointer" }}
        onClick={() => setOpen(o => !o)}>
        <div style={{ width: 10, height: 10, borderRadius: "50%", background: dotColor, boxShadow: dotGlow, flexShrink: 0 }} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: 14, fontWeight: 700, color: "#F3F4F6" }}>{agent.name}</span>
            {data?.agentType && (
              <span style={{ fontSize: 9, fontWeight: 700, padding: "1px 7px", borderRadius: 8,
                background: data.agentType === "windows" ? "rgba(59,130,246,0.15)" : "rgba(52,211,153,0.1)",
                color: data.agentType === "windows" ? "#60A5FA" : "#34D399",
                border: `1px solid ${data.agentType === "windows" ? "rgba(59,130,246,0.3)" : "rgba(52,211,153,0.25)"}`,
                textTransform: "uppercase" }}>
                {data.agentType === "windows" ? "Windows" : "Linux"}
              </span>
            )}
            {data?.os?.name && (
              <span style={{ fontSize: 9, color: "#4B5563", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{data.os.name}</span>
            )}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 2 }}>
            <span style={{ fontSize: 10, color: "#374151", fontFamily: "monospace" }}>{agent.url}</span>
            <span style={{ color: "#1F2937" }}>·</span>
            <RelTime ts={lastSeen} />
          </div>
          {status === "error" && entry?.error && (
            <div style={{ fontSize: 10, color: "#F87171", marginTop: 3 }}>⚠ {entry.error}</div>
          )}
        </div>

        {/* Jauges rapides */}
        {data && (
          <div style={{ display: "flex", gap: 16, flexShrink: 0 }}>
            <Gauge value={data.cpu  ?? 0} label="CPU" />
            <Gauge value={data.ram  ?? 0} label="RAM" />
            <Gauge value={data.disk ?? 0} label="Disk" />
          </div>
        )}

        {/* Boutons */}
        <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
          <button onClick={e => { e.stopPropagation(); onRefresh(agent); }} disabled={refreshing}
            style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 10, padding: "4px 10px", borderRadius: 7,
              background: "rgba(99,102,241,0.1)", border: "1px solid rgba(99,102,241,0.25)",
              color: "#818CF8", cursor: "pointer", opacity: refreshing ? 0.5 : 1 }}>
            <RefreshCw size={10} style={{ animation: refreshing ? "spin 1s linear infinite" : "none" }} />
            {refreshing ? "…" : "Rafraîchir"}
          </button>
          {open ? <ChevronDown size={14} color="#4B5563" /> : <ChevronRight size={14} color="#4B5563" />}
        </div>
      </div>

      {/* Détails dépliables */}
      {open && data && (
        <div style={{ borderTop: "1px solid rgba(255,255,255,0.05)", padding: "16px", display: "flex", flexDirection: "column", gap: 16 }}>

          {/* Infos système */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 10 }}>
            {[
              ["Hostname",  data.hostname,               "#818CF8"],
              ["CPU Cores", data.cpuCores,               "#34D399"],
              ["Uptime",    `${data.uptimeDays} j`,      "#FBBF24"],
              ["Load avg",  data.agentType === "linux" ? `${data.load1} / ${data.load5}` : "N/A (Windows)", "#FB923C"],
            ].map(([label, val, color]) => (
              <div key={label} style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.05)", borderRadius: 10, padding: "10px 12px" }}>
                <div style={{ fontSize: 9, color: "#4B5563", textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 4 }}>{label}</div>
                <div style={{ fontSize: 13, fontWeight: 700, color, fontFamily: "monospace" }}>{val ?? "—"}</div>
              </div>
            ))}
          </div>

          {/* RAM détail */}
          {data.ram_detail && (
            <div>
              <SectionLabel icon={<MemoryStick size={11} />} label="Mémoire" />
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginTop: 8 }}>
                <MiniBar value={data.ram_detail.percent} label="RAM" detail={`${data.ram_detail.usedGb} Go / ${data.ram_detail.totalGb} Go`} />
                {data.ram_detail.swapTotalGb > 0 && (
                  <MiniBar value={data.ram_detail.swapPercent} label="Swap" detail={`${data.ram_detail.swapUsedGb} Go / ${data.ram_detail.swapTotalGb} Go`} />
                )}
              </div>
            </div>
          )}

          {/* Disques / Partitions */}
          {data.disks?.length > 0 && (
            <div>
              <SectionLabel icon={<HardDrive size={11} />} label="Disques & Partitions" />
              <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 8 }}>
                {data.disks.map((d, i) => (
                  <div key={i} style={{ display: "flex", alignItems: "center", gap: 12 }}>
                    <span style={{ fontSize: 11, fontFamily: "monospace", color: "#9CA3AF", minWidth: 90, flexShrink: 0 }}>{d.mount}</span>
                    <div style={{ flex: 1 }}>
                      <MiniBar value={d.percent} label={d.fstype || ""} detail={`${d.usedGb} Go / ${d.totalGb} Go`} />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Réseau */}
          {data.network && Object.keys(data.network).length > 0 && (
            <div>
              <SectionLabel icon={<Network size={11} />} label="Réseau" />
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 8 }}>
                {Object.entries(data.network).map(([iface, n]) => (
                  <div key={iface} style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 10, padding: "8px 12px", minWidth: 160 }}>
                    <div style={{ fontSize: 10, fontWeight: 700, color: "#818CF8", marginBottom: 4 }}>{iface}</div>
                    <div style={{ fontSize: 10, color: "#6B7280" }}>
                      ↓&nbsp;<span style={{ color: "#34D399", fontWeight: 700 }}>{n.rxKbps} KB/s</span>
                      &nbsp;↑&nbsp;<span style={{ color: "#FBBF24", fontWeight: 700 }}>{n.txKbps} KB/s</span>
                    </div>
                    <div style={{ fontSize: 9, color: "#374151", marginTop: 2 }}>
                      Total ↓ {n.rxTotalMb} Mo · ↑ {n.txTotalMb} Mo
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Top processus */}
          {data.processes?.length > 0 && (
            <div>
              <SectionLabel icon={<Cpu size={11} />} label="Top processus (RAM)" />
              <div style={{ display: "flex", flexDirection: "column", gap: 4, marginTop: 8 }}>
                {data.processes.map((p, i) => (
                  <div key={i} style={{ display: "flex", alignItems: "center", gap: 10, padding: "6px 10px", background: "rgba(255,255,255,0.02)", borderRadius: 8 }}>
                    <span style={{ fontSize: 10, color: "#374151", minWidth: 30, fontFamily: "monospace" }}>{p.pid}</span>
                    <span style={{ flex: 1, fontSize: 11, color: "#D1D5DB", fontFamily: "monospace", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.name}</span>
                    <span style={{ fontSize: 11, fontWeight: 700, color: "#FBBF24", fontFamily: "monospace" }}>{p.memMb} Mo</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Taille des répertoires */}
          {data.directories?.length > 0 && (
            <div>
              <SectionLabel icon={<FolderOpen size={11} />} label="Répertoires — sous-dossiers les plus volumineux" />
              <div style={{ display: "flex", flexDirection: "column", gap: 14, marginTop: 8 }}>
                {data.directories.map((d, i) => {
                  /* Nouveau format { path, label, top: [{path, sizeMb, sizeGb}] } */
                  const hasTop = Array.isArray(d.top) && d.top.length > 0;
                  const maxMb  = hasTop ? (d.top[0].sizeMb || 1) : 1;
                  const BAR_COLORS = ["#F87171","#FB923C","#FBBF24","#34D399","#818CF8","#60A5FA","#A78BFA","#F472B6","#6EE7B7","#93C5FD"];
                  return (
                    <div key={i} style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.05)", borderRadius: 10, padding: "10px 14px" }}>
                      <div style={{ fontSize: 10, fontWeight: 700, color: "#818CF8", fontFamily: "monospace", marginBottom: 8, display: "flex", alignItems: "center", gap: 5 }}>
                        <FolderOpen size={10} /> {d.label || d.path}
                      </div>
                      {hasTop ? (
                        <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                          {d.top.map((sub, j) => {
                            const name = sub.path.split(/[/\\]/).filter(Boolean).pop() || sub.path;
                            const pct  = Math.max(2, (sub.sizeMb / maxMb) * 100);
                            const col  = BAR_COLORS[j % BAR_COLORS.length];
                            const size = sub.sizeGb >= 1 ? `${sub.sizeGb} Go` : `${sub.sizeMb} Mo`;
                            return (
                              <div key={j} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                                <span style={{ width: 150, fontSize: 10, color: "#9CA3AF", fontFamily: "monospace", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flexShrink: 0 }} title={sub.path}>
                                  {name}
                                </span>
                                <div style={{ flex: 1, height: 10, background: "rgba(255,255,255,0.04)", borderRadius: 3, overflow: "hidden" }}>
                                  <div style={{ width: `${pct}%`, height: "100%", background: col, borderRadius: 3, transition: "width 0.5s" }} />
                                </div>
                                <span style={{ width: 72, fontSize: 10, fontWeight: 700, color: col, fontFamily: "monospace", textAlign: "right", flexShrink: 0 }}>{size}</span>
                              </div>
                            );
                          })}
                        </div>
                      ) : (
                        /* Ancien format flat (compat.) */
                        <div style={{ fontSize: 13, fontWeight: 800, color: "#F3F4F6", fontFamily: "monospace" }}>
                          {d.sizeGb >= 1 ? `${d.sizeGb} Go` : `${d.sizeMb} Mo`}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function SectionLabel({ icon, label }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 10, fontWeight: 700, color: "#4B5563", textTransform: "uppercase", letterSpacing: "0.08em" }}>
      {icon} {label}
    </div>
  );
}

/* ── Vue principale ──────────────────────────────────────────────────────── */

export default function AgentsView() {
  const agentsMeta  = useSyncExternalStore(subscribeAgents, getAllAgentMetrics);
  const [agents, setAgents]     = useState(() => loadVpsAgents());
  const [refreshing, setRefreshing] = useState({});   // { agentId: bool }
  const [globalRefresh, setGlobalRefresh] = useState(false);

  /* Recharger la liste si on revient sur l'onglet */
  const reloadAgents = useCallback(() => setAgents(loadVpsAgents()), []);

  const refreshOne = useCallback(async (agent) => {
    setRefreshing(r => ({ ...r, [agent.id]: true }));
    try {
      const m = await fetchVpsMetrics(agent.url);
      setAgentMetrics(agent.id, m, "ok");
      patchServerMetrics(agent.name, { ...m, env: agent.env, app: agent.app, role: agent.role });
    } catch (e) {
      setAgentError(agent.id, e.message || "Injoignable");
    } finally {
      setRefreshing(r => ({ ...r, [agent.id]: false }));
    }
  }, []);

  const refreshAll = useCallback(async () => {
    setGlobalRefresh(true);
    for (const agent of agents.filter(a => a.enabled)) await refreshOne(agent);
    setGlobalRefresh(false);
  }, [agents, refreshOne]);

  const okCount  = agents.filter(a => agentsMeta[a.id]?.status === "ok").length;
  const errCount = agents.filter(a => agentsMeta[a.id]?.status === "error").length;

  if (agents.length === 0) {
    return (
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 60, gap: 16, textAlign: "center" }}>
        <Activity size={40} color="#374151" />
        <div style={{ fontSize: 16, fontWeight: 700, color: "#4B5563" }}>Aucun agent configuré</div>
        <div style={{ fontSize: 13, color: "#374151", maxWidth: 420 }}>
          Déployez <code style={{ color: "#818CF8" }}>vps-agent-linux.py</code> ou <code style={{ color: "#60A5FA" }}>vps-agent-windows.py</code> sur chaque serveur,
          puis configurez les agents dans <strong style={{ color: "#6B7280" }}>Paramètres → Agents VPS</strong>.
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>

      {/* Barre de statut globale */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <div style={{ display: "flex", gap: 10, flex: 1 }}>
          {[
            { label: "Total",       val: agents.length,  color: "#818CF8" },
            { label: "En ligne",    val: okCount,        color: "#34D399" },
            { label: "Hors ligne",  val: errCount,       color: "#F87171" },
            { label: "Non sondés",  val: agents.length - okCount - errCount, color: "#4B5563" },
          ].map(({ label, val, color }) => (
            <div key={label} style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 10, padding: "8px 14px", textAlign: "center", minWidth: 72 }}>
              <div style={{ fontSize: 20, fontWeight: 800, color, fontFamily: "monospace" }}>{val}</div>
              <div style={{ fontSize: 9, color: "#4B5563", marginTop: 2 }}>{label}</div>
            </div>
          ))}
        </div>
        <button onClick={refreshAll} disabled={globalRefresh}
          style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 18px", borderRadius: 10,
            background: "rgba(52,211,153,0.1)", border: "1px solid rgba(52,211,153,0.25)",
            color: "#34D399", fontSize: 12, fontWeight: 700, cursor: "pointer", opacity: globalRefresh ? 0.6 : 1 }}>
          <RefreshCw size={13} style={{ animation: globalRefresh ? "spin 1s linear infinite" : "none" }} />
          Rafraîchir tout
        </button>
      </div>

      {/* Cartes agents */}
      {agents.map(agent => (
        <AgentCard
          key={agent.id}
          agent={agent}
          entry={agentsMeta[agent.id]}
          onRefresh={refreshOne}
          refreshing={!!refreshing[agent.id]}
        />
      ))}

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
}
