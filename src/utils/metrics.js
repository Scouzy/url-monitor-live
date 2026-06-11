import { SLOW_THRESHOLD } from "../constants";

/* Filtre les entrées valides avec timestamp */
function valid(history) {
  return (history || []).filter(h => h && typeof h === "object" && h.ts != null);
}

/* Entrées dans une fenêtre de temps (ms depuis maintenant) */
function inWindow(entries, windowMs) {
  const cutoff = Date.now() - windowMs;
  return entries.filter(e => e.ts >= cutoff);
}

const H24  = 24 * 60 * 60 * 1000;
const H168 = 7  * 24 * 60 * 60 * 1000;
const H720 = 30 * 24 * 60 * 60 * 1000;

export function computeMetrics(history) {
  const all = valid(history);
  if (all.length === 0) return null;

  /* Uptime par fenêtre */
  function uptime(entries) {
    if (!entries.length) return null;
    const up = entries.filter(e => e.isUp).length;
    return (up / entries.length * 100);
  }

  const w24h  = inWindow(all, H24);
  const w7d   = inWindow(all, H168);
  const w30d  = inWindow(all, H720);

  /* Temps de réponse (uniquement les checks up) */
  const rts = all.filter(e => e.isUp && e.rt > 0).map(e => e.rt).sort((a, b) => a - b);

  function percentile(arr, p) {
    if (!arr.length) return null;
    const idx = Math.ceil(arr.length * p / 100) - 1;
    return arr[Math.max(0, idx)];
  }

  /* MTTR : temps moyen de rétablissement (durée moyenne des pannes) */
  let mttr = null;
  const incidents = [];
  let downStart = null;
  for (const e of all) {
    if (!e.isUp && downStart === null) downStart = e.ts;
    if (e.isUp && downStart !== null) {
      incidents.push(e.ts - downStart);
      downStart = null;
    }
  }
  if (incidents.length > 0) {
    mttr = incidents.reduce((s, d) => s + d, 0) / incidents.length;
  }

  return {
    totalChecks: all.length,
    uptime24h:   uptime(w24h),
    uptime7d:    uptime(w7d),
    uptime30d:   uptime(w30d),
    p50:         percentile(rts, 50),
    p95:         percentile(rts, 95),
    p99:         percentile(rts, 99),
    mttr,
    incidentCount: incidents.length,
  };
}

export function formatUptime(pct) {
  if (pct === null) return "—";
  return pct.toFixed(2) + "%";
}

export function formatMs(ms) {
  if (ms === null || ms === undefined) return "—";
  if (ms < 1000) return `${Math.round(ms)} ms`;
  return `${(ms / 1000).toFixed(1)} s`;
}

export function formatDuration(ms) {
  if (!ms) return "—";
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}min`;
  const h = Math.floor(m / 60); const rm = m % 60;
  return rm ? `${h}h ${rm}min` : `${h}h`;
}

export function uptimeColor(pct) {
  if (pct === null) return "#6B7280";
  if (pct >= 99)   return "#34D399";
  if (pct >= 95)   return "#FBBF24";
  return "#F87171";
}
