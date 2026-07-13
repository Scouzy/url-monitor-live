import { useState, useMemo } from "react";
import { Map, Server, AlertTriangle, CheckCircle, Cpu, MemoryStick, HardDrive, Globe } from "lucide-react";

/* Mapping datacenter → coordonnées approximatives (lat, lng) */
const DC_COORDS = {
  "FR-Paris":   { lat: 48.85, lng: 2.35,  label: "Paris, FR" },
  "FR-Lyon":    { lat: 45.76, lng: 4.84,  label: "Lyon, FR" },
  "FR-Marseille": { lat: 43.30, lng: 5.37, label: "Marseille, FR" },
  "FR-Lille":   { lat: 50.63, lng: 3.06,  label: "Lille, FR" },
  "FR-Toulouse": { lat: 43.60, lng: 1.44, label: "Toulouse, FR" },
  "EU-Frankfurt": { lat: 50.11, lng: 8.68, label: "Francfort, DE" },
  "EU-Amsterdam": { lat: 52.37, lng: 4.90, label: "Amsterdam, NL" },
  "EU-London":  { lat: 51.51, lng: -0.13, label: "Londres, UK" },
  "EU-Dublin":  { lat: 53.35, lng: -6.26, label: "Dublin, IE" },
  "US-East":    { lat: 39.05, lng: -77.39, label: "Virginia, US" },
  "US-West":    { lat: 37.40, lng: -122.07, label: "California, US" },
  "AS-Tokyo":   { lat: 35.68, lng: 139.69, label: "Tokyo, JP" },
  "AS-Singapore": { lat: 1.35, lng: 103.82, label: "Singapour, SG" },
};

/* Devine la localisation à partir du nom/IP/OS du serveur */
function guessLocation(server) {
  const name = (server.name || "").toUpperCase();
  const ip = server.ip || "";
  /* Indices dans le nom */
  if (name.includes("PARIS") || name.includes("PAR")) return "FR-Paris";
  if (name.includes("LYON") || name.includes("LYO")) return "FR-Lyon";
  if (name.includes("MARSEILLE") || name.includes("MRS")) return "FR-Marseille";
  if (name.includes("LILLE") || name.includes("LIL")) return "FR-Lille";
  if (name.includes("TOULOUSE") || name.includes("TLS")) return "FR-Toulouse";
  if (name.includes("FRA") || name.includes("FRANKFURT")) return "EU-Frankfurt";
  if (name.includes("AMS")) return "EU-Amsterdam";
  if (name.includes("LON")) return "EU-London";
  if (name.includes("DUB")) return "EU-Dublin";
  /* Par défaut: Paris pour les serveurs français */
  if (name.startsWith("PEB") || name.startsWith("FR")) return "FR-Paris";
  /* IP privée 10.x → Paris par défaut */
  if (ip.startsWith("10.")) return "FR-Paris";
  return "FR-Paris";
}

/* Projection lat/lng → x/y sur une carte simplifiée Europe */
function project(lat, lng, width, height) {
  /* Focus Europe: lat 35-60, lng -10-20 */
  const minLat = 35, maxLat = 62, minLng = -12, maxLng = 25;
  const x = ((lng - minLng) / (maxLng - minLng)) * width;
  const y = ((maxLat - lat) / (maxLat - minLat)) * height;
  return { x: Math.max(20, Math.min(width - 20, x)), y: Math.max(20, Math.min(height - 20, y)) };
}

function serverSeverity(s) {
  const cpu = s.cpu ?? 0, ram = s.ram ?? 0, disk = s.disk ?? 0;
  const max = Math.max(cpu, ram, disk);
  if (max >= 90) return "critical";
  if (max >= 75) return "warning";
  return "ok";
}

const SEVERITY_COLORS = {
  critical: "#F87171",
  warning: "#FBBF24",
  ok: "#34D399",
};

export default function ServerGeoMap({ servers: propServers }) {
  const [selected, setSelected] = useState(null);
  const [hover, setHover] = useState(null);

  const locations = useMemo(() => {
    const map = {};
    for (const s of (propServers || [])) {
      const loc = guessLocation(s);
      if (!map[loc]) map[loc] = { key: loc, servers: [], ...DC_COORDS[loc] };
      map[loc].servers.push(s);
    }
    return Object.values(map);
  }, [propServers]);

  const stats = useMemo(() => {
    const total = (propServers || []).length;
    const critical = (propServers || []).filter(s => serverSeverity(s) === "critical").length;
    const warning = (propServers || []).filter(s => serverSeverity(s) === "warning").length;
    return { total, critical, warning, ok: total - critical - warning };
  }, [propServers]);

  const MAP_W = 800, MAP_H = 500;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20, paddingBottom: 24 }}>

      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <Map size={18} color="#818CF8" />
        <span style={{ fontSize: 14, fontWeight: 600, color: "#E5E7EB" }}>Carte géographique des serveurs</span>
      </div>

      {/* KPIs */}
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
        {[
          { label: "Total serveurs", value: stats.total, color: "#818CF8", Icon: Server },
          { label: "Sites", value: locations.length, color: "#6366F1", Icon: Globe },
          { label: "OK", value: stats.ok, color: "#34D399", Icon: CheckCircle },
          { label: "Alertes", value: stats.warning, color: "#FBBF24", Icon: AlertTriangle },
          { label: "Critiques", value: stats.critical, color: "#F87171", Icon: AlertTriangle },
        ].map(({ label, value, color, Icon }) => (
          <div key={label} style={{ flex: "1 1 120px", background: "rgba(255,255,255,0.025)", border: `1px solid ${color}22`, borderRadius: 14, padding: "12px 14px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}>
              <Icon size={12} color={color} />
              <span style={{ fontSize: 10, color: "#6B7280", fontWeight: 600, textTransform: "uppercase" }}>{label}</span>
            </div>
            <div style={{ fontSize: 22, fontWeight: 800, color, fontFamily: "'JetBrains Mono', monospace" }}>{value}</div>
          </div>
        ))}
      </div>

      {/* Carte */}
      <div style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 12, padding: 16, position: "relative", overflow: "hidden" }}>
        <svg width="100%" viewBox={`0 0 ${MAP_W} ${MAP_H}`} style={{ display: "block" }}>
          {/* Fond de carte simplifié — contours Europe */}
          <rect width={MAP_W} height={MAP_H} fill="#0D1117" rx="8" />
          {/* Grille */}
          {[0.25, 0.5, 0.75].map(p => (
            <g key={p}>
              <line x1={MAP_W * p} y1={0} x2={MAP_W * p} y2={MAP_H} stroke="rgba(255,255,255,0.03)" />
              <line x1={0} y1={MAP_H * p} x2={MAP_W} y2={MAP_H * p} stroke="rgba(255,255,255,0.03)" />
            </g>
          ))}
          {/* Continents simplifiés */}
          <path d="M 100,80 Q 200,60 350,90 Q 500,70 650,100 Q 700,120 680,200 Q 660,280 600,320 Q 500,360 400,350 Q 300,340 200,300 Q 120,250 100,180 Z"
            fill="rgba(255,255,255,0.03)" stroke="rgba(255,255,255,0.08)" strokeWidth="1" />
          <text x={MAP_W / 2} y={30} fill="#4B5563" fontSize="11" textAnchor="middle" fontFamily="Inter, sans-serif">Europe — Vue simplifiée</text>

          {/* Lignes de connexion entre sites */}
          {locations.length > 1 && locations.map((loc, i) => {
            if (i === 0) return null;
            const prev = locations[i - 1];
            const p1 = project(prev.lat, prev.lng, MAP_W, MAP_H);
            const p2 = project(loc.lat, loc.lng, MAP_W, MAP_H);
            return <line key={`line-${i}`} x1={p1.x} y1={p1.y} x2={p2.x} y2={p2.y} stroke="rgba(99,102,241,0.1)" strokeWidth="1" strokeDasharray="4 4" />;
          })}

          {/* Points par localisation */}
          {locations.map(loc => {
            const { x, y } = project(loc.lat, loc.lng, MAP_W, MAP_H);
            const critical = loc.servers.filter(s => serverSeverity(s) === "critical").length;
            const warning = loc.servers.filter(s => serverSeverity(s) === "warning").length;
            const color = critical > 0 ? SEVERITY_COLORS.critical : warning > 0 ? SEVERITY_COLORS.warning : SEVERITY_COLORS.ok;
            const radius = 8 + Math.min(loc.servers.length * 2, 16);
            const isSelected = selected?.key === loc.key;
            const isHover = hover?.key === loc.key;
            return (
              <g key={loc.key} onClick={() => setSelected(isSelected ? null : loc)} onMouseEnter={() => setHover(loc)} onMouseLeave={() => setHover(null)} style={{ cursor: "pointer" }}>
                {/* Halo */}
                {(critical > 0 || warning > 0) && (
                  <circle cx={x} cy={y} r={radius + 8} fill={color} opacity={0.08}>
                    <animate attributeName="r" values={`${radius + 4};${radius + 12};${radius + 4}`} dur="2s" repeatCount="indefinite" />
                  </circle>
                )}
                <circle cx={x} cy={y} r={radius} fill={color} opacity={0.2} />
                <circle cx={x} cy={y} r={radius - 3} fill={color} opacity={0.8} stroke={color} strokeWidth="2" />
                <text x={x} y={y + 4} fill="#fff" fontSize="10" fontWeight="700" textAnchor="middle" fontFamily="'JetBrains Mono', monospace">{loc.servers.length}</text>
                {/* Label */}
                <text x={x} y={y + radius + 14} fill={isHover || isSelected ? "#E5E7EB" : "#6B7280"} fontSize="10" textAnchor="middle" fontFamily="Inter, sans-serif" fontWeight={isHover || isSelected ? 600 : 400}>{loc.label}</text>
              </g>
            );
          })}
        </svg>

        {/* Tooltip / détail au survol */}
        {hover && !selected && (
          <div style={{
            position: "absolute", top: 16, right: 16, background: "#1F2937", border: "1px solid rgba(255,255,255,0.1)",
            borderRadius: 10, padding: "10px 14px", fontSize: 11, maxWidth: 250, pointerEvents: "none",
          }}>
            <div style={{ fontWeight: 700, color: "#E5E7EB", marginBottom: 4 }}>{hover.label}</div>
            <div style={{ color: "#9CA3AF" }}>{hover.servers.length} serveur(s)</div>
            <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
              {hover.servers.filter(s => serverSeverity(s) === "critical").length > 0 && (
                <span style={{ color: "#F87171" }}>{hover.servers.filter(s => serverSeverity(s) === "critical").length} critique(s)</span>
              )}
              {hover.servers.filter(s => serverSeverity(s) === "warning").length > 0 && (
                <span style={{ color: "#FBBF24" }}>{hover.servers.filter(s => serverSeverity(s) === "warning").length} alerte(s)</span>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Détail du site sélectionné */}
      {selected && (
        <div style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 12, overflow: "hidden" }}>
          <div style={{ padding: "12px 16px", borderBottom: "1px solid rgba(255,255,255,0.06)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: "#E5E7EB" }}>{selected.label} — {selected.servers.length} serveur(s)</span>
            <button onClick={() => setSelected(null)} style={{ background: "none", border: "none", color: "#6B7280", cursor: "pointer", fontSize: 12 }}>Fermer ✕</button>
          </div>
          <div style={{ maxHeight: 300, overflowY: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
              <thead>
                <tr style={{ position: "sticky", top: 0, background: "#0B0F19" }}>
                  <th style={{ textAlign: "left", padding: "6px 14px", color: "#6B7280", fontWeight: 600 }}>Serveur</th>
                  <th style={{ textAlign: "right", padding: "6px 14px", color: "#818CF8", fontWeight: 600 }}>CPU</th>
                  <th style={{ textAlign: "right", padding: "6px 14px", color: "#EC4899", fontWeight: 600 }}>RAM</th>
                  <th style={{ textAlign: "right", padding: "6px 14px", color: "#FBBF24", fontWeight: 600 }}>Disque</th>
                  <th style={{ textAlign: "center", padding: "6px 14px", color: "#6B7280", fontWeight: 600 }}>Statut</th>
                </tr>
              </thead>
              <tbody>
                {selected.servers.map(s => {
                  const sev = serverSeverity(s);
                  return (
                    <tr key={s.id || s.name} style={{ borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
                      <td style={{ padding: "6px 14px", color: "#E5E7EB", fontWeight: 600 }}>{s.name}</td>
                      <td style={{ textAlign: "right", padding: "6px 14px", color: "#818CF8", fontFamily: "'JetBrains Mono', monospace" }}>{s.cpu ?? 0}%</td>
                      <td style={{ textAlign: "right", padding: "6px 14px", color: "#EC4899", fontFamily: "'JetBrains Mono', monospace" }}>{s.ram ?? 0}%</td>
                      <td style={{ textAlign: "right", padding: "6px 14px", color: "#FBBF24", fontFamily: "'JetBrains Mono', monospace" }}>{s.disk ?? 0}%</td>
                      <td style={{ textAlign: "center", padding: "6px 14px" }}>
                        <span style={{ padding: "2px 8px", borderRadius: 6, fontSize: 10, fontWeight: 700, color: SEVERITY_COLORS[sev], background: `${SEVERITY_COLORS[sev]}15` }}>
                          {sev === "critical" ? "Critique" : sev === "warning" ? "Alerte" : "OK"}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Légende */}
      <div style={{ display: "flex", gap: 16, fontSize: 10, color: "#6B7280", justifyContent: "center" }}>
        <span style={{ display: "flex", alignItems: "center", gap: 4 }}><span style={{ width: 10, height: 10, borderRadius: "50%", background: "#34D399" }} /> OK</span>
        <span style={{ display: "flex", alignItems: "center", gap: 4 }}><span style={{ width: 10, height: 10, borderRadius: "50%", background: "#FBBF24" }} /> Alerte (≥75%)</span>
        <span style={{ display: "flex", alignItems: "center", gap: 4 }}><span style={{ width: 10, height: 10, borderRadius: "50%", background: "#F87171" }} /> Critique (≥90%)</span>
      </div>
    </div>
  );
}
