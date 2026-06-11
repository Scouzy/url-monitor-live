import { useEffect, useState } from "react";
import { gaugeColor } from "../utils/servers";

/* ── Jauge circulaire SVG animée ── */
export default function ServerGauge({ value, label, size = 64 }) {
  const [animated, setAnimated] = useState(0);

  useEffect(() => {
    const t = setTimeout(() => setAnimated(value), 80);
    return () => clearTimeout(t);
  }, [value]);

  const stroke = size > 56 ? 5 : 4;
  const r = (size - stroke * 2) / 2;
  const circ = 2 * Math.PI * r;
  const offset = circ * (1 - animated / 100);
  const color = gaugeColor(value);

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
      <div style={{ position: "relative", width: size, height: size }}>
        <svg width={size} height={size} style={{ transform: "rotate(-90deg)" }}>
          <circle cx={size / 2} cy={size / 2} r={r} fill="none"
            stroke="rgba(255,255,255,0.07)" strokeWidth={stroke} />
          <circle cx={size / 2} cy={size / 2} r={r} fill="none"
            stroke={color} strokeWidth={stroke} strokeLinecap="round"
            strokeDasharray={circ} strokeDashoffset={offset}
            style={{ transition: "stroke-dashoffset 0.9s cubic-bezier(0.4,0,0.2,1), stroke 0.3s" }} />
        </svg>
        <div style={{
          position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: size > 56 ? 13 : 11, fontWeight: 700, color,
          fontFamily: "'JetBrains Mono', monospace",
        }}>
          {value}%
        </div>
      </div>
      {label && <span style={{ fontSize: 9, color: "#6B7280", letterSpacing: "0.06em", textTransform: "uppercase" }}>{label}</span>}
    </div>
  );
}
