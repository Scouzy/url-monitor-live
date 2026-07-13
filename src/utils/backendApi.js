/* ═══════════════════════════════════════════════════════════════
   backendApi.js — Wrapper pour toutes les routes API backend
   ═══════════════════════════════════════════════════════════════ */

import { BACKEND_URL, getAuthToken, isLoggedIn } from "./backendAuth";

function authHeaders(extra = {}) {
  const token = getAuthToken();
  return {
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...extra,
  };
}

async function apiCall(path, opts = {}) {
  if (!isLoggedIn()) return { error: "Non connecté" };
  try {
    const r = await fetch(`${BACKEND_URL}${path}`, {
      ...opts,
      headers: authHeaders(opts.headers),
    });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) return { error: data.error || `HTTP ${r.status}` };
    return data;
  } catch (err) {
    return { error: err.message };
  }
}

/* ── Scheduler ── */
export const schedulerApi = {
  list: () => apiCall("/api/scheduler/"),
  create: (url_config_id, interval_seconds = 300, enabled = true) =>
    apiCall("/api/scheduler/", { method: "POST", body: JSON.stringify({ url_config_id, interval_seconds, enabled }) }),
  update: (id, { interval_seconds, enabled }) =>
    apiCall(`/api/scheduler/${id}`, { method: "PUT", body: JSON.stringify({ interval_seconds, enabled }) }),
  delete: (id) => apiCall(`/api/scheduler/${id}`, { method: "DELETE" }),
  scheduleUrl: (urlId, interval_seconds = 300, enabled = true) =>
    apiCall(`/api/scheduler/url/${urlId}`, { method: "POST", body: JSON.stringify({ interval_seconds, enabled }) }),
  results: (limit = 100) => apiCall(`/api/scheduler/results?limit=${limit}`),
  resultsForUrl: (url, limit = 100) => apiCall(`/api/scheduler/results/${encodeURIComponent(url)}?limit=${limit}`),
};

/* ── Notifications ── */
export const notificationsApi = {
  listChannels: () => apiCall("/api/notifications/channels"),
  createChannel: (name, type, config, triggers = "status_change,check_fail") =>
    apiCall("/api/notifications/channels", { method: "POST", body: JSON.stringify({ name, type, config, triggers }) }),
  updateChannel: (id, { name, type, config, triggers, enabled }) =>
    apiCall(`/api/notifications/channels/${id}`, { method: "PUT", body: JSON.stringify({ name, type, config, triggers, enabled }) }),
  deleteChannel: (id) => apiCall(`/api/notifications/channels/${id}`, { method: "DELETE" }),
  test: (channelId) => apiCall("/api/notifications/test", { method: "POST", body: JSON.stringify({ channelId }) }),
};

/* ── Server Metrics ── */
export const serverMetricsApi = {
  postMetrics: (metrics) =>
    apiCall("/api/servers/metrics", { method: "POST", body: JSON.stringify(metrics) }),
  postBatchMetrics: (metrics) =>
    apiCall("/api/servers/metrics/batch", { method: "POST", body: JSON.stringify({ metrics }) }),
  getHistory: (name, limit = 500) =>
    apiCall(`/api/servers/${encodeURIComponent(name)}/history?limit=${limit}`),
  getLatest: () => apiCall("/api/servers/metrics/latest"),
  postSnapshot: (snapshot) =>
    apiCall("/api/servers/snapshot", { method: "POST", body: JSON.stringify(snapshot) }),
  postBatchSnapshots: (servers) =>
    apiCall("/api/servers/snapshot/batch", { method: "POST", body: JSON.stringify({ servers }) }),
  getSnapshots: (name, limit = 365) =>
    apiCall(`/api/servers/${encodeURIComponent(name)}/snapshots?limit=${limit}`),
  getAllSnapshots: () => apiCall("/api/servers/snapshots/all"),
};

/* ── SSL ── */
export const sslApi = {
  list: () => apiCall("/api/ssl/"),
  expiring: (days = 30) => apiCall(`/api/ssl/expiring?days=${days}`),
  expired: () => apiCall("/api/ssl/expired"),
  check: (url) => apiCall("/api/ssl/check", { method: "POST", body: JSON.stringify({ url }) }),
  checkAll: () => apiCall("/api/ssl/check-all", { method: "POST" }),
};

/* ── Export ── */
export const exportApi = {
  serversXlsx: () => `${BACKEND_URL}/api/export/servers?format=xlsx`,
  urlsXlsx: () => `${BACKEND_URL}/api/export/urls?format=xlsx`,
  reportPdf: () => `${BACKEND_URL}/api/export/report?format=pdf`,
  downloadExport: async (url) => {
    const token = getAuthToken();
    if (!token) return { error: "Non connecté" };
    try {
      const r = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
      if (!r.ok) return { error: `HTTP ${r.status}` };
      const blob = await r.blob();
      const blobUrl = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = blobUrl;
      a.download = url.includes("servers") ? "serveurs.xlsx" : url.includes("urls") ? "urls.xlsx" : "rapport-g1oeil.html";
      a.click();
      URL.revokeObjectURL(blobUrl);
      return { ok: true };
    } catch (err) {
      return { error: err.message };
    }
  },
};

/* ── System ── */
export const systemApi = {
  metrics: () => apiCall("/api/system/metrics"),
  metricsPrometheus: () => apiCall("/api/system/metrics?format=prometheus"),
  backup: () => apiCall("/api/system/backup", { method: "POST" }),
  listBackups: () => apiCall("/api/system/backups"),
  deleteBackup: (filename) => apiCall(`/api/system/backups/${encodeURIComponent(filename)}`, { method: "DELETE" }),
  restore: (file) => {
    const token = getAuthToken();
    if (!token) return Promise.resolve({ error: "Non connecté" });
    const formData = new FormData();
    formData.append("backup", file);
    return fetch(`${BACKEND_URL}/api/system/restore`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      body: formData,
    }).then(r => r.json().catch(() => ({})));
  },
};

/* ── Health ── */
export async function checkBackendHealth() {
  try {
    const r = await fetch(`${BACKEND_URL}/api/health`);
    if (!r.ok) return { ok: false };
    const data = await r.json();
    return { ok: true, ...data };
  } catch {
    return { ok: false };
  }
}
