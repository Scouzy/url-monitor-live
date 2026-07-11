import express from "express";
import cors from "cors";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { existsSync } from "node:fs";

import authRoutes from "./routes/auth.js";
import urlRoutes from "./routes/urls.js";
import apiRoutes from "./routes/apis.js";
import compareRoutes from "./routes/compare.js";
import auditRoutes from "./routes/audit.js";
import { audit } from "./auditLog.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 3210;

const app = express();

app.use(cors({ origin: true, credentials: true }));
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true }));

/* ── API routes ── */
app.use("/api/auth", authRoutes);
app.use("/api/urls", urlRoutes);
app.use("/api/apis", apiRoutes);
app.use("/api/compare", compareRoutes);
app.use("/api/audit", auditRoutes);

/* ── Health check ── */
app.get("/api/health", (_req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

/* ── Admin UI (static files) ── */
const publicDir = join(__dirname, "public");
app.use(express.static(publicDir));

app.get("*", (_req, res) => {
  const index = join(publicDir, "index.html");
  if (existsSync(index)) res.sendFile(index);
  else res.status(404).send("Admin UI not found");
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`\n  ┌──────────────────────────────────────┐`);
  console.log(`  │  G1Oeil Backend                      │`);
  console.log(`  │  http://localhost:${PORT}              │`);
  console.log(`  │  Admin: admin / admin123             │`);
  console.log(`  └──────────────────────────────────────┘\n`);
  audit("system", "startup", { detail: `Backend démarré sur le port ${PORT}`, severity: "info" });
});
