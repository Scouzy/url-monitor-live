import { useState, useMemo, useEffect } from "react";
import {
  RefreshCw, Search, X, Plus, AlertTriangle, CheckCircle2, Clock,
  Loader2, Calendar, User, Server, Filter, ChevronDown, ChevronRight,
  Wrench, Ticket, CircleDot, ArrowRight, Zap, LayoutGrid, List,
} from "lucide-react";

/* ── Statuts possibles ── */
const STATUS_META = {
  open:        { label: "Ouvert",      color: "#818CF8", Icon: CircleDot },
  in_progress: { label: "En cours",    color: "#FBBF24", Icon: Clock },
  in_progress_intervention: { label: "En cours", color: "#FBBF24", Icon: Clock },
  resolved:    { label: "Résolu",      color: "#34D399", Icon: CheckCircle2 },
  closed:      { label: "Clos",        color: "#6B7280", Icon: CheckCircle2 },
  cancelled:   { label: "Annulé",      color: "#F87171", Icon: X },
  pending:     { label: "En attente",  color: "#FB923C", Icon: Clock },
  assigned:    { label: "Assigné",     color: "#818CF8", Icon: User },
  draft:       { label: "Brouillon",   color: "#6B7280", Icon: CircleDot },
};

function getStatusMeta(status) {
  if (!status) return { label: "Inconnu", color: "#6B7280", Icon: CircleDot };
  const s = status.toLowerCase();
  for (const [key, meta] of Object.entries(STATUS_META)) {
    if (s.includes(key) || key.includes(s)) return meta;
  }
  return { label: status.charAt(0).toUpperCase() + status.slice(1), color: "#6B7280", Icon: CircleDot };
}

/* ── Priorités ── */
const PRIORITY_META = {
  critical: { label: "Critique", color: "#F87171" },
  high:     { label: "Haute",    color: "#FB923C" },
  medium:   { label: "Moyenne",  color: "#FBBF24" },
  low:      { label: "Basse",    color: "#34D399" },
  normal:   { label: "Normale",  color: "#818CF8" },
};

function getPriorityMeta(priority) {
  if (!priority) return null;
  const p = priority.toLowerCase();
  for (const [key, meta] of Object.entries(PRIORITY_META)) {
    if (p.includes(key)) return meta;
  }
  return null;
}

/* ── Filtres de statut ── */
const STATUS_FILTERS = [
  { id: "all",          label: "Tous",        test: null },
  { id: "in_progress",  label: "En cours",    test: (s) => /in.progress|progress/i.test(s) },
  { id: "closed",       label: "Clos",        test: (s) => /closed|resolved|cancel|done|complete/i.test(s) },
];

/* ── Filtres de type ── */
const MEP_KEYWORDS = /\b(?:prod|production|pr[ée]?[- ]?prod(?:uction)?|pp)\b/i;
const TYPE_FILTERS = [
  { id: "all",           label: "Tous",          test: null },
  { id: "intervention",  label: "Demandes",      test: (t) => t.isIntervention },
  { id: "ticket",        label: "Incidents",     test: (t) => !t.isIntervention },
  { id: "mep",           label: "MEP",           test: (t) => t.isIntervention && MEP_KEYWORDS.test(t.subject || '') },
];

function formatDate(d) {
  if (!d) return "—";
  try {
    const date = typeof d === "string" ? new Date(d) : d;
    return new Intl.DateTimeFormat("fr-FR", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }).format(date);
  } catch { return String(d); }
}

function relativeDate(d) {
  if (!d) return "—";
  try {
    const date = typeof d === "string" ? new Date(d) : d;
    const diff = Date.now() - date.getTime();
    const days = Math.floor(diff / 86400000);
    const hours = Math.floor(diff / 3600000);
    if (days > 30) return formatDate(d);
    if (days > 0) return `il y a ${days}j`;
    if (hours > 0) return `il y a ${hours}h`;
    return "récemment";
  } catch { return String(d); }
}

/* ── Ligne de ticket (vue liste) ── */
function TicketRow({ ticket, onToggleExpand, expanded, isMobile = false }) {
  const sm = getStatusMeta(ticket.status);
  const pm = getPriorityMeta(ticket.priority);
  const isInt = ticket.isIntervention;

  return (
    <div
      onClick={() => onToggleExpand(ticket.id)}
      style={{
        background: "rgba(255,255,255,0.03)",
        border: `1px solid ${isInt ? "rgba(52,211,153,0.12)" : "rgba(251,191,36,0.12)"}`,
        borderRadius: 10,
        padding: "10px 14px",
        cursor: "pointer",
        transition: "all 0.2s",
        position: "relative",
        overflow: "hidden",
      }}
      onMouseEnter={e => { e.currentTarget.style.borderColor = isInt ? "rgba(52,211,153,0.3)" : "rgba(251,191,36,0.3)"; e.currentTarget.style.background = "rgba(255,255,255,0.05)"; }}
      onMouseLeave={e => { e.currentTarget.style.borderColor = isInt ? "rgba(52,211,153,0.12)" : "rgba(251,191,36,0.12)"; e.currentTarget.style.background = "rgba(255,255,255,0.03)"; }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginLeft: 4 }}>
        {/* Barre latérale */}
        <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: 3, background: isInt ? "#34D399" : "#FBBF24" }} />

        {/* Icône type */}
        <div style={{
          flexShrink: 0, width: 28, height: 28, borderRadius: 7,
          display: "flex", alignItems: "center", justifyContent: "center",
          background: isInt ? "rgba(52,211,153,0.12)" : "rgba(251,191,36,0.12)",
          border: `1px solid ${isInt ? "rgba(52,211,153,0.25)" : "rgba(251,191,36,0.25)"}`,
        }}>
          {isInt ? <Wrench size={13} color="#34D399" /> : <Ticket size={13} color="#FBBF24" />}
        </div>

        {/* ID */}
        <span style={{
          fontSize: 11, fontWeight: 700, fontFamily: "'JetBrains Mono', monospace",
          color: isInt ? "#34D399" : "#FBBF24", flexShrink: 0, minWidth: 70,
        }}>{ticket.displayId}</span>

        {/* Sujet */}
        <span style={{
          fontSize: 12, fontWeight: 500, color: "#E5E7EB",
          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1,
        }}>{ticket.subject || "(sans sujet)"}</span>

        {/* Badges compacts */}
        <span style={{
          display: "inline-flex", alignItems: "center", gap: 3,
          fontSize: 10, fontWeight: 600, padding: "2px 7px", borderRadius: 10,
          background: `${sm.color}15`, border: `1px solid ${sm.color}30`, color: sm.color,
          flexShrink: 0,
        }}>
          <sm.Icon size={9} /> {sm.label}
        </span>
        {pm && (
          <span style={{
            display: "inline-flex", alignItems: "center", gap: 3,
            fontSize: 10, fontWeight: 600, padding: "2px 7px", borderRadius: 10,
            background: `${pm.color}15`, border: `1px solid ${pm.color}30`, color: pm.color,
            flexShrink: 0,
          }}>
            <Zap size={8} /> {pm.label}
          </span>
        )}
        {ticket.service && !isMobile && (
          <span style={{
            fontSize: 10, color: "#818CF8", fontWeight: 500, flexShrink: 0,
            padding: "2px 7px", borderRadius: 10,
            background: "rgba(99,102,241,0.08)", border: "1px solid rgba(99,102,241,0.15)",
          }}>{ticket.service}</span>
        )}

        {/* Date */}
        {ticket.createdAt && (
          <span style={{ fontSize: 10, color: "#4B5563", flexShrink: 0, fontFamily: "'JetBrains Mono', monospace" }}>
            {relativeDate(ticket.createdAt)}
          </span>
        )}

        {/* Chevron */}
        {expanded ? <ChevronDown size={13} color="#4B5563" /> : <ChevronRight size={13} color="#4B5563" />}
      </div>

      {/* Détails si étendu */}
      {expanded && (
        <div style={{ marginTop: 8, marginLeft: 42, display: "flex", flexDirection: "column", gap: 4, animation: "fadeIn 0.2s ease" }}>
          <DetailRow icon={Calendar} label="Créé le" value={formatDate(ticket.createdAt)} />
          {ticket.updatedAt && <DetailRow icon={Clock} label="Mis à jour" value={formatDate(ticket.updatedAt)} />}
          {ticket.closedAt && <DetailRow icon={CheckCircle2} label="Clôturé le" value={formatDate(ticket.closedAt)} />}
          {ticket.assignee && <DetailRow icon={User} label="Assigné à" value={ticket.assignee} />}
          {ticket.requester && <DetailRow icon={User} label="Demandeur" value={ticket.requester} />}
          {ticket.type && <DetailRow icon={Ticket} label="Type" value={ticket.type} />}
        </div>
      )}
    </div>
  );
}

/* ── Carte de ticket (vue grille) ── */
function TicketCard({ ticket, onToggleExpand, expanded }) {
  const sm = getStatusMeta(ticket.status);
  const pm = getPriorityMeta(ticket.priority);
  const isInt = ticket.isIntervention;

  return (
    <div
      onClick={() => onToggleExpand(ticket.id)}
      style={{
        background: "rgba(255,255,255,0.03)",
        border: `1px solid ${isInt ? "rgba(52,211,153,0.15)" : "rgba(251,191,36,0.15)"}`,
        borderRadius: 12,
        padding: "14px 16px",
        cursor: "pointer",
        transition: "all 0.2s",
        position: "relative",
        overflow: "hidden",
      }}
      onMouseEnter={e => { e.currentTarget.style.borderColor = isInt ? "rgba(52,211,153,0.35)" : "rgba(251,191,36,0.35)"; e.currentTarget.style.background = "rgba(255,255,255,0.05)"; }}
      onMouseLeave={e => { e.currentTarget.style.borderColor = isInt ? "rgba(52,211,153,0.15)" : "rgba(251,191,36,0.15)"; e.currentTarget.style.background = "rgba(255,255,255,0.03)"; }}
    >
      {/* Barre latérale colorée selon le type */}
      <div style={{
        position: "absolute", left: 0, top: 0, bottom: 0, width: 3,
        background: isInt ? "#34D399" : "#FBBF24",
      }} />

      <div style={{ display: "flex", alignItems: "flex-start", gap: 10, marginLeft: 4 }}>
        {/* Icône type */}
        <div style={{
          flexShrink: 0, width: 32, height: 32, borderRadius: 8,
          display: "flex", alignItems: "center", justifyContent: "center",
          background: isInt ? "rgba(52,211,153,0.12)" : "rgba(251,191,36,0.12)",
          border: `1px solid ${isInt ? "rgba(52,211,153,0.25)" : "rgba(251,191,36,0.25)"}`,
        }}>
          {isInt ? <Wrench size={15} color="#34D399" /> : <Ticket size={15} color="#FBBF24" />}
        </div>

        {/* Contenu */}
        <div style={{ flex: 1, minWidth: 0 }}>
          {/* Ligne 1 : ID + sujet */}
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
            <span style={{
              fontSize: 11, fontWeight: 700, fontFamily: "'JetBrains Mono', monospace",
              color: isInt ? "#34D399" : "#FBBF24", flexShrink: 0,
            }}>{ticket.displayId}</span>
            <span style={{
              fontSize: 13, fontWeight: 600, color: "#E5E7EB",
              overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1,
            }}>{ticket.subject || "(sans sujet)"}</span>
          </div>

          {/* Ligne 2 : badges */}
          <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
            {/* Statut */}
            <span style={{
              display: "inline-flex", alignItems: "center", gap: 4,
              fontSize: 10, fontWeight: 600, padding: "2px 8px", borderRadius: 12,
              background: `${sm.color}15`, border: `1px solid ${sm.color}30`, color: sm.color,
            }}>
              <sm.Icon size={10} /> {sm.label}
            </span>
            {/* Priorité */}
            {pm && (
              <span style={{
                display: "inline-flex", alignItems: "center", gap: 4,
                fontSize: 10, fontWeight: 600, padding: "2px 8px", borderRadius: 12,
                background: `${pm.color}15`, border: `1px solid ${pm.color}30`, color: pm.color,
              }}>
                <Zap size={9} /> {pm.label}
              </span>
            )}
            {/* Service */}
            {ticket.service && (
              <span style={{
                fontSize: 10, color: "#818CF8", fontWeight: 500,
                padding: "2px 8px", borderRadius: 12,
                background: "rgba(99,102,241,0.08)", border: "1px solid rgba(99,102,241,0.15)",
              }}>{ticket.service}</span>
            )}
            {/* Environnement */}
            {ticket.env && (
              <span style={{
                fontSize: 10, color: "#6B7280", fontWeight: 500,
              }}>{ticket.env}</span>
            )}
          </div>

          {/* Ligne 3 : dates + assigné (si replié) */}
          {!expanded && (
            <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 6, fontSize: 10, color: "#4B5563" }}>
              {ticket.createdAt && (
                <span style={{ display: "flex", alignItems: "center", gap: 3 }}>
                  <Calendar size={9} /> {relativeDate(ticket.createdAt)}
                </span>
              )}
              {ticket.assignee && (
                <span style={{ display: "flex", alignItems: "center", gap: 3 }}>
                  <User size={9} /> {ticket.assignee}
                </span>
              )}
            </div>
          )}

          {/* Détails si étendu */}
          {expanded && (
            <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 6, animation: "fadeIn 0.2s ease" }}>
              <DetailRow icon={Calendar} label="Créé le" value={formatDate(ticket.createdAt)} />
              {ticket.updatedAt && <DetailRow icon={Clock} label="Mis à jour" value={formatDate(ticket.updatedAt)} />}
              {ticket.closedAt && <DetailRow icon={CheckCircle2} label="Clôturé le" value={formatDate(ticket.closedAt)} />}
              {ticket.assignee && <DetailRow icon={User} label="Assigné à" value={ticket.assignee} />}
              {ticket.requester && <DetailRow icon={User} label="Demandeur" value={ticket.requester} />}
              {ticket.type && <DetailRow icon={Ticket} label="Type" value={ticket.type} />}
            </div>
          )}
        </div>

        {/* Chevron */}
        <div style={{ flexShrink: 0, paddingTop: 2 }}>
          {expanded ? <ChevronDown size={14} color="#4B5563" /> : <ChevronRight size={14} color="#4B5563" />}
        </div>
      </div>
    </div>
  );
}

function DetailRow({ icon: Icon, label, value }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 11 }}>
      <Icon size={11} color="#4B5563" style={{ flexShrink: 0 }} />
      <span style={{ color: "#6B7280", fontWeight: 500, minWidth: 80 }}>{label}</span>
      <span style={{ color: "#9CA3AF", fontFamily: "'JetBrains Mono', monospace" }}>{value}</span>
    </div>
  );
}

/* ── Vue principale ── */
export default function MEPView({ isMobile = false, tickets = [], loading = false, error = null, lastLoad = null, onRefresh }) {
  const [filterText, setFilterText] = useState("");
  const [filterStatus, setFilterStatus] = useState("all");
  const [filterType, setFilterType] = useState("all");
  const [filterMonth, setFilterMonth] = useState("all");
  const [viewMode, setViewMode] = useState(() => localStorage.getItem("g1oeil_mep_view") || "grid");
  const [expandedId, setExpandedId] = useState(null);

  /* Filtrage */
  const statusFilter = STATUS_FILTERS.find(f => f.id === filterStatus);
  const typeFilter = TYPE_FILTERS.find(f => f.id === filterType);
  const filtered = useMemo(() => {
    return tickets.filter(t => {
      if (statusFilter?.test && !statusFilter.test(t.status || "")) return false;
      if (typeFilter?.test && !typeFilter.test(t)) return false;
      if (filterMonth !== "all") {
        const d = t.createdAt ? new Date(t.createdAt) : null;
        if (!d || isNaN(d)) return false;
        const monthKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
        if (monthKey !== filterMonth) return false;
      }
      if (filterText) {
        const q = filterText.toLowerCase();
        if (!t.subject?.toLowerCase().includes(q) &&
            !t.displayId?.toLowerCase().includes(q) &&
            !t.assignee?.toLowerCase().includes(q) &&
            !t.service?.toLowerCase().includes(q) &&
            !t.requester?.toLowerCase().includes(q)) return false;
      }
      return true;
    });
  }, [tickets, statusFilter, typeFilter, filterMonth, filterText]);

  /* Stats */
  const stats = useMemo(() => {
    const interventions = tickets.filter(t => t.isIntervention);
    const stdTickets = tickets.filter(t => !t.isIntervention);
    const mep = interventions.filter(t => MEP_KEYWORDS.test(t.subject || '')).length;
    const inProgress = tickets.filter(t => /in.progress|progress/i.test(t.status || "")).length;
    const closed = tickets.filter(t => /closed|resolved|cancel|done|complete/i.test(t.status || "")).length;
    return { total: tickets.length, interventions: interventions.length, tickets: stdTickets.length, mep, inProgress, closed };
  }, [tickets]);

  /* Mois disponibles pour le filtre */
  const availableMonths = useMemo(() => {
    const set = new Set();
    tickets.forEach(t => {
      const d = t.createdAt ? new Date(t.createdAt) : null;
      if (d && !isNaN(d)) {
        set.add(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
      }
    });
    return [...set].sort((a, b) => b.localeCompare(a));
  }, [tickets]);

  useEffect(() => { localStorage.setItem("g1oeil_mep_view", viewMode); }, [viewMode]);

  const toggleExpand = (id) => setExpandedId(prev => prev === id ? null : id);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {/* ── En-tête avec stats ── */}
      <div style={{
        display: "grid", gridTemplateColumns: isMobile ? "repeat(2, 1fr)" : "repeat(auto-fit, minmax(160px, 1fr))",
        gap: 10,
      }}>
        <StatCard icon={Wrench} label="Demandes" value={stats.interventions} color="#34D399" />
        <StatCard icon={Ticket} label="Incidents" value={stats.tickets} color="#FBBF24" />
        <StatCard icon={Zap} label="MEP" value={stats.mep} color="#A78BFA" />
        <StatCard icon={Clock} label="En cours" value={stats.inProgress} color="#FB923C" />
        <StatCard icon={CheckCircle2} label="Clos" value={stats.closed} color="#6B7280" />
      </div>

      {/* ── Barre d'actions ── */}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
        <button
          onClick={onRefresh}
          disabled={loading}
          style={{
            display: "inline-flex", alignItems: "center", gap: 6, padding: "7px 14px", borderRadius: 9,
            background: "rgba(52,211,153,0.1)", border: "1px solid rgba(52,211,153,0.2)",
            color: "#34D399", fontSize: 12, fontWeight: 600, cursor: loading ? "wait" : "pointer",
            transition: "all 0.15s", whiteSpace: "nowrap",
          }}
        >
          {loading ? <Loader2 size={13} className="spin" /> : <RefreshCw size={13} />}
          {isMobile ? "" : " Actualiser"}
        </button>

        {lastLoad && (
          <span style={{ fontSize: 10, color: "#4B5563" }}>
            Dernière maj : {relativeDate(lastLoad)}
          </span>
        )}

        <div style={{ flex: 1 }} />

        {/* Toggle vue grille / liste */}
        <div style={{ display: "flex", borderRadius: 9, overflow: "hidden", border: "1px solid rgba(255,255,255,0.08)", flexShrink: 0 }}>
          {[["grid", LayoutGrid], ["list", List]].map(([mode, Icon]) => (
            <button key={mode} onClick={() => setViewMode(mode)} title={mode === "grid" ? "Vue grille" : "Vue liste"} style={{
              padding: "6px 10px", cursor: "pointer", display: "flex", alignItems: "center", border: "none",
              background: viewMode === mode ? "rgba(99,102,241,0.25)" : "rgba(255,255,255,0.03)",
              color: viewMode === mode ? "#A5B4FC" : "#4B5563", transition: "background 0.15s, color 0.15s",
            }}><Icon size={14} /></button>
          ))}
        </div>

        {/* Recherche */}
        <div style={{
          display: "flex", alignItems: "center", gap: 7, minWidth: isMobile ? 120 : 200,
          background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.07)",
          borderRadius: 9, padding: "5px 12px",
        }}>
          <Search size={13} color="#4B5563" style={{ flexShrink: 0 }} />
          <input value={filterText} onChange={e => setFilterText(e.target.value)}
            placeholder="Rechercher…"
            style={{ flex: 1, background: "transparent", border: "none", color: "#E5E7EB", fontSize: 12, fontFamily: "'JetBrains Mono', monospace", outline: "none" }} />
          {filterText && (
            <button onClick={() => setFilterText("")} style={{ background: "none", border: "none", color: "#4B5563", cursor: "pointer", display: "flex", padding: 0 }}>
              <X size={12} />
            </button>
          )}
        </div>
      </div>

      {/* ── Filtres type + statut ── */}
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
        <span style={{ fontSize: 10, color: "#4B5563", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em", marginRight: 4 }}>
          <Filter size={10} style={{ verticalAlign: "middle" }} /> Type
        </span>
        {TYPE_FILTERS.map(({ id, label }) => (
          <button key={`type-${id}`} onClick={() => setFilterType(id)} style={{
            padding: "5px 11px", borderRadius: 20, fontSize: 11, cursor: "pointer",
            fontWeight: filterType === id ? 700 : 400,
            border: `1px solid ${filterType === id ? "rgba(99,102,241,0.4)" : "rgba(255,255,255,0.07)"}`,
            background: filterType === id ? "rgba(99,102,241,0.18)" : "rgba(255,255,255,0.03)",
            color: filterType === id ? "#A5B4FC" : "#6B7280", transition: "all 0.15s",
          }}>{label}</button>
        ))}

        <span style={{ fontSize: 10, color: "#4B5563", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em", margin: "0 4px 0 12px" }}>
          Statut
        </span>
        {STATUS_FILTERS.map(({ id, label }) => (
          <button key={`status-${id}`} onClick={() => setFilterStatus(id)} style={{
            padding: "5px 11px", borderRadius: 20, fontSize: 11, cursor: "pointer",
            fontWeight: filterStatus === id ? 700 : 400,
            border: `1px solid ${filterStatus === id ? "rgba(99,102,241,0.4)" : "rgba(255,255,255,0.07)"}`,
            background: filterStatus === id ? "rgba(99,102,241,0.18)" : "rgba(255,255,255,0.03)",
            color: filterStatus === id ? "#A5B4FC" : "#6B7280", transition: "all 0.15s",
          }}>{label}</button>
        ))}

        {/* Filtre par mois */}
        <span style={{ fontSize: 10, color: "#4B5563", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em", margin: "0 4px 0 12px" }}>
          Mois
        </span>
        <select value={filterMonth} onChange={e => setFilterMonth(e.target.value)} style={{
          padding: "5px 10px", borderRadius: 20, fontSize: 11, cursor: "pointer",
          background: filterMonth !== "all" ? "rgba(99,102,241,0.18)" : "rgba(255,255,255,0.03)",
          border: `1px solid ${filterMonth !== "all" ? "rgba(99,102,241,0.4)" : "rgba(255,255,255,0.07)"}`,
          color: filterMonth !== "all" ? "#A5B4FC" : "#6B7280", fontWeight: filterMonth !== "all" ? 700 : 400,
          fontFamily: "'JetBrains Mono', monospace", outline: "none",
        }}>
          <option value="all" style={{ background: "#1F2937" }}>Tous</option>
          {availableMonths.map(m => {
            const [y, mo] = m.split("-");
            const date = new Date(+y, +mo - 1, 1);
            const label = new Intl.DateTimeFormat("fr-FR", { month: "long", year: "numeric" }).format(date);
            return <option key={m} value={m} style={{ background: "#1F2937" }}>{label}</option>;
          })}
        </select>

        <span style={{ fontSize: 11, color: "#4B5563", marginLeft: "auto" }}>
          {filtered.length} / {tickets.length}
        </span>
      </div>

      {/* ── Message d'erreur ── */}
      {error && (
        <div style={{
          display: "flex", alignItems: "center", gap: 8, padding: "10px 14px", borderRadius: 10,
          background: "rgba(248,113,113,0.08)", border: "1px solid rgba(248,113,113,0.2)",
          color: "#F87171", fontSize: 12,
        }}>
          <AlertTriangle size={14} style={{ flexShrink: 0 }} />
          {error}
        </div>
      )}

      {/* ── Liste des tickets ── */}
      {loading && tickets.length === 0 ? (
        <div style={{ textAlign: "center", padding: 60, color: "#4B5563" }}>
          <Loader2 size={28} className="spin" style={{ marginBottom: 12 }} />
          <p style={{ fontSize: 13 }}>Chargement des tickets depuis ITCare…</p>
        </div>
      ) : filtered.length === 0 && !error ? (
        <div style={{
          textAlign: "center", padding: "50px 20px", color: "#4B5563",
          background: "rgba(255,255,255,0.02)", borderRadius: 14, border: "1px dashed rgba(255,255,255,0.08)",
        }}>
          <Ticket size={36} style={{ marginBottom: 10, opacity: 0.3 }} />
          <p style={{ fontSize: 14, marginBottom: 4 }}>
            {tickets.length === 0 ? "Aucun ticket chargé" : "Aucun résultat pour ce filtre"}
          </p>
          <p style={{ fontSize: 12 }}>
            {tickets.length === 0 ? "Cliquez sur « Actualiser » pour récupérer les tickets depuis ITCare." : "Modifiez les filtres ci-dessus."}
          </p>
        </div>
      ) : viewMode === "grid" ? (
        <div style={{
          display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(380px, 1fr))",
          gap: 10,
        }}>
          {filtered.map((t, i) => (
            <div key={t.id || i} style={{ animation: `fadeIn 0.3s ease ${Math.min(i * 0.03, 0.6)}s both` }}>
              <TicketCard ticket={t} expanded={expandedId === t.id} onToggleExpand={toggleExpand} />
            </div>
          ))}
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {filtered.map((t, i) => (
            <div key={t.id || i} style={{ animation: `fadeIn 0.3s ease ${Math.min(i * 0.02, 0.4)}s both` }}>
              <TicketRow ticket={t} expanded={expandedId === t.id} onToggleExpand={toggleExpand} isMobile={isMobile} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ── Carte de stat ── */
function StatCard({ icon: Icon, label, value, color }) {
  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 10, padding: "12px 14px", borderRadius: 11,
      background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)",
    }}>
      <div style={{
        width: 34, height: 34, borderRadius: 9, flexShrink: 0,
        display: "flex", alignItems: "center", justifyContent: "center",
        background: `${color}12`, border: `1px solid ${color}25`,
      }}>
        <Icon size={16} color={color} />
      </div>
      <div>
        <div style={{ fontSize: 18, fontWeight: 700, color: "#F3F4F6", fontFamily: "'JetBrains Mono', monospace" }}>{value}</div>
        <div style={{ fontSize: 10, color: "#6B7280", textTransform: "uppercase", letterSpacing: "0.04em" }}>{label}</div>
      </div>
    </div>
  );
}
