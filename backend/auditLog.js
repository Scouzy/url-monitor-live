import db from "./db.js";

/* ── Audit logging helper ──
   Categories: auth, url, api, user, sync, system, itcare
   Severity:   info, warning, error
   Source:     backend, frontend
*/

const stmt = db.prepare(
  "INSERT INTO audit_logs (category, action, username, detail, severity, source) VALUES (?, ?, ?, ?, ?, ?)"
);

export function audit(category, action, opts = {}) {
  const { username = null, detail = null, severity = "info", source = "backend" } = opts;
  try {
    stmt.run(category, action, username, detail, severity, source);
  } catch (e) {
    console.error("[Audit] Erreur écriture log:", e.message);
  }
}

export function getAuditLogs(limit = 200, category = null) {
  if (category && category !== "all") {
    return db.prepare(
      "SELECT * FROM audit_logs WHERE category = ? ORDER BY created_at DESC LIMIT ?"
    ).all(category, limit);
  }
  return db.prepare(
    "SELECT * FROM audit_logs ORDER BY created_at DESC LIMIT ?"
  ).all(limit);
}

export function clearAuditLogs() {
  db.prepare("DELETE FROM audit_logs").run();
}
