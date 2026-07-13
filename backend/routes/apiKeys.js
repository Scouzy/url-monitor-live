import { Router } from "express";
import crypto from "node:crypto";
import db from "../db.js";
import { authMiddleware } from "../auth.js";
import { audit } from "../auditLog.js";

const router = Router();

/* ── Middleware: API key auth (for external apps) ── */
export function apiKeyMiddleware(req, res, next) {
  const rawKey = req.headers["x-api-key"] || req.query.api_key;
  if (!rawKey) return res.status(401).json({ error: "Clé API manquante" });

  const keyHash = crypto.createHash("sha256").update(rawKey).digest("hex");
  const row = db.prepare("SELECT * FROM api_keys WHERE key_hash = ? AND is_active = 1").get(keyHash);
  if (!row) return res.status(401).json({ error: "Clé API invalide ou désactivée" });

  db.prepare("UPDATE api_keys SET last_used = datetime('now') WHERE id = ?").run(row.id);
  req.apiKey = row;
  next();
}

/* ── All routes below require admin auth ── */
router.use(authMiddleware);

/* GET /api/api-keys — list all API keys (without the actual key) */
router.get("/", (req, res) => {
  const keys = db.prepare("SELECT id, key_prefix, app_name, description, permissions, is_active, created_by, created_at, last_used FROM api_keys ORDER BY id DESC").all();
  res.json(keys);
});

/* POST /api/api-keys — generate a new API key */
router.post("/", (req, res) => {
  const { app_name, description, permissions } = req.body;
  if (!app_name) return res.status(400).json({ error: "Nom de l'application requis" });

  const rawKey = `g1oeil_${crypto.randomBytes(32).toString("hex")}`;
  const keyHash = crypto.createHash("sha256").update(rawKey).digest("hex");
  const keyPrefix = rawKey.slice(0, 16) + "...";

  const info = db.prepare("INSERT INTO api_keys (key_prefix, key_hash, app_name, description, permissions, created_by) VALUES (?, ?, ?, ?, ?, ?)")
    .run(keyPrefix, keyHash, app_name, description || null, permissions || "read", req.user.username);

  audit("api", "create", { username: req.user.username, detail: `Clé API créée pour: ${app_name}`, severity: "info" });

  const row = db.prepare("SELECT id, key_prefix, app_name, description, permissions, is_active, created_by, created_at, last_used FROM api_keys WHERE id = ?").get(info.lastInsertRowid);
  res.status(201).json({ ...row, key: rawKey });
});

/* PUT /api/api-keys/:id — update (toggle active, change permissions) */
router.put("/:id", (req, res) => {
  const id = parseInt(req.params.id);
  const { is_active, permissions, description } = req.body;
  const existing = db.prepare("SELECT * FROM api_keys WHERE id = ?").get(id);
  if (!existing) return res.status(404).json({ error: "Clé API introuvable" });

  db.prepare("UPDATE api_keys SET is_active = ?, permissions = ?, description = ? WHERE id = ?")
    .run(
      is_active != null ? (is_active ? 1 : 0) : existing.is_active,
      permissions || existing.permissions,
      description != null ? description : existing.description,
      id
    );

  audit("api", "update", { username: req.user.username, detail: `Clé API #${id} modifiée`, severity: "info" });
  const row = db.prepare("SELECT id, key_prefix, app_name, description, permissions, is_active, created_by, created_at, last_used FROM api_keys WHERE id = ?").get(id);
  res.json(row);
});

/* DELETE /api/api-keys/:id — revoke permanently */
router.delete("/:id", (req, res) => {
  const id = parseInt(req.params.id);
  const row = db.prepare("SELECT app_name FROM api_keys WHERE id = ?").get(id);
  if (!row) return res.status(404).json({ error: "Clé API introuvable" });
  db.prepare("DELETE FROM api_keys WHERE id = ?").run(id);
  audit("api", "delete", { username: req.user.username, detail: `Clé API #${id} supprimée (${row.app_name})`, severity: "warning" });
  res.json({ ok: true });
});

/* ── Public endpoint: authenticate via API key ── */
/* POST /api/auth/external — exchange API key for a session token */
router.post("/auth", async (req, res) => {
  const rawKey = req.headers["x-api-key"] || req.body.api_key;
  if (!rawKey) return res.status(401).json({ error: "Clé API manquante" });

  const keyHash = crypto.createHash("sha256").update(rawKey).digest("hex");
  const row = db.prepare("SELECT * FROM api_keys WHERE key_hash = ? AND is_active = 1").get(keyHash);
  if (!row) return res.status(401).json({ error: "Clé API invalide ou désactivée" });

  db.prepare("UPDATE api_keys SET last_used = datetime('now') WHERE id = ?").run(row.id);

  /* Generate a short-lived session token */
  const jwt = await import("jsonwebtoken");
  const sessionToken = jwt.default.sign(
    { app_name: row.app_name, permissions: row.permissions, type: "api_key" },
    process.env.JWT_SECRET || "g1oeil-secret-key-change-in-production",
    { expiresIn: "1h" }
  );

  audit("auth", "api_login", { detail: `Connexion externe via clé API: ${row.app_name}`, severity: "info", username: row.app_name });

  res.json({ token: sessionToken, app_name: row.app_name, permissions: row.permissions });
});

export default router;
