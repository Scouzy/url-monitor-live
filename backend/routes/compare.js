import { Router } from "express";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { existsSync, mkdirSync } from "node:fs";
import { readFileSync, writeFileSync, unlinkSync } from "node:fs";
import db from "../db.js";
import { authMiddleware } from "../auth.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const IMAGES_DIR = join(__dirname, "..", "data", "images");
const SHOTS_DIR = join(__dirname, "..", "data", "screenshots");
mkdirSync(IMAGES_DIR, { recursive: true });
mkdirSync(SHOTS_DIR, { recursive: true });

const router = Router();
router.use(authMiddleware);

let _browser = null;
async function getBrowser() {
  if (_browser) return _browser;
  const { chromium } = await import("playwright");
  _browser = await chromium.launch({ headless: true });
  return _browser;
}

/* POST /api/compare/:urlConfigId — exécute les étapes + compare avec images de référence */
router.post("/:urlConfigId", async (req, res) => {
  const urlConfigId = parseInt(req.params.urlConfigId);
  const cfg = db.prepare("SELECT * FROM url_configs WHERE id = ?").get(urlConfigId);
  if (!cfg) return res.status(404).json({ error: "Configuration URL introuvable" });

  const steps = db.prepare("SELECT * FROM url_steps WHERE url_config_id = ? ORDER BY step_index").all(urlConfigId);
  const results = [];
  let browser;

  try {
    browser = await getBrowser();
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });

    /* Étape 1 : Accès URL */
    if (cfg.url) {
      try {
        await page.goto(cfg.url, { waitUntil: "domcontentloaded", timeout: 15000 });
        results.push({ step: 1, name: "Accès URL", ok: true, status: 200 });
      } catch (e) {
        results.push({ step: 1, name: "Accès URL", ok: false, status: "Erreur", error: e.message });
      }
    }

    /* Étape 2 : Authentification */
    if (cfg.auth_url && cfg.login && cfg.password) {
      try {
        await page.goto(cfg.auth_url, { waitUntil: "domcontentloaded", timeout: 15000 });
        const lf = cfg.login_field || "input[name='username'], input[type='text']";
        const pf = cfg.password_field || "input[name='password'], input[type='password']";
        await page.fill(lf, cfg.login).catch(() => {});
        await page.fill(pf, cfg.password).catch(() => {});
        await page.click("button[type='submit'], input[type='submit']").catch(() => {});
        await page.waitForLoadState("networkidle", { timeout: 15000 }).catch(() => {});
        const ok = !page.url().includes("login");
        results.push({ step: 2, name: "Authentification", ok, status: ok ? 200 : 401 });
      } catch (e) {
        results.push({ step: 2, name: "Authentification", ok: false, status: "Erreur", error: e.message });
      }
    }

    /* Étape 3 : Page d'accueil */
    if (cfg.home_url) {
      try {
        await page.goto(cfg.home_url, { waitUntil: "domcontentloaded", timeout: 15000 });
        results.push({ step: 3, name: "Page d'accueil", ok: true, status: 200 });
      } catch (e) {
        results.push({ step: 3, name: "Page d'accueil", ok: false, status: "Erreur", error: e.message });
      }
    }

    /* Étape 4 : Accès onglet */
    if (cfg.tab_url) {
      try {
        await page.goto(cfg.tab_url, { waitUntil: "domcontentloaded", timeout: 15000 });
        results.push({ step: 4, name: "Accès onglet", ok: true, status: 200 });
      } catch (e) {
        results.push({ step: 4, name: "Accès onglet", ok: false, status: "Erreur", error: e.message });
      }
    }

    /* Comparaison d'images pour chaque étape configurée */
    const { PNG } = await import("pngjs");
    const pixelmatch = (await import("pixelmatch")).default;

    for (const step of steps) {
      if (!step.reference_image) continue;

      const stepResult = results.find(r => r.step === step.step_index);
      if (!stepResult || !stepResult.ok) continue;

      /* Prendre un screenshot à l'URL correspondante */
      const stepUrl = step.step_index === 1 ? cfg.url
        : step.step_index === 3 ? cfg.home_url
        : step.step_index === 4 ? cfg.tab_url
        : cfg.url;

      if (stepUrl) {
        try {
          await page.goto(stepUrl, { waitUntil: "domcontentloaded", timeout: 15000 });
        } catch {}
      }

      const shotPath = join(SHOTS_DIR, `live_${urlConfigId}_${step.step_index}_${Date.now()}.png`);
      await page.screenshot({ path: shotPath, fullPage: false });

      const refPath = join(IMAGES_DIR, step.reference_image);
      if (!existsSync(refPath)) {
        stepResult.diff = { error: "Image de référence manquante" };
        continue;
      }

      try {
        const imgA = PNG.sync.read(readFileSync(refPath));
        const imgB = PNG.sync.read(readFileSync(shotPath));
        const { width, height } = imgA;
        const diff = new PNG({ width, height });
        const diffPixels = pixelmatch(imgA.data, imgB.data, diff.data, width, height, {
          threshold: step.threshold || 0.1,
        });
        const totalPixels = width * height;
        const diffPercent = (diffPixels / totalPixels) * 100;

        let diffPath = null;
        if (diffPixels > 0) {
          diffPath = join(SHOTS_DIR, `diff_${urlConfigId}_${step.step_index}_${Date.now()}.png`);
          writeFileSync(diffPath, PNG.sync.write(diff));
        }

        stepResult.diff = {
          diffPercent: Math.round(diffPercent * 100) / 100,
          diffPixels,
          totalPixels,
          changed: diffPercent > (step.threshold || 0.1) * 100,
          diffImageUrl: diffPath ? `/api/compare/diff/${basename(diffPath)}` : null,
          liveImageUrl: `/api/compare/live/${basename(shotPath)}`,
        };

        if (stepResult.diff.changed) {
          stepResult.error_code = 622;
          stepResult.ok = false;
          stepResult.status = 622;
        }

        /* Log en base */
        db.prepare(`INSERT INTO check_logs (url_config_id, step_index, status, error_code, diff_percent, screenshot_path)
          VALUES (?, ?, ?, ?, ?, ?)`)
          .run(urlConfigId, step.step_index, stepResult.status, stepResult.error_code || null,
               stepResult.diff.diffPercent, basename(shotPath));
      } catch (e) {
        stepResult.diff = { error: `Comparaison: ${e.message}` };
      }

      /* Nettoyer screenshot live (garder seulement si diff) */
      if (!stepResult.diff?.changed) {
        try { unlinkSync(shotPath); } catch {}
      }
    }

    await page.close().catch(() => {});

    const allOk = results.every(r => r.ok);
    res.json({ ok: allOk, results, error_code: allOk ? null : 622 });
  } catch (e) {
    res.status(500).json({ error: e.message, ok: false, results });
  } finally {
    if (browser) { /* ne pas fermer le browser, il est réutilisé */ }
  }
});

/* GET /api/compare/diff/:filename — servir image diff */
router.get("/diff/:filename", (req, res) => {
  const fp = join(SHOTS_DIR, req.params.filename);
  if (!existsSync(fp)) return res.status(404).json({ error: "Image introuvable" });
  res.sendFile(fp);
});

/* GET /api/compare/live/:filename — servir screenshot live */
router.get("/live/:filename", (req, res) => {
  const fp = join(SHOTS_DIR, req.params.filename);
  if (!existsSync(fp)) return res.status(404).json({ error: "Image introuvable" });
  res.sendFile(fp);
});

/* GET /api/compare/logs/:urlConfigId — historique des checks */
router.get("/logs/:urlConfigId", (req, res) => {
  const urlConfigId = parseInt(req.params.urlConfigId);
  const logs = db.prepare("SELECT * FROM check_logs WHERE url_config_id = ? ORDER BY checked_at DESC LIMIT 50").all(urlConfigId);
  res.json(logs);
});

function basename(fp) {
  return fp.split(/[/\\]/).pop();
}

export default router;
