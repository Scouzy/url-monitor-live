import { useState, useEffect, useRef } from "react";
import {
  Plus, X, ChevronLeft, ChevronRight, List, Grid3X3,
  Clock, Server, Lock, BarChart3, Pencil, Download,
  CheckCircle, Circle, History, Check, Columns3,
} from "lucide-react";
import * as XLSX from "xlsx";
import { loadTodos, saveTodos, makeTodo, updateTodo, deleteTodo } from "../utils/todoStorage";
import { recommendations } from "../utils/servers";

/* ── Constantes ── */
const PRIO = {
  high:   { color: "#F87171", bg: "rgba(248,113,113,0.1)",  border: "rgba(248,113,113,0.3)" },
  medium: { color: "#FBBF24", bg: "rgba(251,191,36,0.1)",   border: "rgba(251,191,36,0.3)" },
  low:    { color: "#34D399", bg: "rgba(52,211,153,0.1)",   border: "rgba(52,211,153,0.3)" },
};

const TYPE_META = {
  manual:   { label: "Manuel",   color: "#818CF8", Icon: Pencil },
  capacity: { label: "Capacité", color: "#FB923C", Icon: BarChart3 },
  ssl:      { label: "SSL",      color: "#FBBF24", Icon: Lock },
  server:   { label: "Serveur",  color: "#F87171", Icon: Server },
};

const STATUS_COLS = [
  { id: "todo",        label: "À faire",  color: "#6B7280" },
  { id: "in_progress", label: "En cours", color: "#818CF8" },
  { id: "done",        label: "Terminé",  color: "#34D399" },
];

/* ── Excel export ── */
function exportToExcel(todos) {
  const rows = todos.map(t => ({
    "Titre":       t.title,
    "Description": t.description || "",
    "Type":        { manual: "Manuel", capacity: "Capacité", ssl: "SSL", server: "Serveur" }[t.type] || t.type,
    "Statut":      { todo: "À faire", in_progress: "En cours", done: "Terminé" }[t.status] || t.status,
    "Priorité":    { high: "Haute", medium: "Moyenne", low: "Basse" }[t.priority] || t.priority,
    "Créé le":     new Date(t.createdAt).toLocaleDateString("fr-FR"),
    "Terminé le":  t.doneAt ? new Date(t.doneAt).toLocaleDateString("fr-FR") : "",
    "Source":      t.source || "",
  }));
  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Tâches");
  XLSX.writeFile(wb, `taches-${new Date().toISOString().slice(0, 10)}.xlsx`);
}

/* ── Composant carte de tâche ── */
function TaskCard({ task, onUpdate, onDelete, compact = false, showMove, onMoveLeft, onMoveRight }) {
  const prio = PRIO[task.priority] || PRIO.medium;
  const typeMeta = TYPE_META[task.type] || TYPE_META.manual;
  const TypeIcon = typeMeta.Icon;
  const isDone = task.status === "done";

  return (
    <div style={{
      background: isDone ? "rgba(255,255,255,0.02)" : "rgba(255,255,255,0.04)",
      borderRadius: 10, border: `1px solid ${isDone ? "rgba(255,255,255,0.06)" : prio.border}`,
      padding: compact ? "8px 10px" : "12px 14px",
      opacity: isDone ? 0.6 : 1,
    }}>
      <div style={{ display: "flex", alignItems: "flex-start", gap: 7 }}>
        <TypeIcon size={11} color={typeMeta.color} style={{ marginTop: 3, flexShrink: 0 }} />
        <span style={{
          flex: 1, fontSize: compact ? 11 : 12, fontWeight: 600, color: isDone ? "#6B7280" : "#E5E7EB",
          lineHeight: 1.4, textDecoration: isDone ? "line-through" : "none",
        }}>
          {task.title}
        </span>
        {onDelete && (
          <button onClick={() => onDelete(task.id)} style={{ background: "none", border: "none", color: "#4B5563", cursor: "pointer", padding: 0, flexShrink: 0 }}
            onMouseEnter={e => e.currentTarget.style.color = "#F87171"}
            onMouseLeave={e => e.currentTarget.style.color = "#4B5563"}>
            <X size={11} />
          </button>
        )}
      </div>

      {task.description && !compact && (
        <p style={{ fontSize: 10, color: "#6B7280", margin: "5px 0 0 18px", lineHeight: 1.4 }}>
          {task.description.length > 120 ? task.description.slice(0, 120) + "…" : task.description}
        </p>
      )}

      <div style={{ display: "flex", alignItems: "center", gap: 5, marginTop: 8, marginLeft: 18 }}>
        <span style={{
          fontSize: 9, padding: "1px 7px", borderRadius: 6, fontWeight: 700,
          background: prio.bg, color: prio.color, border: `1px solid ${prio.border}`,
        }}>
          {{ high: "Haute", medium: "Moy.", low: "Basse" }[task.priority]}
        </span>
        <span style={{ fontSize: 9, padding: "1px 7px", borderRadius: 6, background: `${typeMeta.color}18`, color: typeMeta.color }}>
          {typeMeta.label}
        </span>
        <span style={{ fontSize: 9, color: "#4B5563", marginLeft: "auto" }}>
          {new Date(task.createdAt).toLocaleDateString("fr-FR")}
        </span>
        {showMove && (
          <div style={{ display: "flex", gap: 2 }}>
            {onMoveLeft  && <button onClick={onMoveLeft}  style={{ background: "none", border: "none", color: "#6B7280", cursor: "pointer", padding: 2, display: "flex" }}><ChevronLeft  size={13} /></button>}
            {onMoveRight && <button onClick={onMoveRight} style={{ background: "none", border: "none", color: "#6B7280", cursor: "pointer", padding: 2, display: "flex" }}><ChevronRight size={13} /></button>}
          </div>
        )}
        {!showMove && onUpdate && (
          <button onClick={() => onUpdate(task.id, { status: isDone ? "todo" : "done" })} style={{
            background: "none", border: "none", color: isDone ? "#34D399" : "#4B5563", cursor: "pointer", padding: 2, display: "flex",
          }}>
            {isDone ? <CheckCircle size={13} /> : <Circle size={13} />}
          </button>
        )}
      </div>
    </div>
  );
}

/* ── Vue Kanban ── */
function KanbanView({ todos, onUpdate, onDelete }) {
  const STATUSES = ["todo", "in_progress", "done"];
  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 14, alignItems: "flex-start" }}>
      {STATUS_COLS.map((col, ci) => {
        const colTodos = todos.filter(t => t.status === col.id);
        return (
          <div key={col.id} style={{ background: "rgba(255,255,255,0.02)", borderRadius: 12, border: "1px solid rgba(255,255,255,0.07)" }}>
            <div style={{ padding: "11px 14px 10px", borderBottom: "1px solid rgba(255,255,255,0.06)", display: "flex", alignItems: "center", gap: 7 }}>
              <span style={{ width: 8, height: 8, borderRadius: "50%", background: col.color, display: "inline-block", flexShrink: 0 }} />
              <span style={{ fontSize: 11, fontWeight: 700, color: "#9CA3AF", textTransform: "uppercase", letterSpacing: "0.06em" }}>{col.label}</span>
              <span style={{ fontSize: 10, color: "#4B5563", marginLeft: "auto",
                background: "rgba(255,255,255,0.05)", borderRadius: 8, padding: "1px 6px" }}>{colTodos.length}</span>
            </div>
            <div style={{ padding: 8, display: "flex", flexDirection: "column", gap: 6, minHeight: 60 }}>
              {colTodos.map(t => (
                <TaskCard
                  key={t.id} task={t} onDelete={onDelete}
                  showMove
                  onMoveLeft={ci > 0 ? () => onUpdate(t.id, { status: STATUSES[ci - 1] }) : null}
                  onMoveRight={ci < 2 ? () => onUpdate(t.id, { status: STATUSES[ci + 1] }) : null}
                />
              ))}
              {colTodos.length === 0 && (
                <div style={{ textAlign: "center", padding: "16px 0", fontSize: 10, color: "#374151" }}>Vide</div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* ── Vue Liste ── */
function ListView({ todos, onUpdate, onDelete }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
      {todos.filter(t => t.status !== "done").map(t => (
        <div key={t.id} style={{ display: "flex", alignItems: "center", gap: 10, background: "rgba(255,255,255,0.03)", borderRadius: 10, padding: "9px 14px", border: "1px solid rgba(255,255,255,0.07)" }}>
          <button onClick={() => onUpdate(t.id, { status: t.status === "in_progress" ? "todo" : "in_progress" })} style={{
            background: t.status === "in_progress" ? "rgba(129,140,248,0.15)" : "rgba(255,255,255,0.04)",
            border: `1px solid ${t.status === "in_progress" ? "rgba(129,140,248,0.4)" : "rgba(255,255,255,0.1)"}`,
            borderRadius: 6, padding: "3px 8px", fontSize: 10, color: t.status === "in_progress" ? "#A5B4FC" : "#6B7280",
            cursor: "pointer", whiteSpace: "nowrap",
          }}>
            {t.status === "in_progress" ? "En cours" : "À faire"}
          </button>
          <span style={{ flex: 1, fontSize: 12, fontWeight: 600, color: "#E5E7EB", lineHeight: 1.3 }}>{t.title}</span>
          <span style={{ fontSize: 9, padding: "1px 7px", borderRadius: 6, fontWeight: 700,
            background: PRIO[t.priority].bg, color: PRIO[t.priority].color, flexShrink: 0 }}>
            {{ high: "Haute", medium: "Moy.", low: "Basse" }[t.priority]}
          </span>
          <button onClick={() => onUpdate(t.id, { status: "done" })} style={{ background: "none", border: "none", color: "#4B5563", cursor: "pointer", display: "flex", flexShrink: 0 }}
            title="Marquer comme terminé"
            onMouseEnter={e => e.currentTarget.style.color = "#34D399"}
            onMouseLeave={e => e.currentTarget.style.color = "#4B5563"}>
            <CheckCircle size={15} />
          </button>
          <button onClick={() => onDelete(t.id)} style={{ background: "none", border: "none", color: "#4B5563", cursor: "pointer", display: "flex", flexShrink: 0 }}
            onMouseEnter={e => e.currentTarget.style.color = "#F87171"}
            onMouseLeave={e => e.currentTarget.style.color = "#4B5563"}>
            <X size={14} />
          </button>
        </div>
      ))}
    </div>
  );
}

/* ── Vue Grille ── */
function GridView({ todos, onUpdate, onDelete }) {
  const active = todos.filter(t => t.status !== "done");
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: 12 }}>
      {active.map(t => (
        <TaskCard key={t.id} task={t} onUpdate={onUpdate} onDelete={onDelete} />
      ))}
    </div>
  );
}

/* ── Vue Historique ── */
function HistoryView({ todos, onUpdate, onDelete }) {
  const done = todos.filter(t => t.status === "done").sort((a, b) => (b.doneAt || 0) - (a.doneAt || 0));
  if (done.length === 0) {
    return (
      <div style={{ textAlign: "center", padding: "60px 0", color: "#4B5563" }}>
        <CheckCircle size={36} style={{ display: "block", margin: "0 auto 12px", opacity: 0.25 }} />
        <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 4 }}>Aucune tâche terminée</div>
        <div style={{ fontSize: 11 }}>Complétez des tâches pour les voir apparaître ici.</div>
      </div>
    );
  }
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
      {done.map(t => (
        <div key={t.id} style={{ display: "flex", alignItems: "center", gap: 10, background: "rgba(255,255,255,0.02)", borderRadius: 10, padding: "9px 14px", border: "1px solid rgba(255,255,255,0.05)", opacity: 0.7 }}>
          <CheckCircle size={13} color="#34D399" style={{ flexShrink: 0 }} />
          <span style={{ flex: 1, fontSize: 12, color: "#9CA3AF", textDecoration: "line-through" }}>{t.title}</span>
          {t.doneAt && <span style={{ fontSize: 9, color: "#4B5563", flexShrink: 0 }}>{new Date(t.doneAt).toLocaleDateString("fr-FR")}</span>}
          <button onClick={() => onUpdate(t.id, { status: "todo" })} style={{ background: "none", border: "none", color: "#4B5563", cursor: "pointer", fontSize: 10, flexShrink: 0 }}
            title="Réouvrir">
            ↩
          </button>
          <button onClick={() => onDelete(t.id)} style={{ background: "none", border: "none", color: "#4B5563", cursor: "pointer", display: "flex", flexShrink: 0 }}
            onMouseEnter={e => e.currentTarget.style.color = "#F87171"}
            onMouseLeave={e => e.currentTarget.style.color = "#4B5563"}>
            <X size={13} />
          </button>
        </div>
      ))}
    </div>
  );
}

/* ── Formulaire d'ajout ── */
function AddForm({ onAdd, onClose }) {
  const [title, setTitle]       = useState("");
  const [desc, setDesc]         = useState("");
  const [priority, setPriority] = useState("medium");
  const [type, setType]         = useState("manual");

  const handle = () => {
    if (!title.trim()) return;
    onAdd(makeTodo({ title: title.trim(), description: desc.trim(), priority, type }));
    setTitle(""); setDesc(""); setPriority("medium"); setType("manual");
    onClose();
  };

  const sel = {
    background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)",
    borderRadius: 8, color: "#E5E7EB", fontSize: 12, padding: "6px 10px", cursor: "pointer",
  };

  return (
    <div style={{ background: "rgba(99,102,241,0.08)", border: "1px solid rgba(99,102,241,0.25)", borderRadius: 12, padding: 16, marginBottom: 16 }}>
      <div style={{ fontSize: 12, fontWeight: 700, color: "#A5B4FC", marginBottom: 10 }}>Nouvelle tâche</div>
      <input
        autoFocus value={title} onChange={e => setTitle(e.target.value)}
        onKeyDown={e => { if (e.key === "Enter") handle(); if (e.key === "Escape") onClose(); }}
        placeholder="Titre de la tâche…"
        style={{ width: "100%", background: "rgba(255,255,255,0.07)", border: "1px solid rgba(99,102,241,0.35)", borderRadius: 8, color: "#E5E7EB", fontSize: 13, padding: "8px 12px", outline: "none", boxSizing: "border-box", marginBottom: 8 }}
      />
      <textarea
        value={desc} onChange={e => setDesc(e.target.value)}
        placeholder="Description (optionnel)…"
        rows={2}
        style={{ width: "100%", background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, color: "#D1D5DB", fontSize: 12, padding: "7px 12px", outline: "none", resize: "vertical", boxSizing: "border-box", marginBottom: 8 }}
      />
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
        <select value={priority} onChange={e => setPriority(e.target.value)} style={sel}>
          <option value="high">🔴 Haute</option>
          <option value="medium">🟡 Moyenne</option>
          <option value="low">🟢 Basse</option>
        </select>
        <select value={type} onChange={e => setType(e.target.value)} style={sel}>
          <option value="manual">Manuel</option>
          <option value="server">Serveur</option>
          <option value="capacity">Capacité</option>
          <option value="ssl">SSL</option>
        </select>
        <div style={{ marginLeft: "auto", display: "flex", gap: 6 }}>
          <button onClick={onClose} style={{ ...sel, color: "#6B7280" }}><X size={13} /></button>
          <button onClick={handle} disabled={!title.trim()} style={{
            background: title.trim() ? "rgba(99,102,241,0.2)" : "rgba(255,255,255,0.04)",
            border: "1px solid rgba(99,102,241,0.35)", borderRadius: 8, color: title.trim() ? "#A5B4FC" : "#4B5563",
            fontSize: 12, fontWeight: 700, padding: "6px 16px", cursor: title.trim() ? "pointer" : "default",
            display: "flex", alignItems: "center", gap: 5,
          }}>
            <Check size={13} /> Ajouter
          </button>
        </div>
      </div>
    </div>
  );
}

/* ── Composant principal ── */
export default function TodoList({ servers = [], allUrls = [] }) {
  const [todos, setTodos]       = useState(() => loadTodos());
  const [view, setView]         = useState("kanban");
  const [addOpen, setAddOpen]   = useState(false);
  /* ── Auto-populate depuis recommandations & SSL ── */
  useEffect(() => {
    setTodos(prev => {
      let changed = false;
      const next = [...prev];

      /* Recommandations capacity (critical + high) */
      if (servers && servers.length > 0) {
        recommendations(servers)
          .filter(r => r.severity === "critical" || r.severity === "high")
          .forEach(r => {
            const src = `capacity-${r.server || "fleet"}-${r.type}`;
            if (!next.find(t => t.source === src && t.status !== "done")) {
              next.push(makeTodo({
                title: r.severity === "critical" ? `⚠️ Action immédiate : ${r.server || "Flotte"}` : `📈 Saturation prévue : ${r.server || "Flotte"}`,
                description: r.text,
                type: "capacity",
                priority: r.severity === "critical" ? "high" : "medium",
                source: src,
              }));
              changed = true;
            }
          });
      }

      /* SSL expiry ≤ 30 jours — dédup par domaine */
      if (allUrls) {
        const seenDomains = new Set(next.filter(t => t.type === "ssl" && t.status !== "done").map(t => t.source));
        allUrls
          .filter(u => u.sslInfo?.daysLeft != null && u.sslInfo.daysLeft <= 30)
          .forEach(u => {
            const domain = (() => { try { return new URL(u.url).hostname; } catch { return u.url; } })();
            const src = `ssl-${domain}`;
            if (!seenDomains.has(src) && !next.find(t => t.source === src && t.status !== "done")) {
              seenDomains.add(src);
              const d = u.sslInfo.daysLeft;
              next.push(makeTodo({
                title: d <= 0 ? `🔐 SSL expiré : ${domain}` : `🔐 SSL expire dans ${d}j : ${domain}`,
                description: `Certificat : ${u.sslInfo.issuer || "inconnu"} · Expire le ${u.sslInfo.notAfter ? new Date(u.sslInfo.notAfter).toLocaleDateString("fr-FR") : "?"}`,
                type: "ssl",
                priority: d <= 0 || d <= 7 ? "high" : d <= 14 ? "medium" : "low",
                source: src,
              }));
              changed = true;
            }
          });
      }

      if (changed) { saveTodos(next); return next; }
      return prev;
    });
  }, [servers, allUrls]); // eslint-disable-line

  const handleUpdate = (id, patch) => setTodos(prev => updateTodo(prev, id, patch));
  const handleDelete = (id)        => setTodos(prev => deleteTodo(prev, id));
  const handleAdd    = (todo)      => setTodos(prev => { const n = [...prev, todo]; saveTodos(n); return n; });

  const activeTodos = todos.filter(t => t.status !== "done");
  const doneTodos   = todos.filter(t => t.status === "done");

  const VIEWS = [
    { id: "kanban",  label: "Kanban",     Icon: Columns3  },
    { id: "list",    label: "Liste",      Icon: List      },
    { id: "grid",    label: "Grille",     Icon: Grid3X3   },
    { id: "history", label: "Historique", Icon: History   },
  ];

  const btnV = { background: "none", border: "none", cursor: "pointer", padding: "5px 10px", borderRadius: 8, fontSize: 12, display: "flex", alignItems: "center", gap: 5, transition: "background 0.15s" };

  return (
    <div>

      {/* ── En-tête ── */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 20, flexWrap: "wrap" }}>

        {/* Compteurs */}
        <div style={{ display: "flex", gap: 8 }}>
          {[
            { label: "Total",     value: todos.length,     color: "#818CF8" },
            { label: "En cours",  value: activeTodos.length, color: "#FBBF24" },
            { label: "Terminées", value: doneTodos.length, color: "#34D399" },
          ].map(s => (
            <div key={s.label} style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 10, padding: "8px 14px" }}>
              <div style={{ fontSize: 9, color: "#4B5563", marginBottom: 2 }}>{s.label}</div>
              <div style={{ fontSize: 18, fontWeight: 700, color: s.color, fontFamily: "'JetBrains Mono', monospace" }}>{s.value}</div>
            </div>
          ))}
        </div>

        {/* Vue toggle */}
        <div style={{ display: "flex", background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 10, overflow: "hidden", marginLeft: "auto" }}>
          {VIEWS.map(({ id, label, Icon }) => (
            <button key={id} onClick={() => setView(id)} title={label} style={{
              ...btnV,
              background: view === id ? "rgba(99,102,241,0.2)" : "transparent",
              color: view === id ? "#A5B4FC" : "#6B7280",
            }}>
              <Icon size={14} />
              <span style={{ display: view === "kanban" ? "none" : undefined }}>{label}</span>
            </button>
          ))}
        </div>

        {/* Actions */}
        <div style={{ display: "flex", gap: 6 }}>
          <button onClick={() => exportToExcel(todos)} title="Exporter en Excel" style={{
            display: "flex", alignItems: "center", gap: 5, padding: "6px 12px", borderRadius: 9,
            background: "rgba(52,211,153,0.1)", border: "1px solid rgba(52,211,153,0.25)", color: "#34D399", fontSize: 12, fontWeight: 600, cursor: "pointer",
          }}>
            <Download size={13} /> Excel
          </button>
          <button onClick={() => setAddOpen(o => !o)} style={{
            display: "flex", alignItems: "center", gap: 5, padding: "6px 14px", borderRadius: 9,
            background: "rgba(99,102,241,0.15)", border: "1px solid rgba(99,102,241,0.35)", color: "#A5B4FC", fontSize: 12, fontWeight: 700, cursor: "pointer",
          }}>
            <Plus size={14} /> Ajouter
          </button>
        </div>
      </div>

      {/* ── Formulaire ── */}
      {addOpen && <AddForm onAdd={handleAdd} onClose={() => setAddOpen(false)} />}

      {/* ── Vues ── */}
      {view === "kanban"  && <KanbanView  todos={todos} onUpdate={handleUpdate} onDelete={handleDelete} />}
      {view === "list"    && <ListView    todos={todos} onUpdate={handleUpdate} onDelete={handleDelete} />}
      {view === "grid"    && <GridView    todos={todos} onUpdate={handleUpdate} onDelete={handleDelete} />}
      {view === "history" && <HistoryView todos={todos} onUpdate={handleUpdate} onDelete={handleDelete} />}

      {todos.length === 0 && !addOpen && (
        <div style={{ textAlign: "center", padding: "60px 0", color: "#4B5563" }}>
          <CheckCircle size={40} style={{ display: "block", margin: "0 auto 14px", opacity: 0.2 }} />
          <div style={{ fontSize: 14, fontWeight: 600, color: "#6B7280", marginBottom: 6 }}>Aucune tâche</div>
          <div style={{ fontSize: 12 }}>Cliquez sur « Ajouter » ou importez des serveurs pour générer des tâches automatiques.</div>
        </div>
      )}
    </div>
  );
}
