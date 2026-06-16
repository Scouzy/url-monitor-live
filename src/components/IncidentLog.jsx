import { useState } from "react";
import { AlertTriangle, CheckCircle, ChevronDown, ChevronUp, X, Clock, KeyRound, Server, BarChart3 } from "lucide-react";

const MAX_LOG = 200;
const LOG_KEY = "url-monitor-incidents";

export function loadLog() {
  try {
    const raw = localStorage.getItem(LOG_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

export function saveLog(log) {
  try {
    localStorage.setItem(LOG_KEY, JSON.stringify(log.slice(-MAX_LOG)));
  } catch {}
}

export function addIncident(log, { url, groupName, type, ts = Date.now(), ...extra }) {
  /* Calculer la durée de l'incident précédent si c'est un retour en ligne */
  let duration = null;
  if (type === "online") {
    const lastDown = [...log].reverse().find(e => e.url === url && e.type === "offline");
    if (lastDown) duration = ts - lastDown.ts;
  }
  const entry = { id: crypto.randomUUID(), url, groupName: groupName || "", type, ts, duration, ...extra };
  const next = [...log, entry].slice(-MAX_LOG);
  saveLog(next);
  return next;
}

function formatTs(ts) {
  return new Date(ts).toLocaleString("fr-FR", {
    day: "2-digit", month: "2-digit", year: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
  });
}

function formatDur(ms) {
  if (!ms) return null;
  const s = Math.round(ms / 1000);
  if (s < 60)  return `${s}s`;
  const m = Math.floor(s / 60); const rs = s % 60;
  if (m < 60)  return rs ? `${m}min ${rs}s` : `${m}min`;
  const h = Math.floor(m / 60); const rm = m % 60;
  return rm ? `${h}h ${rm}min` : `${h}h`;
}

function getDomain(url) {
  try { return new URL(url).hostname; } catch { return url; }
}

function sslColor(daysLeft) {
  if (daysLeft <= 0)  return "#F87171";
  if (daysLeft <= 3)  return "#F87171";
  if (daysLeft <= 10) return "#FBBF24";
  return "#34D399";
}

const TYPE_META = {
  offline:        { label: "Panne",      bg: "rgba(248,113,113,0.12)",  color: "#F87171",  border: "rgba(248,113,113,0.3)",  rowBg: "rgba(248,113,113,0.03)" },
  online:         { label: "Rétabli",    bg: "rgba(52,211,153,0.1)",   color: "#34D399",  border: "rgba(52,211,153,0.2)",  rowBg: "transparent" },
  ssl_expiry:     { label: "SSL",         bg: "rgba(251,191,36,0.12)",  color: "#FBBF24",  border: "rgba(251,191,36,0.3)",  rowBg: "rgba(251,191,36,0.02)" },
  server_alert:   { label: "Serveur",    bg: "rgba(249,115,22,0.12)",  color: "#FB923C",  border: "rgba(249,115,22,0.3)",  rowBg: "rgba(249,115,22,0.02)" },
  capacity_alert: { label: "Capacité",   bg: "rgba(129,140,248,0.12)", color: "#818CF8",  border: "rgba(129,140,248,0.3)", rowBg: "rgba(129,140,248,0.02)" },
};

const FILTERS = [
  { v: "all",            l: "Tous" },
  { v: "offline",        l: "Pannes" },
  { v: "online",         l: "Rétablissements" },
  { v: "ssl_expiry",     l: "🔐 SSL" },
  { v: "server_alert",   l: "⚙️ Serveurs" },
  { v: "capacity_alert", l: "📈 Capacité" },
];

/* ── Vue liste des entrées — partagée entre modes flottant et standalone ── */
function IncidentList({ log, onClear }) {
  const [filter, setFilter] = useState("all");
  const [hovered, setHovered] = useState(null);
  const filtered = log.filter(e => filter === "all" || e.type === filter).slice().reverse();

  const grouped = [];
  const groupMap = new Map();
  filtered.forEach(e => {
    const key = `${e.url}||${e.type}`;
    if (!groupMap.has(key)) {
      const entry = { ...e, count: 1, oldestTs: e.ts };
      groupMap.set(key, entry);
      grouped.push(entry);
    } else {
      const ex = groupMap.get(key);
      ex.count++;
      if (e.ts < ex.oldestTs) ex.oldestTs = e.ts;
    }
  });

  const counts = { all: log.length, offline: 0, online: 0, ssl_expiry: 0, server_alert: 0, capacity_alert: 0 };
  log.forEach(e => { if (counts[e.type] !== undefined) counts[e.type]++; });

  return (
    <>
      {/* Barre de filtres */}
      <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "10px 16px",
        borderBottom: "1px solid rgba(255,255,255,0.06)", flexWrap: "wrap" }}>
        {FILTERS.map(({ v, l }) => (
          <button key={v} onClick={() => setFilter(v)} style={{
            fontSize: 11, padding: "4px 12px", borderRadius: 20, cursor: "pointer",
            border: `1px solid ${filter === v ? "rgba(99,102,241,0.5)" : "rgba(255,255,255,0.08)"}`,
            background: filter === v ? "rgba(99,102,241,0.18)" : "transparent",
            color: filter === v ? "#A5B4FC" : "#6B7280", fontWeight: filter === v ? 700 : 400,
            transition: "all 0.15s",
          }}>
            {l}
            {counts[v] > 0 && <span style={{ marginLeft: 5, fontSize: 9, opacity: 0.7 }}>({counts[v]})</span>}
          </button>
        ))}
        {log.length > 0 && (
          <button onClick={onClear} style={{
            marginLeft: "auto", fontSize: 11, padding: "4px 12px", borderRadius: 20,
            background: "rgba(248,113,113,0.08)", border: "1px solid rgba(248,113,113,0.25)",
            color: "#F87171", cursor: "pointer",
          }}>Vider</button>
        )}
      </div>

      {/* Liste */}
      <div style={{ overflowY: "auto", flex: 1 }}>
        {filtered.length === 0 ? (
          <div style={{ padding: "56px 0", textAlign: "center", color: "#374151" }}>
            <CheckCircle size={32} style={{ display: "block", margin: "0 auto 12px", opacity: 0.3 }} />
            <div style={{ fontSize: 13, fontWeight: 600, color: "#4B5563", marginBottom: 4 }}>Aucun événement</div>
            <div style={{ fontSize: 11, color: "#374151" }}>Le journal est vide pour ce filtre.</div>
          </div>
        ) : grouped.map(e => {
          const meta = TYPE_META[e.type] || TYPE_META.offline;
          const isHov = hovered === e.id;
          return (
            <div key={e.id}
              onMouseEnter={() => setHovered(e.id)}
              onMouseLeave={() => setHovered(null)}
              style={{
                display: "flex", alignItems: "center", gap: 12, padding: "10px 16px",
                borderBottom: "1px solid rgba(255,255,255,0.04)",
                background: isHov ? "rgba(255,255,255,0.03)" : meta.rowBg,
                transition: "background 0.15s",
              }}>
              {/* Icône */}
              <div style={{ width: 30, height: 30, borderRadius: 8, flexShrink: 0,
                background: meta.bg, display: "flex", alignItems: "center", justifyContent: "center" }}>
                {e.type === "offline"    && <AlertTriangle size={14} color={meta.color} />}
                {e.type === "online"     && <CheckCircle   size={14} color={meta.color} />}
                {e.type === "ssl_expiry" && <KeyRound      size={14} color={e.daysLeft != null ? sslColor(e.daysLeft) : meta.color} />}
              </div>
              {/* Info */}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 3 }}>
                  <span style={{ fontSize: 13, fontWeight: 700, color: "#E5E7EB",
                    overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {getDomain(e.url)}
                  </span>
                  {e.count > 1 && (
                    <span style={{ fontSize: 11, fontWeight: 800, color: meta.color,
                      background: meta.bg, border: `1px solid ${meta.border}`,
                      borderRadius: 8, padding: "1px 8px", flexShrink: 0 }}>
                      ×{e.count}
                    </span>
                  )}
                  {e.groupName && (
                    <span style={{ fontSize: 9, padding: "2px 7px", borderRadius: 10,
                      background: "rgba(99,102,241,0.15)", color: "#818CF8", flexShrink: 0,
                      border: "1px solid rgba(99,102,241,0.2)" }}>
                      {e.groupName}
                    </span>
                  )}
                </div>
                <div style={{ fontSize: 10, color: "#6B7280", display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                  <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
                    <Clock size={9} /> {formatTs(e.ts)}
                    {e.count > 1 && <span style={{ color: "#4B5563" }}> · 1ère : {formatTs(e.oldestTs)}</span>}
                  </span>
                  {e.duration && <span style={{ color: "#34D399" }}>→ rétabli après <strong>{formatDur(e.duration)}</strong></span>}
                  {e.type === "server_alert" && e.metric != null && (
                    <span style={{ color: "#FB923C", fontWeight: 600 }}>{e.metric?.toUpperCase()} à {e.value}%</span>
                  )}
                  {e.type === "capacity_alert" && e.recoText && (
                    <span style={{ color: "#818CF8" }}>{e.recoText}</span>
                  )}
                  {e.type === "ssl_expiry" && e.daysLeft != null && (
                    <span style={{ color: sslColor(e.daysLeft), fontWeight: 600 }}>
                      → {e.daysLeft <= 0 ? "expiré" : `expire dans ${e.daysLeft}j`}
                    </span>
                  )}
                </div>
              </div>
              {/* Badge type */}
              <span style={{
                fontSize: 10, padding: "3px 10px", borderRadius: 20, flexShrink: 0, fontWeight: 700,
                background: meta.bg, color: e.type === "ssl_expiry" && e.daysLeft != null ? sslColor(e.daysLeft) : meta.color,
                border: `1px solid ${meta.border}`,
              }}>
                {meta.label}
              </span>
            </div>
          );
        })}
      </div>
    </>
  );
}

/* ── Mode standalone : affiché dans un onglet ── */
export function IncidentLogPage({ log, onClear }) {
  const pannes = log.filter(e => e.type === "offline").length;
  const retabs = log.filter(e => e.type === "online").length;
  const sslAlerts = log.filter(e => e.type === "ssl_expiry").length;

  return (
    <div>
      {/* Stats rapides */}
      <div style={{ display: "flex", gap: 12, marginBottom: 20 }}>
        {[
          { label: "Total événements",  value: log.length,  color: "#818CF8" },
          { label: "Pannes détectées",   value: pannes,     color: "#F87171" },
          { label: "Rétablissements",    value: retabs,     color: "#34D399" },
          { label: "Alertes SSL",        value: sslAlerts,  color: "#FBBF24" },
          { label: "Alertes Serveurs",   value: log.filter(e => e.type === "server_alert").length,   color: "#FB923C" },
          { label: "Alertes Capacité",   value: log.filter(e => e.type === "capacity_alert").length, color: "#A78BFA" },
        ].map(s => (
          <div key={s.label} style={{
            flex: 1, background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)",
            borderRadius: 12, padding: "14px 18px",
          }}>
            <div style={{ fontSize: 10, color: "#6B7280", marginBottom: 4 }}>{s.label}</div>
            <div style={{ fontSize: 22, fontWeight: 700, color: s.color, fontFamily: "'JetBrains Mono', monospace" }}>{s.value}</div>
          </div>
        ))}
      </div>

      {/* Liste */}
      <div style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 12, overflow: "hidden", display: "flex", flexDirection: "column" }}>
        <IncidentList log={log} onClear={onClear} />
      </div>
    </div>
  );
}

/* ── Mode flottant (conservé pour compatibilité éventuelle) ── */
export default function IncidentLog({ log, onClear }) {
  return null; /* Remplacé par IncidentLogPage dans l'onglet Journal */
}
