import { Router } from "express";
import db from "../db.js";
import { authMiddleware } from "../auth.js";
import { audit } from "../auditLog.js";

const router = Router();
router.use(authMiddleware);

/* ── Check SSL certificate for a URL ── */
async function checkSsl(urlStr) {
  try {
    const u = new URL(urlStr);
    if (u.protocol !== "https:") return { error: "URL non HTTPS" };

    /* Use TLS connection to get certificate info */
    const { connect } = await import("node:tls");
    const { lookup } = await import("node:dns");

    return new Promise((resolve) => {
      const socket = connect({
        host: u.hostname,
        port: u.port || 443,
        servername: u.hostname,
        rejectUnauthorized: false,
      }, () => {
        const cert = socket.getPeerCertificate();
        if (!cert || Object.keys(cert).length === 0) {
          socket.destroy();
          resolve({ error: "Aucun certificat" });
          return;
        }
        const expiryDate = new Date(cert.valid_to);
        const now = new Date();
        const daysLeft = Math.floor((expiryDate - now) / 86400000);
        const result = {
          url: urlStr,
          issuer: cert.issuer?.O || cert.issuer?.CN || "N/A",
          subject: cert.subject?.CN || cert.subject?.O || "N/A",
          valid_from: cert.valid_from,
          expiry_date: cert.valid_to,
          days_left: daysLeft,
          status: daysLeft <= 0 ? "expired" : daysLeft <= 7 ? "critical" : daysLeft <= 30 ? "warning" : "valid",
        };
        socket.destroy();
        resolve(result);
      });
      socket.on("error", (err) => resolve({ error: err.message }));
      socket.setTimeout(10000, () => { socket.destroy(); resolve({ error: "Timeout" }); });
    });
  } catch (err) {
    return { error: err.message };
  }
}

/* GET /api/ssl/ — all certificates */
router.get("/", (_req, res) => {
  const rows = db.prepare("SELECT * FROM ssl_certificates ORDER BY expiry_date ASC").all();
  res.json(rows);
});

/* GET /api/ssl/expiring — certificates expiring soon */
router.get("/expiring", (req, res) => {
  const days = parseInt(req.query.days) || 30;
  const rows = db.prepare(`
    SELECT * FROM ssl_certificates
    WHERE days_left <= ? AND status != 'expired'
    ORDER BY days_left ASC
  `).all(days);
  res.json(rows);
});

/* GET /api/ssl/expired — expired certificates */
router.get("/expired", (_req, res) => {
  const rows = db.prepare("SELECT * FROM ssl_certificates WHERE days_left <= 0 ORDER BY expiry_date ASC").all();
  res.json(rows);
});

/* POST /api/ssl/check — check a single URL */
router.post("/check", async (req, res) => {
  const { url } = req.body;
  if (!url) return res.status(400).json({ error: "URL requise" });
  const result = await checkSsl(url);
  if (result.error) return res.status(500).json({ error: result.error });
  db.prepare(`INSERT INTO ssl_certificates (url, issuer, subject, valid_from, expiry_date, days_left, last_checked, status)
    VALUES (?, ?, ?, ?, ?, ?, datetime('now'), ?)
    ON CONFLICT(url) DO UPDATE SET issuer=?, subject=?, valid_from=?, expiry_date=?, days_left=?, last_checked=datetime('now'), status=?`)
    .run(url, result.issuer, result.subject, result.valid_from, result.expiry_date, result.days_left, result.status,
         result.issuer, result.subject, result.valid_from, result.expiry_date, result.days_left, result.status);
  audit("ssl", "check", { username: req.user.username, detail: `SSL vérifié: ${url} (${result.days_left}j restants)`, severity: result.days_left <= 7 ? "error" : result.daysLeft <= 30 ? "warning" : "info" });
  res.json(result);
});

/* POST /api/ssl/check-all — check all HTTPS URLs from url_configs */
router.post("/check-all", async (_req, res) => {
  const urls = db.prepare("SELECT DISTINCT url FROM url_configs WHERE url LIKE 'https%'").all();
  const results = [];
  for (const { url } of urls) {
    const result = await checkSsl(url);
    if (result.error) {
      results.push({ url, error: result.error });
      continue;
    }
    db.prepare(`INSERT INTO ssl_certificates (url, issuer, subject, valid_from, expiry_date, days_left, last_checked, status)
      VALUES (?, ?, ?, ?, ?, ?, datetime('now'), ?)
      ON CONFLICT(url) DO UPDATE SET issuer=?, subject=?, valid_from=?, expiry_date=?, days_left=?, last_checked=datetime('now'), status=?`)
      .run(url, result.issuer, result.subject, result.valid_from, result.expiry_date, result.days_left, result.status,
           result.issuer, result.subject, result.valid_from, result.expiry_date, result.days_left, result.status);
    results.push(result);
  }
  audit("ssl", "check_all", { username: _req.user.username, detail: `${urls.length} certificat(s) vérifié(s)`, severity: "info" });
  res.json({ checked: urls.length, results });
});

export default router;
