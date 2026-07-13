import { useState, useMemo } from "react";
import { Activity, Calendar, TrendingUp, TrendingDown, Globe, ChevronDown, ChevronRight } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Cell } from "recharts";
import { getStatus, STATUS_CONFIG, STATUS } from "../constants";
import { getAllSla, computeGroupSla, getSlaHistory } from "../utils/slaStorage";

function getDomain(url) {
  try { return new URL(url).hostname; } catch { return url; }
}

function slaColor(sla) {
  if (sla == null) return "#6B7280";
  if (sla >= 99) return "#34D399";
  if (sla >= 95) return "#818CF8";
  if (sla >= 90) return "#FBBF24";
  return "#F87171";
}

function dayColor(up, total) {
  if (total === 0) return "#1F2937";
  const pct = up / total;
  if (pct >= 0.99) return "#34D399";
  if (pct >= 0.95) return "#818CF8";
  if (pct >= 0.90) return "#FBBF24";
  return "#F87171";
}

export default function UptimeHistory({ groups = [], allUrls = [] }) {
  const [period, setPeriod] = useState(30);
  const [expanded, setExpanded] = useState(new Set());

  const allSlaData = useMemo(() => getAllSla(period), [period]);

  /* Match URLs with groups */
  const urlToGroup = useMemo(() => {
    const map = {};
    for (const g of groups) {
      for (const u of g.urls) {
        map[u.url] = g.name;
      }
    }
    return map;
  }, [groups]);

  /* Group stats */
  const groupStats = useMemo(() => {
    return groups.filter(g => !g.isGlobal).map(g => {
      const urls = g.urls.map(u => u.url);
      const { sla, daysTracked, totalChecks, upChecks } = computeGroupSla(g.urls, period);
      return { name: g.name, sla, daysTracked, totalChecks, upChecks, urlCount: g.urls.length };
    });
  }, [groups, period]);

  /* Overall SLA */
  const overallSla = useMemo(() => {
    if (allSlaData.length === 0) return null;
    const totalChecks = allSlaData.reduce((s, u) => s + u.totalChecks, 0);
    const upChecks = allSlaData.reduce((s, u) => s + u.upChecks, 0);
    return totalChecks > 0 ? Math.round((upChecks / totalChecks) * 1000) / 10 : null;
  }, [allSlaData]);

  const toggle = (url) => {
    setExpanded(prev => {
      const next = new Set(prev);
      if (next.has(url)) next.delete(url);
      else next.add(url);
      return next;
    });
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20, paddingBottom: 24 }}>

      {/* Header avec sélecteur de période */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <Activity size={18} color="#818CF8" />
          <span style={{ fontSize: 14, fontWeight: 600, color: "#E5E7EB" }}>Historique de disponibilité (SLA)</span>
        </div>
        <div style={{ display: "flex", gap: 4 }}>
          {[7, 30, 90].map(d => (
            <button key={d} onClick={() => setPeriod(d)} style={{
              padding: "5px 14px", borderRadius: 8, fontSize: 11, fontWeight: period === d ? 700 : 400, cursor: "pointer",
              background: period === d ? "rgba(99,102,241,0.18)" : "rgba(255,255,255,0.03)",
              border: `1px solid ${period === d ? "rgba(99,102,241,0.35)" : "rgba(255,255,255,0.07)"}`,
              color: period === d ? "#A5B4FC" : "#6B7280",
            }}>{d}j</button>
          ))}
        </div>
      </div>

      {/* KPI global */}
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
        <div style={{ flex: "1 1 200px", background: "rgba(255,255,255,0.025)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 14, padding: "16px 20px" }}>
          <div style={{ fontSize: 10, color: "#6B7280", textTransform: "uppercase", letterSpacing: "0.05em", fontWeight: 600, marginBottom: 8 }}>SLA global (sur {period}j)</div>
          <div style={{ fontSize: 32, fontWeight: 800, fontFamily: "'JetBrains Mono', monospace", color: slaColor(overallSla) }}>
            {overallSla != null ? `${overallSla}%` : "—"}
          </div>
          <div style={{ fontSize: 10, color: "#4B5563", marginTop: 4 }}>
            {allSlaData.length} URL(s) suivie(s) · {allSlaData.reduce((s, u) => s + u.totalChecks, 0)} checks
          </div>
        </div>
        {groupStats.slice(0, 4).map(g => (
          <div key={g.name} style={{ flex: "1 1 160px", background: "rgba(255,255,255,0.025)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 14, padding: "14px 16px" }}>
            <div style={{ fontSize: 10, color: "#6B7280", fontWeight: 600, marginBottom: 6, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{g.name}</div>
            <div style={{ fontSize: 22, fontWeight: 800, fontFamily: "'JetBrains Mono', monospace", color: slaColor(g.sla) }}>
              {g.sla != null ? `${g.sla}%` : "—"}
            </div>
            <div style={{ fontSize: 9, color: "#4B5563", marginTop: 3 }}>{g.urlCount} URL(s)</div>
          </div>
        ))}
      </div>

      {/* SLA par groupe */}
      {groupStats.length > 0 && (
        <div style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 12, overflow: "hidden" }}>
          <div style={{ padding: "12px 16px", borderBottom: "1px solid rgba(255,255,255,0.06)", fontSize: 12, fontWeight: 600, color: "#E5E7EB", display: "flex", alignItems: "center", gap: 8 }}>
            <Calendar size={14} color="#6B7280" /> SLA par groupe
          </div>
          <div style={{ padding: "8px 16px" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
              <thead>
                <tr>
                  <th style={{ textAlign: "left", padding: "6px 8px", color: "#6B7280", fontWeight: 600, borderBottom: "1px solid rgba(255,255,255,0.06)" }}>Groupe</th>
                  <th style={{ textAlign: "right", padding: "6px 8px", color: "#6B7280", fontWeight: 600, borderBottom: "1px solid rgba(255,255,255,0.06)" }}>URLs</th>
                  <th style={{ textAlign: "right", padding: "6px 8px", color: "#6B7280", fontWeight: 600, borderBottom: "1px solid rgba(255,255,255,0.06)" }}>Checks</th>
                  <th style={{ textAlign: "right", padding: "6px 8px", color: "#6B7280", fontWeight: 600, borderBottom: "1px solid rgba(255,255,255,0.06)" }}>Jours suivis</th>
                  <th style={{ textAlign: "right", padding: "6px 8px", color: "#6B7280", fontWeight: 600, borderBottom: "1px solid rgba(255,255,255,0.06)" }}>SLA</th>
                </tr>
              </thead>
              <tbody>
                {groupStats.map(g => (
                  <tr key={g.name}>
                    <td style={{ padding: "6px 8px", color: "#E5E7EB", fontWeight: 600 }}>{g.name}</td>
                    <td style={{ textAlign: "right", padding: "6px 8px", color: "#9CA3AF", fontFamily: "'JetBrains Mono', monospace" }}>{g.urlCount}</td>
                    <td style={{ textAlign: "right", padding: "6px 8px", color: "#9CA3AF", fontFamily: "'JetBrains Mono', monospace" }}>{g.totalChecks}</td>
                    <td style={{ textAlign: "right", padding: "6px 8px", color: "#9CA3AF", fontFamily: "'JetBrains Mono', monospace" }}>{g.daysTracked}</td>
                    <td style={{ textAlign: "right", padding: "6px 8px", fontFamily: "'JetBrains Mono', monospace", fontWeight: 700, color: slaColor(g.sla) }}>{g.sla != null ? `${g.sla}%` : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Détail par URL avec barres quotidiennes */}
      <div style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 12, overflow: "hidden" }}>
        <div style={{ padding: "12px 16px", borderBottom: "1px solid rgba(255,255,255,0.06)", fontSize: 12, fontWeight: 600, color: "#E5E7EB", display: "flex", alignItems: "center", gap: 8 }}>
          <Globe size={14} color="#6B7280" /> Disponibilité par URL
        </div>
        {allSlaData.length === 0 ? (
          <div style={{ padding: "30px 16px", textAlign: "center", fontSize: 12, color: "#4B5563" }}>
            Aucune donnée SLA enregistrée. Les checks sont automatiquement enregistrés pendant la surveillance.
          </div>
        ) : (
          <div style={{ maxHeight: 500, overflowY: "auto" }}>
            {allSlaData.sort((a, b) => (a.sla ?? 0) - (b.sla ?? 0)).map(u => {
              const isExp = expanded.has(u.url);
              const dailyData = u.history.map(d => ({
                date: d.date.slice(5),
                up: d.up,
                total: d.checks,
                pct: d.checks > 0 ? Math.round((d.up / d.checks) * 100) : 0,
              }));
              return (
                <div key={u.url} style={{ borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
                  <div
                    onClick={() => toggle(u.url)}
                    style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 16px", cursor: "pointer" }}
                  >
                    {isExp ? <ChevronDown size={14} color="#6B7280" /> : <ChevronRight size={14} color="#6B7280" />}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 12, fontWeight: 600, color: "#E5E7EB", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{getDomain(u.url)}</div>
                      <div style={{ fontSize: 10, color: "#4B5563", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{u.url}</div>
                    </div>
                    <div style={{ display: "flex", gap: 2, flexShrink: 0 }}>
                      {u.history.slice(-Math.min(period, 30)).map((d, i) => (
                        <div key={i} title={`${d.date}: ${d.up}/${d.checks} checks`}
                          style={{ width: 4, height: 16, borderRadius: 2, background: dayColor(d.up, d.checks) }} />
                      ))}
                    </div>
                    <div style={{ fontSize: 14, fontWeight: 800, fontFamily: "'JetBrains Mono', monospace", color: slaColor(u.sla), minWidth: 55, textAlign: "right" }}>
                      {u.sla != null ? `${u.sla}%` : "—"}
                    </div>
                  </div>
                  {isExp && (
                    <div style={{ padding: "8px 16px 16px 40px" }}>
                      <div style={{ height: 120 }}>
                        <ResponsiveContainer width="100%" height="100%">
                          <BarChart data={dailyData} margin={{ top: 4, right: 8, bottom: 0, left: -16 }}>
                            <CartesianGrid stroke="rgba(255,255,255,0.05)" vertical={false} />
                            <XAxis dataKey="date" tick={{ fontSize: 9, fill: "#6B7280" }} axisLine={false} tickLine={false} />
                            <YAxis tick={{ fontSize: 9, fill: "#6B7280" }} axisLine={false} tickLine={false} domain={[0, 100]} unit="%" />
                            <Tooltip
                              contentStyle={{ background: "#1F2937", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, fontSize: 11 }}
                              formatter={(v, name) => [`${v}%`, name === "pct" ? "Disponibilité" : name]}
                            />
                            <Bar dataKey="pct" name="pct" radius={[3, 3, 0, 0]}>
                              {dailyData.map((d, i) => (
                                <Cell key={i} fill={dayColor(d.up, d.total)} />
                              ))}
                            </Bar>
                          </BarChart>
                        </ResponsiveContainer>
                      </div>
                      <div style={{ display: "flex", gap: 16, marginTop: 8, fontSize: 10, color: "#6B7280" }}>
                        <span>Checks totaux: <b style={{ color: "#E5E7EB" }}>{u.totalChecks}</b></span>
                        <span>Checks OK: <b style={{ color: "#34D399" }}>{u.upChecks}</b></span>
                        <span>Jours suivis: <b style={{ color: "#E5E7EB" }}>{u.daysTracked}</b></span>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Légende */}
      <div style={{ display: "flex", gap: 16, fontSize: 10, color: "#6B7280", justifyContent: "center" }}>
        <span style={{ display: "flex", alignItems: "center", gap: 4 }}><span style={{ width: 10, height: 10, borderRadius: 2, background: "#34D399" }} /> ≥ 99%</span>
        <span style={{ display: "flex", alignItems: "center", gap: 4 }}><span style={{ width: 10, height: 10, borderRadius: 2, background: "#818CF8" }} /> ≥ 95%</span>
        <span style={{ display: "flex", alignItems: "center", gap: 4 }}><span style={{ width: 10, height: 10, borderRadius: 2, background: "#FBBF24" }} /> ≥ 90%</span>
        <span style={{ display: "flex", alignItems: "center", gap: 4 }}><span style={{ width: 10, height: 10, borderRadius: 2, background: "#F87171" }} /> &lt; 90%</span>
      </div>
    </div>
  );
}
