import { DEFAULT_URLS } from "../constants";

const GROUPS_KEY = "url-monitor-groups";
const BACKUP_KEY = "url-monitor-groups-backup";

export function makeEntry(url) {
  return {
    id: crypto.randomUUID(),
    url,
    isUp: null,
    responseTime: null,
    lastCheck: null,
    history: [],
    status: null,
    credentials: { login: "", password: "", previewUrl: "" },
    sslInfo: null,
  };
}

export function makeGroup(name, urls = []) {
  return { id: crypto.randomUUID(), name, urls };
}

function deserializeGroups(parsed) {
  return parsed.map(g => ({
    ...g,
    urls: (g.urls || []).map(u => ({
      ...u,
      lastCheck: u.lastCheck ? new Date(u.lastCheck) : null,
    })),
  }));
}

function applyMigration(groups) {
  if (!groups.some(g => g.isGlobal)) {
    const idx = groups.findIndex(g => g.id === 'general');
    const target = idx >= 0 ? idx : 0;
    groups[target] = { ...groups[target], isGlobal: true };
  }
  return groups;
}

export function loadGroups() {
  /* Essai clé principale */
  try {
    const raw = localStorage.getItem(GROUPS_KEY);
    if (raw) return applyMigration(deserializeGroups(JSON.parse(raw)));
  } catch {}
  /* Repli sur la sauvegarde automatique */
  try {
    const bak = localStorage.getItem(BACKUP_KEY);
    if (bak) {
      console.warn('[storage] Données principales corrompues — restauration depuis la sauvegarde');
      return applyMigration(deserializeGroups(JSON.parse(bak)));
    }
  } catch {}
  return null;
}

export function saveGroups(groups) {
  if (!Array.isArray(groups)) return;
  try {
    const payload = groups.map(g => ({
      ...g,
      urls: (g.urls || []).map(u => ({
        ...u,
        lastCheck: u.lastCheck instanceof Date ? u.lastCheck.toISOString() : (u.lastCheck || null),
      })),
    }));
    const json = JSON.stringify(payload);
    /* Sauvegarde l'ancienne version avant d'écraser */
    const prev = localStorage.getItem(GROUPS_KEY);
    if (prev) localStorage.setItem(BACKUP_KEY, prev);
    localStorage.setItem(GROUPS_KEY, json);
  } catch (e) {
    console.error('[storage] Erreur saveGroups:', e);
  }
}

export function exportGroupsJson(groups) {
  const blob = new Blob([JSON.stringify(groups, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `url-monitor-backup-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(a.href);
}

export function importGroupsJson(jsonText) {
  const parsed = JSON.parse(jsonText);
  if (!Array.isArray(parsed)) throw new Error('Format invalide');
  return applyMigration(deserializeGroups(parsed));
}

export function getDefaultGroups() {
  return [
    {
      id: "general",
      name: "Général",
      isGlobal: true,
      urls: [],
    },
  ];
}
