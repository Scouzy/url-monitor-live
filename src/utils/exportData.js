import * as XLSX from "xlsx";
import { getStatus, STATUS_CONFIG } from "../constants";

/* ═══════════════════════════════════════════════════════════════
   EXPORT EXCEL — Inventaire serveurs, URLs, recommandations
   ═══════════════════════════════════════════════════════════════ */

function autoWidth(ws) {
  const colWidths = [];
  const range = XLSX.utils.decode_range(ws["!ref"] || "A1");
  for (let r = range.s.r; r <= range.e.r; r++) {
    for (let c = range.s.c; c <= range.e.c; c++) {
      const addr = XLSX.utils.encode_cell({ r, c });
      const cell = ws[addr];
      const len = cell && cell.v != null ? String(cell.v).length : 0;
      colWidths[c] = Math.max(colWidths[c] || 10, Math.min(len + 2, 50));
    }
  }
  ws["!cols"] = colWidths.map(w => ({ wch: w }));
}

function downloadWorkbook(wb, filename) {
  XLSX.writeFile(wb, filename, { bookType: "xlsx", type: "binary" });
}

/* ── Export inventaire serveurs ── */
export function exportServersExcel(servers) {
  const wb = XLSX.utils.book_new();

  const data = servers.map(s => ({
    "Nom": s.name || "—",
    "Rôle": s.role || "—",
    "Environnement": s.env || "—",
    "OS": s.os || "—",
    "IP": s.ip || "—",
    "CPU (%)": s.cpu ?? 0,
    "RAM (%)": s.ram ?? 0,
    "Disque (%)": s.disk ?? 0,
    "Cœurs": s.cores ?? "—",
    "RAM (Go)": s.ramGb ?? "—",
    "Disque (Go)": s.diskGb ?? "—",
    "Uptime (jours)": s.uptimeDays ?? "—",
    "Croissance (%/mois)": s.growthRate ?? "—",
    "Source": s.source || "—",
    "Dernier check VPS": s.lastVpsCheck || "—",
  }));

  const ws = XLSX.utils.json_to_sheet(data);
  autoWidth(ws);
  XLSX.utils.book_append_sheet(wb, ws, "Serveurs");

  /* Feuille alertes */
  const alerts = servers
    .filter(s => (s.cpu ?? 0) >= 75 || (s.ram ?? 0) >= 75 || (s.disk ?? 0) >= 75)
    .map(s => ({
      "Serveur": s.name,
      "CPU (%)": s.cpu ?? 0,
      "RAM (%)": s.ram ?? 0,
      "Disque (%)": s.disk ?? 0,
      "Statut": (s.cpu >= 90 || s.ram >= 90 || s.disk >= 90) ? "Critique" : "Alerte",
    }));
  if (alerts.length > 0) {
    const wsAlerts = XLSX.utils.json_to_sheet(alerts);
    autoWidth(wsAlerts);
    XLSX.utils.book_append_sheet(wb, wsAlerts, "Alertes");
  }

  downloadWorkbook(wb, `inventaire-serveurs-${new Date().toISOString().slice(0, 10)}.xlsx`);
}

/* ── Export URLs ── */
export function exportUrlsExcel(groups) {
  const wb = XLSX.utils.book_new();
  const allUrls = groups.flatMap(g => g.urls.map(u => ({ ...u, _group: g.name })));

  const data = allUrls.map(u => {
    const status = getStatus(u);
    return {
      "Groupe": u._group,
      "URL": u.url,
      "Statut": STATUS_CONFIG[status]?.label || status,
      "Temps de réponse (ms)": u.responseTime ?? "—",
      "Dernier check": u.lastCheck ? new Date(u.lastCheck).toLocaleString("fr-FR") : "—",
      "SSL - Jours restants": u.sslInfo?.daysLeft ?? "—",
      "SSL - Expiration": u.sslInfo?.validTo || "—",
      "Mode monitoring": u.monitoring?.mode || "simple",
    };
  });

  const ws = XLSX.utils.json_to_sheet(data);
  autoWidth(ws);
  XLSX.utils.book_append_sheet(wb, ws, "URLs");

  /* Feuille par groupe */
  const byGroup = groups.filter(g => !g.isGlobal).map(g => ({
    "Groupe": g.name,
    "Total URLs": g.urls.length,
    "En ligne": g.urls.filter(u => { const s = getStatus(u); return s === "online" || s === "slow"; }).length,
    "Hors ligne": g.urls.filter(u => getStatus(u) === "offline").length,
    "En attente": g.urls.filter(u => getStatus(u) === "pending").length,
  }));
  if (byGroup.length > 0) {
    const wsGroups = XLSX.utils.json_to_sheet(byGroup);
    autoWidth(wsGroups);
    XLSX.utils.book_append_sheet(wb, wsGroups, "Groupes");
  }

  downloadWorkbook(wb, `urls-supervision-${new Date().toISOString().slice(0, 10)}.xlsx`);
}

/* ── Export recommandations capacity ── */
export function exportRecommendationsExcel(servers, recommendations = []) {
  const wb = XLSX.utils.book_new();

  const data = recommendations.map(r => ({
    "Serveur": r.server || "—",
    "Type": r.type || "—",
    "Métrique": r.metric || "—",
    "Valeur actuelle (%)": r.current ?? "—",
    "Projection (%)": r.projected ?? "—",
    "Mois saturation": r.month || "—",
    "Recommandation": r.text || r.action || "—",
    "Priorité": r.priority || "—",
  }));

  const ws = XLSX.utils.json_to_sheet(data.length > 0 ? data : [{ "Info": "Aucune recommandation" }]);
  autoWidth(ws);
  XLSX.utils.book_append_sheet(wb, ws, "Recommandations");

  /* Feuille synthèse serveurs */
  const summary = servers.map(s => ({
    "Serveur": s.name,
    "CPU (%)": s.cpu ?? 0,
    "RAM (%)": s.ram ?? 0,
    "Disque (%)": s.disk ?? 0,
    "Cœurs": s.cores ?? "—",
    "RAM (Go)": s.ramGb ?? "—",
    "Disque (Go)": s.diskGb ?? "—",
    "Croissance (%/mois)": s.growthRate ?? "—",
  }));
  const wsSummary = XLSX.utils.json_to_sheet(summary);
  autoWidth(wsSummary);
  XLSX.utils.book_append_sheet(wb, wsSummary, "Synthèse");

  downloadWorkbook(wb, `recommandations-${new Date().toISOString().slice(0, 10)}.xlsx`);
}

/* ═══════════════════════════════════════════════════════════════
   EXPORT PDF — Rapport de supervision (impression navigateur)
   ═══════════════════════════════════════════════════════════════ */

export function exportPdfReport({ groups = [], allUrls = [], allServers = [], incidentLog = [], recommendations = [] }) {
  const win = window.open("", "_blank");
  if (!win) { alert("Autorisez les popups pour générer le rapport PDF"); return; }

  const now = new Date();
  const isUp = u => { const s = getStatus(u); return s === "online" || s === "slow"; };
  const onlineCount = allUrls.filter(isUp).length;
  const offlineCount = allUrls.filter(u => getStatus(u) === "offline").length;
  const uptimePct = allUrls.length > 0 ? Math.round((onlineCount / allUrls.length) * 100) : 0;
  const avgResp = allUrls.filter(u => u.responseTime != null);
  const avgMs = avgResp.length > 0 ? Math.round(avgResp.reduce((s, u) => s + u.responseTime, 0) / avgResp.length) : 0;

  const serverAlerts = allServers.filter(s => (s.cpu ?? 0) >= 75 || (s.ram ?? 0) >= 75 || (s.disk ?? 0) >= 75);
  const sslExpiring = allUrls.filter(u => u.sslInfo?.daysLeft != null && u.sslInfo.daysLeft <= 30);

  const html = `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="utf-8">
<title>Rapport de supervision — ${now.toLocaleDateString("fr-FR")}</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: 'Segoe UI', Arial, sans-serif; color: #1F2937; background: #fff; padding: 40px; }
  h1 { font-size: 22px; color: #6366F1; border-bottom: 2px solid #6366F1; padding-bottom: 8px; margin-bottom: 6px; }
  h2 { font-size: 16px; color: #374151; margin-top: 28px; margin-bottom: 10px; border-left: 3px solid #6366F1; padding-left: 10px; }
  h3 { font-size: 13px; color: #6B7280; margin-bottom: 4px; }
  .meta { font-size: 11px; color: #9CA3AF; margin-bottom: 24px; }
  .kpi-row { display: flex; gap: 12px; margin-bottom: 20px; }
  .kpi { flex: 1; border: 1px solid #E5E7EB; border-radius: 8px; padding: 12px; text-align: center; }
  .kpi .val { font-size: 24px; font-weight: 800; font-family: monospace; }
  .kpi .lbl { font-size: 10px; color: #6B7280; text-transform: uppercase; margin-top: 4px; }
  table { width: 100%; border-collapse: collapse; font-size: 11px; margin-bottom: 16px; }
  th { background: #F3F4F6; padding: 6px 10px; text-align: left; font-weight: 600; border-bottom: 2px solid #E5E7EB; }
  td { padding: 5px 10px; border-bottom: 1px solid #F3F4F6; }
  .ok { color: #059669; font-weight: 600; }
  .err { color: #DC2626; font-weight: 600; }
  .warn { color: #D97706; font-weight: 600; }
  .badge { display: inline-block; padding: 1px 6px; border-radius: 4px; font-size: 10px; font-weight: 600; }
  .badge-ok { background: #D1FAE5; color: #065F46; }
  .badge-err { background: #FEE2E2; color: #991B1B; }
  .badge-warn { background: #FEF3C7; color: #92400E; }
  .footer { margin-top: 40px; font-size: 10px; color: #9CA3AF; border-top: 1px solid #E5E7EB; padding-top: 10px; }
  @media print { body { padding: 20px; } .no-print { display: none; } }
</style>
</head>
<body>

<h1>Rapport de supervision G1Oeil</h1>
<div class="meta">Généré le ${now.toLocaleString("fr-FR")} · ${allUrls.length} URL(s) · ${allServers.length} serveur(s)</div>

<div class="kpi-row">
  <div class="kpi"><div class="val" style="color:${uptimePct >= 90 ? '#059669' : uptimePct >= 70 ? '#D97706' : '#DC2626'}">${uptimePct}%</div><div class="lbl">Disponibilité</div></div>
  <div class="kpi"><div class="val" style="color:#059669">${onlineCount}</div><div class="lbl">En ligne</div></div>
  <div class="kpi"><div class="val" style="color:#DC2626">${offlineCount}</div><div class="lbl">Hors ligne</div></div>
  <div class="kpi"><div class="val" style="color:#6366F1">${avgMs}ms</div><div class="lbl">Latence moy.</div></div>
  <div class="kpi"><div class="val" style="color:#DC2626">${serverAlerts.length}</div><div class="lbl">Serveurs en alerte</div></div>
  <div class="kpi"><div class="val" style="color:#D97706">${sslExpiring.length}</div><div class="lbl">SSL < 30j</div></div>
</div>

<h2>Statut des URLs</h2>
<table>
<thead><tr><th>Groupe</th><th>URL</th><th>Statut</th><th>Latence</th><th>SSL (jours)</th><th>Dernier check</th></tr></thead>
<tbody>
${allUrls.map(u => {
  const st = getStatus(u);
  const cls = st === "online" ? "ok" : st === "offline" ? "err" : st === "slow" ? "warn" : "";
  const badge = st === "online" ? "badge-ok" : st === "offline" ? "badge-err" : st === "slow" ? "badge-warn" : "";
  const group = groups.find(g => g.urls.some(gu => gu.id === u.id))?.name || "—";
  return `<tr><td>${group}</td><td>${u.url}</td><td><span class="badge ${badge}">${STATUS_CONFIG[st]?.label || st}</span></td><td class="${cls}">${u.responseTime != null ? u.responseTime + 'ms' : '—'}</td><td>${u.sslInfo?.daysLeft ?? '—'}</td><td>${u.lastCheck ? new Date(u.lastCheck).toLocaleString('fr-FR') : '—'}</td></tr>`;
}).join("")}
</tbody>
</table>

<h2>Serveurs en alerte (≥ 75%)</h2>
${serverAlerts.length > 0 ? `<table>
<thead><tr><th>Serveur</th><th>CPU (%)</th><th>RAM (%)</th><th>Disque (%)</th><th>OS</th><th>Source</th></tr></thead>
<tbody>
${serverAlerts.map(s => `<tr><td>${s.name}</td><td class="${s.cpu >= 90 ? 'err' : s.cpu >= 75 ? 'warn' : ''}">${s.cpu ?? 0}</td><td class="${s.ram >= 90 ? 'err' : s.ram >= 75 ? 'warn' : ''}">${s.ram ?? 0}</td><td class="${s.disk >= 90 ? 'err' : s.disk >= 75 ? 'warn' : ''}">${s.disk ?? 0}</td><td>${s.os || '—'}</td><td>${s.source || '—'}</td></tr>`).join("")}
</tbody>
</table>` : '<p style="font-size:12px;color:#6B7280">Aucun serveur en alerte.</p>'}

<h2>Certificats SSL expirant bientôt (≤ 30 jours)</h2>
${sslExpiring.length > 0 ? `<table>
<thead><tr><th>URL</th><th>Jours restants</th><th>Expiration</th><th>Émetteur</th></tr></thead>
<tbody>
${sslExpiring.map(u => `<tr><td>${u.url}</td><td class="${u.sslInfo.daysLeft <= 3 ? 'err' : 'warn'}">${u.sslInfo.daysLeft}</td><td>${u.sslInfo.validTo || '—'}</td><td>${u.sslInfo.issuer || '—'}</td></tr>`).join("")}
</tbody>
</table>` : '<p style="font-size:12px;color:#6B7280">Aucun certificat SSL expirant bientôt.</p>'}

${recommendations.length > 0 ? `<h2>Recommandations de capacité</h2>
<table>
<thead><tr><th>Serveur</th><th>Type</th><th>Métrique</th><th>Actuel</th><th>Projection</th><th>Recommandation</th></tr></thead>
<tbody>
${recommendations.slice(0, 20).map(r => `<tr><td>${r.server || '—'}</td><td>${r.type || '—'}</td><td>${r.metric || '—'}</td><td>${r.current ?? '—'}%</td><td>${r.projected ?? '—'}%</td><td>${r.text || r.action || '—'}</td></tr>`).join("")}
</tbody>
</table>` : ''}

<h2>Incidents récents (20 derniers)</h2>
${incidentLog.length > 0 ? `<table>
<thead><tr><th>Date</th><th>Type</th><th>URL</th><th>Détail</th></tr></thead>
<tbody>
${incidentLog.slice(0, 20).map(e => `<tr><td>${e.timestamp ? new Date(e.timestamp).toLocaleString('fr-FR') : '—'}</td><td>${e.type || '—'}</td><td>${e.url || '—'}</td><td>${e.detail || '—'}</td></tr>`).join("")}
</tbody>
</table>` : '<p style="font-size:12px;color:#6B7280">Aucun incident enregistré.</p>'}

<div class="footer">G1Oeil — Rapport généré automatiquement · ${now.toLocaleString("fr-FR")}</div>

<div class="no-print" style="margin-top:20px;text-align:center;">
  <button onclick="window.print()" style="padding:10px 24px;font-size:14px;background:#6366F1;color:#fff;border:none;border-radius:8px;cursor:pointer;">Imprimer / Exporter PDF</button>
</div>

<script>setTimeout(() => window.print(), 500);</script>
</body>
</html>`;

  win.document.write(html);
  win.document.close();
}
