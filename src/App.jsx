import { useState, useEffect, useRef, useCallback, useSyncExternalStore } from "react";
import { Globe, Plus, RefreshCw, Pause, Play, Wifi, WifiOff, Zap, LayoutGrid, List, Search, X, Activity, AlertTriangle, Settings, Bell, BellOff, Lock, CheckCircle, Server, Menu } from "lucide-react";2.
import { STATUS, DEFAULT_INTERVAL, MAX_HISTORY, getStatus } from "./constants";
import { checkUrl } from "./utils/checkUrl";
import { checkSsl } from "./utils/checkSsl";
import { loadGroups, saveGroups, getDefaultGroups, makeEntry, makeGroup } from "./utils/storage";
import Sidebar from "./components/Sidebar";
import StatCard from "./components/StatCard";
import UrlCard from "./components/UrlCard";
import Toast from "./components/Toast";
import ExcelImport from "./components/ExcelImport";
import IncidentLog, { loadLog, addIncident, IncidentLogPage } from "./components/IncidentLog";
import ServersView from "./components/ServersView";
import CapacityPlanning from "./components/CapacityPlanning";
import ServerImport, { itcareToRow, API_LS_KEY as ITCARE_LS_KEY } from "./components/ServerImport";
import TodoList from "./components/TodoList";
import WorkflowEditor from "./components/WorkflowEditor";
import AppImpactMap from "./components/AppImpactMap";
import AgentsView from "./components/AgentsView";
import VpsAgentsConfig from "./components/VpsAgentsConfig";
import AgentDeployMass from "./components/AgentDeployMass";
import SettingsPage from "./components/SettingsPage";
import DashboardPage from "./components/DashboardPage";
import { subscribeServers, getServers, setServers, getServersMeta, recommendations as getRecos, patchServerMetrics } from "./utils/servers";
import { loadVpsAgents, fetchVpsMetrics, setAgentMetrics, setAgentError, subscribeAgents, getAllAgentMetrics } from "./utils/vpsAgents";
import { loadCapacitySettings, saveCapacitySettings } from "./utils/capacitySettings";
import { loadTodos } from "./utils/todoStorage";
import { clearSnapshots } from "./utils/snapshots";
import { pushSync, pullSync, subscribeSyncStream } from "./utils/lanSync";

export default function App() {
  const [groups, setGroups] = useState(() => loadGroups() || getDefaultGroups());
  const [activeGroupId, setActiveGroupId] = useState(() => {
    const g = loadGroups() || getDefaultGroups();
    return g[0]?.id;
  });
  const [sidebarOpen, setSidebarOpen] = useState(() => typeof window !== 'undefined' ? window.innerWidth >= 768 : true);
  const [isMobile, setIsMobile] = useState(() => typeof window !== 'undefined' ? window.innerWidth < 768 : false);
  const [viewMode, setViewMode] = useState("grid");
  const [filterText, setFilterText] = useState("");
  const [filterStatus, setFilterStatus] = useState("all");
  const [input, setInput] = useState("");
  const [interval, setInterval_] = useState(DEFAULT_INTERVAL);
  const [paused, setPaused] = useState(false);
  const [countdown, setCountdown] = useState(DEFAULT_INTERVAL);
  const [checkingIds, setCheckingIds] = useState(new Set());
  const [toasts, setToasts] = useState([]);
  const [incidentLog, setIncidentLog] = useState(() => loadLog());
  const [mainTab, setMainTab] = useState(() => localStorage.getItem("g1oeil_tab") || "surveillance");
  const [activeModule, setActiveModule] = useState(() => localStorage.getItem("g1oeil_module") || "dashboard");
  const [serverSubTab, setServerSubTab] = useState("inventory");
  const [agentInterval, setAgentInterval] = useState(() => parseInt(localStorage.getItem("g1oeil_agent_interval") || "30"));
  const [notifEnabled, setNotifEnabled] = useState(() => typeof Notification !== "undefined" && Notification.permission === "granted");
  const [capacitySettings, setCapacitySettings] = useState(() => loadCapacitySettings());
  const allServers    = useSyncExternalStore(subscribeServers, getServers);
  const agentsMetrics = useSyncExternalStore(subscribeAgents, getAllAgentMetrics);
  const agentsBadge   = Object.values(agentsMetrics).filter(e => e.status === "error").length;
  const [todoBadge, setTodoBadge] = useState(() => loadTodos().filter(t => t.status !== "done").length);

  useEffect(() => { localStorage.setItem("g1oeil_module", activeModule); }, [activeModule]);

  /* ── Détection mobile / resize ── */
  useEffect(() => {
    const handler = () => {
      const mobile = window.innerWidth < 768;
      setIsMobile(mobile);
      if (!mobile && !sidebarOpen) setSidebarOpen(true); /* rouvrir automatiquement en desktop */
    };
    window.addEventListener('resize', handler);
    return () => window.removeEventListener('resize', handler);
  }, [sidebarOpen]);

  /* ── LAN Sync : pull au démarrage + SSE ── */
  useEffect(() => {
    /* Pull initial : appliquer les données du desktop si plus récentes */
    const timer = setTimeout(async () => {
      const updated = await pullSync();
      if (updated) window.location.reload(); /* rechargement léger pour que les stores React voient le nouveau localStorage */
    }, 2000);
    /* Abonnement SSE : nouveau push du desktop → pull automatique */
    const unsubSSE = subscribeSyncStream(async () => {
      const updated = await pullSync();
      if (updated) window.location.reload();
    });
    return () => { clearTimeout(timer); unsubSSE(); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  /* ── LAN Sync : push quand les serveurs changent (desktop → mobile) ── */
  const pushSyncTimerRef = useRef(null);
  useEffect(() => {
    clearTimeout(pushSyncTimerRef.current);
    pushSyncTimerRef.current = setTimeout(() => { pushSync(); }, 3000);
    return () => clearTimeout(pushSyncTimerRef.current);
  }, [allServers]);

  /* ── Auto-refresh ITCare (mode client credentials uniquement, toutes les 5 min) ──
     Actualise automatiquement les données si clientId + clientSecret sont mémorisés.
     Pour le mode token de session : pas de refresh auto (token non renouvelable). */
  const ITCARE_LAST_REFRESH = "capacity-itcare-last-refresh";
  const ITCARE_INTERVAL_MS  = 5 * 60 * 1000; // 5 minutes
  useEffect(() => {
    async function doItcareRefresh() {
      if (getServersMeta().source !== "api") return;
      let config = null;
      try { config = JSON.parse(localStorage.getItem(ITCARE_LS_KEY)); } catch {}
      if (!config?.clientId || !config?.clientSecret || config.authMode !== "credentials") return;
      try {
        const res = await fetch("/api/itcare", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ clientId: config.clientId, clientSecret: config.clientSecret }),
        });
        if (!res.ok) return;
        const json = await res.json();
        const rawList = json.servers || json.data || json.items || [];
        if (!rawList.length) return;
        setServers(rawList.map(itcareToRow), "api", "ITCare");
        localStorage.setItem(ITCARE_LAST_REFRESH, String(Date.now()));
        console.log("✅ [ITCare] Auto-refresh : " + rawList.length + " serveurs mis à jour.");
      } catch (e) {
        console.warn("⚠️ [ITCare] Auto-refresh échoué :", e.message);
      }
    }
    /* Refresh initial si données > 30 min ou jamais chargées */
    const lastTs = parseInt(localStorage.getItem(ITCARE_LAST_REFRESH) || "0");
    if (Date.now() - lastTs > ITCARE_INTERVAL_MS) {
      setTimeout(doItcareRefresh, 4000); /* délai 4s pour laisser l'app s'initialiser */
    }
    const id = setInterval(doItcareRefresh, ITCARE_INTERVAL_MS);
    return () => clearInterval(id);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  /* ── Polling automatique des agents VPS (intervalle configurable) ── */
  useEffect(() => {
    const poll = async () => {
      const agents = loadVpsAgents().filter(a => a.enabled);
      for (const agent of agents) {
        try {
          const m = await fetchVpsMetrics(agent.url);
          setAgentMetrics(agent.id, m, "ok");
          patchServerMetrics(agent.name, { ...m, env: agent.env, app: agent.app || agent.name, role: agent.role, agentUrl: agent.url });
        } catch (e) {
          setAgentError(agent.id, e.message || "Injoignable");
        }
      }
    };
    console.log(`\u25b6 [VPS Poll] Démarrage polling — intervalle : ${agentInterval}s`);
    poll();
    const id = setInterval(() => { console.log(`\u23f1 [VPS Poll] Tick (${agentInterval}s)`); poll(); }, agentInterval * 1000);
    return () => { console.log(`\u23f9 [VPS Poll] Arrêt (changement intervalle → nouveau : ${agentInterval}s)`); clearInterval(id); };
  }, [agentInterval]);
  useEffect(() => { localStorage.setItem("g1oeil_tab", mainTab); }, [mainTab]);

  useEffect(() => {
    const handler = (e) => setTodoBadge((e.detail || []).filter(t => t.status !== "done").length);
    window.addEventListener("todos-changed", handler);
    return () => window.removeEventListener("todos-changed", handler);
  }, []);

  const countdownRef = useRef(null);
  const intervalRef = useRef(interval);
  const prevStatusRef = useRef({});
  const sslTsRef = useRef({});
  const groupsRef = useRef(groups);
  useEffect(() => { groupsRef.current = groups; }, [groups]);

  useEffect(() => { intervalRef.current = interval; }, [interval]);
  useEffect(() => { setFilterText(""); setFilterStatus("all"); }, [activeGroupId]);
  useEffect(() => { saveGroups(groups); }, [groups]);

  /* ── Alertes serveurs : seuil CPU/RAM/Disk ── */
  const serverAlertInitRef = useRef(false);
  useEffect(() => {
    if (!serverAlertInitRef.current) { serverAlertInitRef.current = true; return; }
    if (allServers.length === 0) return;
    const { cpuThreshold = 90, ramThreshold = 90, diskThreshold = 90 } = capacitySettings;
    const thresholds = { cpu: cpuThreshold, ram: ramThreshold, disk: diskThreshold };
    allServers.forEach(s => {
      ['cpu', 'ram', 'disk'].forEach(metric => {
        const val = s[metric] ?? 0;
        if (val < thresholds[metric]) return;
        setIncidentLog(prev => {
          const recent = prev.find(e => e.type === "server_alert" && e.serverName === s.name && e.metric === metric && Date.now() - e.ts < 3600000);
          if (recent) return prev;
          return addIncident(prev, { url: s.name, groupName: "Serveurs", type: "server_alert", metric, value: val, serverName: s.name });
        });
      });
    });
    getRecos(allServers).filter(r => r.severity === "critical").forEach(r => {
      setIncidentLog(prev => {
        const recent = prev.find(e => e.type === "capacity_alert" && e.recoText === r.text && Date.now() - e.ts < 86400000);
        if (recent) return prev;
        return addIncident(prev, { url: r.server || "Flotte", groupName: "Capacity", type: "capacity_alert", recoText: r.text, recoType: r.type });
      });
    });
  }, [allServers]); // eslint-disable-line

  /* ── Scan SSL initial : certs déjà stockés ≤ 10j ── */
  useEffect(() => {
    const allGroupUrls = groups.flatMap(g =>
      g.urls.map(u => ({ ...u, _groupName: g.name }))
    );
    allGroupUrls.forEach(u => {
      const ssl = u.sslInfo;
      if (!ssl || ssl.daysLeft == null || ssl.daysLeft > 10) return;
      setIncidentLog(prev => {
        const recent = prev.find(e =>
          e.type === "ssl_expiry" && e.url === u.url &&
          Date.now() - e.ts < 24 * 60 * 60 * 1000
        );
        if (recent) return prev;
        return addIncident(prev, {
          url: u.url, groupName: u._groupName,
          type: "ssl_expiry", daysLeft: ssl.daysLeft, notAfter: ssl.notAfter,
        });
      });
    });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const addToast = useCallback((url, type) => {
    setToasts(prev => [...prev.slice(-4), { id: crypto.randomUUID(), url, type }]);
  }, []);

  const dismissToast = useCallback((id) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  const applySslResult = useCallback((groupId, urlId, result) => {
    /* Alerte SSL si expiration dans ≤ 10 jours */
    if (result.valid && result.daysLeft != null && result.daysLeft <= 10) {
      const grp = groupsRef.current.find(g => g.id === groupId);
      const urlEntry = grp?.urls.find(u => u.id === urlId);
      if (urlEntry) {
        setIncidentLog(prev => {
          /* Dédoublonnage : ne pas ré-alerter si déjà enregistré dans les 24 dernières heures */
          const recent = prev.find(e =>
            e.type === "ssl_expiry" && e.url === urlEntry.url &&
            Date.now() - e.ts < 24 * 60 * 60 * 1000
          );
          if (recent) return prev;
          /* Notification navigateur */
          if (typeof Notification !== "undefined" && Notification.permission === "granted") {
            const domain = (() => { try { return new URL(urlEntry.url).hostname; } catch { return urlEntry.url; } })();
            new Notification(`🔐 Certificat SSL : ${domain}`, {
              body: result.daysLeft <= 0
                ? "Le certificat SSL a expiré !"
                : `Expire dans ${result.daysLeft} jour${result.daysLeft > 1 ? "s" : ""}.`,
              icon: `https://www.google.com/s2/favicons?domain=${domain}&sz=64`,
              tag: `ssl-${urlId}`,
            });
          }
          return addIncident(prev, {
            url: urlEntry.url,
            groupName: grp?.name,
            type: "ssl_expiry",
            daysLeft: result.daysLeft,
            notAfter: result.notAfter,
          });
        });
      }
    }
    setGroups(gs => {
      const next = gs.map(g => g.id !== groupId ? g : {
        ...g,
        urls: g.urls.map(u => u.id !== urlId ? u : {
          ...u, sslInfo: { ...result, lastChecked: new Date().toISOString() },
        }),
      });
      saveGroups(next);
      return next;
    });
  }, []);

  const runSslCheck = useCallback((groupId, urlId, urlStr, force = false) => {
    if (!urlStr.startsWith('https://')) return;
    if (!force) {
      const age = Date.now() - (sslTsRef.current[urlId] || 0);
      if (age < 60 * 60 * 1000) return;
    }
    sslTsRef.current[urlId] = Date.now();
    checkSsl(urlStr).then(result => applySslResult(groupId, urlId, result));
  }, [applySslResult]);

  /* ── Notifications navigateur ── */
  useEffect(() => {
    if (typeof Notification !== "undefined" && Notification.permission === "default") {
      Notification.requestPermission();
    }
  }, []);

  const applyResult = useCallback((groupId, urlId, urlStr, result) => {
    const prev = prevStatusRef.current[urlId];
    const changed = prev !== undefined && prev !== result.isUp;
    if (changed) {
      const type = result.isUp ? "online" : "offline";
      addToast(urlStr, type);
      /* Notification navigateur */
      if (typeof Notification !== "undefined" && Notification.permission === "granted") {
        const domain = (() => { try { return new URL(urlStr).hostname; } catch { return urlStr; } })();
        new Notification(type === "offline" ? `🔴 ${domain} est hors ligne` : `🟢 ${domain} est de retour`, {
          body: type === "offline" ? "Le site ne répond plus." : "Le site répond à nouveau.",
          icon: `https://www.google.com/s2/favicons?domain=${domain}&sz=64`,
          tag: urlId,
        });
      }
      /* Journal d'incidents */
      const grp = groupsRef.current.find(g => g.id === groupId);
      setIncidentLog(prev => addIncident(prev, { url: urlStr, groupName: grp?.name, type }));
    }
    prevStatusRef.current[urlId] = result.isUp;
    setGroups(gs => gs.map(g => {
      if (g.id !== groupId) return g;
      return {
        ...g, urls: g.urls.map(u => {
          if (u.id !== urlId) return u;
          const newHistory = [...u.history, { ts: Date.now(), isUp: result.isUp, rt: result.responseTime }].slice(-MAX_HISTORY);
          return { ...u, isUp: result.isUp, responseTime: result.responseTime, lastCheck: new Date(), history: newHistory, status: result.status };
        }),
      };
    }));
    setCheckingIds(prev => { const s = new Set(prev); s.delete(urlId); return s; });
  }, [addToast]);

  const runCheck = useCallback((groupId, urlId, urlStr) => {
    setCheckingIds(cs => new Set(cs).add(urlId));
    checkUrl(urlStr).then(result => applyResult(groupId, urlId, urlStr, result));
  }, [applyResult]);

  const runAllChecks = useCallback(() => {
    const current = groupsRef.current;
    current.forEach(g => g.urls.forEach(u => {
      if (u.paused) return; /* URL en pause — monitoring suspendu */
      setCheckingIds(cs => new Set(cs).add(u.id));
      checkUrl(u.url).then(result => applyResult(g.id, u.id, u.url, result));
      runSslCheck(g.id, u.id, u.url);
    }));
  }, [applyResult, runSslCheck]);

  useEffect(() => { runAllChecks(); }, []);

  useEffect(() => {
    if (paused) { window.clearInterval(countdownRef.current); return; }
    setCountdown(interval);
    countdownRef.current = window.setInterval(() => {
      setCountdown(prev => {
        if (prev <= 1) { runAllChecks(); return intervalRef.current; }
        return prev - 1;
      });
    }, 1000);
    return () => window.clearInterval(countdownRef.current);
  }, [paused, interval, runAllChecks]);

  const addUrl = () => {
    let url = input.trim();
    if (!url) return;
    if (!/^https?:\/\//i.test(url)) url = "https://" + url;
    try { new URL(url); } catch { return; }
    const group = groups.find(g => g.id === activeGroupId);
    if (!group || group.urls.some(u => u.url.toLowerCase() === url.toLowerCase())) return;
    const entry = makeEntry(url);
    const next = groups.map(g => g.id === activeGroupId ? { ...g, urls: [...g.urls, entry] } : g);
    setGroups(next);
    saveGroups(next);
    setInput("");
    setTimeout(() => {
      runCheck(activeGroupId, entry.id, entry.url);
      runSslCheck(activeGroupId, entry.id, entry.url, true);
    }, 50);
  };

  const togglePauseUrl = useCallback((groupId, urlId) => {
    setGroups(gs => gs.map(g => g.id !== groupId ? g : {
      ...g,
      urls: g.urls.map(u => u.id !== urlId ? u : { ...u, paused: !u.paused }),
    }));
  }, []);

  const removeUrl = (groupId, urlId) => {
    const next = groups.map(g => g.id === groupId ? { ...g, urls: g.urls.filter(u => u.id !== urlId) } : g);
    setGroups(next);
    saveGroups(next);
    delete prevStatusRef.current[urlId];
  };

  const addGroup = (name) => {
    const g = makeGroup(name);
    const next = [...groups, g];
    setGroups(next);
    saveGroups(next);
    setActiveGroupId(g.id);
  };

  const removeGroup = (id) => {
    const next = groups.filter(g => g.id !== id);
    if (activeGroupId === id) setActiveGroupId(next[0]?.id);
    setGroups(next);
    saveGroups(next);
  };

  const renameGroup = (id, name) => {
    const next = groups.map(g => g.id === id ? { ...g, name } : g);
    setGroups(next);
    saveGroups(next);
  };

  const updateCredentials = (groupId, urlId, creds) => {
    const next = groups.map(g => g.id !== groupId ? g : {
      ...g,
      urls: g.urls.map(u => u.id !== urlId ? u : { ...u, credentials: creds }),
    });
    setGroups(next);
    saveGroups(next);
  };

  const updateUrl = (groupId, urlId, newUrl) => {
    const next = groups.map(g => g.id !== groupId ? g : {
      ...g,
      urls: g.urls.map(u => u.id !== urlId ? u : {
        ...u,
        url: newUrl,
        isUp: null, responseTime: null, lastCheck: null, history: [], status: null,
      }),
    });
    setGroups(next);
    saveGroups(next);
    setTimeout(() => runCheck(groupId, urlId, newUrl), 100);
  };

  /* ── Drag & drop réordonnancement ── */
  const dragRef = useRef(null);
  const [dragOverId, setDragOverId] = useState(null);

  const moveUrl = useCallback((groupId, fromId, toId) => {
    if (fromId === toId) return;
    setGroups(gs => {
      const next = gs.map(g => {
        if (g.id !== groupId) return g;
        const urls = [...g.urls];
        const fi = urls.findIndex(u => u.id === fromId);
        const ti = urls.findIndex(u => u.id === toId);
        if (fi < 0 || ti < 0) return g;
        const [moved] = urls.splice(fi, 1);
        urls.splice(ti, 0, moved);
        return { ...g, urls };
      });
      saveGroups(next);
      return next;
    });
  }, []);

  const handleExcelImport = (urls) => {
    const group = groups.find(g => g.id === activeGroupId);
    if (!group) return;
    const existing = new Set(group.urls.map(u => u.url.toLowerCase()));
    const newEntries = urls.filter(u => !existing.has(u.toLowerCase())).map(makeEntry);
    if (!newEntries.length) return;
    const next = groups.map(g => g.id === activeGroupId ? { ...g, urls: [...g.urls, ...newEntries] } : g);
    setGroups(next);
    saveGroups(next);
    setTimeout(() => newEntries.forEach(e => {
      runCheck(activeGroupId, e.id, e.url);
      runSslCheck(activeGroupId, e.id, e.url, true);
    }), 50);
  };

  const activeGroup = groups.find(g => g.id === activeGroupId);
  const isAllView = activeGroup?.isGlobal === true;
  const groupUrls = isAllView
    ? groups.flatMap(g => g.urls.map(u => ({ ...u, _groupId: g.id, _groupName: g.name })))
    : (activeGroup?.urls || []);
  const allUrls = groups.flatMap(g => g.urls);
  const isUp = u => { const s = getStatus(u); return s === STATUS.ONLINE || s === STATUS.SLOW; };
  const onlineCount = groupUrls.filter(isUp).length;
  const checkedUrls = groupUrls.filter(u => u.responseTime !== null);
  const avgResponse = checkedUrls.length > 0
    ? Math.round(checkedUrls.reduce((s, u) => s + u.responseTime, 0) / checkedUrls.length) : 0;
  const uptimePercent = groupUrls.length > 0 ? Math.round((onlineCount / groupUrls.length) * 100) : 0;
  const totalOnline = allUrls.filter(isUp).length;
  const displayedUrls = groupUrls.filter(entry => {
    if (filterText) {
      const q = filterText.toLowerCase();
      if (!entry.url.toLowerCase().includes(q)) return false;
    }
    if (filterStatus === "online" && getStatus(entry) !== STATUS.ONLINE) return false;
    if (filterStatus === "offline" && getStatus(entry) !== STATUS.OFFLINE) return false;
    return true;
  });

  const activeNavItem = activeModule !== "monitor" ? activeModule
    : (mainTab === "journal" || mainTab === "parametres") ? mainTab
    : "monitor";

  return (
    <div style={{ display: "flex", minHeight: "100vh", background: "#0B0F19", color: "#F3F4F6", fontFamily: "'Inter', system-ui, sans-serif" }}>
      <Sidebar
        groups={groups}
        activeGroupId={activeGroupId}
        onSelect={(id) => { setActiveGroupId(id); setActiveModule("monitor"); setMainTab("surveillance"); }}
        onAddGroup={(name) => { addGroup(name); setActiveModule("monitor"); setMainTab("surveillance"); }}
        onRemoveGroup={removeGroup}
        onRenameGroup={renameGroup}
        open={sidebarOpen}
        onToggle={() => setSidebarOpen(o => !o)}
        isMobile={isMobile}
        checkingIds={checkingIds}
        totalUrls={allUrls.length}
        totalOnline={totalOnline}
        onImport={(importedGroups) => setGroups(() => { saveGroups(importedGroups); return importedGroups; })}
        activeModule={activeNavItem}
        journalBadge={incidentLog.filter(e => e.type !== "online").length}
        todoBadge={todoBadge}
        serversBadge={allServers.length}
        agentsBadge={agentsBadge}
        onSelectModule={(id) => {
          if (id === "journal" || id === "parametres") { setActiveModule("monitor"); setMainTab(id); }
          else { setActiveModule(id); setMainTab("surveillance"); }
        }}
      />

      {/* ══ MODULES NON-MONITOR ══ */}
      {activeModule !== "monitor" && (
        <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0 }}>
          <header style={{
            borderBottom: "1px solid rgba(255,255,255,0.06)", padding: "14px 24px",
            display: "flex", alignItems: "flex-start", justifyContent: "space-between",
            flexWrap: "wrap", gap: 12,
            background: "rgba(255,255,255,0.02)", backdropFilter: "blur(12px)",
            position: "sticky", top: 0, zIndex: 10,
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              {isMobile && (
                <button onClick={() => setSidebarOpen(true)} style={{
                  background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)",
                  borderRadius: 8, width: 32, height: 32, display: "flex", alignItems: "center", justifyContent: "center",
                  color: "#9CA3AF", cursor: "pointer", flexShrink: 0,
                }}><Menu size={16} /></button>
              )}
              <div>
              <h1 style={{ fontSize: 16, fontWeight: 700, color: "#F9FAFB", margin: 0 }}>
                {activeModule === "servers"
                  ? ({ inventory: "Inventaire serveurs", agents: "Agents VPS", config: "Configuration agents", deploy: "Déploiement en masse" }[serverSubTab] || "Serveurs")
                  : ({ dashboard: "Dashboard", capacity: "Capacity Planning", todo: "TodoList", workflows: "Workflows", impacts: "Impacts Applicatifs", journal: "Journal des alertes", parametres: "Paramètres" }[activeModule] || activeModule)}
              </h1>
              <p style={{ fontSize: 11, color: "#4B5563", margin: 0 }}>
                {activeModule === "servers"
                  ? ({ inventory: "CPU, RAM et disque en temps réel par serveur", agents: "Supervision temps réel · Linux & Windows · CPU / RAM / Disque / Réseau / Processus / Répertoires", config: "Ajouter · modifier · tester les agents VPS · télécharger les scripts", deploy: "Scripts pré-remplis SSH · WinRM · Ansible pour déployer les agents sur tout l'inventaire" }[serverSubTab] || "")
                  : ({ dashboard: "Vue synthetique - KPIs - alertes - SSL - performance", capacity: "Projections 6 mois · seuil critique 90% · recommandations", todo: "Tâches en cours · auto-générées + manuelles", workflows: "Création et gestion de procédures d'intervention pas à pas", impacts: "Cartographie des dépendances entre applications et serveurs", journal: "Historique des événements · pannes · SSL · serveurs", parametres: "Configuration de l'application" }[activeModule] || "")}
              </p>
              </div>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              {activeModule === "servers" && (
                <div style={{
                  display: "flex", alignItems: "center", gap: 7, padding: "5px 12px", borderRadius: 9,
                  background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.06)",
                }}>
                  <span style={{ fontSize: 11, color: "#9CA3AF" }}>Serveurs</span>
                  <select value={agentInterval} onChange={e => { const v = +e.target.value; setAgentInterval(v); localStorage.setItem("g1oeil_agent_interval", String(v)); }}
                    style={{ background: "transparent", border: "none", color: "#E5E7EB", fontSize: 12, fontFamily: "'JetBrains Mono', monospace", cursor: "pointer" }}>
                    {[10, 15, 30, 60, 120, 300].map(v => <option key={v} value={v} style={{ background: "#1F2937" }}>{v < 60 ? `${v}s` : `${v/60}min`}</option>)}
                  </select>
                </div>
              )}
              {activeModule === "servers" && serverSubTab === "inventory" && <ServerImport />}
            </div>
          </header>
          {/* Sous-onglets Serveurs */}
          {activeModule === "servers" && (
            <div style={{ display: "flex", gap: 4, padding: "0 24px 0", borderBottom: "1px solid rgba(255,255,255,0.06)", background: "rgba(255,255,255,0.01)" }}>
              {[
                { id: "inventory", label: "Inventaire" },
                { id: "agents",    label: `Agents VPS${agentsBadge > 0 ? ` (${agentsBadge} ✗)` : ""}` },
                { id: "config",    label: "Configuration agents" },
                { id: "deploy",    label: "Déploiement" },
              ].map(({ id, label }) => (
                <button key={id} onClick={() => setServerSubTab(id)} style={{
                  padding: "9px 16px", fontSize: 12, fontWeight: serverSubTab === id ? 700 : 400,
                  color: serverSubTab === id ? "#818CF8" : "#6B7280",
                  background: "transparent", border: "none", borderBottom: serverSubTab === id ? "2px solid #818CF8" : "2px solid transparent",
                  cursor: "pointer", transition: "color 0.15s",
                }}>{label}</button>
              ))}
            </div>
          )}
          <main style={{ flex: 1, padding: activeModule === "workflows" || activeModule === "impacts" ? 0 : "20px 24px 48px", overflowY: activeModule === "workflows" || activeModule === "impacts" ? "hidden" : "auto", display: "flex", flexDirection: "column" }}>
            {activeModule === "dashboard" && <DashboardPage groups={groups} allUrls={allUrls} allServers={allServers} incidentLog={incidentLog} capacitySettings={capacitySettings} />}
            {activeModule === "servers"   && serverSubTab === "inventory" && <ServersView />}
            {activeModule === "servers"   && serverSubTab === "agents"    && <AgentsView />}
            {activeModule === "servers"   && serverSubTab === "config"    && <VpsAgentsConfig />}
            {activeModule === "servers"   && serverSubTab === "deploy"    && <AgentDeployMass />}
            {activeModule === "capacity"  && <CapacityPlanning />}
            {activeModule === "todo"      && <TodoList servers={allServers} allUrls={allUrls} />}
            {activeModule === "workflows" && <WorkflowEditor />}
            {activeModule === "impacts"   && <AppImpactMap />}
          </main>
        </div>
      )}

      {activeModule === "monitor" && (<>

      <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0 }}>
        <header style={{
          borderBottom: "1px solid rgba(255,255,255,0.06)", padding: "14px 24px",
          display: "flex", alignItems: "center", justifyContent: "space-between",
          flexWrap: "wrap", gap: 12,
          background: "rgba(255,255,255,0.02)", backdropFilter: "blur(12px)",
          position: "sticky", top: 0, zIndex: 10,
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            {isMobile && (
              <button onClick={() => setSidebarOpen(true)} style={{
                background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)",
                borderRadius: 8, width: 32, height: 32, display: "flex", alignItems: "center", justifyContent: "center",
                color: "#9CA3AF", cursor: "pointer", flexShrink: 0,
              }}><Menu size={16} /></button>
            )}
            <div>
            <h1 style={{ fontSize: 16, fontWeight: 700, color: "#F9FAFB", margin: 0 }}>
              {isAllView ? "Tous les sites" : (activeGroup?.name || "—")}
            </h1>
            <p style={{ fontSize: 11, color: "#4B5563", margin: 0 }}>
              {totalOnline}/{allUrls.length} en ligne · {groups.length} groupe{groups.length > 1 ? "s" : ""}
            </p>
            </div>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <div style={{
              display: "flex", alignItems: "center", gap: 7, padding: "5px 12px", borderRadius: 9,
              background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.06)",
            }}>
              <span style={{ fontSize: 11, color: "#9CA3AF" }}>Intervalle</span>
              <select value={interval} onChange={e => { setInterval_(+e.target.value); setCountdown(+e.target.value); }}
                style={{ background: "transparent", border: "none", color: "#E5E7EB", fontSize: 12, fontFamily: "'JetBrains Mono', monospace", cursor: "pointer" }}>
                {[10, 15, 30, 60, 120].map(v => <option key={v} value={v} style={{ background: "#1F2937" }}>{v}s</option>)}
              </select>
            </div>
            <button onClick={() => setPaused(!paused)} style={{
              display: "flex", alignItems: "center", gap: 5, padding: "5px 12px", borderRadius: 9,
              background: paused ? "rgba(251,191,36,0.1)" : "rgba(52,211,153,0.1)",
              border: `1px solid ${paused ? "rgba(251,191,36,0.2)" : "rgba(52,211,153,0.2)"}`,
              color: paused ? "#FBBF24" : "#34D399", fontSize: 12, fontWeight: 600, cursor: "pointer",
            }}>
              {paused ? <Play size={13} /> : <Pause size={13} />}
              {paused ? "Reprendre" : "Pause"}
            </button>
            <button onClick={runAllChecks} style={{
              display: "flex", alignItems: "center", gap: 5, padding: "5px 12px", borderRadius: 9,
              background: "rgba(99,102,241,0.1)", border: "1px solid rgba(99,102,241,0.2)",
              color: "#A5B4FC", fontSize: 12, fontWeight: 600, cursor: "pointer",
            }}>
              <RefreshCw size={13} /> Vérifier tout
            </button>
            {!paused && (
              <div style={{
                padding: "5px 12px", borderRadius: 9, background: "rgba(99,102,241,0.08)",
                border: "1px solid rgba(99,102,241,0.15)", fontSize: 12, color: "#818CF8",
                fontFamily: "'JetBrains Mono', monospace", fontWeight: 600, minWidth: 52, textAlign: "center",
              }}>
                {countdown}s
              </div>
            )}
          </div>
        </header>


        <main style={{ flex: 1, padding: "20px 24px 48px", overflowY: "auto" }}>
          {/* ══ ONGLET SURVEILLANCE ══ */}
          {mainTab === "surveillance" && (<>
          <div style={{ display: "flex", gap: 10, marginBottom: 20, flexWrap: "wrap" }}>
            <StatCard icon={Globe} label="URLs" value={groupUrls.length} accent="#6366F1" />
            <StatCard icon={Wifi} label="Disponibilité" value={`${uptimePercent}%`} accent="#34D399" />
            <StatCard icon={Zap} label="Moy. réponse" value={avgResponse > 0 ? `${avgResponse} ms` : "—"} accent="#FBBF24" />
            <StatCard icon={WifiOff} label="Hors ligne" value={groupUrls.filter(u => getStatus(u) === STATUS.OFFLINE).length} accent="#F87171" />
          </div>

          {/* Filtre + vue toggle */}
          <div style={{ display: "flex", gap: 8, marginBottom: 10, flexWrap: "wrap", alignItems: "center" }}>
            <div style={{ display: "flex", borderRadius: 9, overflow: "hidden", border: "1px solid rgba(255,255,255,0.08)", flexShrink: 0 }}>
              {[["grid", LayoutGrid], ["list", List]].map(([mode, Icon]) => (
                <button key={mode} onClick={() => setViewMode(mode)} title={mode === "grid" ? "Vue grille" : "Vue liste"} style={{
                  padding: "6px 10px", cursor: "pointer", display: "flex", alignItems: "center", border: "none",
                  background: viewMode === mode ? "rgba(99,102,241,0.25)" : "rgba(255,255,255,0.03)",
                  color: viewMode === mode ? "#A5B4FC" : "#4B5563", transition: "background 0.15s, color 0.15s",
                }}><Icon size={14} /></button>
              ))}
            </div>
            <div style={{ flex: 1, minWidth: 180, display: "flex", alignItems: "center", gap: 7,
              background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 9, padding: "5px 12px" }}>
              <Search size={13} color="#4B5563" style={{ flexShrink: 0 }} />
              <input value={filterText} onChange={e => setFilterText(e.target.value)}
                placeholder="Filtrer par URL ou domaine…"
                style={{ flex: 1, background: "transparent", border: "none", color: "#E5E7EB", fontSize: 12,
                  fontFamily: "'JetBrains Mono', monospace", outline: "none" }} />
              {filterText && (
                <button onClick={() => setFilterText("")} style={{ background: "none", border: "none", color: "#4B5563", cursor: "pointer", display: "flex", padding: 0 }}>
                  <X size={12} />
                </button>
              )}
            </div>
            {[["all", "Tous"], ["online", "En ligne"], ["offline", "Hors ligne"]].map(([val, label]) => (
              <button key={val} onClick={() => setFilterStatus(val)} style={{
                padding: "6px 11px", borderRadius: 9, fontSize: 11, cursor: "pointer", fontWeight: filterStatus === val ? 700 : 400,
                border: `1px solid ${filterStatus === val ? "rgba(99,102,241,0.4)" : "rgba(255,255,255,0.07)"}`,
                background: filterStatus === val ? "rgba(99,102,241,0.18)" : "rgba(255,255,255,0.03)",
                color: filterStatus === val ? "#A5B4FC" : "#6B7280", transition: "all 0.15s",
              }}>{label}</button>
            ))}
            {(filterText || filterStatus !== "all") && (
              <span style={{ fontSize: 11, color: "#4B5563", flexShrink: 0 }}>
                {displayedUrls.length} / {groupUrls.length}
              </span>
            )}
          </div>

          {/* Ajout d’URL (masqué en vue globale) */}
          {!isAllView && (
            <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap", alignItems: "center" }}>
              <div style={{
                display: "flex", flex: 1, minWidth: 260, gap: 8,
                background: "rgba(255,255,255,0.025)", border: "1px solid rgba(255,255,255,0.07)",
                borderRadius: 11, padding: 5,
              }}>
                <input value={input} onChange={e => setInput(e.target.value)} onKeyDown={e => e.key === "Enter" && addUrl()}
                  placeholder={`Ajouter une URL dans « ${activeGroup?.name || "..."} »`}
                  style={{ flex: 1, background: "transparent", border: "none", color: "#E5E7EB", padding: "8px 12px", fontSize: 13, fontFamily: "'JetBrains Mono', monospace" }} />
                <button onClick={addUrl} style={{
                  display: "flex", alignItems: "center", gap: 5, padding: "8px 18px", borderRadius: 8,
                  background: "linear-gradient(135deg, #6366F1, #7C3AED)", border: "none", color: "#fff",
                  fontSize: 12, fontWeight: 600, cursor: "pointer", boxShadow: "0 2px 10px rgba(99,102,241,0.3)",
                }}>
                  <Plus size={14} /> Ajouter
                </button>
              </div>
              <ExcelImport onImport={handleExcelImport} />
            </div>
          )}

          {displayedUrls.length === 0 ? (
            <div style={{
              textAlign: "center", padding: "60px 20px", color: "#4B5563",
              background: "rgba(255,255,255,0.02)", borderRadius: 14, border: "1px dashed rgba(255,255,255,0.08)",
            }}>
              <Globe size={36} style={{ marginBottom: 10, opacity: 0.3 }} />
              {(filterText || filterStatus !== "all") ? (
                <>
                  <p style={{ fontSize: 14, marginBottom: 8 }}>Aucun résultat pour ce filtre</p>
                  <button onClick={() => { setFilterText(""); setFilterStatus("all"); }} style={{
                    padding: "6px 14px", borderRadius: 8, border: "1px solid rgba(99,102,241,0.3)",
                    background: "rgba(99,102,241,0.1)", color: "#A5B4FC", fontSize: 12, cursor: "pointer",
                  }}>Effacer les filtres</button>
                </>
              ) : (
                <>
                  <p style={{ fontSize: 14, marginBottom: 4 }}>Aucune URL dans ce groupe</p>
                  <p style={{ fontSize: 12 }}>Ajoutez une URL ou importez un fichier Excel.</p>
                </>
              )}
            </div>
          ) : (
            <div style={viewMode === "grid"
              ? { display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))", gap: 14 }
              : { display: "flex", flexDirection: "column", gap: 6 }
            }>
              {displayedUrls.map((entry, i) => {
                const gId = entry._groupId || activeGroupId;
                const isDragTarget = dragOverId === entry.id;
                return (
                  <div
                    key={entry.id}
                    draggable={!isAllView}
                    onDragStart={() => { dragRef.current = { groupId: gId, urlId: entry.id }; }}
                    onDragEnd={() => { dragRef.current = null; setDragOverId(null); }}
                    onDragOver={e => { e.preventDefault(); if (!isAllView) setDragOverId(entry.id); }}
                    onDragLeave={() => setDragOverId(null)}
                    onDrop={e => {
                      e.preventDefault();
                      setDragOverId(null);
                      const d = dragRef.current;
                      if (d && d.groupId === gId) moveUrl(gId, d.urlId, entry.id);
                    }}
                    style={{
                      animation: `fadeIn 0.3s ease ${i * 0.04}s both`,
                      cursor: isAllView ? "default" : "grab",
                      outline: isDragTarget ? "2px solid rgba(99,102,241,0.6)" : "none",
                      borderRadius: 14,
                      transition: "outline 0.1s, transform 0.1s",
                      transform: isDragTarget ? "scale(1.01)" : "scale(1)",
                    }}>
                    <UrlCard
                      entry={entry}
                      index={i}
                      viewMode={viewMode}
                      groupName={isAllView ? entry._groupName : null}
                      onRemove={() => removeUrl(gId, entry.id)}
                      onCheck={() => {
                        runCheck(gId, entry.id, entry.url);
                        runSslCheck(gId, entry.id, entry.url, true);
                      }}
                      checking={checkingIds.has(entry.id)}
                      onUpdateCredentials={(creds) => updateCredentials(gId, entry.id, creds)}
                      onUpdateUrl={(newUrl) => updateUrl(gId, entry.id, newUrl)}
                      onTogglePause={() => togglePauseUrl(gId, entry.id)}
                    />
                  </div>
                );
              })}
            </div>
          )}
          </>)}

          {/* ══ ONGLET JOURNAL ══ */}
          {mainTab === "journal" && (
            <IncidentLogPage
              log={incidentLog}
              onClear={() => { setIncidentLog([]); localStorage.removeItem("url-monitor-incidents"); }}
            />
          )}

          {/* ══ ONGLET PARAMÈTRES ══ */}
          {mainTab === "parametres" && (
            <SettingsPage
              interval={interval}
              setInterval_={setInterval_}
              countdown={countdown}
              paused={paused}
              setPaused={setPaused}
              runAllChecks={runAllChecks}
              notifEnabled={notifEnabled}
              setNotifEnabled={setNotifEnabled}
              capacitySettings={capacitySettings}
              setCapacitySettings={setCapacitySettings}
              allUrls={allUrls}
              incidentLog={incidentLog}
              setIncidentLog={setIncidentLog}
              allServers={allServers}
              onNavigate={(mod) => { setActiveModule(mod); setMainTab("surveillance"); }}
            />
          )}
        </main>
      </div>
      </>)}

      <Toast toasts={toasts} onDismiss={dismissToast} />
    </div>
  );
}
