import { WebSocketServer } from "ws";
import { audit } from "./auditLog.js";

let wss = null;
const clients = new Set();

/* ── Initialize WebSocket server ── */
export function initWebSocket(server) {
  wss = new WebSocketServer({ server, path: "/ws" });

  wss.on("connection", (ws, req) => {
    clients.add(ws);
    const ip = req.socket.remoteAddress;
    console.log(`[WS] Client connecté (${ip}) — total: ${clients.size}`);

    ws.on("message", (data) => {
      try {
        const msg = JSON.parse(data.toString());
        /* Handle subscription messages */
        if (msg.type === "subscribe") {
          ws.subscriptions = msg.channels || ["all"];
        }
      } catch {}
    });

    ws.on("close", () => {
      clients.delete(ws);
      console.log(`[WS] Client déconnecté — total: ${clients.size}`);
    });

    ws.on("error", () => {
      clients.delete(ws);
    });

    /* Send initial connection message */
    ws.send(JSON.stringify({ type: "connected", timestamp: new Date().toISOString() }));
  });

  console.log("[WS] Serveur WebSocket initialisé sur /ws");
  audit("system", "ws_init", { detail: "WebSocket server started", severity: "info" });
}

/* ── Broadcast to all connected clients ── */
export function broadcast(type, data) {
  if (!wss || clients.size === 0) return;
  const message = JSON.stringify({ type, data, timestamp: new Date().toISOString() });
  for (const ws of clients) {
    if (ws.readyState === 1) { /* OPEN */
      try {
        ws.send(message);
      } catch {
        clients.delete(ws);
      }
    }
  }
}

/* ── Broadcast check result ── */
export function broadcastCheckResult(result) {
  broadcast("check_result", result);
}

/* ── Broadcast status change ── */
export function broadcastStatusChange(data) {
  broadcast("status_change", data);
}

/* ── Broadcast alert ── */
export function broadcastAlert(data) {
  broadcast("alert", data);
}

/* ── Get connected clients count ── */
export function getClientsCount() {
  return clients.size;
}
