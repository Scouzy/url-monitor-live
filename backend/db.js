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
    status TEXT NOT NULL DEFAULT 'approved',
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

  CREATE TABLE IF NOT EXISTS api_keys (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    key_prefix TEXT NOT NULL,
    key_hash TEXT NOT NULL UNIQUE,
    app_name TEXT NOT NULL,
    description TEXT,
    permissions TEXT NOT NULL DEFAULT 'read',
    is_active INTEGER NOT NULL DEFAULT 1,
    created_by TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    last_used TEXT
  );

  CREATE TABLE IF NOT EXISTS check_schedule (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    url_config_id INTEGER NOT NULL,
    interval_seconds INTEGER NOT NULL DEFAULT 300,
    enabled INTEGER NOT NULL DEFAULT 1,
    last_check_at TEXT,
    last_status TEXT,
    last_response_time INTEGER,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (url_config_id) REFERENCES url_configs(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS notification_channels (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    type TEXT NOT NULL DEFAULT 'webhook',
    config TEXT NOT NULL,
    enabled INTEGER NOT NULL DEFAULT 1,
    triggers TEXT NOT NULL DEFAULT 'status_change,check_fail',
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS server_metrics (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    server_name TEXT NOT NULL,
    cpu REAL,
    ram REAL,
    disk REAL,
    ram_gb REAL,
    disk_gb REAL,
    cores INTEGER,
    ts TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE INDEX IF NOT EXISTS idx_server_metrics_name_ts ON server_metrics(server_name, ts DESC);

  CREATE TABLE IF NOT EXISTS server_snapshots (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    server_name TEXT NOT NULL,
    cores INTEGER,
    ram_gb REAL,
    disk_gb REAL,
    cpu REAL,
    ram REAL,
    disk REAL,
    ts TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE INDEX IF NOT EXISTS idx_server_snapshots_name_ts ON server_snapshots(server_name, ts DESC);

  CREATE TABLE IF NOT EXISTS ssl_certificates (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    url TEXT NOT NULL UNIQUE,
    issuer TEXT,
    subject TEXT,
    valid_from TEXT,
    expiry_date TEXT,
    days_left INTEGER,
    last_checked TEXT NOT NULL DEFAULT (datetime('now')),
    status TEXT DEFAULT 'unknown'
  );

  CREATE INDEX IF NOT EXISTS idx_ssl_expiry ON ssl_certificates(expiry_date);

  CREATE TABLE IF NOT EXISTS check_results (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    url_config_id INTEGER,
    url TEXT NOT NULL,
    status TEXT NOT NULL,
    response_time INTEGER,
    error_code INTEGER,
    error_message TEXT,
    checked_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (url_config_id) REFERENCES url_configs(id) ON DELETE SET NULL
  );

  CREATE INDEX IF NOT EXISTS idx_check_results_url ON check_results(url, checked_at DESC);
  CREATE INDEX IF NOT EXISTS idx_check_results_checked ON check_results(checked_at DESC);
`);

/* ── Migration: add status column if missing ── */
try {
  db.prepare("SELECT status FROM users LIMIT 1").get();
} catch {
  db.exec("ALTER TABLE users ADD COLUMN status TEXT NOT NULL DEFAULT 'approved'");
  console.log("[DB] Migration: added 'status' column to users table");
}

/* ── Migration: add retention_days to server_metrics (configurable) ── */
try {
  db.prepare("SELECT retention_days FROM check_schedule LIMIT 1").get();
} catch {
  db.exec("ALTER TABLE check_schedule ADD COLUMN retention_days INTEGER DEFAULT 90");
}

/* ── Seed admin par défaut ── */
const adminExists = db.prepare("SELECT COUNT(*) as c FROM users WHERE username = 'admin'").get();
if (adminExists.c === 0) {
  const hash = bcrypt.hashSync("admin123", 10);
  db.prepare("INSERT INTO users (username, email, password_hash, role) VALUES (?, ?, ?, ?)")
    .run("admin", "admin@g1oeil.local", hash, "superadmin");
  console.log("[DB] Admin par défaut créé: admin / admin123");
}

export default db;
