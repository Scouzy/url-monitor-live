import { useState } from "react";
import {
  RefreshCw, Bell, BellOff, Lock, Server, Zap, Play, Pause,
  CheckCircle, Github, Info, Database, GitBranch, Network,
  ClipboardList, Trash2, BarChart3, Globe, ShieldCheck,
} from "lucide-react";
import { saveCapacitySettings } from "../utils/capacitySettings";
import { clearSnapshots } from "../utils/snapshots";
import { loadWorkflows } from "../utils/workflowStorage";
import { loadImpacts } from "../utils/appImpactStorage";
import { loadTodos } from "../utils/todoStorage";

/* ── helpers UI ── */
const card = { background: "rgba(255,255,255,0.025)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 14, overflow: "hidden" };

function SectionHead({ icon, label, extra }) {
  return (
    <div style={{ padding: "12px 18px", borderBottom: "1px solid rgba(255,255,255,0.06)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <div style={{ opacity: 0.5 }}>{icon}</div>
        <span style={{ fontSize: 11, fontWeight: 700, color: "#9CA3AF", letterSpacing: "0.08em", textTransform: "uppercase" }}>{label}</span>
      </div>
      {extra}
    </div>
  );
}

function Row({ left, right }) {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 18px", borderBottom: "1px solid rgba(255,255,255,0.04)", gap: 16 }}>
      <div style={{ flex: 1 }}>{left}</div>
      <div style={{ flexShrink: 0 }}>{right}</div>
    </div>
  );
}

function LabelPair({ title, sub }) {
  return (
    <div>
      <div style={{ fontSize: 13, fontWeight: 600, color: "#E5E7EB", marginBottom: 2 }}>{title}</div>
      <div style={{ fontSize: 11, color: "#6B7280" }}>{sub}</div>
    </div>
  );
}

function StatCard({ icon, label, value, color = "#818CF8", sub }) {
  return (
    <div style={{ background: "rgba(255,255,255,0.025)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 12, padding: "14px 16px", display: "flex", alignItems: "center", gap: 12 }}>
      <div style={{ width: 36, height: 36, borderRadius: 10, background: `${color}18`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
        {icon}
      </div>
      <div>
        <div style={{ fontSize: 20, fontWeight: 800, color: "#F9FAFB", lineHeight: 1, fontFamily: "'JetBrains Mono', monospace" }}>{value}</div>
        <div style={{ fontSize: 11, color: "#6B7280", marginTop: 2 }}>{label}</div>
        {sub && <div style={{ fontSize: 9, color: "#374151", marginTop: 1 }}>{sub}</div>}
      </div>
    </div>
  );
}

function selStyle() {
  return { background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, color: "#E5E7EB", fontSize: 13, padding: "6px 12px", cursor: "pointer", fontFamily: "'JetBrains Mono', monospace" };
}

function lsSize(key) {
  try { const v = localStorage.getItem(key); return v ? `${(v.length / 1024).toFixed(1)} Ko` : "—"; } catch { return "—"; }
}

export default function SettingsPage({
  interval, setInterval_, countdown,
  paused, setPaused, runAllChecks,
  notifEnabled, setNotifEnabled,
  capacitySettings, setCapacitySettings,
  allUrls, incidentLog, setIncidentLog,
  allServers, onNavigate,
}) {
  const [confirmReset, setConfirmReset] = useState(false);

  const workflows = loadWorkflows();
  const impacts   = loadImpacts();
  const todos     = loadTodos();

  const todosByStatus = {
    pending:     todos.filter(t => t.status === "pending").length,
    in_progress: todos.filter(t => t.status === "in_progress").length,
    done:        todos.filter(t => t.status === "done").length,
  };
  const wfByStatus = {
    draft:    workflows.filter(w => w.status === "draft").length,
    active:   workflows.filter(w => w.status === "active").length,
    archived: workflows.filter(w => w.status === "archived").length,
  };

  const sslWarnings = allUrls
    .filter(u => u.sslInfo?.daysLeft != null && u.sslInfo.daysLeft <= 10)
    .sort((a, b) => a.sslInfo.daysLeft - b.sslInfo.daysLeft);

  const updCap = (key, val) => {
    const s = { ...capacitySettings, [key]: val };
    setCapacitySettings(s);
    saveCapacitySettings(s);
  };

  const resetAll = () => {
    ["url-monitor-groups", "url-monitor-groups-backup", "url-monitor-incidents",
      "capacity-settings", "capacity-todos", "capacity-snapshots",
      "capacity-servers", "url-monitor-workflows", "url-monitor-app-impacts",
    ].forEach(k => localStorage.removeItem(k));
    window.location.reload();
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>

      {/* ── Statistiques globales ── */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12 }}>
        <StatCard icon={<Globe size={16} color="#818CF8" />} label="URLs surveillées" value={allUrls.length} color="#818CF8"
          sub={`${allUrls.filter(u => u.isUp).length} en ligne`} />
        <StatCard icon={<Server size={16} color="#34D399" />} label="Serveurs importés" value={allServers.length} color="#34D399"
          sub={`${[...new Set(allServers.map(s => s.app).filter(Boolean))].length} application${[...new Set(allServers.map(s => s.app).filter(Boolean))].length > 1 ? "s" : ""}`} />
        <StatCard icon={<GitBranch size={16} color="#F472B6" />} label="Workflows" value={workflows.length} color="#F472B6"
          sub={`${wfByStatus.active} actif${wfByStatus.active > 1 ? "s" : ""}`} />
        <StatCard icon={<ClipboardList size={16} color="#FBBF24" />} label="Tâches actives" value={todosByStatus.pending + todosByStatus.in_progress} color="#FBBF24"
          sub={`${todosByStatus.done} terminée${todosByStatus.done > 1 ? "s" : ""}`} />
      </div>

      {/* ── 2 colonnes ── */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>

        {/* COL GAUCHE */}
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>

          {/* Vérification */}
          <div style={card}>
            <SectionHead icon={<RefreshCw size={14} />} label="Vérification" />
            <Row
              left={<LabelPair title="Intervalle" sub="Fréquence des checks automatiques" />}
              right={
                <select value={interval} onChange={e => { setInterval_(+e.target.value); }}
                  style={selStyle()}>
                  {[10, 15, 30, 60, 120, 300].map(v => (
                    <option key={v} value={v} style={{ background: "#1F2937" }}>
                      {v >= 60 ? `${v / 60}min` : `${v}s`}
                    </option>
                  ))}
                </select>
              }
            />
            <Row
              left={<LabelPair title="Surveillance" sub={paused ? "⏸ En pause" : `▶ Prochain check dans ${countdown}s`} />}
              right={
                <button onClick={() => setPaused(!paused)} style={{
                  display: "flex", alignItems: "center", gap: 6, padding: "6px 16px", borderRadius: 20,
                  background: paused ? "rgba(251,191,36,0.1)" : "rgba(52,211,153,0.1)",
                  border: `1px solid ${paused ? "rgba(251,191,36,0.3)" : "rgba(52,211,153,0.3)"}`,
                  color: paused ? "#FBBF24" : "#34D399", fontSize: 12, fontWeight: 700, cursor: "pointer",
                }}>
                  {paused ? <><Play size={13} /> Reprendre</> : <><Pause size={13} /> Pause</>}
                </button>
              }
            />
            <div style={{ padding: "8px 18px 12px" }}>
              <button onClick={runAllChecks} style={{ display: "flex", alignItems: "center", gap: 6, padding: "6px 16px", borderRadius: 20, background: "rgba(99,102,241,0.1)", border: "1px solid rgba(99,102,241,0.25)", color: "#A5B4FC", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
                <RefreshCw size={13} /> Vérifier tout maintenant
              </button>
            </div>
          </div>

          {/* Notifications */}
          <div style={card}>
            <SectionHead icon={<Bell size={14} />} label="Notifications" />
            <Row
              left={<LabelPair title="Notifications navigateur"
                sub={typeof Notification === "undefined" ? "Non supporté"
                  : Notification.permission === "denied" ? "🚫 Bloquées dans le navigateur"
                  : Notification.permission === "granted" ? "✅ Autorisées et actives"
                  : "Non encore demandées"} />}
              right={
                <button disabled={typeof Notification === "undefined" || Notification.permission === "denied"}
                  onClick={() => { if (Notification.permission !== "granted") Notification.requestPermission().then(p => setNotifEnabled(p === "granted")); }}
                  style={{ display: "flex", alignItems: "center", gap: 6, padding: "6px 16px", borderRadius: 20, background: notifEnabled ? "rgba(52,211,153,0.1)" : "rgba(255,255,255,0.05)", border: `1px solid ${notifEnabled ? "rgba(52,211,153,0.3)" : "rgba(255,255,255,0.12)"}`, color: notifEnabled ? "#34D399" : "#6B7280", fontSize: 12, fontWeight: 700, cursor: "pointer", opacity: typeof Notification === "undefined" || Notification.permission === "denied" ? 0.4 : 1 }}>
                  {notifEnabled ? <><Bell size={13} /> Activées</> : <><BellOff size={13} /> Activer</>}
                </button>
              }
            />
          </div>

          {/* Serveurs & Capacity */}
          <div style={card}>
            <SectionHead icon={<Server size={14} />} label="Serveurs & Capacity Planning" />
            {[["cpuThreshold", "Seuil CPU", "Alerte journal si dépassé"], ["ramThreshold", "Seuil RAM", "Alerte journal si dépassé"], ["diskThreshold", "Seuil Disque", "Alerte journal si dépassé"]].map(([key, title, sub]) => (
              <Row key={key}
                left={<LabelPair title={title} sub={sub} />}
                right={
                  <select value={capacitySettings[key]} onChange={e => updCap(key, +e.target.value)} style={selStyle()}>
                    {[70, 75, 80, 85, 90, 95].map(v => <option key={v} value={v} style={{ background: "#1F2937" }}>{v}%</option>)}
                  </select>
                }
              />
            ))}
            <div style={{ padding: "8px 18px 12px" }}>
              <button onClick={() => clearSnapshots()} style={{ display: "flex", alignItems: "center", gap: 6, padding: "6px 16px", borderRadius: 20, background: "rgba(248,113,113,0.08)", border: "1px solid rgba(248,113,113,0.25)", color: "#F87171", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
                <RefreshCw size={13} /> Réinitialiser les snapshots
              </button>
            </div>
          </div>
        </div>

        {/* COL DROITE */}
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>

          {/* SSL */}
          <div style={{ ...card, borderColor: sslWarnings.length > 0 ? "rgba(251,191,36,0.3)" : "rgba(255,255,255,0.07)" }}>
            <SectionHead icon={<Lock size={14} />} label={`Certificats SSL${sslWarnings.length > 0 ? ` — ${sslWarnings.length} en alerte` : ""}`} />
            {sslWarnings.length === 0 ? (
              <div style={{ padding: "16px 18px", display: "flex", alignItems: "center", gap: 8 }}>
                <CheckCircle size={14} color="#34D399" />
                <span style={{ fontSize: 12, color: "#6B7280" }}>Tous les certificats sont valides (&gt; 10 jours)</span>
              </div>
            ) : sslWarnings.slice(0, 5).map(u => {
              const d = u.sslInfo.daysLeft;
              const clr = d <= 3 ? "#F87171" : "#FBBF24";
              return (
                <div key={u.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 18px", borderBottom: "1px solid rgba(255,255,255,0.04)", background: d <= 3 ? "rgba(248,113,113,0.06)" : "rgba(251,191,36,0.04)" }}>
                  <Lock size={12} color={clr} style={{ flexShrink: 0 }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 12, fontWeight: 600, color: "#E5E7EB", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {(() => { try { return new URL(u.url).hostname; } catch { return u.url; } })()}
                    </div>
                    <div style={{ fontSize: 10, color: "#4B5563" }}>{u.sslInfo.issuer || "Émetteur inconnu"}</div>
                  </div>
                  <span style={{ fontSize: 11, fontWeight: 700, color: clr, padding: "2px 9px", borderRadius: 20, background: `${clr}18`, border: `1px solid ${clr}44`, flexShrink: 0 }}>
                    {d <= 0 ? "Expiré" : `${d}j`}
                  </span>
                </div>
              );
            })}
          </div>

          {/* TodoList */}
          <div style={card}>
            <SectionHead icon={<ClipboardList size={14} />} label="TodoList"
              extra={<button onClick={() => onNavigate?.("todo")} style={{ fontSize: 10, padding: "2px 9px", borderRadius: 6, background: "rgba(129,140,248,0.12)", border: "1px solid rgba(129,140,248,0.25)", color: "#818CF8", cursor: "pointer", fontWeight: 600 }}>Ouvrir →</button>} />
            <div style={{ padding: "12px 18px", display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
              {[["À faire", todosByStatus.pending, "#6B7280"], ["En cours", todosByStatus.in_progress, "#FBBF24"], ["Terminées", todosByStatus.done, "#34D399"]].map(([label, val, color]) => (
                <div key={label} style={{ textAlign: "center", padding: "10px 8px", background: `${color}10`, border: `1px solid ${color}25`, borderRadius: 10 }}>
                  <div style={{ fontSize: 22, fontWeight: 800, color, fontFamily: "monospace" }}>{val}</div>
                  <div style={{ fontSize: 10, color: "#6B7280", marginTop: 2 }}>{label}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Workflows */}
          <div style={card}>
            <SectionHead icon={<GitBranch size={14} />} label="Workflows"
              extra={<button onClick={() => onNavigate?.("workflows")} style={{ fontSize: 10, padding: "2px 9px", borderRadius: 6, background: "rgba(244,114,182,0.12)", border: "1px solid rgba(244,114,182,0.25)", color: "#F472B6", cursor: "pointer", fontWeight: 600 }}>Ouvrir →</button>} />
            <div style={{ padding: "12px 18px", display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
              {[["Brouillons", wfByStatus.draft, "#6B7280"], ["Actifs", wfByStatus.active, "#34D399"], ["Archivés", wfByStatus.archived, "#9CA3AF"]].map(([label, val, color]) => (
                <div key={label} style={{ textAlign: "center", padding: "10px 8px", background: `${color}10`, border: `1px solid ${color}25`, borderRadius: 10 }}>
                  <div style={{ fontSize: 22, fontWeight: 800, color, fontFamily: "monospace" }}>{val}</div>
                  <div style={{ fontSize: 10, color: "#6B7280", marginTop: 2 }}>{label}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Impacts applicatifs */}
          <div style={card}>
            <SectionHead icon={<Network size={14} />} label="Impacts Applicatifs"
              extra={<button onClick={() => onNavigate?.("impacts")} style={{ fontSize: 10, padding: "2px 9px", borderRadius: 6, background: "rgba(52,211,153,0.12)", border: "1px solid rgba(52,211,153,0.25)", color: "#34D399", cursor: "pointer", fontWeight: 600 }}>Ouvrir →</button>} />
            <div style={{ padding: "12px 18px", display: "flex", gap: 10 }}>
              <div style={{ flex: 1, textAlign: "center", padding: "10px 8px", background: "rgba(129,140,248,0.08)", border: "1px solid rgba(129,140,248,0.2)", borderRadius: 10 }}>
                <div style={{ fontSize: 22, fontWeight: 800, color: "#818CF8", fontFamily: "monospace" }}>
                  {[...new Set(allServers.map(s => s.app).filter(Boolean))].length}
                </div>
                <div style={{ fontSize: 10, color: "#6B7280", marginTop: 2 }}>Applications</div>
              </div>
              <div style={{ flex: 1, textAlign: "center", padding: "10px 8px", background: "rgba(251,191,36,0.08)", border: "1px solid rgba(251,191,36,0.2)", borderRadius: 10 }}>
                <div style={{ fontSize: 22, fontWeight: 800, color: "#FBBF24", fontFamily: "monospace" }}>
                  {impacts.dependencies.length}
                </div>
                <div style={{ fontSize: 10, color: "#6B7280", marginTop: 2 }}>Dépendances</div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ── Données & Stockage ── */}
      <div style={card}>
        <SectionHead icon={<Database size={14} />} label="Données & Stockage" />
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 0 }}>
          {[
            ["url-monitor-groups",      "Groupes & URLs",     "#818CF8"],
            ["url-monitor-incidents",   "Journal d'alertes",  "#F87171"],
            ["capacity-servers",        "Serveurs",           "#34D399"],
            ["capacity-todos",          "TodoList",           "#FBBF24"],
            ["url-monitor-workflows",   "Workflows",          "#F472B6"],
            ["url-monitor-app-impacts", "Impacts App.",       "#FB923C"],
          ].map(([key, label, color]) => (
            <div key={key} style={{ padding: "11px 18px", borderBottom: "1px solid rgba(255,255,255,0.04)", borderRight: "1px solid rgba(255,255,255,0.04)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <span style={{ fontSize: 12, color: "#9CA3AF" }}>{label}</span>
              <span style={{ fontSize: 11, fontFamily: "monospace", color, fontWeight: 700 }}>{lsSize(key)}</span>
            </div>
          ))}
        </div>
        <div style={{ padding: "12px 18px", display: "flex", gap: 10, flexWrap: "wrap" }}>
          <div style={{ fontSize: 12, color: "#4B5563", alignSelf: "center", flex: 1 }}>
            {allUrls.reduce((s, u) => s + (u.history?.length || 0), 0)} points historique · {incidentLog.length}/200 événements
          </div>
          <button onClick={() => { setIncidentLog([]); localStorage.removeItem("url-monitor-incidents"); }} style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 11, padding: "5px 13px", borderRadius: 20, background: "rgba(248,113,113,0.08)", border: "1px solid rgba(248,113,113,0.25)", color: "#F87171", cursor: "pointer", fontWeight: 600 }}>
            <Trash2 size={11} /> Vider le journal
          </button>
          {!confirmReset ? (
            <button onClick={() => setConfirmReset(true)} style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 11, padding: "5px 13px", borderRadius: 20, background: "rgba(248,113,113,0.06)", border: "1px solid rgba(248,113,113,0.18)", color: "#9CA3AF", cursor: "pointer", fontWeight: 600 }}>
              <Zap size={11} /> Réinitialiser tout
            </button>
          ) : (
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <span style={{ fontSize: 11, color: "#F87171", fontWeight: 600 }}>Confirmer la suppression totale ?</span>
              <button onClick={resetAll} style={{ fontSize: 11, padding: "4px 12px", borderRadius: 20, background: "#F87171", border: "none", color: "#fff", cursor: "pointer", fontWeight: 700 }}>Oui, tout effacer</button>
              <button onClick={() => setConfirmReset(false)} style={{ fontSize: 11, padding: "4px 10px", borderRadius: 20, background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", color: "#6B7280", cursor: "pointer" }}>Annuler</button>
            </div>
          )}
        </div>
      </div>

      {/* ── À propos ── */}
      <div style={card}>
        <SectionHead icon={<Info size={14} />} label="À propos" />
        <div style={{ padding: "16px 18px", display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 16 }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <div style={{ fontSize: 15, fontWeight: 700, color: "#F9FAFB" }}>G1Oeil <span style={{ fontSize: 11, color: "#818CF8", fontWeight: 600, padding: "1px 7px", borderRadius: 6, background: "rgba(129,140,248,0.12)", border: "1px solid rgba(129,140,248,0.25)" }}>v2.0</span></div>
            <div style={{ fontSize: 11, color: "#4B5563" }}>Application de surveillance d'URLs, serveurs et capacity planning</div>
            <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginTop: 4 }}>
              {[["React 18", "#61DAFB"], ["Vite 5", "#646CFF"], ["Recharts", "#22D3EE"], ["SheetJS", "#34D399"], ["Lucide", "#F472B6"]].map(([t, c]) => (
                <span key={t} style={{ fontSize: 10, color: c, padding: "1px 7px", borderRadius: 5, background: `${c}12`, border: `1px solid ${c}30` }}>{t}</span>
              ))}
            </div>
          </div>
          <a href="https://github.com/Scouzy/url-monitor-live" target="_blank" rel="noopener noreferrer"
            style={{ display: "flex", alignItems: "center", gap: 7, padding: "8px 18px", borderRadius: 20, background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.12)", color: "#9CA3AF", fontSize: 12, fontWeight: 600, textDecoration: "none", transition: "color 0.15s" }}
            onMouseEnter={e => e.currentTarget.style.color = "#F3F4F6"}
            onMouseLeave={e => e.currentTarget.style.color = "#9CA3AF"}>
            <Github size={15} /> Scouzy/url-monitor-live
          </a>
        </div>
        <div style={{ padding: "0 18px 14px", fontSize: 10, color: "#374151" }}>
          Données persistantes dans localStorage · Port 5173 · {new Date().getFullYear()}
        </div>
      </div>
    </div>
  );
}
