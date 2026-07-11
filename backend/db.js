import Database from "better-sqlite3";
import bcrypt from "bcryptjs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { mkdirSync } from "node:fs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DB_PATH = join(__dirname, "data", "g1oeil.db");

mkdirSync(join(__dirname, "data"), { recursive: true });
mkdirSync(join(__dirname, "data", "images"), { recursive: true });

const db = new Database(DB_PATH);
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

/* ── Migrations ── */
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'admin',
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    last_login TEXT
  );

  CREATE TABLE IF NOT EXISTS url_configs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    url TEXT NOT NULL,
    name TEXT,
    mode TEXT NOT NULL DEFAULT 'simple',
    auth_url TEXT,
    login_field TEXT DEFAULT 'username',
    password_field TEXT DEFAULT 'password',
    login TEXT,
    password TEXT,
    home_url TEXT,
    tab_url TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS url_steps (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    url_config_id INTEGER NOT NULL,
    step_index INTEGER NOT NULL,
    step_name TEXT NOT NULL,
    reference_image TEXT,
    threshold REAL DEFAULT 0.1,
    FOREIGN KEY (url_config_id) REFERENCES url_configs(id) ON DELETE CASCADE,
    UNIQUE (url_config_id, step_index)
  );

  CREATE TABLE IF NOT EXISTS api_configs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    base_url TEXT NOT NULL,
    auth_type TEXT DEFAULT 'bearer',
    token_url TEXT,
    client_id TEXT,
    client_secret TEXT,
    username TEXT,
    password TEXT,
    api_key TEXT,
    headers TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS check_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    url_config_id INTEGER,
    step_index INTEGER,
    status TEXT,
    response_time INTEGER,
    error_code INTEGER,
    diff_percent REAL,
    screenshot_path TEXT,
    checked_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (url_config_id) REFERENCES url_configs(id) ON DELETE SET NULL
  );

  CREATE TABLE IF NOT EXISTS audit_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    category TEXT NOT NULL,
    action TEXT NOT NULL,
    username TEXT,
    detail TEXT,
    severity TEXT NOT NULL DEFAULT 'info',
    source TEXT DEFAULT 'backend',
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE INDEX IF NOT EXISTS idx_audit_category ON audit_logs(category);
  CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_logs(created_at DESC);
`);

/* ── Seed admin par défaut ── */
const adminExists = db.prepare("SELECT COUNT(*) as c FROM users WHERE username = 'admin'").get();
if (adminExists.c === 0) {
  const hash = bcrypt.hashSync("admin123", 10);
  db.prepare("INSERT INTO users (username, email, password_hash, role) VALUES (?, ?, ?, ?)")
    .run("admin", "admin@g1oeil.local", hash, "superadmin");
  console.log("[DB] Admin par défaut créé: admin / admin123");
}

export default db;
