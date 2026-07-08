import { useState, useRef } from "react";
import {
  ChevronLeft, ChevronRight, Menu, Plus, Folder, FolderOpen,
  Trash2, Activity, Check, X, Globe, Download, Upload,
  Server, BarChart3, MonitorCheck, AlertTriangle, Settings, ClipboardList, GitBranch, Network, LayoutDashboard, Wrench,
} from "lucide-react";
import { getStatus, STATUS } from "../constants";
import { importGroupsJson, importGroupsArray } from "../utils/storage";
import { getServersBackup, restoreServersBackup } from "../utils/servers";
import { loadTodos, saveTodos } from "../utils/todoStorage";
import { loadSnapshots } from "../utils/snapshots";
import { loadCapacitySettings, saveCapacitySettings } from "../utils/capacitySettings";
import { loadImpacts, saveImpacts } from "../utils/appImpactStorage";
import { loadLog, saveLog } from "./IncidentLog";

function ExportImportButtons({ groups, onImport }) {
  const fileRef = useRef(null);
  const [msg, setMsg] = useState(null);

  const handleExport = () => {
    const backup = {
      version: 3,
      exportedAt: new Date().toISOString(),
      groups,
      servers:          getServersBackup(),
      todos:            loadTodos(),
      snapshots:        loadSnapshots(),
      capacitySettings: loadCapacitySettings(),
      appImpacts:       loadImpacts(),
      incidents:        loadLog(),
    };
    const blob = new Blob([JSON.stringify(backup, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `g1oeil-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const handleImport = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const parsed = JSON.parse(ev.target.result);
        let importedGroups, importedServers = null, importedTodos = null;

        let importedSnapshots = null, importedCapSettings = null, importedImpacts = null, importedIncidents = null;

        if (Array.isArray(parsed)) {
          /* Ancien format (v1) — tableau de groupes uniquement */
          importedGroups = importGroupsJson(ev.target.result);
        } else if ((parsed.version === 2 || parsed.version === 3) && parsed.groups) {
          /* Format v2/v3 — sauvegarde complète */
          importedGroups      = importGroupsArray(parsed.groups);
          importedServers     = parsed.servers?.rows ? parsed.servers : null;
          importedTodos       = Array.isArray(parsed.todos)     ? parsed.todos     : null;
          importedSnapshots   = Array.isArray(parsed.snapshots) ? parsed.snapshots : null;
          importedCapSettings = parsed.capacitySettings         || null;
          importedImpacts     = parsed.appImpacts               || null;
          importedIncidents   = Array.isArray(parsed.incidents) ? parsed.incidents : null;
        } else {
          throw new Error("Format invalide");
        }

        onImport(importedGroups);
        if (importedServers)     restoreServersBackup(importedServers);
        if (importedTodos)       saveTodos(importedTodos);
        if (importedSnapshots)   { try { localStorage.setItem("capacity-snapshots", JSON.stringify(importedSnapshots)); } catch {} }
        if (importedCapSettings) saveCapacitySettings(importedCapSettings);
        if (importedImpacts)     saveImpacts(importedImpacts);
        if (importedIncidents)   saveLog(importedIncidents);

        const urlCount    = importedGroups.reduce((s, g) => s + (g.urls?.length || 0), 0);
        const serverCount = importedServers?.rows?.length   || 0;
        const todoCount   = importedTodos?.length           || 0;
        const snapCount   = importedSnapshots?.length       || 0;
        const incCount    = importedIncidents?.length       || 0;
        const parts = [`${urlCount} URL${urlCount > 1 ? "s" : ""}`];
        if (serverCount) parts.push(`${serverCount} serveur${serverCount > 1 ? "s" : ""}`);
        if (todoCount)   parts.push(`${todoCount} tâche${todoCount > 1 ? "s" : ""}`);
        if (snapCount)   parts.push(`${snapCount} snapshot${snapCount > 1 ? "s" : ""}`);
        if (incCount)    parts.push(`${incCount} incident${incCount > 1 ? "s" : ""}`);
        setMsg({ ok: true, text: parts.join(" · ") + " restaurés" });
      } catch {
        setMsg({ ok: false, text: "Fichier invalide" });
      }
      setTimeout(() => setMsg(null), 5000);
    };
    reader.readAsText(file);
    e.target.value = "";
  };

  const btnStyle = (color) => ({
    flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 5,
    padding: "6px 0", borderRadius: 8, fontSize: 11, fontWeight: 600, cursor: "pointer",
    border: `1px solid ${color}33`, background: `${color}15`, color,
    transition: "background 0.15s",
  });

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
      <div style={{ display: "flex", gap: 6 }}>
        <button style={btnStyle("#34D399")} onClick={handleExport} title="Exporter toutes les URLs en JSON">
          <Download size={12} /> Export
        </button>
        <button style={btnStyle("#818CF8")} onClick={() => fileRef.current?.click()} title="Importer un fichier JSON de sauvegarde">
          <Upload size={12} /> Import
        </button>
        <input ref={fileRef} type="file" accept=".json" style={{ display: "none" }} onChange={handleImport} />
      </div>
      {msg && (
        <div style={{ fontSize: 10, textAlign: "center", color: msg.ok ? "#34D399" : "#F87171", padding: "2px 0" }}>
          {msg.text}
        </div>
      )}
    </div>
  );
}

const MODULES = [
  { id: "dashboard",  label: "Dashboard",         Icon: LayoutDashboard },
  { id: "monitor",    label: "Surveillance",      Icon: MonitorCheck },
  { id: "servers",    label: "Serveurs",          Icon: Server },
  { id: "capacity",   label: "Capacity Planning", Icon: BarChart3 },
  { id: "impacts",    label: "Impacts App.",      Icon: Network },
  { id: "journal",    label: "Journal",           Icon: AlertTriangle },
  { id: "workflows",  label: "Workflows",         Icon: GitBranch },
  { id: "todo",       label: "TodoList",          Icon: ClipboardList },
  { id: "intervention", label: "Intervention",       Icon: Wrench },
  { id: "parametres", label: "Paramètres",        Icon: Settings },
];

export default function Sidebar({ groups, activeGroupId, onSelect, onAddGroup, onRemoveGroup, onRenameGroup, open, onToggle, checkingIds, totalUrls, totalOnline, onImport, activeModule = "monitor", onSelectModule, journalBadge = 0, todoBadge = 0, serversBadge = 0, agentsBadge = 0, isMobile = false }) {
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState("");
  const [editingId, setEditingId] = useState(null);
  const [editName, setEditName] = useState("");

  /* Sur mobile : le drawer est toujours 240px et montre les labels */
  const showFull = isMobile || open;

  const confirmAdd = () => {
    const name = newName.trim();
    if (name) onAddGroup(name);
    setNewName("");
    setAdding(false);
  };

  const confirmRename = (id) => {
    const name = editName.trim();
    if (name) onRenameGroup(id, name);
    setEditingId(null);
  };

  const startEdit = (g) => {
    setEditingId(g.id);
    setEditName(g.name);
  };

  return (
    <>
      {/* Backdrop mobile : ferme le drawer au clic */}
      {isMobile && open && (
        <div
          onClick={onToggle}
          style={{
            position: "fixed", inset: 0,
            background: "rgba(0,0,0,0.6)", zIndex: 49,
          }}
        />
      )}
    <aside style={{
      width: isMobile ? 240 : (open ? 200 : 48),
      minWidth: isMobile ? 240 : (open ? 200 : 48),
      background: "#0D1117", borderRight: "1px solid rgba(255,255,255,0.07)",
      display: "flex", flexDirection: "column",
      transition: isMobile ? "transform 0.25s ease" : "width 0.25s ease, min-width 0.25s ease",
      overflow: "hidden", height: "100vh",
      position: isMobile ? "fixed" : "sticky",
      top: 0, left: 0, flexShrink: 0,
      zIndex: isMobile ? 50 : undefined,
      transform: isMobile && !open ? "translateX(-100%)" : "translateX(0)",
    }}>
      <div style={{
        display: "flex", flexDirection: "column", alignItems: showFull ? "flex-end" : "center",
        padding: "12px 10px 14px",
        borderBottom: "1px solid rgba(255,255,255,0.06)",
        gap: 12,
      }}>
        {/* Bouton rétractation / fermeture drawer */}
        <button onClick={onToggle} style={{
          background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)",
          borderRadius: 8, width: 28, height: 28, display: "flex", alignItems: "center",
          justifyContent: "center", cursor: "pointer", color: "#9CA3AF", flexShrink: 0,
          transition: "color 0.2s", alignSelf: "flex-end",
        }}
          onMouseEnter={e => e.currentTarget.style.color = "#F3F4F6"}
          onMouseLeave={e => e.currentTarget.style.color = "#9CA3AF"}
        >
          {isMobile ? <X size={14} /> : (open ? <ChevronLeft size={14} /> : <ChevronRight size={14} />)}
        </button>
        {/* Logo centré */}
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6, width: "100%" }}>
          <img src="/g1oeil_icone_app.svg" alt="logo" style={{
            width: showFull ? 52 : 38, height: showFull ? 52 : 38, borderRadius: 12, objectFit: "contain",
            transition: "width 0.25s ease, height 0.25s ease",
          }} />
          {showFull && (
            <span style={{ fontSize: 9, color: "#6B7280", letterSpacing: "0.08em", textTransform: "uppercase" }}>Live Monitor</span>
          )}
        </div>
      </div>

      {/* ── Modules ── */}
      {showFull && (
        <div style={{ padding: "10px 10px 4px", fontSize: 10, color: "#4B5563", letterSpacing: "0.08em", textTransform: "uppercase" }}>
          Modules
        </div>
      )}
      <div style={{ padding: "4px 8px", borderBottom: "1px solid rgba(255,255,255,0.06)", paddingBottom: 10 }}>
        {MODULES.map(({ id, label, Icon }) => {
          const isActive = activeModule === id;
          const badge      = id === "journal" ? journalBadge : id === "servers" ? agentsBadge : 0;
          const greenBadge = id === "todo"   ? todoBadge    : id === "servers" ? serversBadge : 0;
          return (
            <div key={id}
              onClick={() => onSelectModule?.(id)}
              title={label}
              style={{
                display: "flex", alignItems: "center", gap: 8, padding: open ? "7px 10px" : "7px 0",
                borderRadius: 9, marginBottom: 2, cursor: "pointer",
                background: isActive ? "rgba(99,102,241,0.15)" : "transparent",
                border: isActive ? "1px solid rgba(99,102,241,0.25)" : "1px solid transparent",
                transition: "background 0.15s", justifyContent: open ? "flex-start" : "center",
              }}
              onMouseEnter={e => { if (!isActive) e.currentTarget.style.background = "rgba(255,255,255,0.04)"; }}
              onMouseLeave={e => { if (!isActive) e.currentTarget.style.background = "transparent"; }}
            >
              <div style={{ position: "relative", flexShrink: 0 }}>
                <Icon size={16} color={isActive ? "#818CF8" : "#6B7280"} />
                {!open && badge > 0 && (
                  <span style={{ position: "absolute", top: -4, right: -4, width: 8, height: 8, borderRadius: "50%", background: "#F87171", border: "2px solid #0D1117" }} />
                )}
                {!open && greenBadge > 0 && (
                  <span style={{ position: "absolute", top: -4, right: badge > 0 ? 6 : -4, width: 8, height: 8, borderRadius: "50%", background: "#34D399", border: "2px solid #0D1117" }} />
                )}
              </div>
              {showFull && (
                <span style={{
                  flex: 1, fontSize: 13, color: isActive ? "#E5E7EB" : "#9CA3AF",
                  fontWeight: isActive ? 600 : 400, whiteSpace: "nowrap",
                }}>
                  {label}
                </span>
              )}
              {showFull && badge > 0 && (
                <span style={{ fontSize: 9, padding: "1px 5px", borderRadius: 8, background: "rgba(248,113,113,0.2)", color: "#F87171", fontWeight: 700 }}>{badge}</span>
              )}
              {showFull && greenBadge > 0 && (
                <span style={{ fontSize: 9, padding: "1px 5px", borderRadius: 8, background: "rgba(52,211,153,0.2)", color: "#34D399", fontWeight: 700 }}>{greenBadge}</span>
              )}
            </div>
          );
        })}
      </div>

      {showFull && (
        <div style={{ padding: "10px 10px 4px", fontSize: 10, color: "#4B5563", letterSpacing: "0.08em", textTransform: "uppercase" }}>
          Groupes URL's
        </div>
      )}

      <nav style={{ flex: 1, overflowY: "auto", padding: "4px 8px" }}>
        {groups.map(g => {
          const isActive = g.id === activeGroupId;
          const isOk = u => { const s = getStatus(u); return s === STATUS.ONLINE || s === STATUS.SLOW; };
          const onlineCount = g.isGlobal
            ? (totalOnline ?? g.urls.filter(isOk).length)
            : g.urls.filter(isOk).length;
          const urlCount = g.isGlobal ? (totalUrls ?? g.urls.length) : g.urls.length;
          const checking = g.urls.some(u => checkingIds.has(u.id));
          const FolderIcon = g.isGlobal ? Globe : (isActive ? FolderOpen : Folder);

          return (
            <div key={g.id} style={{
              display: "flex", alignItems: "center", gap: 8, padding: showFull ? "7px 10px" : "7px 0",
              borderRadius: 9, marginBottom: 2, cursor: "pointer",
              background: isActive ? "rgba(99,102,241,0.15)" : "transparent",
              border: isActive ? "1px solid rgba(99,102,241,0.25)" : "1px solid transparent",
              transition: "background 0.15s", justifyContent: showFull ? "flex-start" : "center",
            }}
              onClick={() => { if (editingId !== g.id) onSelect(g.id); }}
              onMouseEnter={e => { if (!isActive) e.currentTarget.style.background = "rgba(255,255,255,0.04)"; }}
              onMouseLeave={e => { if (!isActive) e.currentTarget.style.background = "transparent"; }}
            >
              <div style={{ color: isActive ? "#818CF8" : "#6B7280", flexShrink: 0 }}>
                <FolderIcon size={16} />
              </div>

              {showFull && (
                <>
                  {editingId === g.id ? (
                    <input
                      autoFocus
                      value={editName}
                      onChange={e => setEditName(e.target.value)}
                      onKeyDown={e => { if (e.key === "Enter") confirmRename(g.id); if (e.key === "Escape") setEditingId(null); }}
                      onBlur={() => confirmRename(g.id)}
                      onClick={e => e.stopPropagation()}
                      style={{
                        flex: 1, background: "rgba(255,255,255,0.07)", border: "1px solid rgba(99,102,241,0.4)",
                        borderRadius: 5, color: "#F3F4F6", fontSize: 12, padding: "2px 6px",
                      }}
                    />
                  ) : (
                    <span onDoubleClick={() => startEdit(g)} style={{
                      flex: 1, fontSize: 13, color: isActive ? "#E5E7EB" : "#9CA3AF",
                      fontWeight: isActive ? 600 : 400, whiteSpace: "nowrap",
                      overflow: "hidden", textOverflow: "ellipsis",
                    }}>
                      {g.name}
                    </span>
                  )}

                  <div style={{ display: "flex", alignItems: "center", gap: 4, flexShrink: 0 }}>
                    {checking && (
                      <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#6366F1", animation: "ping 1s infinite" }} />
                    )}
                    <span style={{
                      fontSize: 10, fontFamily: "'JetBrains Mono', monospace",
                      color: onlineCount > 0 ? "#34D399" : "#4B5563",
                      background: "rgba(255,255,255,0.05)", borderRadius: 10, padding: "1px 6px",
                      minWidth: 42, textAlign: "right", display: "inline-block",
                    }}>
                      {onlineCount}/{urlCount}
                    </span>
                    {(!g.isGlobal && groups.length > 1 && editingId !== g.id) ? (
                      <button onClick={e => { e.stopPropagation(); onRemoveGroup(g.id); }} style={{
                        background: "none", border: "none", color: "#4B5563", cursor: "pointer",
                        padding: 1, display: "flex", transition: "color 0.15s", flexShrink: 0,
                      }}
                        onMouseEnter={e => e.currentTarget.style.color = "#F87171"}
                        onMouseLeave={e => e.currentTarget.style.color = "#4B5563"}
                      >
                        <Trash2 size={11} />
                      </button>
                    ) : (
                      <span style={{ width: 13, flexShrink: 0 }} />
                    )}
                  </div>
                </>
              )}
            </div>
          );
        })}

        {showFull && (
          adding ? (
            <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "6px 10px", marginTop: 4 }}>
              <input
                autoFocus
                value={newName}
                onChange={e => setNewName(e.target.value)}
                onKeyDown={e => { if (e.key === "Enter") confirmAdd(); if (e.key === "Escape") { setAdding(false); setNewName(""); } }}
                placeholder="Nom du groupe"
                style={{
                  flex: 1, background: "rgba(255,255,255,0.07)", border: "1px solid rgba(99,102,241,0.4)",
                  borderRadius: 7, color: "#F3F4F6", fontSize: 12, padding: "5px 8px",
                }}
              />
              <button onClick={confirmAdd} style={{ background: "none", border: "none", color: "#34D399", cursor: "pointer", display: "flex" }}>
                <Check size={15} />
              </button>
              <button onClick={() => { setAdding(false); setNewName(""); }} style={{ background: "none", border: "none", color: "#F87171", cursor: "pointer", display: "flex" }}>
                <X size={15} />
              </button>
            </div>
          ) : (
            <button onClick={() => setAdding(true)} style={{
              display: "flex", alignItems: "center", gap: 7, width: "100%", padding: "7px 10px",
              background: "none", border: "1px dashed rgba(255,255,255,0.1)", borderRadius: 9,
              color: "#4B5563", fontSize: 12, cursor: "pointer", marginTop: 6,
              transition: "color 0.15s, border-color 0.15s",
            }}
              onMouseEnter={e => { e.currentTarget.style.color = "#818CF8"; e.currentTarget.style.borderColor = "rgba(99,102,241,0.4)"; }}
              onMouseLeave={e => { e.currentTarget.style.color = "#4B5563"; e.currentTarget.style.borderColor = "rgba(255,255,255,0.1)"; }}
            >
              <Plus size={13} /> Nouveau groupe
            </button>
          )
        )}
      </nav>

      {showFull && (
        <div style={{ padding: "10px 12px", borderTop: "1px solid rgba(255,255,255,0.06)", display: "flex", flexDirection: "column", gap: 6 }}>
          <ExportImportButtons groups={groups} onImport={onImport} />
          <div style={{ fontSize: 10, color: "#374151", textAlign: "center" }}>Double-clic pour renommer</div>
        </div>
      )}
    </aside>
    </>
  );
}
