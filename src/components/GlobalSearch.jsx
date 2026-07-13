import { useState, useEffect, useRef, useMemo } from "react";
import { Search, Globe, Server, AlertTriangle, ClipboardList, GitBranch, Activity, ShieldCheck, Map, GitCompare, BarChart3, LayoutDashboard, MonitorCheck, Wrench, Settings, ArrowRight, X } from "lucide-react";

export default function GlobalSearch({ open, onClose, groups = [], servers = [], incidentLog = [], onNavigate }) {
  const [query, setQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef(null);
  const listRef = useRef(null);

  useEffect(() => {
    if (open) {
      setQuery("");
      setSelectedIndex(0);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const handler = (e) => {
      if (e.key === "Escape") { onClose(); return; }
      if (e.key === "ArrowDown") { e.preventDefault(); setSelectedIndex(i => Math.min(i + 1, results.length - 1)); }
      if (e.key === "ArrowUp") { e.preventDefault(); setSelectedIndex(i => Math.max(i - 1, 0)); }
      if (e.key === "Enter" && results[selectedIndex]) {
        e.preventDefault();
        results[selectedIndex].action();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, query, selectedIndex]);

  const MODULES = [
    { id: "dashboard", label: "Dashboard", icon: LayoutDashboard },
    { id: "monitor", label: "Surveillance", icon: MonitorCheck },
    { id: "servers", label: "Serveurs", icon: Server },
    { id: "capacity", label: "Capacity Planning", icon: BarChart3 },
    { id: "uptime", label: "SLA / Uptime", icon: Activity },
    { id: "ssl", label: "Certificats SSL", icon: ShieldCheck },
    { id: "geo", label: "Carte serveurs", icon: Map },
    { id: "snapshot-diff", label: "Diff Snapshots", icon: GitCompare },
    { id: "impacts", label: "Impacts App.", icon: AlertTriangle },
    { id: "journal", label: "Journal", icon: AlertTriangle },
    { id: "workflows", label: "Workflows", icon: GitBranch },
    { id: "todo", label: "TodoList", icon: ClipboardList },
    { id: "intervention", label: "Intervention", icon: Wrench },
    { id: "parametres", label: "Paramètres", icon: Settings },
  ];

  const results = useMemo(() => {
    if (!query.trim()) {
      return MODULES.slice(0, 6).map(m => ({
        type: "module", label: m.label, sub: "Module", icon: m.icon,
        action: () => { onNavigate(m.id); onClose(); },
      }));
    }
    const q = query.toLowerCase();
    const items = [];

    /* Modules */
    MODULES.forEach(m => {
      if (m.label.toLowerCase().includes(q)) {
        items.push({ type: "module", label: m.label, sub: "Module", icon: m.icon, action: () => { onNavigate(m.id); onClose(); } });
      }
    });

    /* URLs */
    groups.forEach(g => {
      g.urls?.forEach(u => {
        if (u.url.toLowerCase().includes(q)) {
          items.push({ type: "url", label: u.url, sub: `URL · ${g.name}`, icon: Globe, action: () => { onNavigate("monitor"); onClose(); } });
        }
      });
    });

    /* Serveurs */
    servers.forEach(s => {
      if ((s.name || "").toLowerCase().includes(q) || (s.ip || "").toLowerCase().includes(q) || (s.app || "").toLowerCase().includes(q)) {
        items.push({ type: "server", label: s.name, sub: `Serveur · ${s.role || ""} · ${s.env || ""}`, icon: Server, action: () => { onNavigate("servers"); onClose(); } });
      }
    });

    /* Incidents */
    incidentLog.slice(0, 50).forEach(e => {
      const text = `${e.type || ""} ${e.url || ""} ${e.detail || ""}`.toLowerCase();
      if (text.includes(q)) {
        items.push({ type: "incident", label: e.url || e.type, sub: `Incident · ${e.type}`, icon: AlertTriangle, action: () => { onNavigate("journal"); onClose(); } });
      }
    });

    return items.slice(0, 20);
  }, [query, groups, servers, incidentLog, onNavigate, onClose]);

  useEffect(() => {
    setSelectedIndex(0);
  }, [query]);

  if (!open) return null;

  return (
    <>
      {/* Backdrop */}
      <div onClick={onClose} style={{
        position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", zIndex: 1000,
        backdropFilter: "blur(4px)",
      }} />

      {/* Modal */}
      <div style={{
        position: "fixed", top: "15%", left: "50%", transform: "translateX(-50%)",
        width: "90%", maxWidth: 600, zIndex: 1001,
        background: "#0D1117", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 14,
        boxShadow: "0 20px 60px rgba(0,0,0,0.5)", overflow: "hidden",
      }}>
        {/* Search input */}
        <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "14px 18px", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
          <Search size={18} color="#6B7280" />
          <input
            ref={inputRef}
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Rechercher un module, URL, serveur, incident..."
            style={{ flex: 1, background: "transparent", border: "none", color: "#E5E7EB", fontSize: 15, outline: "none" }}
          />
          <kbd style={{ fontSize: 10, color: "#4B5563", background: "rgba(255,255,255,0.05)", padding: "2px 6px", borderRadius: 4, border: "1px solid rgba(255,255,255,0.08)" }}>ESC</kbd>
        </div>

        {/* Results */}
        <div ref={listRef} style={{ maxHeight: 400, overflowY: "auto", padding: "6px 0" }}>
          {results.length === 0 ? (
            <div style={{ padding: "30px 18px", textAlign: "center", fontSize: 13, color: "#4B5563" }}>
              Aucun résultat pour "{query}"
            </div>
          ) : (
            results.map((r, i) => {
              const Icon = r.icon;
              const isSelected = i === selectedIndex;
              return (
                <div
                  key={i}
                  onMouseEnter={() => setSelectedIndex(i)}
                  onClick={() => r.action()}
                  style={{
                    display: "flex", alignItems: "center", gap: 12, padding: "10px 18px", cursor: "pointer",
                    background: isSelected ? "rgba(99,102,241,0.12)" : "transparent",
                    borderLeft: isSelected ? "2px solid #818CF8" : "2px solid transparent",
                  }}
                >
                  <div style={{ width: 28, height: 28, borderRadius: 8, background: "rgba(255,255,255,0.05)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                    <Icon size={14} color={isSelected ? "#818CF8" : "#6B7280"} />
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, color: "#E5E7EB", fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.label}</div>
                    <div style={{ fontSize: 10, color: "#6B7280" }}>{r.sub}</div>
                  </div>
                  {isSelected && <ArrowRight size={14} color="#818CF8" />}
                </div>
              );
            })
          )}
        </div>

        {/* Footer */}
        <div style={{ padding: "8px 18px", borderTop: "1px solid rgba(255,255,255,0.06)", display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 10, color: "#4B5563" }}>
          <span>{results.length} résultat(s)</span>
          <span><kbd style={{ background: "rgba(255,255,255,0.05)", padding: "1px 5px", borderRadius: 3, border: "1px solid rgba(255,255,255,0.08)" }}>↑↓</kbd> naviguer · <kbd style={{ background: "rgba(255,255,255,0.05)", padding: "1px 5px", borderRadius: 3, border: "1px solid rgba(255,255,255,0.08)" }}>↵</kbd> ouvrir</span>
        </div>
      </div>
    </>
  );
}
