import { Router } from "express";
import db from "../db.js";
import { authMiddleware } from "../auth.js";
import { audit } from "../auditLog.js";

const router = Router();
router.use(authMiddleware);

/* GET /api/apis */
router.get("/", (_req, res) => {
  const apis = db.prepare("SELECT * FROM api_configs ORDER BY id").all();
  res.json(apis.map(a => ({
    ...a,
    headers: a.headers ? JSON.parse(a.headers) : {},
  })));
});

/* POST /api/apis */
router.post("/", (req, res) => {
  const { name, base_url, auth_type, token_url, client_id, client_secret, username, password, api_key, headers } = req.body;
  if (!name || !base_url) return res.status(400).json({ error: "Nom et base_url requis" });
  const info = db.prepare(`INSERT INTO api_configs (name, base_url, auth_type, token_url, client_id, client_secret, username, password, api_key, headers)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(name, base_url, auth_type || "bearer", token_url || null, client_id || null,
         client_secret || null, username || null, password || null, api_key || null,
         headers ? JSON.stringify(headers) : null);
  const row = db.prepare("SELECT * FROM api_configs WHERE id = ?").get(info.lastInsertRowid);
  audit("api", "create", { username: req.user.username, detail: `API créée: ${name}`, severity: "info" });
  res.status(201).json({ ...row, headers: row.headers ? JSON.parse(row.headers) : {} });
});

/* PUT /api/apis/:id */
router.put("/:id", (req, res) => {
  const id = parseInt(req.params.id);
  const { name, base_url, auth_type, token_url, client_id, client_secret, username, password, api_key, headers } = req.body;
  const info = db.prepare(`UPDATE api_configs SET name=?, base_url=?, auth_type=?, token_url=?, client_id=?, client_secret=?, username=?, password=?, api_key=?, headers=?, updated_at=datetime('now') WHERE id=?`)
    .run(name, base_url, auth_type || "bearer", token_url || null, client_id || null,
         client_secret || null, username || null, password || null, api_key || null,
         headers ? JSON.stringify(headers) : null, id);
  if (info.changes === 0) return res.status(404).json({ error: "API introuvable" });
  const row = db.prepare("SELECT * FROM api_configs WHERE id = ?").get(id);
  audit("api", "update", { username: req.user.username, detail: `API #${id} modifiée: ${name}`, severity: "info" });
  res.json({ ...row, headers: row.headers ? JSON.parse(row.headers) : {} });
});

/* DELETE /api/apis/:id */
router.delete("/:id", (req, res) => {
  const id = parseInt(req.params.id);
  db.prepare("DELETE FROM api_configs WHERE id = ?").run(id);
  audit("api", "delete", { username: req.user.username, detail: `API #${id} supprimée`, severity: "warning" });
  res.json({ ok: true });
});

/* POST /api/apis/:id/test — tester la connexion à l'API */
router.post("/:id/test", async (req, res) => {
  const id = parseInt(req.params.id);
  const api = db.prepare("SELECT * FROM api_configs WHERE id = ?").get(id);
  if (!api) return res.status(404).json({ error: "API introuvable" });

  try {
    let token = null;
    if (api.auth_type === "oauth2" && api.token_url) {
      const body = new URLSearchParams();
      if (api.client_id) body.append("client_id", api.client_id);
      if (api.client_secret) body.append("client_secret", api.client_secret);
      if (api.username) body.append("username", api.username);
      if (api.password) body.append("password", api.password);
      body.append("grant_type", "password");
      const tr = await fetch(api.token_url, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: body.toString(),
      });
      if (!tr.ok) {
        const txt = await tr.text().catch(() => "");
        return res.json({ ok: false, status: tr.status, error: `Token: ${txt.slice(0, 200)}` });
      }
      const td = await tr.json();
      token = td.access_token;
    } else if (api.auth_type === "api_key" && api.api_key) {
      token = api.api_key;
    }

    const hdrs = { Accept: "application/json" };
    if (api.headers) {
      try { Object.assign(hdrs, JSON.parse(api.headers)); } catch {}
    }
    if (token) hdrs["Authorization"] = `Bearer ${token}`;

    const r = await fetch(api.base_url, { headers: hdrs, signal: AbortSignal.timeout(10000) });
    if (!r.ok) {
      audit("itcare", "api_error", { username: req.user.username, detail: `API ${api.name} (${api.base_url}) — HTTP ${r.status}`, severity: "error" });
    }
    res.json({ ok: r.ok, status: r.status, statusText: r.statusText });
  } catch (e) {
    audit("itcare", "api_disconnect", { username: req.user.username, detail: `API ${api.name} — ${e.message}`, severity: "error" });
    res.json({ ok: false, error: e.message });
  }
});

export default router;
