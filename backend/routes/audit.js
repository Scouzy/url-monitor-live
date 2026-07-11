import { Router } from "express";
import { getAuditLogs, clearAuditLogs, audit } from "../auditLog.js";
import { authMiddleware } from "../auth.js";

const router = Router();
router.use(authMiddleware);

/* GET /api/audit?category=auth&limit=200 */
router.get("/", (req, res) => {
  const category = req.query.category || "all";
  const limit = parseInt(req.query.limit) || 200;
  const logs = getAuditLogs(limit, category);
  res.json(logs);
});

/* DELETE /api/audit — vider les logs (superadmin only) */
router.delete("/", (req, res) => {
  if (req.user.role !== "superadmin") return res.status(403).json({ error: "Accès refusé" });
  clearAuditLogs();
  audit("system", "logs_cleared", { username: req.user.username, detail: "Logs d'audit vidés", severity: "warning" });
  res.json({ ok: true });
});

/* POST /api/audit — recevoir un log depuis le frontend */
router.post("/", (req, res) => {
  const { category, action, detail, severity } = req.body;
  if (!category || !action) return res.status(400).json({ error: "category et action requis" });
  audit(category, action, {
    username: req.user.username,
    detail: detail || null,
    severity: severity || "info",
    source: "frontend",
  });
  res.json({ ok: true });
});

export default router;
