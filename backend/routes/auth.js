import { Router } from "express";
import bcrypt from "bcryptjs";
import db from "../db.js";
import { signToken, authMiddleware } from "../auth.js";
import { audit } from "../auditLog.js";

const router = Router();

/* POST /api/auth/register — superadmin only (existing) */
router.post("/register", authMiddleware, (req, res) => {
  if (req.user.role !== "superadmin") {
    return res.status(403).json({ error: "Seul un superadmin peut créer des comptes" });
  }
  const { username, email, password, role } = req.body;
  if (!username || !email || !password) {
    return res.status(400).json({ error: "Champs manquants" });
  }
  const existing = db.prepare("SELECT id FROM users WHERE username = ? OR email = ?").get(username, email);
  if (existing) return res.status(409).json({ error: "Utilisateur ou email déjà existant" });
  const hash = bcrypt.hashSync(password, 10);
  const info = db.prepare("INSERT INTO users (username, email, password_hash, role, status) VALUES (?, ?, ?, ?, 'approved')")
    .run(username, email, hash, role || "admin");
  const user = db.prepare("SELECT id, username, email, role, status, created_at FROM users WHERE id = ?").get(info.lastInsertRowid);
  audit("user", "create", { username: req.user.username, detail: `Compte créé: ${username} (${role || "admin"})`, severity: "info" });
  res.status(201).json(user);
});

/* POST /api/auth/register-public — public registration with pending status */
router.post("/register-public", (req, res) => {
  const { username, email, password } = req.body;
  if (!username || !email || !password) {
    return res.status(400).json({ error: "Champs manquants" });
  }
  if (password.length < 6) {
    return res.status(400).json({ error: "Le mot de passe doit faire au moins 6 caractères" });
  }
  const existing = db.prepare("SELECT id FROM users WHERE username = ? OR email = ?").get(username, email);
  if (existing) return res.status(409).json({ error: "Utilisateur ou email déjà existant" });
  const hash = bcrypt.hashSync(password, 10);
  const info = db.prepare("INSERT INTO users (username, email, password_hash, role, status) VALUES (?, ?, ?, 'admin', 'pending')")
    .run(username, email, hash);
  audit("user", "register_pending", { detail: `Nouvelle inscription: ${username} (${email}) — en attente de validation`, severity: "warning" });
  res.status(201).json({ ok: true, message: "Compte créé. En attente de validation par un superadmin." });
});

/* GET /api/auth/pending — list pending users (superadmin only) */
router.get("/pending", authMiddleware, (req, res) => {
  if (req.user.role !== "superadmin") return res.status(403).json({ error: "Accès refusé" });
  const users = db.prepare("SELECT id, username, email, role, status, created_at FROM users WHERE status = 'pending' ORDER BY created_at DESC").all();
  res.json(users);
});

/* PUT /api/auth/users/:id/approve — approve pending user (superadmin only) */
router.put("/users/:id/approve", authMiddleware, (req, res) => {
  if (req.user.role !== "superadmin") return res.status(403).json({ error: "Accès refusé" });
  const id = parseInt(req.params.id);
  const info = db.prepare("UPDATE users SET status = 'approved' WHERE id = ? AND status = 'pending'").run(id);
  if (info.changes === 0) return res.status(404).json({ error: "Utilisateur introuvable ou déjà validé" });
  const user = db.prepare("SELECT id, username, email, role, status, created_at FROM users WHERE id = ?").get(id);
  audit("user", "approve", { username: req.user.username, detail: `Compte approuvé: ${user.username}`, severity: "info" });
  res.json(user);
});

/* PUT /api/auth/users/:id/reject — reject pending user (superadmin only) */
router.put("/users/:id/reject", authMiddleware, (req, res) => {
  if (req.user.role !== "superadmin") return res.status(403).json({ error: "Accès refusé" });
  const id = parseInt(req.params.id);
  const user = db.prepare("SELECT username FROM users WHERE id = ? AND status = 'pending'").get(id);
  if (!user) return res.status(404).json({ error: "Utilisateur introuvable ou déjà validé" });
  db.prepare("DELETE FROM users WHERE id = ?").run(id);
  audit("user", "reject", { username: req.user.username, detail: `Compte rejeté: ${user.username}`, severity: "warning" });
  res.json({ ok: true });
});

/* POST /api/auth/login */
router.post("/login", (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) return res.status(400).json({ error: "Champs manquants" });
  const user = db.prepare("SELECT * FROM users WHERE username = ?").get(username);
  if (!user || !bcrypt.compareSync(password, user.password_hash)) {
    audit("auth", "login_failed", { detail: `Tentative échouée: ${username}`, severity: "warning" });
    return res.status(401).json({ error: "Identifiants invalides" });
  }
  if (user.status === "pending") {
    return res.status(403).json({ error: "Votre compte est en attente de validation par un superadmin" });
  }
  db.prepare("UPDATE users SET last_login = datetime('now') WHERE id = ?").run(user.id);
  const token = signToken(user);
  audit("auth", "login", { username: user.username, detail: `Connexion réussie (${user.role})`, severity: "info" });
  res.json({ token, user: { id: user.id, username: user.username, email: user.email, role: user.role } });
});

/* GET /api/auth/me */
router.get("/me", authMiddleware, (req, res) => {
  res.json(req.user);
});

/* POST /api/auth/logout */
router.post("/logout", authMiddleware, (req, res) => {
  audit("auth", "logout", { username: req.user.username, detail: "Déconnexion", severity: "info" });
  res.json({ ok: true });
});

/* POST /api/auth/heartbeat — ping du frontend pour tracer la synchro */
router.post("/heartbeat", authMiddleware, (req, res) => {
  const { urlsCount, serversCount, lastSync } = req.body || {};
  audit("sync", "heartbeat", {
    username: req.user.username,
    detail: `Frontend actif — ${urlsCount || 0} URL(s), ${serversCount || 0} serveur(s)`,
    severity: "info",
    source: "frontend",
  });
  res.json({ ok: true, serverTime: new Date().toISOString() });
});

/* GET /api/auth/users — liste (superadmin only) */
router.get("/users", authMiddleware, (req, res) => {
  if (req.user.role !== "superadmin") return res.status(403).json({ error: "Accès refusé" });
  const users = db.prepare("SELECT id, username, email, role, status, created_at, last_login FROM users ORDER BY id").all();
  res.json(users);
});

/* DELETE /api/auth/users/:id */
router.delete("/users/:id", authMiddleware, (req, res) => {
  if (req.user.role !== "superadmin") return res.status(403).json({ error: "Accès refusé" });
  const id = parseInt(req.params.id);
  if (id === req.user.id) return res.status(400).json({ error: "Impossible de supprimer votre propre compte" });
  const info = db.prepare("DELETE FROM users WHERE id = ?").run(id);
  if (info.changes === 0) return res.status(404).json({ error: "Utilisateur introuvable" });
  audit("user", "delete", { username: req.user.username, detail: `Utilisateur #${id} supprimé`, severity: "warning" });
  res.json({ ok: true });
});

/* PUT /api/auth/users/:id — modifier rôle ou mot de passe */
router.put("/users/:id", authMiddleware, (req, res) => {
  if (req.user.role !== "superadmin") return res.status(403).json({ error: "Accès refusé" });
  const id = parseInt(req.params.id);
  const { role, password } = req.body;
  if (password) {
    const hash = bcrypt.hashSync(password, 10);
    db.prepare("UPDATE users SET password_hash = ? WHERE id = ?").run(hash, id);
  }
  if (role) {
    db.prepare("UPDATE users SET role = ? WHERE id = ?").run(role, id);
  }
  const user = db.prepare("SELECT id, username, email, role, created_at, last_login FROM users WHERE id = ?").get(id);
  audit("user", "update", { username: req.user.username, detail: `Utilisateur #${id} modifié${role ? ` (rôle: ${role})` : ""}${password ? " (+ mot de passe)" : ""}`, severity: "info" });
  res.json(user);
});

export default router;
