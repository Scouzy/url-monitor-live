import { Router } from "express";
import db from "../db.js";
import { authMiddleware } from "../auth.js";
import { audit } from "../auditLog.js";

const router = Router();

/* ── Public POST for agent metrics (uses API key or auth) ── */
/* POST /api/servers/metrics — receive metrics from agent */
router.post("/metrics", authMiddleware, (req, res) => {
  const { server_name, cpu, ram, disk, ram_gb, disk_gb, cores } = req.body;
  if (!server_name) return res.status(400).json({ error: "server_name requis" });
  const info = db.prepare(`INSERT INTO server_metrics (server_name, cpu, ram, disk, ram_gb, disk_gb, cores) VALUES (?, ?, ?, ?, ?, ?, ?)`)
    .run(server_name, cpu ?? null, ram ?? null, disk ?? null, ram_gb ?? null, disk_gb ?? null, cores ?? null);
  res.status(201).json({ ok: true, id: info.lastInsertRowid });
});

/* POST /api/servers/metrics/batch — receive batch metrics */
router.post("/metrics/batch", authMiddleware, (req, res) => {
  const metrics = Array.isArray(req.body) ? req.body : (req.body.metrics || []);
  if (metrics.length === 0) return res.status(400).json({ error: "Aucune métrique" });
  const stmt = db.prepare(`INSERT INTO server_metrics (server_name, cpu, ram, disk, ram_gb, disk_gb, cores) VALUES (?, ?, ?, ?, ?, ?, ?)`);
  let inserted = 0;
  const tx = db.transaction(() => {
    for (const m of metrics) {
      if (!m.server_name) continue;
      stmt.run(m.server_name, m.cpu ?? null, m.ram ?? null, m.disk ?? null, m.ram_gb ?? null, m.disk_gb ?? null, m.cores ?? null);
      inserted++;
    }
  });
  tx();
  res.status(201).json({ ok: true, inserted });
});

/* GET /api/servers/:name/history — metric history for a server */
router.get("/:name/history", authMiddleware, (req, res) => {
  const name = decodeURIComponent(req.params.name);
  const limit = Math.min(parseInt(req.query.limit) || 500, 5000);
  const rows = db.prepare("SELECT * FROM server_metrics WHERE server_name = ? ORDER BY ts DESC LIMIT ?").all(name, limit);
  res.json(rows);
});

/* GET /api/servers/metrics/latest — latest metrics for all servers */
router.get("/metrics/latest", authMiddleware, (_req, res) => {
  const rows = db.prepare(`
    SELECT * FROM server_metrics
    WHERE id IN (SELECT MAX(id) FROM server_metrics GROUP BY server_name)
    ORDER BY server_name
  `).all();
  res.json(rows);
});

/* ── Snapshots ── */

/* POST /api/servers/snapshot — save daily snapshot */
router.post("/snapshot", authMiddleware, (req, res) => {
  const { server_name, cores, ram_gb, disk_gb, cpu, ram, disk } = req.body;
  if (!server_name) return res.status(400).json({ error: "server_name requis" });
  const info = db.prepare(`INSERT INTO server_snapshots (server_name, cores, ram_gb, disk_gb, cpu, ram, disk) VALUES (?, ?, ?, ?, ?, ?, ?)`)
    .run(server_name, cores ?? null, ram_gb ?? null, disk_gb ?? null, cpu ?? null, ram ?? null, disk ?? null);
  audit("server", "snapshot", { username: req.user.username, detail: `Snapshot sauvegardé: ${server_name}`, severity: "info" });
  res.status(201).json({ ok: true, id: info.lastInsertRowid });
});

/* POST /api/servers/snapshot/batch — batch snapshots */
router.post("/snapshot/batch", authMiddleware, (req, res) => {
  const servers = Array.isArray(req.body) ? req.body : (req.body.servers || []);
  if (servers.length === 0) return res.status(400).json({ error: "Aucun serveur" });
  const stmt = db.prepare(`INSERT INTO server_snapshots (server_name, cores, ram_gb, disk_gb, cpu, ram, disk) VALUES (?, ?, ?, ?, ?, ?, ?)`);
  let inserted = 0;
  const tx = db.transaction(() => {
    for (const s of servers) {
      if (!s.server_name && !s.name) continue;
      const name = s.server_name || s.name;
      stmt.run(name, s.cores ?? null, s.ram_gb ?? null, s.disk_gb ?? null, s.cpu ?? null, s.ram ?? null, s.disk ?? null);
      inserted++;
    }
  });
  tx();
  audit("server", "snapshot_batch", { username: req.user.username, detail: `${inserted} snapshot(s) sauvegardé(s)`, severity: "info" });
  res.status(201).json({ ok: true, inserted });
});

/* GET /api/servers/:name/snapshots — snapshot history */
router.get("/:name/snapshots", authMiddleware, (req, res) => {
  const name = decodeURIComponent(req.params.name);
  const limit = Math.min(parseInt(req.query.limit) || 365, 1000);
  const rows = db.prepare("SELECT * FROM server_snapshots WHERE server_name = ? ORDER BY ts DESC LIMIT ?").all(name, limit);
  res.json(rows);
});

/* GET /api/servers/snapshots/all — all latest snapshots */
router.get("/snapshots/all", authMiddleware, (_req, res) => {
  const rows = db.prepare(`
    SELECT * FROM server_snapshots
    WHERE id IN (SELECT MAX(id) FROM server_snapshots GROUP BY server_name)
    ORDER BY server_name
  `).all();
  res.json(rows);
});

export default router;
