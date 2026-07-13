/* ═══════════════════════════════════════════════════════════════
   SLA / Uptime storage — persiste les checks dans localStorage
   ═══════════════════════════════════════════════════════════════ */

const SLA_KEY = "g1oeil-sla-history";
const MAX_DAYS = 90;

/* Charge l'historique SLA depuis localStorage */
export function loadSlaHistory() {
  try {
    const raw = localStorage.getItem(SLA_KEY);
    if (!raw) return {};
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

/* Sauvegarde l'historique SLA */
function saveSlaHistory(data) {
  try {
    localStorage.setItem(SLA_KEY, JSON.stringify(data));
  } catch (e) {
    console.error("[SLA] Erreur sauvegarde:", e.message);
  }
}

/* Enregistre un check pour une URL donnée
   entry = { url, isUp, responseTime, status } */
export function recordSlaCheck(entry) {
  if (!entry?.url) return;
  const data = loadSlaHistory();
  const today = new Date().toISOString().slice(0, 10);
  if (!data[entry.url]) data[entry.url] = [];
  const dayData = data[entry.url].find(d => d.date === today);
  const isUp = entry.status === "online" || entry.status === "slow";
  if (dayData) {
    dayData.checks++;
    if (isUp) dayData.up++;
    dayData.lastResponse = entry.responseTime ?? dayData.lastResponse;
  } else {
    data[entry.url].push({
      date: today,
      checks: 1,
      up: isUp ? 1 : 0,
      lastResponse: entry.responseTime ?? null,
    });
  }
  /* Trim à MAX_DAYS */
  if (data[entry.url].length > MAX_DAYS) {
    data[entry.url] = data[entry.url].slice(-MAX_DAYS);
  }
  saveSlaHistory(data);
}

/* Calcule le SLA pour une URL sur une période donnée */
export function computeSla(url, days = 30) {
  const data = loadSlaHistory();
  const history = data[url] || [];
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days);
  const cutoffStr = cutoff.toISOString().slice(0, 10);
  const relevant = history.filter(d => d.date >= cutoffStr);
  if (relevant.length === 0) return { sla: null, daysTracked: 0, totalChecks: 0, upChecks: 0 };
  const totalChecks = relevant.reduce((s, d) => s + d.checks, 0);
  const upChecks = relevant.reduce((s, d) => s + d.up, 0);
  const sla = totalChecks > 0 ? Math.round((upChecks / totalChecks) * 1000) / 10 : null;
  return { sla, daysTracked: relevant.length, totalChecks, upChecks };
}

/* Retourne l'historique quotidien pour une URL */
export function getSlaHistory(url, days = 30) {
  const data = loadSlaHistory();
  const history = data[url] || [];
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days);
  const cutoffStr = cutoff.toISOString().slice(0, 10);
  return history.filter(d => d.date >= cutoffStr).sort((a, b) => a.date.localeCompare(b.date));
}

/* Calcule le SLA agrégé pour un groupe d'URLs */
export function computeGroupSla(urls, days = 30) {
  if (urls.length === 0) return { sla: null, daysTracked: 0 };
  let totalChecks = 0;
  let upChecks = 0;
  let daysTracked = 0;
  for (const u of urls) {
    const { totalChecks: tc, upChecks: uc, daysTracked: dt } = computeSla(u.url, days);
    totalChecks += tc;
    upChecks += uc;
    daysTracked = Math.max(daysTracked, dt);
  }
  const sla = totalChecks > 0 ? Math.round((upChecks / totalChecks) * 1000) / 10 : null;
  return { sla, daysTracked, totalChecks, upChecks };
}

/* Retourne toutes les URLs suivies avec leur SLA */
export function getAllSla(days = 30) {
  const data = loadSlaHistory();
  return Object.entries(data).map(([url, history]) => {
    const { sla, daysTracked, totalChecks, upChecks } = computeSla(url, days);
    return { url, sla, daysTracked, totalChecks, upChecks, history: getSlaHistory(url, days) };
  }).filter(u => u.daysTracked > 0);
}
