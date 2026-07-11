import jwt from "jsonwebtoken";
import db from "./db.js";

const SECRET = process.env.JWT_SECRET || "g1oeil-secret-change-in-production";
const TOKEN_EXPIRY = "7d";

export function signToken(user) {
  return jwt.sign(
    { id: user.id, username: user.username, role: user.role },
    SECRET,
    { expiresIn: TOKEN_EXPIRY }
  );
}

export function authMiddleware(req, res, next) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Token manquant" });
  }
  const token = header.slice(7);
  try {
    const decoded = jwt.verify(token, SECRET);
    const user = db.prepare("SELECT id, username, email, role FROM users WHERE id = ?").get(decoded.id);
    if (!user) return res.status(401).json({ error: "Utilisateur introuvable" });
    req.user = user;
    next();
  } catch {
    return res.status(401).json({ error: "Token invalide" });
  }
}

export { SECRET };
