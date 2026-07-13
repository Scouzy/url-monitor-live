import { Router } from "express";
import db from "../db.js";
import { authMiddleware } from "../auth.js";
import ExcelJS from "exceljs";
import { audit } from "../auditLog.js";

const router = Router();
router.use(authMiddleware);

/* GET /api/export/servers?format=xlsx — export server inventory */
router.get("/servers", async (req, res) => {
  const format = req.query.format || "xlsx";
  const metrics = db.prepare(`
    SELECT * FROM server_metrics
    WHERE id IN (SELECT MAX(id) FROM server_metrics GROUP BY server_name)
    ORDER BY server_name
  `).all();

  if (format === "xlsx") {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet("Serveurs");
    ws.columns = [
      { header: "Serveur", key: "server_name", width: 25 },
      { header: "CPU (%)", key: "cpu", width: 10 },
      { header: "RAM (%)", key: "ram", width: 10 },
      { header: "Disque (%)", key: "disk", width: 10 },
      { header: "RAM (Go)", key: "ram_gb", width: 10 },
      { header: "Disque (Go)", key: "disk_gb", width: 12 },
      { header: "Cores", key: "cores", width: 8 },
      { header: "Timestamp", key: "ts", width: 20 },
    ];
    ws.getRow(1).font = { bold: true };
    for (const m of metrics) ws.addRow(m);
    await wb.xlsx.writeFile("/tmp/g1oeil-servers.xlsx").catch(() => {});
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", "attachment; filename=serveurs.xlsx");
    await wb.xlsx.write(res);
    res.end();
    audit("export", "servers_xlsx", { username: req.user.username, detail: `${metrics.length} serveur(s) exporté(s)`, severity: "info" });
  } else {
    res.status(400).json({ error: "Format non supporté" });
  }
});

/* GET /api/export/urls?format=xlsx — export URL configs */
router.get("/urls", async (req, res) => {
  const format = req.query.format || "xlsx";
  const urls = db.prepare("SELECT * FROM url_configs ORDER BY id").all();

  if (format === "xlsx") {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet("URLs");
    ws.columns = [
      { header: "ID", key: "id", width: 6 },
      { header: "URL", key: "url", width: 50 },
      { header: "Nom", key: "name", width: 20 },
      { header: "Mode", key: "mode", width: 12 },
      { header: "Auth URL", key: "auth_url", width: 30 },
      { header: "Login", key: "login", width: 15 },
      { header: "Home URL", key: "home_url", width: 30 },
      { header: "Créé le", key: "created_at", width: 20 },
    ];
    ws.getRow(1).font = { bold: true };
    for (const u of urls) ws.addRow(u);
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", "attachment; filename=urls.xlsx");
    await wb.xlsx.write(res);
    res.end();
    audit("export", "urls_xlsx", { username: req.user.username, detail: `${urls.length} URL(s) exportée(s)`, severity: "info" });
  } else {
    res.status(400).json({ error: "Format non supporté" });
  }
});

/* GET /api/export/report?format=pdf — generate supervision report (HTML for print) */
router.get("/report", async (req, res) => {
  const format = req.query.format || "pdf";
  if (format !== "pdf") return res.status(400).json({ error: "Format non supporté" });

  const urls = db.prepare("SELECT * FROM url_configs ORDER BY id").all();
  const schedules = db.prepare("SELECT * FROM check_schedule").all();
  const sslCerts = db.prepare("SELECT * FROM ssl_certificates ORDER BY days_left ASC").all();
  const serverMetrics = db.prepare(`
    SELECT * FROM server_metrics
    WHERE id IN (SELECT MAX(id) FROM server_metrics GROUP BY server_name)
    ORDER BY server_name
  `).all();
  const recentResults = db.prepare("SELECT * FROM check_results ORDER BY checked_at DESC LIMIT 50").all();
  const auditLogs = db.prepare("SELECT * FROM audit_logs ORDER BY created_at DESC LIMIT 50").all();

  const now = new Date().toLocaleString("fr-FR");
  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Rapport G1Oeil</title>
  <style>
    body { font-family: Arial, sans-serif; margin: 30px; color: #1a1a1a; }
    h1 { color: #4F46E5; border-bottom: 2px solid #4F46E5; padding-bottom: 8px; }
    h2 { color: #374151; margin-top: 24px; }
    table { width: 100%; border-collapse: collapse; margin: 10px 0; font-size: 11px; }
    th { background: #4F46E5; color: white; padding: 6px 8px; text-align: left; }
    td { padding: 5px 8px; border-bottom: 1px solid #e5e7eb; }
    .kpi { display: inline-block; margin: 5px 15px 5px 0; padding: 10px 20px; background: #f3f4f6; border-radius: 8px; }
    .kpi b { font-size: 20px; color: #4F46E5; }
    .footer { margin-top: 30px; font-size: 10px; color: #9ca3af; text-align: center; }
    @media print { body { margin: 15px; } }
  </style></head><body>
  <h1>Rapport de Supervision G1Oeil</h1>
  <p style="color:#6B7280">Généré le ${now}</p>

  <h2>Indicateurs clés</h2>
  <div class="kpi"><b>${urls.length}</b><br>URLs monitorées</div>
  <div class="kpi"><b>${schedules.length}</b><br>Schedules actifs</div>
  <div class="kpi"><b>${serverMetrics.length}</b><br>Serveurs suivis</div>
  <div class="kpi"><b>${sslCerts.filter(c => c.days_left <= 30).length}</b><br>Certificats SSL à risque</div>
  <div class="kpi"><b>${recentResults.filter(r => r.status === "offline").length}</b><br>Checks hors ligne (50 derniers)</div>

  <h2>Configuration URLs</h2>
  <table><tr><th>ID</th><th>URL</th><th>Nom</th><th>Mode</th><th>Créé le</th></tr>
  ${urls.map(u => `<tr><td>${u.id}</td><td>${u.url}</td><td>${u.name || "—"}</td><td>${u.mode}</td><td>${u.created_at}</td></tr>`).join("")}
  </table>

  <h2>Métriques serveurs</h2>
  <table><tr><th>Serveur</th><th>CPU (%)</th><th>RAM (%)</th><th>Disque (%)</th><th>RAM (Go)</th><th>Cores</th><th>Timestamp</th></tr>
  ${serverMetrics.map(s => `<tr><td>${s.server_name}</td><td>${s.cpu ?? "—"}</td><td>${s.ram ?? "—"}</td><td>${s.disk ?? "—"}</td><td>${s.ram_gb ?? "—"}</td><td>${s.cores ?? "—"}</td><td>${s.ts}</td></tr>`).join("")}
  </table>

  <h2>Certificats SSL</h2>
  <table><tr><th>URL</th><th>Issuer</th><th>Expiration</th><th>Jours restants</th><th>Statut</th></tr>
  ${sslCerts.map(c => `<tr><td>${c.url}</td><td>${c.issuer || "—"}</td><td>${c.expiry_date || "—"}</td><td>${c.days_left ?? "—"}</td><td>${c.status}</td></tr>`).join("")}
  </table>

  <h2>50 derniers checks</h2>
  <table><tr><th>URL</th><th>Statut</th><th>Temps (ms)</th><th>Date</th></tr>
  ${recentResults.map(r => `<tr><td>${r.url}</td><td>${r.status}</td><td>${r.response_time ?? "—"}</td><td>${r.checked_at}</td></tr>`).join("")}
  </table>

  <h2>50 derniers événements (audit)</h2>
  <table><tr><th>Catégorie</th><th>Action</th><th>Détail</th><th>Sévérité</th><th>Date</th></tr>
  ${auditLogs.map(a => `<tr><td>${a.category}</td><td>${a.action}</td><td>${a.detail || "—"}</td><td>${a.severity}</td><td>${a.created_at}</td></tr>`).join("")}
  </table>

  <div class="footer">G1Oeil — Rapport généré automatiquement le ${now}</div>
  </body></html>`;

  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.setHeader("Content-Disposition", "inline; filename=rapport-g1oeil.html");
  res.send(html);
  audit("export", "report_pdf", { username: req.user.username, detail: "Rapport PDF généré", severity: "info" });
});

export default router;
