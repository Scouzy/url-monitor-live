/* ── Historique des ressources absolues par serveur ──────────────────────────
 *  Reconstruit l'évolution des ressources (cores, RAM Go, Disque Go) à partir
 *  des snapshots quotidiens. Détecte les ajouts/retraits et génère des courbes
 *  mois par mois sur 1 an et +.
 * ─────────────────────────────────────────────────────────────────────────── */

import { loadSnapshots } from "./snapshots";

const MONTH_NAMES = ["Jan", "Fév", "Mar", "Avr", "Mai", "Juin", "Juil", "Août", "Sep", "Oct", "Nov", "Déc"];

/* ── Grouper les snapshots par mois ──
 *  Retourne un tableau trié : [{ key: "2025-01", label: "Jan 25", ts, servers: { name: {cores, ramGb, diskGb} } }]
 *  Pour chaque mois, on prend la dernière valeur connue de chaque serveur.
 */
export function monthlyResourceHistory(snapshots) {
  const snaps = (snapshots || loadSnapshots()).slice().sort((a, b) => a.ts - b.ts);
  if (snaps.length === 0) return [];

  /* Accumuler les dernières valeurs connues par serveur mois par mois */
  const byMonth = new Map();
  const lastKnown = {};

  for (const snap of snaps) {
    const d = new Date(snap.ts);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    const label = `${MONTH_NAMES[d.getMonth()]} ${String(d.getFullYear()).slice(2)}`;

    /* Mettre à jour les dernières valeurs connues */
    for (const [name, vals] of Object.entries(snap.servers || {})) {
      if (!lastKnown[name]) lastKnown[name] = {};
      if (vals.cores  != null) lastKnown[name].cores  = vals.cores;
      if (vals.ramGb  != null) lastKnown[name].ramGb  = vals.ramGb;
      if (vals.diskGb != null) lastKnown[name].diskGb = vals.diskGb;
      if (vals.cpu    != null) lastKnown[name].cpu    = vals.cpu;
      if (vals.ram    != null) lastKnown[name].ram    = vals.ram;
      if (vals.disk   != null) lastKnown[name].disk   = vals.disk;
    }

    /* Snapshot du mois : copie profonde des dernières valeurs connues */
    const monthServers = {};
    for (const [name, vals] of Object.entries(lastKnown)) {
      monthServers[name] = { ...vals };
    }

    byMonth.set(key, { key, label, ts: snap.ts, servers: monthServers });
  }

  return [...byMonth.values()];
}

/* ── Détecter les events d'ajout/retrait de ressources ──
 *  Compare chaque mois avec le précédent et détecte les changements.
 *  Retourne : [{ month, label, server, field, oldValue, newValue, delta, type: "add"|"remove" }]
 */
export function resourceEvents(snapshots) {
  const monthly = monthlyResourceHistory(snapshots);
  if (monthly.length < 2) return [];

  const events = [];
  const fields = [
    { key: "cores",  label: "CPU (cœurs)", unit: "" },
    { key: "ramGb",  label: "RAM",          unit: " Go" },
    { key: "diskGb", label: "Disque",       unit: " Go" },
  ];

  for (let i = 1; i < monthly.length; i++) {
    const prev = monthly[i - 1].servers;
    const curr = monthly[i].servers;
    const { label } = monthly[i];

    for (const [name, currVals] of Object.entries(curr)) {
      const prevVals = prev[name] || {};
      for (const { key, label: fieldLabel, unit } of fields) {
        const oldV = prevVals[key];
        const newV = currVals[key];
        if (oldV == null || newV == null || oldV === newV) continue;
        const delta = +(newV - oldV).toFixed(1);
        if (delta === 0) continue;
        events.push({
          month: monthly[i].key,
          label,
          server: name,
          field: key,
          fieldLabel,
          oldValue: oldV,
          newValue: newV,
          delta,
          unit,
          type: delta > 0 ? "add" : "remove",
        });
      }
    }
  }

  return events.sort((a, b) => a.month.localeCompare(b.month));
}

/* ── Évolution d'un serveur spécifique sur 1 an ──
 *  Retourne : [{ label, cores, ramGb, diskGb, cpu, ram, disk }]
 *  Complète avec des mois vides si pas de snapshot ce mois-là (forward fill).
 */
export function serverResourceTimeline(serverName, snapshots) {
  const monthly = monthlyResourceHistory(snapshots);
  if (monthly.length === 0) return [];

  /* Trouver le premier et dernier mois avec données pour ce serveur */
  let firstIdx = -1, lastIdx = -1;
  for (let i = 0; i < monthly.length; i++) {
    if (monthly[i].servers[serverName]) {
      if (firstIdx === -1) firstIdx = i;
      lastIdx = i;
    }
  }
  if (firstIdx === -1) return [];

  /* Forward-fill : propager la dernière valeur connue sur les mois manquants */
  const result = [];
  let lastVals = null;
  for (let i = firstIdx; i <= lastIdx; i++) {
    const m = monthly[i];
    const vals = m.servers[serverName];
    if (vals) lastVals = { ...vals };
    if (lastVals) {
      result.push({
        label: m.label,
        cores: lastVals.cores ?? null,
        ramGb: lastVals.ramGb ?? null,
        diskGb: lastVals.diskGb ?? null,
        cpu: lastVals.cpu ?? null,
        ram: lastVals.ram ?? null,
        disk: lastVals.disk ?? null,
      });
    }
  }
  return result;
}

/* ── Agrégats flotte : totaux et headroom ──
 *  Retourne : { totalCores, totalRamGb, totalDiskGb, usedRamGb, usedDiskGb,
 *               headroomRamGb, headroomDiskGb, efficiencyRam, efficiencyDisk,
 *               perServer: [{ name, cores, ramGb, diskGb, usedRamGb, usedDiskGb, headroomRamGb, headroomDiskGb }] }
 */
export function fleetResourceSummary(servers) {
  let totalCores = 0, totalRamGb = 0, totalDiskGb = 0;
  let usedRamGb = 0, usedDiskGb = 0;
  const perServer = [];

  for (const s of servers) {
    const cores = s.cores ?? null;
    const ramGb = s.ramGb ?? null;
    const diskGb = s.diskGb ?? null;
    const usedRam = ramGb != null && s.ram != null ? Math.round(ramGb * s.ram / 100 * 10) / 10 : null;
    const usedDisk = diskGb != null && s.disk != null ? Math.round(diskGb * s.disk / 100 * 10) / 10 : null;
    const headroomRam = ramGb != null && usedRam != null ? Math.round((ramGb - usedRam) * 10) / 10 : null;
    const headroomDisk = diskGb != null && usedDisk != null ? Math.round((diskGb - usedDisk) * 10) / 10 : null;

    if (cores) totalCores += cores;
    if (ramGb) totalRamGb += ramGb;
    if (diskGb) totalDiskGb += diskGb;
    if (usedRam != null) usedRamGb += usedRam;
    if (usedDisk != null) usedDiskGb += usedDisk;

    perServer.push({ name: s.name, cores, ramGb, diskGb, usedRamGb: usedRam, usedDiskGb: usedDisk, headroomRamGb: headroomRam, headroomDiskGb: headroomDisk, cpu: s.cpu, ram: s.ram, disk: s.disk });
  }

  return {
    totalCores,
    totalRamGb: Math.round(totalRamGb * 10) / 10,
    totalDiskGb: Math.round(totalDiskGb * 10) / 10,
    usedRamGb: Math.round(usedRamGb * 10) / 10,
    usedDiskGb: Math.round(usedDiskGb * 10) / 10,
    headroomRamGb: Math.round((totalRamGb - usedRamGb) * 10) / 10,
    headroomDiskGb: Math.round((totalDiskGb - usedDiskGb) * 10) / 10,
    efficiencyRam: totalRamGb > 0 ? Math.round(usedRamGb / totalRamGb * 100) : null,
    efficiencyDisk: totalDiskGb > 0 ? Math.round(usedDiskGb / totalDiskGb * 100) : null,
    perServer,
  };
}

/* ── Évolution des totaux flotte mois par mois ──
 *  Retourne : [{ label, totalCores, totalRamGb, totalDiskGb, serverCount }]
 */
export function fleetResourceEvolution(snapshots) {
  const monthly = monthlyResourceHistory(snapshots);
  return monthly.map(m => {
    let totalCores = 0, totalRamGb = 0, totalDiskGb = 0;
    let count = 0;
    for (const vals of Object.values(m.servers)) {
      if (vals.cores  != null) totalCores  += vals.cores;
      if (vals.ramGb  != null) totalRamGb  += vals.ramGb;
      if (vals.diskGb != null) totalDiskGb += vals.diskGb;
      count++;
    }
    return {
      label: m.label,
      totalCores,
      totalRamGb: Math.round(totalRamGb * 10) / 10,
      totalDiskGb: Math.round(totalDiskGb * 10) / 10,
      serverCount: count,
    };
  });
}

/* ── Taux de croissance par serveur (basé sur snapshots réels) ──
 *  Retourne : [{ name, cpuGrowth, ramGrowth, diskGrowth, ramGbGrowth, diskGbGrowth, monthsTracked }]
 */
export function serverGrowthRates(snapshots) {
  const monthly = monthlyResourceHistory(snapshots);
  if (monthly.length < 2) return [];

  const result = [];
  const names = new Set();
  for (const m of monthly) {
    for (const name of Object.keys(m.servers)) names.add(name);
  }

  for (const name of names) {
    const pts = monthly
      .filter(m => m.servers[name])
      .map(m => m.servers[name]);
    if (pts.length < 2) continue;

    const first = pts[0];
    const last = pts[pts.length - 1];
    const months = pts.length - 1;
    if (months < 1) continue;

    const rate = (curr, prev) => {
      if (prev == null || curr == null || prev === 0) return null;
      return +((curr - prev) / prev / months * 100).toFixed(1);
    };

    result.push({
      name,
      cpuGrowth: rate(last.cpu, first.cpu),
      ramGrowth: rate(last.ram, first.ram),
      diskGrowth: rate(last.disk, first.disk),
      ramGbGrowth: rate(last.ramGb, first.ramGb),
      diskGbGrowth: rate(last.diskGb, first.diskGb),
      monthsTracked: months,
    });
  }

  return result;
}
