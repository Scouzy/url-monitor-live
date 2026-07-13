import cron from "node-cron";
import db from "./db.js";
import { audit } from "./auditLog.js";
import { notifyChannels } from "./routes/notifications.js";
import { readdirSync, unlinkSync, statSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

/* ── Check URL simple (HTTP HEAD/GET) ── */
async function checkUrl(urlStr) {
  const start = Date.now();
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);
    const response = await fetch(urlStr, {
      method: "GET",
      signal: controller.signal,
      redirect: "follow",
      headers: { "User-Agent": "G1Oeil-Monitor/1.0" },
    });
    clearTimeout(timeout);
    const responseTime = Date.now() - start;
    return {
      status: response.ok ? "online" : "error",
      statusCode: response.status,
      responseTime,
    };
  } catch (err) {
    return {
      status: "offline",
      statusCode: 0,
      responseTime: Date.now() - start,
      error: err.message,
    };
  }
}

/* ── Run scheduled checks ── */
async function runScheduledChecks() {
  const schedules = db.prepare("SELECT * FROM check_schedule WHERE enabled = 1").all();
  if (schedules.length === 0) return;

  for (const sched of schedules) {
    const urlConfig = db.prepare("SELECT * FROM url_configs WHERE id = ?").get(sched.url_config_id);
    if (!urlConfig) continue;

    const lastCheckTs = sched.last_check_at ? new Date(sched.last_check_at).getTime() : 0;
    const elapsed = (Date.now() - lastCheckTs) / 1000;
    if (elapsed < sched.interval_seconds) continue;

    const result = await checkUrl(urlConfig.url);
    const prevStatus = sched.last_status;
    const statusChanged = prevStatus && prevStatus !== result.status;

    /* Store result */
    db.prepare(`INSERT INTO check_results (url_config_id, url, status, response_time, error_code, error_message) VALUES (?, ?, ?, ?, ?, ?)`)
      .run(sched.url_config_id, urlConfig.url, result.status, result.responseTime, result.statusCode || null, result.error || null);

    /* Update schedule */
    db.prepare(`UPDATE check_schedule SET last_check_at = datetime('now'), last_status = ?, last_response_time = ?, updated_at = datetime('now') WHERE id = ?`)
      .run(result.status, result.responseTime, sched.id);

    /* Notify on status change or failure */
    if (statusChanged || result.status === "offline") {
      const eventType = statusChanged ? "status_change" : "check_fail";
      await notifyChannels(eventType, {
        url: urlConfig.url,
        name: urlConfig.name,
        prevStatus,
        newStatus: result.status,
        responseTime: result.responseTime,
        error: result.error,
      });
      audit("check", "scheduled_alert", {
        detail: `${urlConfig.url}: ${prevStatus || "—"} → ${result.status} (${result.responseTime}ms)`,
        severity: result.status === "offline" ? "error" : "warning",
      });
    }
  }
}

/* ── Cleanup old check results (retention) ── */
function cleanupOldResults() {
  const retentionDays = 90;
  const deleted = db.prepare(`DELETE FROM check_results WHERE checked_at < datetime('now', ?)`).run(`-${retentionDays} days`);
  if (deleted.changes > 0) {
    console.log(`[Scheduler] Nettoyage: ${deleted.changes} anciens résultats supprimés (>${retentionDays}j)`);
  }
}

/* ── Cleanup old server metrics ── */
function cleanupOldMetrics() {
  const deleted = db.prepare(`DELETE FROM server_metrics WHERE ts < datetime('now', '-90 days')`).run();
  if (deleted.changes > 0) {
    console.log(`[Scheduler] Nettoyage: ${deleted.changes} anciennes métriques supprimées (>90j)`);
  }
}

/* ── SSL certificate check ── */
async function checkSslCert(urlStr) {
  try {
    const u = new URL(urlStr);
    if (u.protocol !== "https:") return null;
    const response = await fetch(urlStr, { method: "HEAD", signal: AbortSignal.timeout(10000) });
    const certInfo = {
      url: urlStr,
      last_checked: new Date().toISOString(),
      status: response.ok ? "valid" : "warning",
    };
    /* Try to extract expiry from headers (not always available) */
    return certInfo;
  } catch {
    return { url: urlStr, last_checked: new Date().toISOString(), status: "error" };
  }
}

async function runSslChecks() {
  const urls = db.prepare("SELECT DISTINCT url FROM url_configs WHERE url LIKE 'https%'").all();
  for (const { url } of urls) {
    const info = await checkSslCert(url);
    if (info) {
      db.prepare(`INSERT INTO ssl_certificates (url, last_checked, status) VALUES (?, ?, ?)
        ON CONFLICT(url) DO UPDATE SET last_checked = datetime('now'), status = ?`)
        .run(url, info.last_checked, info.status, info.status);
    }
  }
  console.log(`[Scheduler] SSL check: ${urls.length} URL(s) vérifiées`);
}

/* ── Daily server snapshot ── */
function runDailySnapshot() {
  const latestMetrics = db.prepare(`
    SELECT server_name, cpu, ram, disk, ram_gb, disk_gb, cores
    FROM server_metrics
    WHERE id IN (SELECT MAX(id) FROM server_metrics GROUP BY server_name)
  `).all();

  for (const m of latestMetrics) {
    db.prepare(`INSERT INTO server_snapshots (server_name, cores, ram_gb, disk_gb, cpu, ram, disk) VALUES (?, ?, ?, ?, ?, ?, ?)`)
      .run(m.server_name, m.cores, m.ram_gb, m.disk_gb, m.cpu, m.ram, m.disk);
  }
  if (latestMetrics.length > 0) {
    console.log(`[Scheduler] Snapshot quotidien: ${latestMetrics.length} serveur(s) enregistré(s)`);
    audit("system", "daily_snapshot", { detail: `${latestMetrics.length} serveur(s) snapshotés`, severity: "info" });
  }
}

/* ── Backup rotation ── */
function rotateBackups() {
  const backupDir = join(__dirname, "data", "backups");
  try {
    mkdirSync(backupDir, { recursive: true });
    const files = readdirSync(backupDir).filter(f => f.endsWith(".db"));
    const cutoff = Date.now() - 7 * 86400000;
    for (const f of files) {
      const fp = join(backupDir, f);
      if (statSync(fp).mtimeMs < cutoff) {
        unlinkSync(fp);
        console.log(`[Scheduler] Backup supprimé: ${f}`);
      }
    }
  } catch { /* dir doesn't exist yet */ }
}

/* ── Initialize all cron jobs ── */
export function initScheduler() {
  /* Check URLs every minute */
  cron.schedule("* * * * *", () => {
    runScheduledChecks().catch(err => console.error("[Scheduler] Erreur checks:", err.message));
  });

  /* Cleanup old data daily at 3am */
  cron.schedule("0 3 * * *", () => {
    cleanupOldResults();
    cleanupOldMetrics();
  });

  /* SSL checks daily at 6am */
  cron.schedule("0 6 * * *", () => {
    runSslChecks().catch(err => console.error("[Scheduler] Erreur SSL:", err.message));
  });

  /* Daily server snapshot at 1am */
  cron.schedule("0 1 * * *", () => {
    runDailySnapshot();
  });

  /* Backup rotation daily at 4am */
  cron.schedule("0 4 * * *", () => {
    rotateBackups();
  });

  console.log("[Scheduler] Tâches cron initialisées (checks 1min, cleanup 3h, SSL 6h, snapshot 1h, backup-rotation 4h)");
  audit("system", "scheduler_init", { detail: "Scheduler démarré avec 5 tâches cron", severity: "info" });
}
