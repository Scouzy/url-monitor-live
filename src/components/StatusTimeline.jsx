import { useState } from "react";
import { SLOW_THRESHOLD } from "../constants";

const MAX_SEGMENTS = 80;

function segmentColor(uptime, avgRt) {
  if (uptime === 0)  return "#F87171";
  if (uptime < 1)    return "#FBBF24";
  if (avgRt > SLOW_THRESHOLD) return "#FBBF24";
  return "#34D399";
}

function formatTs(ts) {
  return new Date(ts).toLocaleString("fr-FR", {
    day: "2-digit", month: "2-digit",
    hour: "2-digit", minute: "2-digit",
  });
}

function formatDuration(ms) {
  const s = Math.round(ms / 1000);
  if (s < 60)  return `${s}s`;
  const m = Math.round(s / 60);
  if (m < 60)  return `${m}min`;
  const h = (m / 60).toFixed(1);
  return `${h}h`;
}

export default function StatusTimeline({ history, label = "Historique" }) {
  const [tip, setTip] = useState(null);

  /* Filtrer les entrées avec timestamps (nouveau format) */
  const entries = (history || []).filter(h => h && typeof h === "object" && h.ts);
  if (entries.length < 3) return null;

  /* Regrouper en N segments au maximum */
  const chunkSize = Math.max(1, Math.ceil(entries.length / MAX_SEGMENTS));
  const segments = [];
  for (let i = 0; i < entries.length; i += chunkSize) {
    const chunk = entries.slice(i, i + chunkSize);
    const upCount  = chunk.filter(e => e.isUp).length;
    const uptime   = upCount / chunk.length;
    const avgRt    = chunk.reduce((s, e) => s + (e.rt || 0), 0) / chunk.length;
    segments.push({
      color:   segmentColor(uptime, avgRt),
      uptime,
      avgRt:   Math.round(avgRt),
      tsFirst: chunk[0].ts,
      tsLast:  chunk[chunk.length - 1].ts,
      total:   chunk.length,
      down:    chunk.length - upCount,
    });
  }

  const totalUp     = entries.filter(e => e.isUp).length;
  const uptimePct   = ((totalUp / entries.length) * 100).toFixed(1);
  const spanMs      = entries[entries.length - 1].ts - entries[0].ts;
  const uptimeColor = uptimePct >= 99 ? "#34D399" : uptimePct >= 95 ? "#FBBF24" : "#F87171";

  return (
    <div style={{ position: "relative", userSelect: "none" }}>
      {/* Barre de segments */}
      <div style={{ display: "flex", alignItems: "flex-end", gap: 1, height: 28, cursor: "crosshair" }}>
        {segments.map((seg, i) => (
          <div
            key={i}
            style={{
              flex: 1,
              height: seg.uptime === 0 ? "100%" : `${60 + seg.uptime * 40}%`,
              background: seg.color,
              borderRadius: 2,
              opacity: tip?.i === i ? 1 : 0.75,
              transition: "opacity 0.1s, height 0.1s",
            }}
            onMouseEnter={() => setTip({ ...seg, i })}
            onMouseLeave={() => setTip(null)}
          />
        ))}
      </div>

      {/* Légende bas */}
      <div style={{ display: "flex", justifyContent: "space-between", marginTop: 4, fontSize: 9, color: "#4B5563" }}>
        <span>{formatTs(entries[0].ts)}</span>
        <span style={{ color: uptimeColor, fontWeight: 600 }}>{uptimePct}% uptime ({formatDuration(spanMs)})</span>
        <span>maintenant</span>
      </div>

      {/* Tooltip */}
      {tip && (
        <div style={{
          position: "absolute", bottom: "calc(100% - 20px)",
          left: `${(tip.i / segments.length) * 100}%`,
          transform: "translateX(-50%)",
          background: "#1F2937", border: "1px solid rgba(255,255,255,0.1)",
          borderRadius: 7, padding: "6px 10px", fontSize: 10, color: "#E5E7EB",
          whiteSpace: "nowrap", zIndex: 50, pointerEvents: "none",
          boxShadow: "0 4px 12px rgba(0,0,0,0.5)",
        }}>
          <div style={{ fontWeight: 600, marginBottom: 2 }}>
            {formatTs(tip.tsFirst)} → {formatTs(tip.tsLast)}
          </div>
          <div style={{ color: segmentColor(tip.uptime, tip.avgRt) }}>
            {(tip.uptime * 100).toFixed(0)}% uptime
            {tip.down > 0 && <span style={{ color: "#F87171" }}> · {tip.down} échec{tip.down > 1 ? "s" : ""}</span>}
          </div>
          {tip.avgRt > 0 && <div style={{ color: "#9CA3AF" }}>Moy. {tip.avgRt} ms</div>}
          <div style={{ color: "#4B5563" }}>{tip.total} vérification{tip.total > 1 ? "s" : ""}</div>
        </div>
      )}
    </div>
  );
}
