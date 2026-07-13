import express from "express";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import { createServer } from "node:http";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { existsSync } from "node:fs";

import authRoutes from "./routes/auth.js";
import urlRoutes from "./routes/urls.js";
import apiRoutes from "./routes/apis.js";
import apiKeyRoutes from "./routes/apiKeys.js";
import compareRoutes from "./routes/compare.js";
import auditRoutes from "./routes/audit.js";
import schedulerRoutes from "./routes/scheduler.js";
import notificationRoutes from "./routes/notifications.js";
import serverMetricsRoutes from "./routes/serverMetrics.js";
import exportRoutes from "./routes/export.js";
import sslRoutes from "./routes/ssl.js";
import systemRoutes, { metricsMiddleware } from "./routes/system.js";
import { audit } from "./auditLog.js";
import { initScheduler } from "./scheduler.js";
import { initWebSocket, getClientsCount } from "./websocket.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 3210;

const app = express();

/* ── Security middleware ── */
app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginEmbedderPolicy: false,
  crossOriginResourcePolicy: { policy: "cross-origin" },
}));
app.use(cors({ origin: true, credentials: true }));
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true }));

/* ── Metrics middleware (timing per route) ── */
app.use(metricsMiddleware);

/* ── Rate limiting on auth login ── */
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Trop de tentatives de connexion. Réessayez dans 15 minutes." },
});

/* ── Input sanitization middleware ── */
app.use((req, res, next) => {
  if (req.body && typeof req.body === "object") {
    sanitizeObject(req.body);
  }
  if (req.query && typeof req.query === "object") {
    sanitizeObject(req.query);
  }
  next();
});

function sanitizeObject(obj) {
  for (const key in obj) {
    if (typeof obj[key] === "string") {
      obj[key] = obj[key].slice(0, 10000);
    } else if (typeof obj[key] === "object" && obj[key] !== null) {
      sanitizeObject(obj[key]);
    }
  }
}

/* ── API routes ── */
app.use("/api/auth", authRoutes);
/* Apply login rate limiter specifically */
app.use("/api/auth/login", loginLimiter);
app.use("/api/urls", urlRoutes);
app.use("/api/apis", apiRoutes);
app.use("/api/api-keys", apiKeyRoutes);
app.use("/api/compare", compareRoutes);
app.use("/api/audit", auditRoutes);
app.use("/api/scheduler", schedulerRoutes);
app.use("/api/notifications", notificationRoutes);
app.use("/api/servers", serverMetricsRoutes);
app.use("/api/export", exportRoutes);
app.use("/api/ssl", sslRoutes);
app.use("/api/system", systemRoutes);

/* ── Health check ── */
app.get("/api/health", (_req, res) => {
  res.json({
    status: "ok",
    timestamp: new Date().toISOString(),
    wsClients: getClientsCount(),
    uptime: process.uptime(),
  });
});

/* ── Admin UI (static files) ── */
const publicDir = join(__dirname, "public");
app.use(express.static(publicDir));

app.get("*", (_req, res) => {
  const index = join(publicDir, "index.html");
  if (existsSync(index)) res.sendFile(index);
  else res.status(404).send("Admin UI not found");
});

/* ── Create HTTP server and init WebSocket + Scheduler ── */
const server = createServer(app);

initWebSocket(server);
initScheduler();

server.listen(PORT, "0.0.0.0", () => {
  console.log(`\n  ┌──────────────────────────────────────┐`);
  console.log(`  │  G1Oeil Backend                      │`);
  console.log(`  │  http://localhost:${PORT}              │`);
  console.log(`  │  Admin: admin / admin123             │`);
  console.log(`  │  WebSocket: /ws                      │`);
  console.log(`  └──────────────────────────────────────┘\n`);
  audit("system", "startup", { detail: `Backend démarré sur le port ${PORT} (WS + Scheduler + Security)`, severity: "info" });
});
