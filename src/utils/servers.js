import { saveSnapshot, loadSnapshots, clearSnapshots } from "./snapshots";

/* ── Générateur de données serveurs (simulation déterministe, seedée) ── */

/* PRNG mulberry32 : déterministe pour des données stables entre rechargements */
function mulberry32(seed) {
  return function () {
    seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const ROLES = {
  web:        { label: "Web",        color: "#6366F1", icon: "globe" },
  bdd:        { label: "BDD",        color: "#F59E0B", icon: "database" },
  applicatif: { label: "Applicatif", color: "#34D399", icon: "boxes" },
  cache:      { label: "Cache",      color: "#F472B6", icon: "zap" },
};

const SERVER_DEFS = [
  { name: "WEB-PROD-01",   role: "web",        env: "Production",     os: "Ubuntu 22.04 LTS",        cores: 8,  ramGb: 16,  diskGb: 256  },
  { name: "WEB-PROD-02",   role: "web",        env: "Production",     os: "Ubuntu 22.04 LTS",        cores: 8,  ramGb: 16,  diskGb: 256  },
  { name: "WEB-FRONT-03",  role: "web",        env: "Pré-production", os: "Debian 12",               cores: 4,  ramGb: 8,   diskGb: 128  },
  { name: "SQL-PROD-01",   role: "bdd",        env: "Production",     os: "Windows Server 2022",     cores: 16, ramGb: 64,  diskGb: 2048 },
  { name: "SQL-PROD-02",   role: "bdd",        env: "Production",     os: "Windows Server 2022",     cores: 16, ramGb: 64,  diskGb: 2048 },
  { name: "PG-ANALYTICS",  role: "bdd",        env: "Recette",        os: "Rocky Linux 9",           cores: 12, ramGb: 48,  diskGb: 1024 },
  { name: "APP-METIER-01", role: "applicatif", env: "Production",     os: "Windows Server 2019",     cores: 8,  ramGb: 32,  diskGb: 512  },
  { name: "APP-METIER-02", role: "applicatif", env: "Pré-production", os: "Windows Server 2019",     cores: 8,  ramGb: 32,  diskGb: 512  },
  { name: "APP-BATCH-01",  role: "applicatif", env: "Test",           os: "Ubuntu 20.04 LTS",        cores: 6,  ramGb: 24,  diskGb: 512  },
  { name: "REDIS-CACHE-01",role: "cache",      env: "Production",     os: "Debian 12",               cores: 4,  ramGb: 32,  diskGb: 64   },
  { name: "REDIS-CACHE-02",role: "cache",      env: "Production",     os: "Debian 12",               cores: 4,  ramGb: 32,  diskGb: 64   },
  { name: "MEMCACHE-01",   role: "cache",      env: "Développement",  os: "Alpine Linux 3.19",       cores: 2,  ramGb: 16,  diskGb: 32   },
];

const clamp = (v, min = 2, max = 99) => Math.min(max, Math.max(min, Math.round(v)));

/* Hash déterministe d'une chaîne → seed */
function strSeed(str) {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = (Math.imul(31, h) + str.charCodeAt(i)) | 0;
  return Math.abs(h);
}

const MONTH_NAMES = ["Jan", "Fév", "Mar", "Avr", "Mai", "Juin", "Juil", "Août", "Sep", "Oct", "Nov", "Déc"];

/* Libellés des 12 mois : 6 passés (incluant le courant) + 6 futurs */
export function monthLabels() {
  const now = new Date();
  const labels = [];
  for (let i = -5; i <= 6; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() + i, 1);
    labels.push({ label: MONTH_NAMES[d.getMonth()], projected: i > 0 });
  }
  return labels;
}

function genServer(def, idx) {
  const rnd = mulberry32(idx * 7919 + 42);

  /* Profil de charge selon le rôle */
  const profile = {
    web:        { cpu: 35, ram: 45, disk: 40, growth: 1.2 },
    bdd:        { cpu: 50, ram: 70, disk: 65, growth: 2.0 },
    applicatif: { cpu: 40, ram: 55, disk: 50, growth: 1.5 },
    cache:      { cpu: 25, ram: 65, disk: 20, growth: 0.8 },
  }[def.role];

  /* Variation par serveur : certains sous-utilisés, certains proches de la saturation */
  const bias = (rnd() - 0.35) * 50; // -17 à +32
  const base = {
    cpu:  clamp(profile.cpu + bias + (rnd() - 0.5) * 18),
    ram:  clamp(profile.ram + bias * 0.8 + (rnd() - 0.5) * 14),
    disk: clamp(profile.disk + bias * 0.9 + (rnd() - 0.5) * 20),
  };

  /* Historique 24h : variation horaire avec pic en journée */
  const history24h = Array.from({ length: 24 }, (_, h) => {
    const dayFactor = h >= 8 && h <= 18 ? 1 + 0.25 * Math.sin(((h - 8) / 10) * Math.PI) : 0.75;
    return {
      h: `${String(h).padStart(2, "0")}h`,
      cpu:  clamp(base.cpu * dayFactor + (rnd() - 0.5) * 12),
      ram:  clamp(base.ram * (0.92 + dayFactor * 0.1) + (rnd() - 0.5) * 6),
      disk: clamp(base.disk + h * 0.05 + (rnd() - 0.5) * 2),
    };
  });

  /* Tendance 12 mois : 6 passés réels + 6 projetés (régression linéaire + croissance) */
  const labels = monthLabels();
  const growth = profile.growth * (0.6 + rnd() * 0.9); // %/mois propre au serveur
  const monthly = labels.map(({ label, projected }, i) => {
    const offset = i - 5; // 0 = mois courant
    const noise = projected ? 0 : (rnd() - 0.5) * 6;
    return {
      month: label,
      projected,
      cpu:  clamp(base.cpu  + offset * growth        + noise),
      ram:  clamp(base.ram  + offset * growth * 0.85 + noise),
      disk: clamp(base.disk + offset * growth * 1.15 + noise),
    };
  });

  return {
    id: `srv-${idx}`,
    ...def,
    ip: `10.${10 + Math.floor(idx / 4)}.${(idx % 4) * 16 + 1}.${10 + idx}`,
    uptimeDays: Math.floor(30 + rnd() * 400),
    cpu: base.cpu, ram: base.ram, disk: base.disk,
    growthRate: Math.round(growth * 10) / 10,
    history24h,
    monthly,
  };
}

/* ── Génération historique + projection à partir de valeurs réelles (import Excel/API) ── */
function buildSeries(base, growth, seed) {
  const rnd = mulberry32(seed);
  const history24h = Array.from({ length: 24 }, (_, h) => {
    const dayFactor = h >= 8 && h <= 18 ? 1 + 0.25 * Math.sin(((h - 8) / 10) * Math.PI) : 0.75;
    return {
      h: `${String(h).padStart(2, "0")}h`,
      cpu:  clamp(base.cpu * dayFactor + (rnd() - 0.5) * 12),
      ram:  clamp(base.ram * (0.92 + dayFactor * 0.1) + (rnd() - 0.5) * 6),
      disk: clamp(base.disk + h * 0.05 + (rnd() - 0.5) * 2),
    };
  });
  const labels = monthLabels();
  const monthly = labels.map(({ label, projected }, i) => {
    const offset = i - 5;
    const noise = projected ? 0 : (rnd() - 0.5) * 6;
    return {
      month: label, projected,
      cpu:  clamp(base.cpu  + offset * growth        + noise),
      ram:  clamp(base.ram  + offset * growth * 0.85 + noise),
      disk: clamp(base.disk + offset * growth * 1.15 + noise),
    };
  });
  return { history24h, monthly };
}

const ROLE_ALIASES = {
  web: "web", frontend: "web", front: "web", http: "web",
  bdd: "bdd", db: "bdd", database: "bdd", sql: "bdd", basededonnees: "bdd",
  applicatif: "applicatif", app: "applicatif", application: "applicatif", batch: "applicatif", metier: "applicatif",
  cache: "cache", redis: "cache", memcache: "cache",
};

function normalizeRole(raw) {
  const key = String(raw || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z]/g, "");
  return ROLE_ALIASES[key] || "applicatif";
}

const num = (v, fallback = 0) => {
  const n = parseFloat(String(v ?? "").replace(",", "."));
  return Number.isFinite(n) ? n : fallback;
};

/* Convertit une date Excel (nombre série) ou une chaîne ISO en date lisible FR */
function formatDate(raw) {
  if (raw == null || raw === "") return null;
  const s = String(raw).trim();
  const n = parseFloat(s);
  if (Number.isFinite(n) && n > 1000) {
    /* Nombre série Excel : jours depuis 1900-01-01 (ajustement 25569 jours vers epoch Unix) */
    const d = new Date((n - 25569) * 86400 * 1000);
    if (!isNaN(d.getTime())) return d.toLocaleDateString("fr-FR");
  }
  const d = new Date(s);
  if (!isNaN(d.getTime())) return d.toLocaleDateString("fr-FR");
  return s;
}

/* Normalise un objet brut (ligne Excel ou item JSON d'API) en serveur complet.
   Champs reconnus (insensible à la casse, FR/EN) :
   name/nom, role, os, ip, cores/vcpu, ram_gb/ramGb, disk_gb/diskGb,
   cpu (%), ram (%), disk/disque (%), uptime_days/uptime, growth/croissance (%/mois) */
export function normalizeServer(raw, idx) {
  /* Accès insensible à la casse et aux séparateurs */
  const flat = {};
  const original = {};
  Object.entries(raw).forEach(([k, v]) => {
    const fk = String(k).toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]/g, "");
    flat[fk] = v;
    original[fk] = String(k).trim();
  });
  /* pick mémorise toutes les clés candidates pour identifier les colonnes restantes */
  const consumed = new Set(["id", "extra", "growthrate"]);
  const pick = (...keys) => {
    let found;
    for (const k of keys) {
      consumed.add(k);
      if (found === undefined && flat[k] !== undefined && flat[k] !== "") found = flat[k];
    }
    return found;
  };

  let name = pick("name", "nom", "serveur", "server", "hostname", "servername", "serveurname", "nomserveur", "nomduserveur", "nomdeserveur", "machine", "host", "libelle", "label");
  const role = normalizeRole(pick("role", "roleserveur", "typeserveur", "typedeserveur", "categorie"));
  const env = pick("env", "environnement", "environment", "envt", "environnements");
  let app = pick("app", "application", "appli", "applications", "applicationname", "nomapplication", "nomdelapplication", "service", "servicename", "nomservice", "nomduservice");
  /* Heuristique : toute colonne dont le nom contient "appli" */
  if (app === undefined) {
    for (const k of Object.keys(flat)) {
      if (consumed.has(k)) continue;
      if (/appli/.test(k) && flat[k] !== "" && flat[k] != null) {
        app = flat[k];
        consumed.add(k);
        break;
      }
    }
  }
  const statut  = pick("statut", "status", "etat", "etatserveur", "statusserveur", "statusserver");
  const createdAt = pick("creationtime", "createdat", "creationdate", "datecreation", "created", "dateajout", "dateCreation");

  const base = {
    /* cpu%  : colonne CPU ou alias explicitement liés à un pourcentage                */
    cpu:  clamp(num(pick("cpu", "cpupct", "cpupercent", "utilisationcpu", "cpuutilisation", "cpuusage"), 30)),
    /* ram%  : alias % uniquement — la colonne générique "ram" est réservée au Go      */
    ram:  clamp(num(pick("rampct", "rampercent", "utilisationram", "ramusage", "ramutilisation"), 40)),
    /* disk% : alias % uniquement — "stockage" et "disque" sont réservés au Go        */
    disk: clamp(num(pick("diskpct", "stockagepct", "utilisationdisque", "diskusage", "diskutilisation"), 35)),
  };
  const growth = num(pick("growth", "croissance", "croissancemois", "tauxcroissance"), { web: 1.2, bdd: 2.0, applicatif: 1.5, cache: 0.8 }[role]);
  const _osRaw = pick("os", "type", "type1", "osname", "ostype", "operatingsystem", "family", "systeme", "system", "systemedexploitation", "so");
  const ipVal  = pick("ip", "adresseip", "ipaddress", "adresse");

  /* Heuristique OS : si colonne non reconnue, chercher une valeur qui ressemble à un OS */
  let osVal = _osRaw;
  if (osVal == null) {
    const osRx = /windows|linux|ubuntu|debian|centos|rocky|alpine|redhat|rhel|suse/i;
    for (const k of Object.keys(flat)) {
      if (consumed.has(k)) continue;
      if (osRx.test(String(flat[k] || ""))) { osVal = flat[k]; consumed.add(k); break; }
    }
  }

  /* Specs capacité : null si colonne absente (pas de valeur par défaut trompeuse)
     RAM  → colonne "ram" ou alias Go explicites
     Disk → colonne "stockage" / "disque" ou alias Go explicites                      */
  const _rawCores  = pick("cores", "vcpu", "cpucores", "coeurs", "nbcores", "nbcpu");
  const coresVal   = _rawCores  != null ? Math.round(num(_rawCores,  4))   : null;
  const _rawRamGb  = pick("ram", "ramgb", "ramgo", "memorygb", "memoirego", "memoiregb");
  const ramGbVal   = _rawRamGb  != null ? Math.round(num(_rawRamGb, 16))   : null;
  const _rawDiskGb = pick("stockage", "disque", "diskgb", "diskgo", "storagegb", "stockagego", "disquego", "disquegb");
  const diskGbVal  = _rawDiskGb != null ? Math.round(num(_rawDiskGb, 256)) : null;
  const _rawUptime = pick("uptimedays", "uptime", "uptimejours");
  const uptimeVal  = _rawUptime != null ? Math.round(num(_rawUptime, 0))   : null;

  /* Heuristique : si aucune colonne nom reconnue, prendre la 1ère colonne texte non numérique */
  if (name === undefined) {
    for (const k of Object.keys(flat)) {
      if (consumed.has(k)) continue;
      const v = flat[k];
      if (typeof v === "string" && v.trim() && !/^[\d.,%\s]+$/.test(v.trim())) {
        name = v;
        consumed.add(k);
        break;
      }
    }
  }
  name = String(name || `SRV-${idx + 1}`).trim();

  /* Colonnes supplémentaires non reconnues → conservées et affichées dans le détail */
  const extra = Array.isArray(raw.extra) ? raw.extra :
    Object.keys(flat)
      .filter(k => !consumed.has(k) && flat[k] !== "" && flat[k] != null)
      .map(k => ({ label: original[k], value: String(flat[k]) }));

  return {
    id: `srv-ext-${idx}`,
    name, role,
    env:       env       != null ? String(env).trim()       : null,
    app:       app       != null ? String(app).trim()       : null,
    statut:    statut    != null ? String(statut).trim()    : null,
    createdAt: formatDate(createdAt),
    os: String(osVal || "—"),
    ip: String(ipVal || "—"),
    cores: coresVal,
    ramGb: ramGbVal,
    diskGb: diskGbVal,
    uptimeDays: uptimeVal,
    ...base,
    growthRate: Math.round((num(flat.growthrate, growth)) * 10) / 10,
    extra,
    ...buildSeries(base, growth, strSeed(name)),
  };
}

/* ── Store réactif avec persistance ── */
const LS_KEY = "capacity-servers";
let _cache = null;
let _meta = { source: "demo", loadedAt: null, label: null };
const _listeners = new Set();

function loadPersisted() {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    /* Nouveau format : lignes brutes ; ancien format : serveurs normalisés (compatible) */
    const rows = parsed.rows || parsed.servers;
    if (!Array.isArray(rows) || rows.length === 0) return null;
    _meta = parsed.meta || { source: "excel", loadedAt: null, label: null };
    /* Re-normalisation complète : séries et colonnes extra regénérées depuis les données d'origine */
    return rows.map((s, i) => normalizeServer(s, i));
  } catch { return null; }
}

export function getServers() {
  if (!_cache) _cache = loadPersisted() || SERVER_DEFS.map(genServer);
  return _cache;
}

export function getServersMeta() { return _meta; }

export function setServers(rawList, source, label) {
  const servers = rawList.map((r, i) => normalizeServer(r, i));
  if (servers.length === 0) throw new Error("Aucun serveur valide");
  _cache = servers;
  _meta = { source, loadedAt: Date.now(), label: label || null };
  try {
    /* Lignes brutes persistées : toutes les colonnes d'origine sont conservées */
    localStorage.setItem(LS_KEY, JSON.stringify({ rows: rawList, meta: _meta }));
  } catch { /* quota */ }
  /* Snapshot horodaté pour le suivi de tendance (hors mode démo) */
  saveSnapshot(servers, source, label);
  _listeners.forEach(fn => fn());
  return servers.length;
}

/* ── Sauvegarde/restauration complète (export/import JSON) ── */
export function getServersBackup() {
  try {
    const raw = localStorage.getItem(LS_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

export function restoreServersBackup(backup) {
  if (!backup || !Array.isArray(backup.rows) || backup.rows.length === 0) return false;
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(backup));
    _meta  = backup.meta || { source: "excel", loadedAt: null, label: null };
    _cache = backup.rows.map((r, i) => normalizeServer(r, i));
    _listeners.forEach(fn => fn());
    return true;
  } catch { return false; }
}

export function resetServers() {
  localStorage.removeItem(LS_KEY);
  clearSnapshots();
  _cache = SERVER_DEFS.map(genServer);
  _meta = { source: "demo", loadedAt: null, label: null };
  _listeners.forEach(fn => fn());
}

export function removeServer(id) {
  if (!_cache) _cache = loadPersisted() || SERVER_DEFS.map(genServer);
  _cache = _cache.filter(s => s.id !== id);
  try { localStorage.setItem(LS_KEY, JSON.stringify({ meta: _meta, rows: _cache })); } catch {}
  _listeners.forEach(fn => fn());
}

export function subscribeServers(fn) {
  _listeners.add(fn);
  return () => _listeners.delete(fn);
}

/* ── Mise à jour depuis un agent VPS ── */
export function patchServerMetrics(name, metrics) {
  if (!_cache) _cache = loadPersisted() || SERVER_DEFS.map(genServer);

  const role    = metrics.role || "web";
  const defGrow = { web: 1.2, bdd: 2.0, applicatif: 1.5, cache: 0.8 }[role] ?? 1.2;
  const osName  = typeof metrics.os === "object"
    ? (metrics.os?.name || (metrics.os?.agentType === "windows" ? "Windows" : "Linux"))
    : (metrics.os || "Linux");

  const base = {
    cpu:  clamp(Math.round(metrics.cpu  ?? 0)),
    ram:  clamp(Math.round(metrics.ram  ?? 0)),
    disk: clamp(Math.round(metrics.disk ?? 0)),
  };
  const agentIp = (() => { try { return new URL(metrics.agentUrl || "").hostname; } catch { return metrics.hostname || ""; } })();
  const patch = {
    ...base,
    uptimeDays:   Math.round(metrics.uptimeDays ?? 0),
    lastVpsCheck: Date.now(),
    os:  osName,
    ip:  agentIp,
    ...(metrics.ramGb  != null ? { ramGb:  Math.round(metrics.ramGb  * 10) / 10 } : {}),
    ...(metrics.diskGb != null ? { diskGb: Math.round(metrics.diskGb * 10) / 10 } : {}),
  };

  const idx = _cache.findIndex(s => s.name.toLowerCase() === name.toLowerCase());
  if (idx >= 0) {
    const growthRate = _cache[idx].growthRate || defGrow;
    const { history24h, monthly } = buildSeries(base, growthRate, strSeed(name));
    _cache = _cache.map((s, i) => i !== idx ? s : { ...s, ...patch, history24h, monthly });
  } else {
    const { history24h, monthly } = buildSeries(base, defGrow, strSeed(name));
    _cache = [..._cache, {
      id:         `vps-${metrics.hostname || name}`,
      name,
      role,
      env:        metrics.env  || "Production",
      app:        metrics.app  || "",
      ip:         (() => { try { return new URL(metrics.agentUrl || "").hostname; } catch { return metrics.hostname || ""; } })(),
      source:     "vps-agent",
      growthRate: defGrow,
      history24h,
      monthly,
      ...patch,
    }];
  }

  /* Snapshot throttlé — max 1 par 6 h par serveur (pour buildTrendChartData) */
  const SIX_H = 6 * 3_600_000;
  const snaps = loadSnapshots();
  const last  = [...snaps].reverse().find(s => s.servers?.[name] != null);
  if (!last || Date.now() - last.ts > SIX_H) {
    saveSnapshot(_cache.filter(s => s.source === "vps-agent"), "vps-agent", `Agents VPS`);
  }

  /* Persistance : préserver les lignes brutes originales, mettre à jour uniquement les métriques */
  try {
    const existing = JSON.parse(localStorage.getItem(LS_KEY) || "{}");
    const rawRows  = Array.isArray(existing.rows) ? existing.rows : _cache;
    const updated  = _cache.map(s => {
      const orig = rawRows.find(r => (r.name || r.nom || r.serveur || "").toLowerCase() === s.name.toLowerCase());
      return orig ? { ...orig, cpu: s.cpu, ram: s.ram, disk: s.disk, os: s.os, ip: s.ip, uptimeDays: s.uptimeDays, lastVpsCheck: s.lastVpsCheck, ramGb: s.ramGb, diskGb: s.diskGb, source: s.source } : s;
    });
    localStorage.setItem(LS_KEY, JSON.stringify({ meta: _meta, rows: updated }));
  } catch {}
  _listeners.forEach(fn => fn());
}

/* ── Agrégats Capacity Planning ── */

/* Moyenne flotte par mois pour une métrique */
export function fleetTrend(servers, metric) {
  const labels = monthLabels();
  return labels.map(({ label, projected }, i) => {
    const avg = servers.reduce((s, srv) => s + srv.monthly[i][metric], 0) / servers.length;
    const v = Math.round(avg * 10) / 10;
    return {
      month: label,
      réel: projected ? null : v,
      projection: projected || i === 5 ? v : null, // i===5 : relier les courbes
    };
  });
}

/* Distribution par tranche d'utilisation */
export function distribution(servers, metric) {
  const brackets = [
    { label: "0–25%",   min: 0,  max: 25,  color: "#34D399" },
    { label: "25–50%",  min: 25, max: 50,  color: "#818CF8" },
    { label: "50–75%",  min: 50, max: 75,  color: "#FBBF24" },
    { label: "75–90%",  min: 75, max: 90,  color: "#FB923C" },
    { label: "90–100%", min: 90, max: 101, color: "#F87171" },
  ];
  return brackets.map(b => ({
    ...b,
    count: servers.filter(s => s[metric] >= b.min && s[metric] < b.max).length,
  }));
}

/* Top N consommateurs */
export function topConsumers(servers, metric, n = 5) {
  return [...servers].sort((a, b) => b[metric] - a[metric]).slice(0, n);
}

/* Mois (label) où un serveur franchit le seuil, selon sa projection. null si jamais */
function saturationMonth(server, metric, threshold = 90) {
  const hit = server.monthly.find((m, i) => i >= 5 && m[metric] >= threshold);
  return hit ? hit.month : null;
}

/* Recommandations automatiques */
export function recommendations(servers) {
  const recos = [];

  /* 1. Saturations à venir (sur les 6 mois projetés) */
  for (const metric of ["cpu", "ram", "disk"]) {
    const metricLabel = { cpu: "CPU", ram: "RAM", disk: "disque" }[metric];
    servers.forEach(s => {
      const m = saturationMonth(s, metric);
      if (m && s[metric] < 90) {
        recos.push({
          type: "saturation",
          severity: "high",
          server: s.name,
          text: `${s.name} : ${metricLabel} projeté ≥ 90% en ${m} (actuellement ${s[metric]}%, +${s.growthRate}%/mois)`,
        });
      }
    });
  }

  /* 2. Déjà saturés */
  servers.forEach(s => {
    ["cpu", "ram", "disk"].forEach(metric => {
      if (s[metric] >= 90) {
        recos.push({
          type: "critical",
          severity: "critical",
          server: s.name,
          text: `${s.name} : ${{ cpu: "CPU", ram: "RAM", disk: "disque" }[metric]} à ${s[metric]}% — action immédiate requise`,
        });
      }
    });
  });

  /* 3. Consolidation : serveurs sous-utilisés */
  const underused = servers.filter(s => s.cpu < 20 && s.ram < 35 && s.disk < 40);
  if (underused.length >= 2) {
    recos.push({
      type: "consolidation",
      severity: "info",
      server: null,
      text: `${underused.length} serveurs sous-utilisés (${underused.map(s => s.name).join(", ")}) — opportunité de consolidation / virtualisation`,
    });
  } else if (underused.length === 1) {
    recos.push({
      type: "consolidation",
      severity: "info",
      server: underused[0].name,
      text: `${underused[0].name} est sous-utilisé (CPU ${underused[0].cpu}%, RAM ${underused[0].ram}%) — candidat à la consolidation`,
    });
  }

  /* 4. Monitoring renforcé : zone 75–90% */
  const watchList = servers.filter(s =>
    !recos.some(r => r.server === s.name && (r.type === "critical" || r.type === "saturation")) &&
    (s.cpu >= 75 || s.ram >= 75 || s.disk >= 75)
  );
  watchList.forEach(s => {
    const hot = ["cpu", "ram", "disk"].filter(m => s[m] >= 75)
      .map(m => `${{ cpu: "CPU", ram: "RAM", disk: "disque" }[m]} ${s[m]}%`).join(", ");
    recos.push({
      type: "watch",
      severity: "medium",
      server: s.name,
      text: `${s.name} : ${hot} — monitoring renforcé recommandé`,
    });
  });

  const order = { critical: 0, high: 1, medium: 2, info: 3 };
  return recos.sort((a, b) => order[a.severity] - order[b.severity]);
}

export function gaugeColor(v) {
  if (v >= 90) return "#F87171";
  if (v >= 75) return "#FB923C";
  if (v >= 50) return "#FBBF24";
  return "#34D399";
}
