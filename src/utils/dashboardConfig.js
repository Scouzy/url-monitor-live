/* ═══════════════════════════════════════════════════════════════
   Dashboard widget configuration — save/load per user
   ═══════════════════════════════════════════════════════════════ */

const WIDGET_KEY = "g1oeil-dashboard-widgets";

export const WIDGET_DEFS = [
  { id: "url-overview",   label: "Vue d'ensemble URLs (donut + KPIs)", defaultVisible: true },
  { id: "server-resources", label: "Ressources serveurs (CPU/RAM/Disque)", defaultVisible: true },
  { id: "recent-events",  label: "Événements récents", defaultVisible: true },
  { id: "top-consumers",  label: "Top 5 consommateurs", defaultVisible: true },
  { id: "distributions",  label: "Distributions par tranche", defaultVisible: true },
  { id: "ssl-expiring",   label: "SSL expirant bientôt", defaultVisible: true },
  { id: "top-slow",       label: "URLs les plus lentes", defaultVisible: true },
  { id: "group-stats",    label: "Statistiques par groupe", defaultVisible: true },
  { id: "incidents-top",  label: "Top pannes par URL", defaultVisible: true },
];

export function loadWidgetConfig() {
  try {
    const raw = localStorage.getItem(WIDGET_KEY);
    if (!raw) return WIDGET_DEFS.map(w => ({ ...w, visible: w.defaultVisible }));
    const parsed = JSON.parse(raw);
    /* Merge with defaults to handle new widgets */
    return WIDGET_DEFS.map(w => {
      const saved = parsed.find(p => p.id === w.id);
      return { ...w, visible: saved != null ? saved.visible : w.defaultVisible };
    });
  } catch {
    return WIDGET_DEFS.map(w => ({ ...w, visible: w.defaultVisible }));
  }
}

export function saveWidgetConfig(config) {
  try {
    localStorage.setItem(WIDGET_KEY, JSON.stringify(config.map(w => ({ id: w.id, visible: w.visible }))));
  } catch (e) {
    console.error("[Dashboard] Erreur sauvegarde widgets:", e.message);
  }
}

export function isWidgetVisible(config, id) {
  const w = config.find(w => w.id === id);
  return w ? w.visible : true;
}
