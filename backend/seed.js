import db from "./db.js";

/* ── Seed: APIs existantes de l'application ── */
const apis = [
  {
    name: "ITCare",
    base_url: "https://api.cegedim.cloud/itcare/compute/instances",
    auth_type: "oauth2",
    token_url: "https://accounts.cegedim.cloud/auth/realms/cloud/protocol/openid-connect/token",
    client_id: "",
    client_secret: "",
    username: "",
    password: "",
    api_key: "",
    headers: {},
  },
  {
    name: "Google Favicons",
    base_url: "https://www.google.com/s2/favicons",
    auth_type: "none",
    token_url: null,
    client_id: "",
    client_secret: "",
    username: "",
    password: "",
    api_key: "",
    headers: {},
  },
  {
    name: "Microlink Screenshot",
    base_url: "https://api.microlink.io",
    auth_type: "none",
    token_url: null,
    client_id: "",
    client_secret: "",
    username: "",
    password: "",
    api_key: "",
    headers: {},
  },
  {
    name: "PagePeeker Screenshot",
    base_url: "https://free.pagepeeker.com/v2/thumbs.php",
    auth_type: "none",
    token_url: null,
    client_id: "",
    client_secret: "",
    username: "",
    password: "",
    api_key: "",
    headers: {},
  },
  {
    name: "DuckDuckGo Icons",
    base_url: "https://icons.duckduckgo.com/ip3",
    auth_type: "none",
    token_url: null,
    client_id: "",
    client_secret: "",
    username: "",
    password: "",
    api_key: "",
    headers: {},
  },
];

const existingApis = db.prepare("SELECT COUNT(*) as c FROM api_configs").get();
if (existingApis.c === 0) {
  for (const a of apis) {
    db.prepare(`INSERT INTO api_configs (name, base_url, auth_type, token_url, client_id, client_secret, username, password, api_key, headers)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .run(a.name, a.base_url, a.auth_type, a.token_url, a.client_id, a.client_secret,
           a.username, a.password, a.api_key, a.headers ? JSON.stringify(a.headers) : null);
  }
  console.log(`[Seed] ${apis.length} APIs importées`);
}

/* ── Import des URLs depuis le frontend (localStorage) ── */
/* Le frontend stocke les URLs dans localStorage sous la clé "url-monitor-groups" */
/* On expose un endpoint pour les importer, mais on peut aussi les charger depuis un fichier */
import { readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const importFile = join(__dirname, "data", "frontend-urls.json");

if (existsSync(importFile)) {
  try {
    const data = JSON.parse(readFileSync(importFile, "utf-8"));
    const groups = Array.isArray(data) ? data : [];
    let imported = 0;
    for (const g of groups) {
      for (const u of (g.urls || [])) {
        const existing = db.prepare("SELECT id FROM url_configs WHERE url = ?").get(u.url);
        if (existing) continue;
        const mon = u.monitoring || {};
        db.prepare(`INSERT INTO url_configs (url, name, mode, auth_url, login_field, password_field, login, password, home_url, tab_url)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
          .run(
            u.url,
            g.name || null,
            mon.mode || "simple",
            mon.authUrl || null,
            mon.loginField || "username",
            mon.passwordField || "password",
            mon.login || null,
            mon.password || null,
            mon.homeUrl || null,
            mon.tabUrl || null,
          );
        imported++;
      }
    }
    if (imported > 0) console.log(`[Seed] ${imported} URLs importées depuis le frontend`);
  } catch (e) {
    console.warn("[Seed] Erreur import URLs frontend:", e.message);
  }
}

console.log("[Seed] Terminé");
