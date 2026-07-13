import { Router } from "express";
import db from "../db.js";
import { authMiddleware } from "../auth.js";
import { audit } from "../auditLog.js";

const router = Router();
router.use(authMiddleware);

/* ── Send notifications to enabled channels ── */
export async function notifyChannels(eventType, data) {
  const channels = db.prepare("SELECT * FROM notification_channels WHERE enabled = 1").all();
  for (const ch of channels) {
    const triggers = (ch.triggers || "").split(",");
    if (!triggers.includes(eventType)) continue;

    const config = JSON.parse(ch.config || "{}");
    try {
      if (ch.type === "webhook") {
        await sendWebhook(config.url, eventType, data);
      } else if (ch.type === "email") {
        await sendEmail(config, eventType, data);
      }
    } catch (err) {
      console.error(`[Notifications] Erreur envoi canal ${ch.name}:`, err.message);
    }
  }
}

async function sendWebhook(url, eventType, data) {
  if (!url) return;
  const payload = {
    text: `[G1Oeil] ${eventType}: ${data.url || "N/A"}`,
    event: eventType,
    data,
    timestamp: new Date().toISOString(),
  };
  await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(10000),
  });
}

async function sendEmail(config, eventType, data) {
  /* Email sending via SMTP — placeholder for nodemailer integration */
  console.log(`[Notifications] Email to ${config.to || "N/A"}: ${eventType} — ${data.url}`);
}

/* GET /api/notifications/channels */
router.get("/channels", (_req, res) => {
  const channels = db.prepare("SELECT * FROM notification_channels ORDER BY id").all();
  res.json(channels.map(c => ({ ...c, config: JSON.parse(c.config || "{}") })));
});

/* POST /api/notifications/channels */
router.post("/channels", (req, res) => {
  const { name, type, config, triggers } = req.body;
  if (!name || !type) return res.status(400).json({ error: "Nom et type requis" });
  const info = db.prepare("INSERT INTO notification_channels (name, type, config, triggers) VALUES (?, ?, ?, ?)")
    .run(name, type, JSON.stringify(config || {}), triggers || "status_change,check_fail");
  const row = db.prepare("SELECT * FROM notification_channels WHERE id = ?").get(info.lastInsertRowid);
  audit("notification", "channel_create", { username: req.user.username, detail: `Canal créé: ${name} (${type})`, severity: "info" });
  res.status(201).json({ ...row, config: JSON.parse(row.config || "{}") });
});

/* PUT /api/notifications/channels/:id */
router.put("/channels/:id", (req, res) => {
  const id = parseInt(req.params.id);
  const { name, type, config, triggers, enabled } = req.body;
  const info = db.prepare("UPDATE notification_channels SET name=?, type=?, config=?, triggers=?, enabled=?, updated_at=datetime('now') WHERE id=?")
    .run(name, type, JSON.stringify(config || {}), triggers, enabled != null ? (enabled ? 1 : 0) : 1, id);
  if (info.changes === 0) return res.status(404).json({ error: "Canal introuvable" });
  const row = db.prepare("SELECT * FROM notification_channels WHERE id = ?").get(id);
  audit("notification", "channel_update", { username: req.user.username, detail: `Canal modifié: ${name}`, severity: "info" });
  res.json({ ...row, config: JSON.parse(row.config || "{}") });
});

/* DELETE /api/notifications/channels/:id */
router.delete("/channels/:id", (req, res) => {
  const id = parseInt(req.params.id);
  const row = db.prepare("SELECT name FROM notification_channels WHERE id = ?").get(id);
  if (!row) return res.status(404).json({ error: "Canal introuvable" });
  db.prepare("DELETE FROM notification_channels WHERE id = ?").run(id);
  audit("notification", "channel_delete", { username: req.user.username, detail: `Canal supprimé: ${row.name}`, severity: "warning" });
  res.json({ ok: true });
});

/* POST /api/notifications/test — test a channel */
router.post("/test", async (req, res) => {
  const { channelId } = req.body;
  const ch = db.prepare("SELECT * FROM notification_channels WHERE id = ?").get(channelId);
  if (!ch) return res.status(404).json({ error: "Canal introuvable" });
  try {
    const config = JSON.parse(ch.config || "{}");
    if (ch.type === "webhook") {
      await sendWebhook(config.url, "test", { message: "Test de notification G1Oeil", timestamp: new Date().toISOString() });
    } else if (ch.type === "email") {
      await sendEmail(config, "test", { message: "Test de notification G1Oeil" });
    }
    audit("notification", "test_sent", { username: req.user.username, detail: `Test envoyé sur canal: ${ch.name}`, severity: "info" });
    res.json({ ok: true, message: "Test envoyé" });
  } catch (err) {
    res.status(500).json({ error: `Erreur: ${err.message}` });
  }
});

export default router;
