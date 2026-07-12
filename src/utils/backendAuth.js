/* ── Auth frontend — synchronisation avec le backend G1Oeil ── */

const BACKEND_URL = "http://localhost:3210";
const TOKEN_KEY = "g1oeil-auth-token";
const USER_KEY = "g1oeil-auth-user";

export function getAuthToken() {
  return localStorage.getItem(TOKEN_KEY) || null;
}

export function getAuthUser() {
  try {
    const raw = localStorage.getItem(USER_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

export function isLoggedIn() {
  return !!getAuthToken();
}

export function getUserRole() {
  const user = getAuthUser();
  return user?.role || null;
}

export function isSuperAdmin() {
  return getUserRole() === "superadmin";
}

export function isAdmin() {
  return getUserRole() === "admin";
}

export function canEdit() {
  return isSuperAdmin() || isAdmin();
}

export function canDelete() {
  return isSuperAdmin();
}

export function canManageUsers() {
  return isSuperAdmin();
}

export async function register(username, email, password) {
  const r = await fetch(`${BACKEND_URL}/api/auth/register-public`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, email, password }),
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data.error || "Inscription échouée");
  return data;
}

export async function login(username, password) {
  const r = await fetch(`${BACKEND_URL}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password }),
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data.error || "Connexion échouée");
  localStorage.setItem(TOKEN_KEY, data.token);
  localStorage.setItem(USER_KEY, JSON.stringify(data.user));
  return data.user;
}

export async function logout() {
  const token = getAuthToken();
  if (token) {
    try {
      await fetch(`${BACKEND_URL}/api/auth/logout`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      });
    } catch {}
  }
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
}

export async function verifyToken() {
  const token = getAuthToken();
  if (!token) return null;
  try {
    const r = await fetch(`${BACKEND_URL}/api/auth/me`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!r.ok) { logout(); return null; }
    const user = await r.json();
    localStorage.setItem(USER_KEY, JSON.stringify(user));
    return user;
  } catch { return null; }
}

export async function pushUrlsToBackend(groups) {
  const token = getAuthToken();
  if (!token) return { ok: false, error: "Non connecté" };
  const r = await fetch(`${BACKEND_URL}/api/urls/import`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify(groups),
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) return { ok: false, error: data.error || "Import échoué" };
  return data;
}

/* ── Envoi d'un log d'audit depuis le frontend ── */
export async function sendAuditLog(category, action, detail, severity = "info") {
  const token = getAuthToken();
  if (!token) return;
  try {
    await fetch(`${BACKEND_URL}/api/audit`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ category, action, detail, severity }),
    });
  } catch {}
}

/* ── Heartbeat régulier pour tracer la synchro frontend ↔ backend ── */
let heartbeatInterval = null;
let lastHeartbeatOk = true;

export function startHeartbeat(getState) {
  if (heartbeatInterval) clearInterval(heartbeatInterval);
  heartbeatInterval = setInterval(async () => {
    const token = getAuthToken();
    if (!token) return;
    try {
      const state = getState ? getState() : {};
      const r = await fetch(`${BACKEND_URL}/api/auth/heartbeat`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          urlsCount: state.urlsCount || 0,
          serversCount: state.serversCount || 0,
        }),
      });
      if (!r.ok) throw new Error("Heartbeat échoué");
      if (!lastHeartbeatOk) {
        lastHeartbeatOk = true;
        sendAuditLog("sync", "restored", "Synchronisation restaurée", "info");
      }
    } catch {
      if (lastHeartbeatOk) {
        lastHeartbeatOk = false;
        sendAuditLog("sync", "lost", "Perte de synchronisation avec le backend", "error");
      }
    }
  }, 30000); /* toutes les 30 secondes */
}

export function stopHeartbeat() {
  if (heartbeatInterval) { clearInterval(heartbeatInterval); heartbeatInterval = null; }
}

/* ── Tracer les indisponibilités de l'application (URLs down) ── */
export async function logAppIncident(url, type, detail) {
  await sendAuditLog("system", "incident", `${type}: ${url} — ${detail}`, "error");
}

/* ── Tracer les déconnexions ITCare ── */
export async function logItcareDisconnect(error) {
  await sendAuditLog("itcare", "disconnect", `Déconnexion ITCare: ${error}`, "error");
}

export { BACKEND_URL };
