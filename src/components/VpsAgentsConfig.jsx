import { useState } from "react";
import { Activity, Download, Plus, X, RefreshCw, Pencil, Check } from "lucide-react";
import { loadVpsAgents, saveVpsAgents, makeVpsAgent, fetchVpsMetrics } from "../utils/vpsAgents";
import { patchServerMetrics } from "../utils/servers";

const card = { background: "rgba(255,255,255,0.025)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 14, overflow: "hidden" };

function SectionHead({ icon, label, extra }) {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 18px", borderBottom: "1px solid rgba(255,255,255,0.06)", gap: 10 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <span style={{ color: "#818CF8" }}>{icon}</span>
        <span style={{ fontSize: 13, fontWeight: 700, color: "#E5E7EB" }}>{label}</span>
      </div>
      {extra}
    </div>
  );
}

export default function VpsAgentsConfig() {
  const [vpsAgents, setVpsAgents]      = useState(() => loadVpsAgents());
  const [newAgent,  setNewAgent]       = useState({ name: "", url: "" });
  const [agentStatus, setAgentStatus]  = useState({});
  const [refreshingAll, setRefreshingAll] = useState(false);
  const [editingAgent, setEditingAgent]   = useState(null);

  const testAgent = async (agent) => {
    setAgentStatus(s => ({ ...s, [agent.id]: "loading" }));
    try {
      const m = await fetchVpsMetrics(agent.url);
      patchServerMetrics(agent.name, { ...m, env: agent.env, app: agent.app || agent.name, role: agent.role, agentUrl: agent.url });
      setAgentStatus(s => ({ ...s, [agent.id]: { ok: true, cpu: m.cpu, ram: m.ram, disk: m.disk } }));
    } catch (e) {
      setAgentStatus(s => ({ ...s, [agent.id]: { ok: false, error: e.message || "Connexion échouée" } }));
    }
  };

  const addAgent = () => {
    if (!newAgent.name.trim() || !newAgent.url.trim()) return;
    const agent = makeVpsAgent(newAgent);
    const updated = [...vpsAgents, agent];
    setVpsAgents(updated); saveVpsAgents(updated);
    setNewAgent({ name: "", url: "" });
  };

  const removeAgent = (id) => {
    const updated = vpsAgents.filter(a => a.id !== id);
    setVpsAgents(updated); saveVpsAgents(updated);
    setAgentStatus(s => { const n = { ...s }; delete n[id]; return n; });
  };

  const saveEditAgent = () => {
    if (!editingAgent || !editingAgent.name.trim() || !editingAgent.url.trim()) return;
    const url = editingAgent.url.trim().replace(/\/+$/, "");
    const updated = vpsAgents.map(a => a.id === editingAgent.id ? { ...a, name: editingAgent.name.trim(), url } : a);
    setVpsAgents(updated); saveVpsAgents(updated);
    setEditingAgent(null);
  };

  const refreshAll = async () => {
    setRefreshingAll(true);
    for (const agent of vpsAgents.filter(a => a.enabled)) await testAgent(agent);
    setRefreshingAll(false);
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20, maxWidth: 860 }}>
      <div style={card}>
        <SectionHead
          icon={<Activity size={14} />}
          label={`Agents VPS${vpsAgents.length > 0 ? ` (${vpsAgents.length})` : ""}`}
          extra={
            <div style={{ display: "flex", gap: 6 }}>
              <a href="/vps-agent-linux.py" download="vps-agent-linux.py" style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 10, padding: "3px 10px", borderRadius: 6, background: "rgba(52,211,153,0.1)", border: "1px solid rgba(52,211,153,0.25)", color: "#34D399", textDecoration: "none", fontWeight: 600 }}>
                <Download size={10} /> Linux
              </a>
              <a href="/vps-agent-windows.py" download="vps-agent-windows.py" style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 10, padding: "3px 10px", borderRadius: 6, background: "rgba(59,130,246,0.1)", border: "1px solid rgba(59,130,246,0.25)", color: "#60A5FA", textDecoration: "none", fontWeight: 600 }}>
                <Download size={10} /> Windows
              </a>
              <button onClick={refreshAll} disabled={refreshingAll || vpsAgents.filter(a => a.enabled).length === 0}
                style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 10, padding: "3px 10px", borderRadius: 6, background: "rgba(52,211,153,0.1)", border: "1px solid rgba(52,211,153,0.25)", color: "#34D399", cursor: "pointer", fontWeight: 600, opacity: refreshingAll ? 0.6 : 1 }}>
                <RefreshCw size={10} /> Rafraîchir tous
              </button>
            </div>
          }
        />

        {vpsAgents.length === 0 ? (
          <div style={{ padding: "14px 18px", fontSize: 12, color: "#4B5563" }}>
            Aucun agent configuré — déployez <code style={{ color: "#34D399" }}>vps-agent-linux.py</code> (Linux) ou <code style={{ color: "#60A5FA" }}>vps-agent-windows.py</code> (Windows) sur chaque serveur, puis ajoutez-le ci-dessous.
          </div>
        ) : vpsAgents.map(agent => {
          const st      = agentStatus[agent.id];
          const dot     = st?.ok === true ? "#34D399" : st?.ok === false ? "#F87171" : st === "loading" ? "#FBBF24" : "#4B5563";
          const editing = editingAgent?.id === agent.id;
          const inp     = { background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 6, color: "#E5E7EB", fontSize: 11, padding: "4px 8px", outline: "none", fontFamily: "monospace" };
          return (
            <div key={agent.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 18px", borderBottom: "1px solid rgba(255,255,255,0.04)", background: editing ? "rgba(99,102,241,0.05)" : st?.ok === true ? "rgba(52,211,153,0.03)" : st?.ok === false ? "rgba(248,113,113,0.04)" : "transparent" }}>
              <div style={{ width: 8, height: 8, borderRadius: "50%", background: dot, flexShrink: 0, boxShadow: st?.ok === true ? `0 0 6px ${dot}` : "none" }} />
              {editing ? (
                <div style={{ flex: 1, display: "flex", gap: 6, alignItems: "center", minWidth: 0 }}>
                  <input value={editingAgent.name} onChange={e => setEditingAgent(s => ({ ...s, name: e.target.value }))}
                    placeholder="Nom" style={{ ...inp, width: 110 }} />
                  <input value={editingAgent.url} onChange={e => setEditingAgent(s => ({ ...s, url: e.target.value }))}
                    placeholder="http://ip:9099" onKeyDown={e => e.key === "Enter" && saveEditAgent()}
                    style={{ ...inp, flex: 1 }} />
                </div>
              ) : (
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: "#E5E7EB" }}>{agent.name}</div>
                  <div style={{ fontSize: 10, color: "#4B5563", fontFamily: "monospace", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{agent.url}/metrics</div>
                  {st?.ok === true && (
                    <div style={{ fontSize: 10, color: "#6B7280", marginTop: 2 }}>
                      CPU&nbsp;<span style={{ color: st.cpu >= 90 ? "#F87171" : st.cpu >= 75 ? "#FB923C" : "#34D399", fontWeight: 700 }}>{st.cpu}%</span>
                      &nbsp;· RAM&nbsp;<span style={{ color: st.ram >= 90 ? "#F87171" : st.ram >= 75 ? "#FB923C" : "#34D399", fontWeight: 700 }}>{st.ram}%</span>
                      &nbsp;· Disk&nbsp;<span style={{ color: st.disk >= 90 ? "#F87171" : st.disk >= 75 ? "#FB923C" : "#34D399", fontWeight: 700 }}>{st.disk}%</span>
                    </div>
                  )}
                  {st?.ok === false && <div style={{ fontSize: 10, color: "#F87171", marginTop: 2 }}>{st.error}</div>}
                </div>
              )}
              {editing ? (
                <button onClick={saveEditAgent}
                  style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 10, padding: "3px 10px", borderRadius: 6, background: "rgba(52,211,153,0.15)", border: "1px solid rgba(52,211,153,0.3)", color: "#34D399", cursor: "pointer", fontWeight: 700 }}>
                  <Check size={11} /> Sauver
                </button>
              ) : (
                <button onClick={() => testAgent(agent)} disabled={st === "loading"}
                  style={{ fontSize: 10, padding: "3px 10px", borderRadius: 6, background: "rgba(99,102,241,0.1)", border: "1px solid rgba(99,102,241,0.25)", color: "#818CF8", cursor: "pointer", fontWeight: 600, opacity: st === "loading" ? 0.5 : 1 }}>
                  {st === "loading" ? "…" : "Tester"}
                </button>
              )}
              <button onClick={() => setEditingAgent(editing ? null : { id: agent.id, name: agent.name, url: agent.url })}
                style={{ background: "none", border: "none", color: editing ? "#818CF8" : "#4B5563", cursor: "pointer", padding: 4, display: "flex", alignItems: "center" }}>
                <Pencil size={12} />
              </button>
              <button onClick={() => removeAgent(agent.id)}
                style={{ background: "none", border: "none", color: "#4B5563", cursor: "pointer", padding: 4, display: "flex", alignItems: "center" }}>
                <X size={13} />
              </button>
            </div>
          );
        })}

        <div style={{ display: "flex", gap: 8, padding: "12px 18px", borderTop: vpsAgents.length > 0 ? "1px solid rgba(255,255,255,0.05)" : "none" }}>
          <input value={newAgent.name} onChange={e => setNewAgent(s => ({ ...s, name: e.target.value }))} placeholder="Nom du VPS"
            style={{ width: 130, background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 7, color: "#E5E7EB", fontSize: 12, padding: "6px 10px", outline: "none", fontFamily: "'JetBrains Mono', monospace" }} />
          <input value={newAgent.url} onChange={e => setNewAgent(s => ({ ...s, url: e.target.value }))} placeholder="http://ip-vps:9099"
            onKeyDown={e => e.key === "Enter" && addAgent()}
            style={{ flex: 1, background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 7, color: "#E5E7EB", fontSize: 12, padding: "6px 10px", outline: "none", fontFamily: "'JetBrains Mono', monospace" }} />
          <button onClick={addAgent} disabled={!newAgent.name.trim() || !newAgent.url.trim()}
            style={{ display: "flex", alignItems: "center", gap: 5, padding: "6px 14px", borderRadius: 7, background: "rgba(99,102,241,0.15)", border: "1px solid rgba(99,102,241,0.35)", color: "#A5B4FC", fontSize: 12, fontWeight: 700, cursor: "pointer", opacity: !newAgent.name.trim() || !newAgent.url.trim() ? 0.4 : 1 }}>
            <Plus size={13} /> Ajouter
          </button>
        </div>

        <div style={{ padding: "0 18px 12px", fontSize: 10, color: "#374151", lineHeight: 1.8 }}>
          <span style={{ color: "#34D399", fontWeight: 700 }}>Linux</span>&nbsp;:&nbsp;
          <code style={{ color: "#34D399" }}>python3 vps-agent-linux.py 9099 /var/log /home</code>
          &nbsp;·&nbsp;<a href="/vps-agent.service" download style={{ color: "#34D399" }}>service systemd</a>
          &nbsp;·&nbsp;<code style={{ color: "#374151" }}>ufw allow from IP_G1OEIL to any port 9099</code>
          <br />
          <span style={{ color: "#60A5FA", fontWeight: 700 }}>Windows</span>&nbsp;:&nbsp;
          <code style={{ color: "#60A5FA" }}>python3 vps-agent-windows.py 9099</code>
          &nbsp;·&nbsp;<a href="/install-agent-windows.ps1" download style={{ color: "#60A5FA" }}>script install PowerShell</a>
          &nbsp;·&nbsp;Firewall : autoriser port 9099 TCP entrant depuis l'IP G1Oeil
        </div>
      </div>
    </div>
  );
}
