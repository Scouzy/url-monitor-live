/* ── Snapshots de capacité ──────────────────────────────────────────────────
 *  Chaque chargement (Excel ou ITCare) est sauvegardé comme snapshot horodaté.
 *  Le moteur de tendance applique une régression linéaire sur ces snapshots
 *  et génère une projection à 6 mois.
 * ─────────────────────────────────────────────────────────────────────────── */

const SNAP_KEY  = "capacity-snapshots";
const MAX_SNAPS = 365; /* 365 jours max — 1 snapshot/jour = 1 an de suivi */

/* ── Régression linéaire (moindres carrés) ── */
function linReg(pts) {
  const n = pts.length;
  if (n < 2) return null;
  const mx = pts.reduce((s, p) => s + p.x, 0) / n;
  const my = pts.reduce((s, p) => s + p.y, 0) / n;
  const num = pts.reduce((s, p) => s + (p.x - mx) * (p.y - my), 0);
  const den = pts.reduce((s, p) => s + (p.x - mx) ** 2, 0);
  if (Math.abs(den) < 1e-9) return { slope: 0, intercept: my };
  const slope = num / den;
  return { slope, intercept: my - slope * mx };
}

/* ── Persistence ── */
export function loadSnapshots() {
  try { return JSON.parse(localStorage.getItem(SNAP_KEY)) || []; }
  catch { return []; }
}

export function clearSnapshots() {
  localStorage.removeItem(SNAP_KEY);
}

/**
 * Sauvegarde un snapshot des serveurs normalisés.
 * @param {Array}  servers  - tableau de serveurs normalisés (sortie de normalizeServer)
 * @param {string} source   - "api" | "excel"
 * @param {string} label    - nom affiché (ex: "ITCare")
 */
export function saveSnapshot(servers, source, label) {
  if (source === "demo") return; /* Ne pas tracer les données de démo */
  /* 1 seul snapshot par jour : remplace les snapshot(s) existants du jour courant.
     Cela élimine les mesures aux valeurs par défaut (30/40/35) sauvegardées avant
     que les données réelles arrivent, et assure un suivi cohérent jour après jour. */
  const todayStr = new Date().toDateString();
  const snaps = loadSnapshots().filter(s => new Date(s.ts).toDateString() !== todayStr);
  const entry = {
    ts:     Date.now(),
    source,
    label:  label || source,
    servers: Object.fromEntries(
      servers.map(s => [s.name, {
        cpu:    s.cpu    ?? null,
        ram:    s.ram    ?? null,
        disk:   s.disk   ?? null,
        ramGb:  s.ramGb  ?? null,
        diskGb: s.diskGb ?? null,
        cores:  s.cores  ?? null,
      }])
    ),
  };
  snaps.push(entry);
  if (snaps.length > MAX_SNAPS) snaps.splice(0, snaps.length - MAX_SNAPS);
  try { localStorage.setItem(SNAP_KEY, JSON.stringify(snaps)); } catch { /* quota */ }
}

/* ── Delta entre les deux derniers snapshots pour un serveur ── */
export function lastDelta(serverName, snapshots) {
  const pts = snapshots
    .filter(s => s.servers[serverName] != null)
    .sort((a, b) => a.ts - b.ts);
  if (pts.length < 2) return null;
  const prev = pts[pts.length - 2].servers[serverName];
  const curr = pts[pts.length - 1].servers[serverName];
  const d = (a, b) => (a != null && b != null) ? +(a - b).toFixed(1) : null;
  const r = {
    cpu:  d(curr.cpu,  prev.cpu),
    ram:  d(curr.ram,  prev.ram),
    disk: d(curr.disk, prev.disk),
    days: (pts[pts.length - 1].ts - pts[pts.length - 2].ts) / 86400000,
  };
  /* Retourner null si aucune valeur n'a changé */
  return (r.cpu === 0 && r.ram === 0 && r.disk === 0) ? null : r;
}

/* ── Construction des données de tendance pour le graphique ──
 *
 *  Retourne :
 *    - data      : tableau recharts (points réels + projection 6 mois)
 *    - breach    : premier point projeté franchissant 90%
 *    - proj3m    : valeurs projetées à +3 mois  { cpu, ram, disk, month }
 *    - proj6m    : valeurs projetées à +6 mois  { cpu, ram, disk, month }
 *    - snapCount : nombre de snapshots utilisés
 *    - spanDays  : durée couverte par les snapshots (jours)
 *  Retourne null si < 2 snapshots disponibles pour ce serveur.
 */
export function buildTrendChartData(serverName, snapshots) {
  const pts = snapshots
    .filter(s => s.servers[serverName] != null)
    .map(s => ({ ts: s.ts, ...s.servers[serverName] }))
    .sort((a, b) => a.ts - b.ts);

  if (pts.length < 2) return null;

  const t0       = pts[0].ts;
  const toDays   = ts => (ts - t0) / 86400000;
  const lastDays = toDays(pts[pts.length - 1].ts);

  /* Régression par métrique */
  function reg(metric) {
    const valid = pts.filter(p => p[metric] != null);
    if (valid.length < 2) return null;
    return linReg(valid.map(p => ({ x: toDays(p.ts), y: p[metric] })));
  }
  const regs = { cpu: reg("cpu"), ram: reg("ram"), disk: reg("disk") };

  function project(metric, daysAhead) {
    const r = regs[metric];
    if (!r) return null;
    const v = r.slope * (lastDays + daysAhead) + r.intercept;
    /* Plancher = valeur du dernier snapshot : la projection ne peut pas descendre sous le niveau actuel.
       Ceci évite les projections artificiellement à 0% causées par la transition défauts→vraies valeurs. */
    const current = pts[pts.length - 1][metric] ?? 0;
    return Math.min(100, Math.max(current, Math.round(v * 10) / 10));
  }

  /* Formateur de date court */
  const fmt = new Intl.DateTimeFormat("fr-FR", { day: "2-digit", month: "short" });

  /* Points réels */
  const real = pts.map((p, i) => {
    const isLast = i === pts.length - 1;
    return {
      month:  fmt.format(new Date(p.ts)),
      cpu_r:  p.cpu  ?? null,
      ram_r:  p.ram  ?? null,
      disk_r: p.disk ?? null,
      /* Point de jonction : le dernier réel est aussi le premier projeté */
      cpu_p:  isLast ? (p.cpu  ?? null) : null,
      ram_p:  isLast ? (p.ram  ?? null) : null,
      disk_p: isLast ? (p.disk ?? null) : null,
    };
  });

  /* Points projetés (+1m … +6m) */
  const proj = [30, 60, 90, 120, 150, 180].map((days, i) => {
    const cpuV  = project("cpu",  days);
    const ramV  = project("ram",  days);
    const diskV = project("disk", days);
    return {
      month:  `+${i + 1}m`,
      cpu:    cpuV,  ram:    ramV,  disk:   diskV,   /* pour table résumé */
      cpu_r:  null,  ram_r:  null,  disk_r: null,
      cpu_p:  cpuV,  ram_p:  ramV,  disk_p: diskV,
    };
  });

  const breach = proj.find(p =>
    (p.cpu  != null && p.cpu  >= 90) ||
    (p.ram  != null && p.ram  >= 90) ||
    (p.disk != null && p.disk >= 90)
  );

  return {
    data:      [...real, ...proj],
    breach,
    proj3m:    proj[2],
    proj6m:    proj[5],
    snapCount: pts.length,
    spanDays:  Math.round(lastDays),
  };
}
