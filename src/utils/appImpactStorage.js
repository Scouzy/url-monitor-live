const KEY = "url-monitor-app-impacts";

export function loadImpacts() {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? JSON.parse(raw) : { dependencies: [] };
  } catch { return { dependencies: [] }; }
}

export function saveImpacts(data) {
  try { localStorage.setItem(KEY, JSON.stringify(data)); } catch {}
}
