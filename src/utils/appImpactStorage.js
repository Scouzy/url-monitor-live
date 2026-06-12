const KEY = "url-monitor-app-impacts";

export function loadImpacts() {
  try {
    const raw = localStorage.getItem(KEY);
    const data = raw ? JSON.parse(raw) : {};
    return { dependencies: [], appMeta: {}, ...data };
  } catch { return { dependencies: [], appMeta: {} }; }
}

export function saveImpacts(data) {
  try { localStorage.setItem(KEY, JSON.stringify(data)); } catch {}
}
