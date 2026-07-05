const KEY = "vps-agents-config";

/* ── Persistance de la config ── */
export function loadVpsAgents() {
  try { return JSON.parse(localStorage.getItem(KEY)) || []; }
  catch { return []; }
}

export function saveVpsAgents(agents) {
  try {
    localStorage.setItem(KEY, JSON.stringify(agents));
    window.dispatchEvent(new CustomEvent("vps-agents-changed", { detail: agents }));
  } catch {}
}

export function makeVpsAgent(data = {}) {
  return {
    id:      crypto.randomUUID(),
    name:    data.name  || "VPS",
    url:     (data.url  || "").replace(/\/+$/, ""),
    env:     data.env   || "Production",
    app:     data.app   || "",
    role:    data.role  || "web",
    enabled: true,
  };
}

/* ── Cache des dernières métriques (en mémoire, non persisté) ── */
const _metricsCache = new Map();   // agentId -> { data, status, lastSeen }
const _listeners    = new Set();
let   _snapshot     = {};          // référence stable pour useSyncExternalStore

export function getAgentMetrics(agentId) {
  return _metricsCache.get(agentId) || null;
}

export function getAllAgentMetrics() {
  return _snapshot;   // même référence entre deux _notify()
}

export function subscribeAgents(fn) {
  _listeners.add(fn);
  return () => _listeners.delete(fn);
}

function _notify() {
  _snapshot = Object.fromEntries(_metricsCache);   // nouvel objet uniquement lors d'une mise à jour
  _listeners.forEach(fn => fn());
}

export function setAgentMetrics(agentId, data, status = "ok") {
  _metricsCache.set(agentId, { data, status, lastSeen: Date.now() });
  _notify();
}

export function setAgentError(agentId, error) {
  const prev = _metricsCache.get(agentId);
  _metricsCache.set(agentId, { data: prev?.data || null, status: "error", error, lastSeen: prev?.lastSeen || null });
  _notify();
}

/* ── Fetch ── */
export async function fetchVpsMetrics(agentUrl) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 30000);
  try {
    const res = await fetch(`${agentUrl}/metrics`, { signal: controller.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}
