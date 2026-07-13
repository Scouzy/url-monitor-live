import { useState, useEffect, useRef } from "react";
import { checkBackendHealth } from "../utils/backendApi";
import { isLoggedIn } from "../utils/backendAuth";

/**
 * Indicateur visuel de connexion frontend ↔ backend en temps réel.
 * Combine : état WebSocket (temps réel) + ping HTTP périodique (sanity check).
 *
 * Props:
 *   wsConnected: boolean — état WebSocket passé par le parent
 */
export default function BackendStatus({ wsConnected }) {
  const [httpOk, setHttpOk] = useState(null);
  const [latency, setLatency] = useState(null);
  const [expanded, setExpanded] = useState(false);
  const timerRef = useRef(null);

  useEffect(() => {
    if (!isLoggedIn()) return;

    const ping = async () => {
      const t0 = performance.now();
      try {
        const r = await checkBackendHealth();
        const dt = Math.round(performance.now() - t0);
        setHttpOk(r.ok);
        setLatency(dt);
      } catch {
        setHttpOk(false);
        setLatency(null);
      }
    };

    ping();
    timerRef.current = setInterval(ping, 15000);
    return () => clearInterval(timerRef.current);
  }, []);

  if (!isLoggedIn()) return null;

  const connected = wsConnected && httpOk;
  const partial = (wsConnected || httpOk) && !connected;
  const down = !wsConnected && !httpOk;

  const color = connected ? "#34D399" : partial ? "#FBBF24" : "#F87171";
  const bgColor = connected ? "rgba(52,211,153,0.08)" : partial ? "rgba(251,191,36,0.08)" : "rgba(248,113,113,0.08)";
  const borderColor = connected ? "rgba(52,211,153,0.2)" : partial ? "rgba(251,191,36,0.2)" : "rgba(248,113,113,0.2)";
  const label = connected ? "Live" : partial ? "Partiel" : "Hors ligne";
  const tooltip = [
    `Backend: ${httpOk === null ? "..." : httpOk ? "OK" : "Injoignable"}`,
    `WebSocket: ${wsConnected ? "Connecté" : "Déconnecté"}`,
    latency != null ? `Latence: ${latency}ms` : null,
  ].filter(Boolean).join(" · ");

  return (
    <div
      title={tooltip}
      onClick={() => setExpanded(e => !e)}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 6,
        padding: "5px 10px",
        borderRadius: 9,
        background: bgColor,
        border: `1px solid ${borderColor}`,
        fontSize: 11,
        color,
        fontWeight: 600,
        cursor: "pointer",
        userSelect: "none",
        transition: "all 0.3s ease",
      }}
    >
      {/* Pulsing dot */}
      <span
        style={{
          width: 7,
          height: 7,
          borderRadius: "50%",
          background: color,
          boxShadow: `0 0 ${connected ? "8px" : "4px"} ${color}`,
          flexShrink: 0,
          animation: connected ? "backendPulse 2s ease-in-out infinite" : "none",
        }}
      />
      <span>{label}</span>
      {expanded && latency != null && (
        <span style={{ fontSize: 10, color: "#6B7280", fontWeight: 500 }}>
          {latency}ms
        </span>
      )}

      <style>{`
        @keyframes backendPulse {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.5; transform: scale(0.85); }
        }
      `}</style>
    </div>
  );
}
