import { useEffect } from "react";
import { CheckCircle, XCircle, X } from "lucide-react";

export default function Toast({ toasts, onDismiss }) {
  return (
    <div style={{
      position: "fixed", bottom: 24, right: 24, zIndex: 1000,
      display: "flex", flexDirection: "column", gap: 8, pointerEvents: "none",
    }}>
      {toasts.map(t => (
        <ToastItem key={t.id} toast={t} onDismiss={onDismiss} />
      ))}
    </div>
  );
}

function ToastItem({ toast, onDismiss }) {
  useEffect(() => {
    const timer = setTimeout(() => onDismiss(toast.id), 4000);
    return () => clearTimeout(timer);
  }, [toast.id, onDismiss]);

  const isOnline = toast.type === "online";
  const color = isOnline ? "#34D399" : "#F87171";
  const bg = isOnline ? "rgba(52,211,153,0.12)" : "rgba(248,113,113,0.12)";
  const border = isOnline ? "rgba(52,211,153,0.25)" : "rgba(248,113,113,0.25)";
  const Icon = isOnline ? CheckCircle : XCircle;

  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 10,
      padding: "12px 16px", borderRadius: 12,
      background: "rgba(15,20,35,0.95)", border: `1px solid ${border}`,
      backdropFilter: "blur(12px)", boxShadow: `0 4px 20px rgba(0,0,0,0.4), 0 0 0 1px ${border}`,
      animation: "slideIn 0.25s ease both", pointerEvents: "auto",
      minWidth: 280, maxWidth: 380,
    }}>
      <div style={{
        width: 30, height: 30, borderRadius: 8, display: "flex", alignItems: "center",
        justifyContent: "center", background: bg, color, flexShrink: 0,
      }}>
        <Icon size={16} />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 12, fontWeight: 600, color, marginBottom: 1 }}>
          {isOnline ? "Retour en ligne" : "Hors ligne"}
        </div>
        <div style={{
          fontSize: 11, color: "#9CA3AF",
          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
          fontFamily: "'JetBrains Mono', monospace",
        }}>
          {toast.url}
        </div>
      </div>
      <button
        onClick={() => onDismiss(toast.id)}
        style={{
          background: "none", border: "none", color: "#6B7280", cursor: "pointer",
          padding: 2, display: "flex", flexShrink: 0,
          transition: "color 0.2s",
        }}
        onMouseEnter={e => e.currentTarget.style.color = "#E5E7EB"}
        onMouseLeave={e => e.currentTarget.style.color = "#6B7280"}
      >
        <X size={14} />
      </button>
    </div>
  );
}
