import { useState, useMemo, useSyncExternalStore, useRef, useLayoutEffect, useCallback, useEffect } from "react";
import { Network, Plus, Trash2, ChevronDown, ChevronRight, Server, ArrowRight, X, FileText, AlertTriangle, Rocket, ExternalLink } from "lucide-react";
import { getServers, subscribeServers } from "../utils/servers";
import { loadImpacts, saveImpacts } from "../utils/appImpactStorage";
import { loadLog } from "./IncidentLog";

const DEP_TYPES = {
  depends_on: { label: "Dépend de",     color: "#F87171" },
  hosts:      { label: "Héberge",        color: "#34D399" },
  shared:     { label: "Partagé avec",   color: "#FBBF24" },
  calls:      { label: "Appelle l'API",  color: "#818CF8" },
  feeds:      { label: "Alimente",       color: "#FB923C" },
};

function avgMetric(servers, key) {
  const vals = servers.map(s => s[key]).filter(v => v != null);
  return vals.length ? Math.round(vals.reduce((a, b) => a + b, 0) / vals.length) : null;
}

function healthColor(pct) {
  if (pct == null) return "#4B5563";
  if (pct >= 90)   return "#F87171";
  if (pct >= 75)   return "#FBBF24";
  return "#34D399";
}

function MiniBar({ value, color }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
      <div style={{ flex: 1, height: 4, borderRadius: 2, background: "rgba(255,255,255,0.06)" }}>
        <div style={{ width: `${value ?? 0}%`, height: "100%", borderRadius: 2, background: color }} />
      </div>
      <span style={{ fontSize: 9, color, fontFamily: "monospace", minWidth: 28 }}>{value ?? "—"}%</span>
    </div>
  );
}

/* ── Panneau de détail Application ── */
function AppDetailPanel({ app, meta = {}, allDeps, incidentLog, onClose, onSaveMeta }) {
  const [m, setM] = useState({
    dat: "", dex: "", dit: "",
    description: "", resume: "",
    prochaineMeP: "", derniereMeP: "",
    ...meta,
  });
  const upd = (k, v) => { const next = { ...m, [k]: v }; setM(next); onSaveMeta(next); };

  const cpuC  = healthColor(app.cpuAvg);
  const ramC  = healthColor(app.ramAvg);
  const appDeps = allDeps.filter(d => d.from === app.name || d.to === app.name);
  const serverNames = new Set(app.servers.map(s => s.name));
  const serverAlerts = incidentLog
    .filter(e => serverNames.has(e.serverName) || serverNames.has(e.url))
    .sort((a, b) => b.ts - a.ts)
    .slice(0, 20);

  const fi = (extra = {}) => ({
    background: "#0B0F19", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 7,
    color: "#E5E7EB", fontSize: 11, padding: "6px 9px", outline: "none",
    width: "100%", boxSizing: "border-box", fontFamily: "inherit", ...extra,
  });

  const secHead = (color, Icon, label) => (
    <div style={{ fontSize: 10, fontWeight: 700, color, marginBottom: 12, textTransform: "uppercase", letterSpacing: "0.08em", display: "flex", alignItems: "center", gap: 6 }}>
      <Icon size={11} />{label}
    </div>
  );

  const bloc = (children, extra = {}) => (
    <div style={{ background: "#151B27", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 12, padding: "16px", ...extra }}>
      {children}
    </div>
  );

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.80)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: "16px" }}
      onClick={onClose}>
      <div onClick={e => e.stopPropagation()}
        style={{ background: "#0D1117", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 16, width: "100%", maxWidth: 1020, maxHeight: "92vh", overflowY: "auto", boxShadow: "0 32px 64px rgba(0,0,0,0.9)" }}>

        {/* En-tête sticky */}
        <div style={{ padding: "18px 24px 14px", borderBottom: "1px solid rgba(255,255,255,0.07)", display: "flex", alignItems: "center", gap: 14, position: "sticky", top: 0, background: "#0D1117", zIndex: 10, borderRadius: "16px 16px 0 0" }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 20, fontWeight: 800, color: "#F9FAFB", marginBottom: 5 }}>{app.name}</div>
            <div style={{ display: "flex", gap: 14, alignItems: "center", flexWrap: "wrap" }}>
              <span style={{ fontSize: 10, color: "#4B5563", display: "flex", alignItems: "center", gap: 4 }}>
                <Server size={10} /> {app.servers.length} serveur{app.servers.length !== 1 ? "s" : ""}
              </span>
              {app.cpuAvg  != null && <span style={{ fontSize: 10, color: cpuC,  fontFamily: "monospace", fontWeight: 600 }}>CPU {app.cpuAvg}%</span>}
              {app.ramAvg  != null && <span style={{ fontSize: 10, color: ramC,  fontFamily: "monospace", fontWeight: 600 }}>RAM {app.ramAvg}%</span>}
              {app.diskAvg != null && <span style={{ fontSize: 10, color: healthColor(app.diskAvg), fontFamily: "monospace", fontWeight: 600 }}>Disk {app.diskAvg}%</span>}
              {serverAlerts.length > 0 && <span style={{ fontSize: 10, color: "#F87171", fontWeight: 700 }}>⚠ {serverAlerts.length} alerte{serverAlerts.length > 1 ? "s" : ""}</span>}
            </div>
          </div>
          <button onClick={onClose} style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, color: "#9CA3AF", cursor: "pointer", padding: "6px 14px", fontSize: 11, display: "flex", alignItems: "center", gap: 6, fontFamily: "inherit" }}>
            <X size={13} /> Fermer
          </button>
        </div>

        <div style={{ padding: "20px 24px 28px" }}>

          {/* ── Ligne 1 : Documentation | Dépendances | Calendrier MeP ── */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1.35fr 1fr", gap: 14, marginBottom: 14 }}>

            {/* Documentation */}
            {bloc(<>
              {secHead("#818CF8", FileText, "Documentation")}
              {[["dat", "DAT", "Dossier d'Architecture Technique — URL ou référence"],
                ["dex", "DEX", "Dossier d'Exploitation — URL ou référence"],
                ["dit", "DIT", "Dossier d'Installation Technique — URL ou référence"],
              ].map(([k, label, ph]) => (
                <div key={k} style={{ marginBottom: 10 }}>
                  <label style={{ fontSize: 10, color: "#4B5563", display: "block", marginBottom: 3, fontWeight: 700 }}>{label}</label>
                  <div style={{ display: "flex", gap: 5 }}>
                    <input value={m[k] || ""} onChange={e => upd(k, e.target.value)} placeholder={ph}
                      style={{ ...fi({ flex: 1 }) }} />
                    {m[k] && m[k].startsWith("http") && (
                      <a href={m[k]} target="_blank" rel="noreferrer"
                        style={{ display: "flex", alignItems: "center", padding: "0 8px", background: "rgba(129,140,248,0.12)", border: "1px solid rgba(129,140,248,0.25)", borderRadius: 7, color: "#818CF8" }}>
                        <ExternalLink size={11} />
                      </a>
                    )}
                  </div>
                </div>
              ))}
            </>)}

            {/* Dépendances — encart central */}
            {bloc(<>
              {secHead("#34D399", Network, `Dépendances (${appDeps.length})`)}
              {appDeps.length === 0 ? (
                <div style={{ fontSize: 11, color: "#374151", textAlign: "center", padding: "28px 0", borderRadius: 8, border: "1px dashed rgba(255,255,255,0.06)" }}>
                  Aucune dépendance définie<br />
                  <span style={{ fontSize: 10 }}>Utilisez l'onglet Dépendances pour en ajouter</span>
                </div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
                  {appDeps.map(dep => {
                    const dt = DEP_TYPES[dep.type] || DEP_TYPES.depends_on;
                    const isSource = dep.from === app.name;
                    const other    = isSource ? dep.to : dep.from;
                    return (
                      <div key={dep.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "9px 12px", borderRadius: 9, background: "#0B0F19", border: `1px solid ${dt.color}28` }}>
                        <div style={{ width: 7, height: 7, borderRadius: "50%", background: dt.color, flexShrink: 0 }} />
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 11, color: "#E5E7EB", fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{other}</div>
                          <div style={{ fontSize: 9, color: dt.color, fontWeight: 700, marginTop: 1 }}>
                            {isSource ? `→ ${dt.label}` : `← ${dt.label}`}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </>)}

            {/* Calendrier MeP + Serveurs */}
            {bloc(<>
              {secHead("#FBBF24", Rocket, "Calendrier MeP")}
              {[["prochaineMeP", "Prochaine MeP"], ["derniereMeP", "Dernière MeP"]].map(([k, label]) => (
                <div key={k} style={{ marginBottom: 11 }}>
                  <label style={{ fontSize: 10, color: "#4B5563", display: "block", marginBottom: 3, fontWeight: 700 }}>{label}</label>
                  <input type="date" value={m[k] || ""} onChange={e => upd(k, e.target.value)} style={{ ...fi() }} />
                  {m[k] && (
                    <div style={{ fontSize: 10, color: k === "prochaineMeP" ? "#FBBF24" : "#34D399", marginTop: 3, fontWeight: 600 }}>
                      {new Date(m[k]).toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}
                    </div>
                  )}
                </div>
              ))}
              <div style={{ fontSize: 10, color: "#4B5563", fontWeight: 700, marginTop: 14, marginBottom: 7, textTransform: "uppercase", letterSpacing: "0.06em" }}>Serveurs rattachés</div>
              <div style={{ maxHeight: 110, overflowY: "auto", display: "flex", flexDirection: "column", gap: 3 }}>
                {app.servers.map(s => (
                  <div key={s.id || s.name} style={{ display: "flex", alignItems: "center", gap: 6, padding: "4px 8px", background: "#0B0F19", borderRadius: 6, border: "1px solid rgba(255,255,255,0.05)" }}>
                    <Server size={9} color="#374151" />
                    <span style={{ fontSize: 10, color: "#9CA3AF", flex: 1, fontFamily: "monospace", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{s.name}</span>
                    {s.cpu  != null && <span style={{ fontSize: 9, color: healthColor(s.cpu),  fontFamily: "monospace" }}>CPU {s.cpu}%</span>}
                    {s.ram  != null && <span style={{ fontSize: 9, color: healthColor(s.ram),  fontFamily: "monospace" }}>RAM {s.ram}%</span>}
                    {s.disk != null && <span style={{ fontSize: 9, color: healthColor(s.disk), fontFamily: "monospace" }}>Disk {s.disk}%</span>}
                  </div>
                ))}
              </div>
            </>)}
          </div>

          {/* ── Ligne 2 : Description + Résumé ── */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 14 }}>
            {[["description", "📄 Description technique", "Architecture détaillée, composants, flux de données, points d'intégration…"],
              ["resume",      "📋 Résumé fonctionnel",    "Résumé destiné aux équipes métier et directions, sans jargon technique…"],
            ].map(([k, label, ph]) => (
              <div key={k} style={{ background: "#151B27", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 12, padding: "16px" }}>
                <label style={{ fontSize: 10, fontWeight: 700, color: "#9CA3AF", display: "block", marginBottom: 10, textTransform: "uppercase", letterSpacing: "0.07em" }}>{label}</label>
                <textarea value={m[k] || ""} onChange={e => upd(k, e.target.value)} rows={5} placeholder={ph}
                  style={{ ...fi({ resize: "vertical", lineHeight: 1.6 }) }} />
              </div>
            ))}
          </div>

          {/* ── Ligne 3 : Alertes serveurs ── */}
          <div style={{ background: "#151B27", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 12, padding: "16px" }}>
            {secHead("#F87171", AlertTriangle, `Dernières alertes serveurs liées à ${app.name} (${serverAlerts.length})`)}
            {serverAlerts.length === 0 ? (
              <div style={{ fontSize: 11, color: "#374151", textAlign: "center", padding: "20px 0" }}>
                ✅ Aucune alerte récente pour les serveurs de cette application
              </div>
            ) : (
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))", gap: 6 }}>
                {serverAlerts.map((e, i) => {
                  const typeMap = {
                    server_alert:   { color: "#FBBF24", badge: (e.metric || "srv").toUpperCase() },
                    offline:        { color: "#F87171", badge: "OFFLINE" },
                    online:         { color: "#34D399", badge: "ONLINE" },
                    capacity_alert: { color: "#FB923C", badge: "CAPACITY" },
                    ssl_expiry:     { color: "#818CF8", badge: "SSL" },
                  };
                  const t = typeMap[e.type] || { color: "#6B7280", badge: (e.type || "?").toUpperCase() };
                  return (
                    <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 11px", borderRadius: 8, background: "#0B0F19", border: `1px solid ${t.color}22` }}>
                      <span style={{ fontSize: 9, padding: "1px 6px", borderRadius: 4, background: `${t.color}22`, color: t.color, fontWeight: 700, flexShrink: 0 }}>{t.badge}</span>
                      <span style={{ fontSize: 10, color: "#E5E7EB", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {e.serverName || e.url}
                        {e.value != null ? ` — ${e.value}%` : ""}
                        {e.recoText   ? ` — ${e.recoText}` : ""}
                      </span>
                      <span style={{ fontSize: 9, color: "#374151", flexShrink: 0, fontFamily: "monospace", whiteSpace: "nowrap" }}>
                        {new Date(e.ts).toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit" })} {new Date(e.ts).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

const TABS = ["Carte", "Inventaire", "Dépendances"];

export default function AppImpactMap() {
  const servers = useSyncExternalStore(subscribeServers, getServers);
  const [impacts, setImpacts] = useState(() => loadImpacts());
  const [tab, setTab]         = useState("Carte");
  const [expanded, setExpanded] = useState(new Set());
  const [newDep, setNewDep]   = useState({ from: "", to: "", type: "depends_on" });
  const [selApp, setSelApp]     = useState(null);
  const [detailApp, setDetailApp] = useState(null);
  const [incidentLog]             = useState(() => loadLog());
  const [linePositions, setLinePositions] = useState([]);
  const wrapperRef = useRef(null);
  const cardRefs   = useRef({});

  const persist = (data) => { setImpacts(data); saveImpacts(data); };

  /* Grouper les serveurs par application */
  const appGroups = useMemo(() => {
    const map = new Map();
    for (const s of servers) {
      if (s.app) {
        if (!map.has(s.app)) map.set(s.app, []);
        map.get(s.app).push(s);
      } else {
        /* Pas d'application : carte individuelle avec le nom du serveur */
        const key = `\x00srv\x00${s.id || s.name}`;
        map.set(key, [s]);
      }
    }
    return Array.from(map.entries()).map(([key, srvs]) => {
      const isSrv = key.startsWith("\x00srv\x00");
      return {
        name:     isSrv ? srvs[0].name : key,
        isSrv,
        servers:  srvs,
        cpuAvg:   avgMetric(srvs, "cpu"),
        ramAvg:   avgMetric(srvs, "ram"),
        diskAvg:  avgMetric(srvs, "disk"),
      };
    });
  }, [servers]);

  const appNames = appGroups.map(g => g.name);

  /* ── Calcul des positions SVG via DOM ── */
  const computeLines = useCallback(() => {
    if (!wrapperRef.current || impacts.dependencies.length === 0) { setLinePositions([]); return; }
    const base = wrapperRef.current.getBoundingClientRect();
    const positions = impacts.dependencies.map(dep => {
      const fromEl = cardRefs.current[dep.from];
      const toEl   = cardRefs.current[dep.to];
      if (!fromEl || !toEl) return null;
      const fr = fromEl.getBoundingClientRect();
      const tr = toEl.getBoundingClientRect();
      return {
        id:   dep.id,
        type: dep.type,
        sx: fr.left - base.left + fr.width  / 2,
        sy: fr.top  - base.top  + fr.height / 2,
        tx: tr.left - base.left + tr.width  / 2,
        ty: tr.top  - base.top  + tr.height / 2,
      };
    }).filter(Boolean);
    setLinePositions(positions);
  }, [impacts.dependencies, appGroups]);

  useLayoutEffect(() => { computeLines(); }, [computeLines]);

  useEffect(() => {
    if (!wrapperRef.current) return;
    const ro = new ResizeObserver(() => computeLines());
    ro.observe(wrapperRef.current);
    return () => ro.disconnect();
  }, [computeLines]);

  const addDep = () => {
    if (!newDep.from || !newDep.to || newDep.from === newDep.to) return;
    const already = impacts.dependencies.find(d => d.from === newDep.from && d.to === newDep.to && d.type === newDep.type);
    if (already) return;
    persist({ ...impacts, dependencies: [...impacts.dependencies, { ...newDep, id: crypto.randomUUID() }] });
    setNewDep(d => ({ ...d, from: "", to: "" }));
  };

  const delDep = (id) => persist({ ...impacts, dependencies: impacts.dependencies.filter(d => d.id !== id) });

  const updateAppMeta = (name, meta) => persist({ ...impacts, appMeta: { ...(impacts.appMeta || {}), [name]: meta } });

  const selGroup = selApp ? appGroups.find(g => g.name === selApp) : null;

  const sel = (e) => ({
    background: "#151B27", border: "1px solid rgba(255,255,255,0.1)",
    borderRadius: 6, color: "#E5E7EB", fontSize: 11, padding: "5px 9px",
    outline: "none", ...e,
  });

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", background: "#0B0F19", color: "#F3F4F6" }}>

      {/* ── Sous-onglets ── */}
      <div style={{ display: "flex", gap: 4, padding: "12px 20px 0", borderBottom: "1px solid rgba(255,255,255,0.07)" }}>
        {TABS.map(t => (
          <button key={t} onClick={() => setTab(t)} style={{
            padding: "7px 16px", borderRadius: "8px 8px 0 0", fontSize: 12, fontWeight: tab === t ? 600 : 400,
            background: tab === t ? "rgba(99,102,241,0.15)" : "transparent",
            border: `1px solid ${tab === t ? "rgba(99,102,241,0.35)" : "transparent"}`,
            borderBottom: "none", color: tab === t ? "#818CF8" : "#6B7280", cursor: "pointer",
          }}>{t}</button>
        ))}
        <div style={{ flex: 1 }} />
        <span style={{ fontSize: 11, color: "#374151", alignSelf: "center", paddingRight: 8 }}>
          {appGroups.length} application{appGroups.length !== 1 ? "s" : ""} · {servers.length} serveur{servers.length !== 1 ? "s" : ""}
        </span>
      </div>

      {/* ══ CARTE ══ */}
      {tab === "Carte" && (
        <div style={{ flex: 1, overflow: "auto" }}>
          {appGroups.length === 0 ? (
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%", color: "#374151", flexDirection: "column", gap: 10 }}>
              <Network size={44} color="#1F2937" />
              <div style={{ fontSize: 14 }}>Aucun serveur importé</div>
              <div style={{ fontSize: 11, color: "#4B5563" }}>Importez des serveurs avec un champ "Application" pour afficher la carte</div>
            </div>
          ) : (
            <div ref={wrapperRef} style={{ position: "relative", padding: "20px" }}>

              {/* SVG overlay — flèches de dépendances (DOM-based) */}
              {linePositions.length > 0 && (
                <svg style={{ position: "absolute", top: 0, left: 0, width: "100%", height: "100%", pointerEvents: "none", zIndex: 1, overflow: "visible" }}>
                  <defs>
                    {Object.entries(DEP_TYPES).map(([k, v]) => (
                      <marker key={k} id={`arrow-${k}`} markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto">
                        <path d="M0,0 L0,6 L8,3 z" fill={v.color} opacity="0.8" />
                      </marker>
                    ))}
                  </defs>
                  {linePositions.map(lp => {
                    const col = DEP_TYPES[lp.type]?.color || "#818CF8";
                    const mx  = (lp.tx - lp.sx) / 2;
                    return (
                      <path key={lp.id}
                        d={`M ${lp.sx} ${lp.sy} C ${lp.sx + mx} ${lp.sy}, ${lp.tx - mx} ${lp.ty}, ${lp.tx} ${lp.ty}`}
                        stroke={col} strokeWidth={1.5} fill="none" opacity={0.7}
                        strokeDasharray="5 4" markerEnd={`url(#arrow-${lp.type})`}
                      />
                    );
                  })}
                </svg>
              )}

              {/* Grille CSS responsive — toute la largeur disponible */}
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 16, position: "relative", zIndex: 2 }}>
                {appGroups.map((app) => {
                  const cpuC  = healthColor(app.cpuAvg);
                  const ramC  = healthColor(app.ramAvg);
                  const isSel = selApp === app.name;
                  return (
                    <div
                      key={app.name}
                      ref={el => { cardRefs.current[app.name] = el; }}
                      onClick={() => { setSelApp(app.name); setDetailApp(app.name); }}
                      style={{
                        background: isSel ? "rgba(99,102,241,0.12)" : "#151B27",
                        border: `1px solid ${isSel ? "rgba(99,102,241,0.45)" : "rgba(255,255,255,0.08)"}`,
                        borderRadius: 12, padding: "14px 16px", cursor: "pointer",
                        boxShadow: isSel ? "0 0 0 2px rgba(99,102,241,0.25)" : "none",
                        transition: "all 0.15s",
                      }}
                      onMouseEnter={e => { if (!isSel) e.currentTarget.style.borderColor = "rgba(255,255,255,0.16)"; }}
                      onMouseLeave={e => { if (!isSel) e.currentTarget.style.borderColor = "rgba(255,255,255,0.08)"; }}
                    >
                      <div style={{ fontWeight: 700, fontSize: 13, color: app.isSrv ? "#9CA3AF" : "#E5E7EB", marginBottom: 4, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", display: "flex", alignItems: "center", gap: 5 }}>
                        {app.isSrv && <Server size={11} color="#4B5563" />}
                        {app.name}
                      </div>
                      <div style={{ fontSize: 10, color: "#4B5563", marginBottom: 10, display: "flex", alignItems: "center", gap: 4 }}>
                        {app.isSrv ? <span style={{ color: "#374151", fontStyle: "italic" }}>Sans application</span> : <><Server size={9} /> {app.servers.length} serveur{app.servers.length !== 1 ? "s" : ""}</>}
                      </div>
                      {app.cpuAvg != null && (
                        <div style={{ marginBottom: 5 }}>
                          <div style={{ fontSize: 9, color: "#374151", marginBottom: 2 }}>CPU</div>
                          <MiniBar value={app.cpuAvg} color={cpuC} />
                        </div>
                      )}
                      {app.ramAvg != null && (
                        <div style={{ marginBottom: 5 }}>
                          <div style={{ fontSize: 9, color: "#374151", marginBottom: 2 }}>RAM</div>
                          <MiniBar value={app.ramAvg} color={ramC} />
                        </div>
                      )}
                      {app.diskAvg != null && (
                        <div>
                          <div style={{ fontSize: 9, color: "#374151", marginBottom: 2 }}>Disk</div>
                          <MiniBar value={app.diskAvg} color={healthColor(app.diskAvg)} />
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

      {/* ══ INVENTAIRE ══ */}
      {tab === "Inventaire" && (
        <div style={{ flex: 1, overflowY: "auto", padding: "16px 24px" }}>
          {appGroups.map(app => {
            const isExp = expanded.has(app.name);
            const cpuC = healthColor(app.cpuAvg);
            const ramC = healthColor(app.ramAvg);
            return (
              <div key={app.name} style={{ background: "#151B27", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 11, marginBottom: 10, overflow: "hidden" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "12px 16px", cursor: "pointer" }}
                  onClick={() => setExpanded(p => { const n = new Set(p); n.has(app.name) ? n.delete(app.name) : n.add(app.name); return n; })}>
                  {isExp ? <ChevronDown size={14} color="#6B7280" /> : <ChevronRight size={14} color="#6B7280" />}
                  <span style={{ fontSize: 13, fontWeight: 600, flex: 1 }}>{app.name}</span>
                  <span style={{ fontSize: 11, color: "#4B5563" }}>{app.servers.length} serveur{app.servers.length !== 1 ? "s" : ""}</span>
                  {app.cpuAvg != null && <span style={{ fontSize: 11, color: cpuC, fontFamily: "monospace" }}>CPU {app.cpuAvg}%</span>}
                  {app.ramAvg != null && <span style={{ fontSize: 11, color: ramC, fontFamily: "monospace" }}>RAM {app.ramAvg}%</span>}
                </div>
                {isExp && (
                  <div style={{ borderTop: "1px solid rgba(255,255,255,0.05)" }}>
                    {app.servers.map(s => (
                      <div key={s.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 16px 8px 40px", borderBottom: "1px solid rgba(255,255,255,0.03)" }}>
                        <Server size={12} color="#4B5563" />
                        <span style={{ fontSize: 12, color: "#E5E7EB", flex: 1, fontFamily: "monospace" }}>{s.name}</span>
                        <span style={{ fontSize: 10, color: "#6B7280" }}>{s.env || "—"}</span>
                        <span style={{ fontSize: 10, color: "#6B7280" }}>{s.os || "—"}</span>
                        {s.cpu != null && <span style={{ fontSize: 10, color: healthColor(s.cpu), fontFamily: "monospace" }}>CPU {s.cpu}%</span>}
                        {s.ram != null && <span style={{ fontSize: 10, color: healthColor(s.ram), fontFamily: "monospace" }}>RAM {s.ram}%</span>}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* ══ DÉPENDANCES ══ */}
      {tab === "Dépendances" && (
        <div style={{ flex: 1, overflowY: "auto", padding: "20px 24px" }}>
          {/* Formulaire d'ajout */}
          <div style={{ background: "#151B27", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 11, padding: "16px 20px", marginBottom: 20 }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: "#9CA3AF", marginBottom: 14 }}>Ajouter une dépendance</div>
            <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
              <select value={newDep.from} onChange={e => setNewDep(d => ({ ...d, from: e.target.value }))}
                style={{ ...sel({ minWidth: 150 }) }}>
                <option value="">Application source…</option>
                {appNames.map(n => <option key={n} value={n}>{n}</option>)}
              </select>
              <select value={newDep.type} onChange={e => setNewDep(d => ({ ...d, type: e.target.value }))}
                style={{ ...sel({ color: DEP_TYPES[newDep.type]?.color || "#E5E7EB" }) }}>
                {Object.entries(DEP_TYPES).map(([k, v]) => <option key={k} value={k} style={{ color: "#E5E7EB" }}>{v.label}</option>)}
              </select>
              <ArrowRight size={14} color="#374151" />
              <select value={newDep.to} onChange={e => setNewDep(d => ({ ...d, to: e.target.value }))}
                style={{ ...sel({ minWidth: 150 }) }}>
                <option value="">Application cible…</option>
                {appNames.filter(n => n !== newDep.from).map(n => <option key={n} value={n}>{n}</option>)}
              </select>
              <button onClick={addDep} disabled={!newDep.from || !newDep.to}
                style={{ display: "flex", alignItems: "center", gap: 5, padding: "5px 14px", borderRadius: 7, background: newDep.from && newDep.to ? "rgba(52,211,153,0.15)" : "rgba(255,255,255,0.04)", border: `1px solid ${newDep.from && newDep.to ? "rgba(52,211,153,0.35)" : "rgba(255,255,255,0.08)"}`, color: newDep.from && newDep.to ? "#34D399" : "#374151", fontSize: 11, fontWeight: 600, cursor: newDep.from && newDep.to ? "pointer" : "default" }}>
                <Plus size={12} /> Ajouter
              </button>
            </div>
          </div>

          {/* Liste des dépendances */}
          {impacts.dependencies.length === 0 ? (
            <div style={{ textAlign: "center", padding: "40px 0", color: "#374151", fontSize: 12, borderRadius: 10, border: "1px dashed rgba(255,255,255,0.06)" }}>
              Aucune dépendance définie — utilisez le formulaire ci-dessus
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {impacts.dependencies.map(dep => {
                const dt = DEP_TYPES[dep.type] || DEP_TYPES.depends_on;
                return (
                  <div key={dep.id} style={{ display: "flex", alignItems: "center", gap: 10, background: "#151B27", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 9, padding: "10px 14px" }}>
                    <span style={{ fontSize: 12, fontWeight: 600, color: "#E5E7EB", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{dep.from}</span>
                    <span style={{ fontSize: 10, padding: "2px 8px", borderRadius: 5, background: `${dt.color}20`, color: dt.color, fontWeight: 600, flexShrink: 0 }}>{dt.label}</span>
                    <span style={{ fontSize: 12, fontWeight: 600, color: "#E5E7EB", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{dep.to}</span>
                    <button onClick={() => delDep(dep.id)} style={{ background: "none", border: "none", color: "#374151", cursor: "pointer", padding: 3, display: "flex" }}
                      onMouseEnter={e => e.currentTarget.style.color = "#F87171"}
                      onMouseLeave={e => e.currentTarget.style.color = "#374151"}>
                      <Trash2 size={13} />
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ── Panneau de détail (modal) ── */}
      {detailApp && (() => {
        const dApp = appGroups.find(g => g.name === detailApp);
        if (!dApp) return null;
        return (
          <AppDetailPanel
            app={dApp}
            meta={(impacts.appMeta || {})[detailApp] || {}}
            allDeps={impacts.dependencies}
            incidentLog={incidentLog}
            onClose={() => setDetailApp(null)}
            onSaveMeta={meta => updateAppMeta(detailApp, meta)}
          />
        );
      })()}
    </div>
  );
}
