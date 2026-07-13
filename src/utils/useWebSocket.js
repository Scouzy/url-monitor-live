/* ═══════════════════════════════════════════════════════════════
   useWebSocket.js — Hook React pour connexion WebSocket backend
   ═══════════════════════════════════════════════════════════════ */

import { useEffect, useRef, useState, useCallback } from "react";
import { BACKEND_URL, isLoggedIn } from "./backendAuth";

export function useWebSocket(onMessage) {
  const [connected, setConnected] = useState(false);
  const wsRef = useRef(null);
  const reconnectTimer = useRef(null);
  const onMessageRef = useRef(onMessage);
  onMessageRef.current = onMessage;

  const connect = useCallback(() => {
    if (!isLoggedIn()) return;
    if (wsRef.current && wsRef.current.readyState <= 1) return;

    const wsUrl = BACKEND_URL.replace("http", "ws") + "/ws";
    try {
      wsRef.current = new WebSocket(wsUrl);

      wsRef.current.onopen = () => {
        setConnected(true);
        console.log("[WS] Connecté au backend");
      };

      wsRef.current.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          onMessageRef.current?.(msg);
        } catch {}
      };

      wsRef.current.onclose = () => {
        setConnected(false);
        console.log("[WS] Déconnecté, reconnexion dans 5s...");
        reconnectTimer.current = setTimeout(connect, 5000);
      };

      wsRef.current.onerror = () => {
        wsRef.current?.close();
      };
    } catch (err) {
      console.error("[WS] Erreur connexion:", err.message);
      reconnectTimer.current = setTimeout(connect, 5000);
    }
  }, []);

  useEffect(() => {
    connect();
    return () => {
      if (reconnectTimer.current) clearTimeout(reconnectTimer.current);
      if (wsRef.current) {
        wsRef.current.onclose = null;
        wsRef.current.close();
      }
    };
  }, [connect]);

  const send = useCallback((type, data) => {
    if (wsRef.current?.readyState === 1) {
      wsRef.current.send(JSON.stringify({ type, ...data }));
    }
  }, []);

  return { connected, send };
}
