import { Router } from "express";
import db from "../db.js";
import { authMiddleware } from "../auth.js";
import { audit } from "../auditLog.js";

const router = Router();
router.use(authMiddleware);

/* GET /api/scheduler — list all schedules */
router.get("/", (_req, res) => {
  const schedules = db.prepare(`
    SELECT s.*, u.url, u.name as url_name
    FROM check_schedule s
    JOIN url_configs u ON s.url_config_id = u.id
    ORDER BY s.id
  `).all();
  res.json(schedules);
});

/* POST /api/scheduler — create schedule for a URL */
router.post("/", (req, res) => {
  const { url_config_id, interval_seconds, enabled } = req.body;
  if (!url_config_id) return res.status(400).json({ error: "url_config_id requis" });
  const urlConfig = db.prepare("SELECT * FROM url_configs WHERE id = ?").get(url_config_id);
  if (!urlConfig) return res.status(404).json({ error: "URL config introuvable" });
  const existing = db.prepare("SELECT id FROM check_schedule WHERE url_config_id = ?").get(url_config_id);
  if (existing) return res.status(409).json({ error: "Un schedule existe déjà pour cette URL" });
  const info = db.prepare("INSERT INTO check_schedule (url_config_id, interval_seconds, enabled) VALUES (?, ?, ?)")
    .run(url_config_id, interval_seconds || 300, enabled != null ? (enabled ? 1 : 0) : 1);
  const row = db.prepare("SELECT * FROM check_schedule WHERE id = ?").get(info.lastInsertRowid);
  audit("scheduler", "create", { username: req.user.username, detail: `Schedule créé pour ${urlConfig.url} (interval: ${interval_seconds || 300}s)`, severity: "info" });
  res.status(201).json(row);
});

/* PUT /api/scheduler/:id — update schedule */
router.put("/:id", (req, res) => {
  const id = parseInt(req.params.id);
  const { interval_seconds, enabled } = req.body;
  const info = db.prepare("UPDATE check_schedule SET interval_seconds=?, enabled=?, updated_at=datetime('now') WHERE id=?")
    .run(interval_seconds || 300, enabled != null ? (enabled ? 1 : 0) : 1, id);
  if (info.changes === 0) return res.status(404).json({ error: "Schedule introuvable" });
  const row = db.prepare("SELECT * FROM check_schedule WHERE id = ?").get(id);
  audit("scheduler", "update", { username: req.user.username, detail: `Schedule #${id} modifié`, severity: "info" });
  res.json(row);
});

/* DELETE /api/scheduler/:id */
router.delete("/:id", (req, res) => {
  const id = parseInt(req.params.id);
  db.prepare("DELETE FROM check_schedule WHERE id = ?").run(id);
  audit("scheduler", "delete", { username: req.user.username, detail: `Schedule #${id} supprimé`, severity: "warning" });
  res.json({ ok: true });
});

/* POST /api/urls/:id/schedule — convenience route to schedule a URL */
router.post("/url/:urlId", (req, res) => {
  const urlId = parseInt(req.params.urlId);
  const { interval_seconds, enabled } = req.body;
  const urlConfig = db.prepare("SELECT * FROM url_configs WHERE id = ?").get(urlId);
  if (!urlConfig) return res.status(404).json({ error: "URL config introuvable" });
  const existing = db.prepare("SELECT id FROM check_schedule WHERE url_config_id = ?").get(urlId);
  if (existing) {
    db.prepare("UPDATE check_schedule SET interval_seconds=?, enabled=?, updated_at=datetime('now') WHERE id=?")
      .run(interval_seconds || 300, enabled != null ? (enabled ? 1 : 0) : 1, existing.id);
    const row = db.prepare("SELECT * FROM check_schedule WHERE id = ?").get(existing.id);
    res.json(row);
  } else {
    const info = db.prepare("INSERT INTO check_schedule (url_config_id, interval_seconds, enabled) VALUES (?, ?, ?)")
      .run(urlId, interval_seconds || 300, enabled != null ? (enabled ? 1 : 0) : 1);
    const row = db.prepare("SELECT * FROM check_schedule WHERE id = ?").get(info.lastInsertRowid);
    audit("scheduler", "create", { username: req.user.username, detail: `Schedule créé pour ${urlConfig.url}`, severity: "info" });
    res.status(201).json(row);
  }
});

/* GET /api/scheduler/results — recent check results */
router.get("/results", (req, res) => {
  const limit = Math.min(parseInt(req.query.limit) || 100, 500);
  const url = req.query.url;
  let rows;
  if (url) {
    rows = db.prepare("SELECT * FROM check_results WHERE url = ? ORDER BY checked_at DESC LIMIT ?").all(url, limit);
  } else {
    rows = db.prepare("SELECT * FROM check_results ORDER BY checked_at DESC LIMIT ?").all(limit);
  }
  res.json(rows);
});

/* GET /api/scheduler/results/:url — history for a specific URL */
router.get("/results/:url", (req, res) => {
  const limit = Math.min(parseInt(req.query.limit) || 100, 500);
  const decodedUrl = decodeURIComponent(req.params.url);
  const rows = db.prepare("SELECT * FROM check_results WHERE url = ? ORDER BY checked_at DESC LIMIT ?").all(decodedUrl, limit);
  res.json(rows);
});

export default router;
