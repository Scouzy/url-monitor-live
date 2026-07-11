import { Router } from "express";
import multer from "multer";
import { join, dirname, extname } from "node:path";
import { fileURLToPath } from "node:url";
import { existsSync, mkdirSync, unlinkSync, writeFileSync } from "node:fs";
import db from "../db.js";
import { authMiddleware } from "../auth.js";
import { audit } from "../auditLog.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const IMAGES_DIR = join(__dirname, "..", "data", "images");
mkdirSync(IMAGES_DIR, { recursive: true });

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, IMAGES_DIR),
  filename: (_req, file, cb) => {
    const ext = extname(file.originalname) || ".png";
    cb(null, `step_${Date.now()}_${Math.random().toString(36).slice(2, 8)}${ext}`);
  },
});
const upload = multer({ storage, limits: { fileSize: 5 * 1024 * 1024 } });

const router = Router();
router.use(authMiddleware);

/* ── CRUD URL configs ── */

/* GET /api/urls */
router.get("/", (_req, res) => {
  const urls = db.prepare("SELECT * FROM url_configs ORDER BY id").all();
  const steps = db.prepare("SELECT * FROM url_steps ORDER BY url_config_id, step_index").all();
  const byUrl = {};
  for (const s of steps) {
    if (!byUrl[s.url_config_id]) byUrl[s.url_config_id] = [];
    byUrl[s.url_config_id].push(s);
  }
  res.json(urls.map(u => ({ ...u, steps: byUrl[u.id] || [] })));
});

/* POST /api/urls */
router.post("/", (req, res) => {
  const { url, name, mode, auth_url, login_field, password_field, login, password, home_url, tab_url } = req.body;
  if (!url) return res.status(400).json({ error: "URL requise" });
  const info = db.prepare(`INSERT INTO url_configs (url, name, mode, auth_url, login_field, password_field, login, password, home_url, tab_url)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(url, name || null, mode || "simple", auth_url || null, login_field || "username",
         password_field || "password", login || null, password || null, home_url || null, tab_url || null);
  const row = db.prepare("SELECT * FROM url_configs WHERE id = ?").get(info.lastInsertRowid);
  audit("url", "create", { username: req.user.username, detail: `URL créée: ${url}`, severity: "info" });
  res.status(201).json({ ...row, steps: [] });
});

/* PUT /api/urls/:id */
router.put("/:id", (req, res) => {
  const id = parseInt(req.params.id);
  const { url, name, mode, auth_url, login_field, password_field, login, password, home_url, tab_url } = req.body;
  const info = db.prepare(`UPDATE url_configs SET url=?, name=?, mode=?, auth_url=?, login_field=?, password_field=?, login=?, password=?, home_url=?, tab_url=?, updated_at=datetime('now') WHERE id=?`)
    .run(url, name || null, mode || "simple", auth_url || null, login_field || "username",
         password_field || "password", login || null, password || null, home_url || null, tab_url || null, id);
  if (info.changes === 0) return res.status(404).json({ error: "URL introuvable" });
  const row = db.prepare("SELECT * FROM url_configs WHERE id = ?").get(id);
  const steps = db.prepare("SELECT * FROM url_steps WHERE url_config_id = ? ORDER BY step_index").all(id);
  audit("url", "update", { username: req.user.username, detail: `URL #${id} modifiée: ${url}`, severity: "info" });
  res.json({ ...row, steps });
});

/* DELETE /api/urls/:id */
router.delete("/:id", (req, res) => {
  const id = parseInt(req.params.id);
  const steps = db.prepare("SELECT reference_image FROM url_steps WHERE url_config_id = ?").all(id);
  for (const s of steps) {
    if (s.reference_image) {
      const fp = join(IMAGES_DIR, s.reference_image);
      if (existsSync(fp)) { try { require("fs").unlinkSync(fp); } catch {} }
    }
  }
  db.prepare("DELETE FROM url_configs WHERE id = ?").run(id);
  audit("url", "delete", { username: req.user.username, detail: `URL #${id} supprimée`, severity: "warning" });
  res.json({ ok: true });
});

/* ── Steps + reference images ── */

/* POST /api/urls/:id/steps — créer une étape */
router.post("/:id/steps", (req, res) => {
  const urlConfigId = parseInt(req.params.id);
  const { step_index, step_name, threshold } = req.body;
  const info = db.prepare("INSERT INTO url_steps (url_config_id, step_index, step_name, threshold) VALUES (?, ?, ?, ?)")
    .run(urlConfigId, step_index, step_name || `Étape ${step_index}`, threshold || 0.1);
  const row = db.prepare("SELECT * FROM url_steps WHERE id = ?").get(info.lastInsertRowid);
  audit("url", "step_create", { username: req.user.username, detail: `Étape ${step_index} ajoutée à URL #${urlConfigId}`, severity: "info" });
  res.status(201).json(row);
});

/* PUT /api/urls/:id/steps/:stepId — modifier étape */
router.put("/:id/steps/:stepId", (req, res) => {
  const stepId = parseInt(req.params.stepId);
  const { step_name, threshold } = req.body;
  db.prepare("UPDATE url_steps SET step_name=?, threshold=? WHERE id=?")
    .run(step_name, threshold || 0.1, stepId);
  const row = db.prepare("SELECT * FROM url_steps WHERE id = ?").get(stepId);
  res.json(row);
});

/* POST /api/urls/:id/steps/:stepId/image — upload image de référence */
router.post("/:id/steps/:stepId/image", upload.single("image"), (req, res) => {
  const stepId = parseInt(req.params.stepId);
  if (!req.file) return res.status(400).json({ error: "Aucune image" });
  const old = db.prepare("SELECT reference_image FROM url_steps WHERE id = ?").get(stepId);
  if (old?.reference_image) {
    const fp = join(IMAGES_DIR, old.reference_image);
    if (existsSync(fp)) { try { unlinkSync(fp); } catch {} }
  }
  db.prepare("UPDATE url_steps SET reference_image = ? WHERE id = ?").run(req.file.filename, stepId);
  const row = db.prepare("SELECT * FROM url_steps WHERE id = ?").get(stepId);
  audit("url", "image_upload", { username: req.user.username, detail: `Image de référence uploadée (étape #${stepId})`, severity: "info" });
  res.json({ ...row, image_url: `/api/urls/images/${req.file.filename}` });
});

/* GET /api/urls/images/:filename — servir une image de référence */
router.get("/images/:filename", (req, res) => {
  const fp = join(IMAGES_DIR, req.params.filename);
  if (!existsSync(fp)) return res.status(404).json({ error: "Image introuvable" });
  res.sendFile(fp);
});

/* DELETE /api/urls/:id/steps/:stepId/image — supprimer image de référence */
router.delete("/:id/steps/:stepId/image", (req, res) => {
  const stepId = parseInt(req.params.stepId);
  const row = db.prepare("SELECT reference_image FROM url_steps WHERE id = ?").get(stepId);
  if (row?.reference_image) {
    const fp = join(IMAGES_DIR, row.reference_image);
    if (existsSync(fp)) { try { unlinkSync(fp); } catch {} }
  }
  db.prepare("UPDATE url_steps SET reference_image = NULL WHERE id = ?").run(stepId);
  res.json({ ok: true });
});

/* DELETE /api/urls/:id/steps/:stepId — supprimer étape */
router.delete("/:id/steps/:stepId", (req, res) => {
  const stepId = parseInt(req.params.stepId);
  const row = db.prepare("SELECT reference_image FROM url_steps WHERE id = ?").get(stepId);
  if (row?.reference_image) {
    const fp = join(IMAGES_DIR, row.reference_image);
    if (existsSync(fp)) { try { unlinkSync(fp); } catch {} }
  }
  db.prepare("DELETE FROM url_steps WHERE id = ?").run(stepId);
  res.json({ ok: true });
});

/* POST /api/urls/import — importer les URLs depuis le frontend (groups format) */
router.post("/import", (req, res) => {
  const groups = Array.isArray(req.body) ? req.body : (req.body.groups || []);
  let imported = 0;
  let skipped = 0;
  for (const g of groups) {
    for (const u of (g.urls || [])) {
      const existing = db.prepare("SELECT id FROM url_configs WHERE url = ?").get(u.url);
      if (existing) { skipped++; continue; }
      const mon = u.monitoring || {};
      db.prepare(`INSERT INTO url_configs (url, name, mode, auth_url, login_field, password_field, login, password, home_url, tab_url)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
        .run(
          u.url,
          g.name || null,
          mon.mode || "simple",
          mon.authUrl || null,
          mon.loginField || "username",
          mon.passwordField || "password",
          mon.login || null,
          mon.password || null,
          mon.homeUrl || null,
          mon.tabUrl || null,
        );
      imported++;
    }
  }
  /* Sauvegarder aussi dans le fichier pour le seed au redémarrage */
  try {
    writeFileSync(join(__dirname, "..", "data", "frontend-urls.json"), JSON.stringify(groups, null, 2));
  } catch {}
  audit("sync", "url_import", { username: req.user.username, detail: `${imported} URL(s) importée(s), ${skipped} existante(s)`, severity: "info", source: "frontend" });
  res.json({ ok: true, imported, skipped });
});

export default router;
