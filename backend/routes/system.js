import { Router } from "express";
import db from "../db.js";
import { authMiddleware } from "../auth.js";
import { audit } from "../auditLog.js";
import { copyFileSync, existsSync, mkdirSync, readdirSync, statSync, unlinkSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import multer from "multer";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DB_PATH = join(__dirname, "..", "data", "g1oeil.db");
const BACKUP_DIR = join(__dirname, "..", "data", "backups");
mkdirSync(BACKUP_DIR, { recursive: true });

const router = Router();
router.use(authMiddleware);

/* ── Metrics middleware (timing) ── */
const requestStats = {
  totalRequests: 0,
  routeTimings: {},
  startTime: Date.now(),
};

export function metricsMiddleware(req, res, next) {
  const start = Date.now();
  requestStats.totalRequests++;
  res.on("finish", () => {
    const duration = Date.now() - start;
    const route = `${req.method} ${req.route?.path || req.path}`;
    if (!requestStats.routeTimings[route]) {
      requestStats.routeTimings[route] = { count: 0, totalMs: 0, maxMs: 0 };
    }
    requestStats.routeTimings[route].count++;
    requestStats.routeTimings[route].totalMs += duration;
    requestStats.routeTimings[route].maxMs = Math.max(requestStats.routeTimings[route].maxMs, duration);
  });
  next();
}

/* GET /api/system/metrics — observability metrics */
router.get("/metrics", (req, res) => {
  const mem = process.memoryUsage();
  const cpu = process.cpuUsage();
  const uptime = process.uptime();

  const routeStats = Object.entries(requestStats.routeTimings).map(([route, s]) => ({
    route,
    count: s.count,
    avgMs: Math.round(s.totalMs / s.count),
    maxMs: s.maxMs,
  })).sort((a, b) => b.count - a.count);

  /* Prometheus-compatible format */
  if (req.query.format === "prometheus") {
    const lines = [
      "# HELP g1oeil_uptime_seconds Process uptime",
      "# TYPE g1oeil_uptime_seconds gauge",
      `g1oeil_uptime_seconds ${uptime}`,
      "",
      "# HELP g1oeil_mem_rss_bytes Resident Set Size",
      "# TYPE g1oeil_mem_rss_bytes gauge",
      `g1oeil_mem_rss_bytes ${mem.rss}`,
      `g1oeil_mem_heap_used_bytes ${mem.heapUsed}`,
      `g1oeil_mem_heap_total_bytes ${mem.heapTotal}`,
      `g1oeil_mem_external_bytes ${mem.external}`,
      "",
      "# HELP g1oeil_requests_total Total requests",
      "# TYPE g1oeil_requests_total counter",
      `g1oeil_requests_total ${requestStats.totalRequests}`,
      "",
      "# HELP g1oeil_request_duration_ms Request duration",
      "# TYPE g1oeil_request_duration_ms summary",
    ];
    for (const r of routeStats) {
      lines.push(`g1oeil_request_duration_ms{route="${r.route}",quantile="avg"} ${r.avgMs}`);
      lines.push(`g1oeil_request_duration_ms{route="${r.route}",quantile="max"} ${r.maxMs}`);
      lines.push(`g1oeil_requests_total{route="${r.route}"} ${r.count}`);
    }
    res.set("Content-Type", "text/plain; version=0.0.4");
    res.send(lines.join("\n"));
    return;
  }

  res.json({
    uptime_seconds: uptime,
    memory: {
      rss: mem.rss,
      heapUsed: mem.heapUsed,
      heapTotal: mem.heapTotal,
      external: mem.external,
      arrayBuffers: mem.arrayBuffers,
    },
    cpu: {
      user: cpu.user,
      system: cpu.system,
    },
    totalRequests: requestStats.totalRequests,
    routes: routeStats,
    db: {
      size: statSync(DB_PATH).size,
      path: DB_PATH,
    },
    timestamp: new Date().toISOString(),
  });
});

/* POST /api/system/backup — export SQLite database */
router.post("/backup", (req, res) => {
  const ts = new Date().toISOString().replace(/[:.]/g, "-");
  const filename = `g1oeil-backup-${ts}.db`;
  const filepath = join(BACKUP_DIR, filename);
  try {
    copyFileSync(DB_PATH, filepath);
    const size = statSync(filepath).size;
    audit("system", "backup", { username: req.user.username, detail: `Backup créé: ${filename} (${size} bytes)`, severity: "info" });
    res.json({ ok: true, filename, size });
  } catch (err) {
    res.status(500).json({ error: `Backup échoué: ${err.message}` });
  }
});

/* GET /api/system/backups — list backups */
router.get("/backups", (_req, res) => {
  try {
    const files = readdirSync(BACKUP_DIR)
      .filter(f => f.endsWith(".db"))
      .map(f => {
        const fp = join(BACKUP_DIR, f);
        const stat = statSync(fp);
        return { filename: f, size: stat.size, created: stat.mtime };
      })
      .sort((a, b) => b.created - a.created);
    res.json(files);
  } catch {
    res.json([]);
  }
});

/* DELETE /api/system/backups/:filename — delete a backup */
router.delete("/backups/:filename", (req, res) => {
  const filename = req.params.filename.replace(/[^a-zA-Z0-9._-]/g, "");
  const fp = join(BACKUP_DIR, filename);
  if (!existsSync(fp)) return res.status(404).json({ error: "Backup introuvable" });
  unlinkSync(fp);
  audit("system", "backup_delete", { username: req.user.username, detail: `Backup supprimé: ${filename}`, severity: "warning" });
  res.json({ ok: true });
});

/* POST /api/system/restore — restore from uploaded backup */
const upload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, BACKUP_DIR),
    filename: (_req, file, cb) => cb(null, `restore-${Date.now()}-${file.originalname}`),
  }),
  limits: { fileSize: 100 * 1024 * 1024 },
});

router.post("/restore", upload.single("backup"), (req, res) => {
  if (!req.file) return res.status(400).json({ error: "Aucun fichier" });
  try {
    const restorePath = req.file.path;
    /* Backup current DB before restore */
    const currentBackup = join(BACKUP_DIR, `pre-restore-${Date.now()}.db`);
    copyFileSync(DB_PATH, currentBackup);
    /* Copy restore file to DB path */
    copyFileSync(restorePath, DB_PATH);
    unlinkSync(restorePath);
    audit("system", "restore", { username: req.user.username, detail: `Base restaurée depuis backup`, severity: "warning" });
    res.json({ ok: true, message: "Base restaurée. Redémarrage du serveur recommandé." });
  } catch (err) {
    res.status(500).json({ error: `Restauration échouée: ${err.message}` });
  }
});

export default router;
