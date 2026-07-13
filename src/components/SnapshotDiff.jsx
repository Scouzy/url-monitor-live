import { useState, useMemo } from "react";
import { GitCompare, Calendar, ArrowRight, TrendingUp, TrendingDown, Minus, Cpu, MemoryStick, HardDrive, Server, Download } from "lucide-react";
import { loadSnapshots } from "../utils/snapshots";
import { exportServersExcel } from "../utils/exportData";

function fmtDate(ts) {
  return new Date(ts).toLocaleDateString("fr-FR", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

function deltaColor(delta) {
  if (delta == null) return "#6B7280";
  if (delta > 0) return "#F87171";
  if (delta < 0) return "#34D399";
  return "#6B7280";
}

function DeltaIcon({ delta }) {
  if (delta == null || delta === 0) return <Minus size={12} color="#6B7280" />;
  return delta > 0 ? <TrendingUp size={12} color="#F87171" /> : <TrendingDown size={12} color="#34D399" />;
}

export default function SnapshotDiff({ servers: propServers }) {
  const snapshots = useMemo(() => loadSnapshots(), []);
  const [fromIdx, setFromIdx] = useState(-1);
  const [search, setSearch] = useState("");

  const fromSnap = fromIdx >= 0 ? snapshots[fromIdx] : null;
  const toSnap = snapshots.length > 0 ? snapshots[snapshots.length - 1] : null;

  const diffData = useMemo(() => {
    if (!fromSnap || !toSnap) return [];
    const allNames = new Set([...Object.keys(fromSnap.servers), ...Object.keys(toSnap.servers)]);
    const results = [];
    for (const name of allNames) {
      const from = fromSnap.servers[name];
      const to = toSnap.servers[name];
      if (!from && !to) continue;
      const d = (a, b) => (a != null && b != null) ? +(a - b).toFixed(1) : null;
      results.push({
        name,
        cpuFrom: from?.cpu ?? null,
        cpuTo: to?.cpu ?? null,
        cpuDelta: d(to?.cpu, from?.cpu),
        ramFrom: from?.ram ?? null,
        ramTo: to?.ram ?? null,
        ramDelta: d(to?.ram, from?.ram),
        diskFrom: from?.disk ?? null,
        diskTo: to?.disk ?? null,
        diskDelta: d(to?.disk, from?.disk),
        coresFrom: from?.cores ?? null,
        coresTo: to?.cores ?? null,
        coresDelta: d(to?.cores, from?.cores),
        ramGbFrom: from?.ramGb ?? null,
        ramGbTo: to?.ramGb ?? null,
        ramGbDelta: d(to?.ramGb, from?.ramGb),
        diskGbFrom: from?.diskGb ?? null,
        diskGbTo: to?.diskGb ?? null,
        diskGbDelta: d(to?.diskGb, from?.diskGb),
        added: !from && !!to,
        removed: !!from && !to,
      });
    }
    return results.sort((a, b) => {
      const aMax = Math.max(Math.abs(a.cpuDelta ?? 0), Math.abs(a.ramDelta ?? 0), Math.abs(a.diskDelta ?? 0));
      const bMax = Math.max(Math.abs(b.cpuDelta ?? 0), Math.abs(b.ramDelta ?? 0), Math.abs(b.diskDelta ?? 0));
      return bMax - aMax;
    });
  }, [fromSnap, toSnap]);

  const filtered = useMemo(() => {
    if (!search) return diffData;
    const q = search.toLowerCase();
    return diffData.filter(d => d.name.toLowerCase().includes(q));
  }, [diffData, search]);

  const summary = useMemo(() => {
    if (diffData.length === 0) return null;
    const changed = diffData.filter(d => (d.cpuDelta != null && d.cpuDelta !== 0) || (d.ramDelta != null && d.ramDelta !== 0) || (d.diskDelta != null && d.diskDelta !== 0) || (d.ramGbDelta != null && d.ramGbDelta !== 0) || (d.diskGbDelta != null && d.diskGbDelta !== 0));
    const added = diffData.filter(d => d.added);
    const removed = diffData.filter(d => d.removed);
    return { total: diffData.length, changed: changed.length, added: added.length, removed: removed.length };
  }, [diffData]);

  if (snapshots.length < 2) {
    return (
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 16, padding: "60px 20px", textAlign: "center" }}>
        <GitCompare size={40} color="#4B5563" />
        <div style={{ fontSize: 14, color: "#9CA3AF", fontWeight: 600 }}>Pas assez de snapshots</div>
        <div style={{ fontSize: 12, color: "#4B5563" }}>
          Au moins 2 snapshots sont nécessaires pour comparer les évolutions.<br />
          Les snapshots sont créés automatiquement lors de l'import de serveurs (Excel ou ITCare).
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20, paddingBottom: 24 }}>

      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <GitCompare size={18} color="#818CF8" />
        <span style={{ fontSize: 14, fontWeight: 600, color: "#E5E7EB" }}>Comparaison de snapshots</span>
      </div>

      {/* Sélecteur de dates */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 12, padding: "14px 16px" }}>
        <Calendar size={16} color="#6B7280" />
        <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
          <label style={{ fontSize: 10, color: "#6B7280", fontWeight: 600 }}>Snapshot de départ</label>
          <select value={fromIdx} onChange={e => setFromIdx(parseInt(e.target.value))} style={{ background: "#1F2937", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, color: "#E5E7EB", fontSize: 12, padding: "5px 10px", cursor: "pointer" }}>
            <option value={-1} style={{ background: "#1F2937" }}>— Sélectionner —</option>
            {snapshots.slice(0, -1).map((s, i) => (
              <option key={i} value={i} style={{ background: "#1F2937" }}>{fmtDate(s.ts)} · {s.label || s.source}</option>
            ))}
          </select>
        </div>
        <ArrowRight size={16} color="#6B7280" />
        <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
          <label style={{ fontSize: 10, color: "#6B7280", fontWeight: 600 }}>Snapshot d'arrivée (le plus récent)</label>
          <div style={{ padding: "5px 10px", background: "rgba(99,102,241,0.1)", border: "1px solid rgba(99,102,241,0.2)", borderRadius: 8, fontSize: 12, color: "#818CF8", fontWeight: 600 }}>
            {toSnap ? fmtDate(toSnap.ts) : "—"} · {toSnap?.label || toSnap?.source}
          </div>
        </div>
        {summary && (
          <div style={{ marginLeft: "auto", display: "flex", gap: 10 }}>
            <span style={{ fontSize: 11, color: "#6B7280" }}><b style={{ color: "#E5E7EB" }}>{summary.total}</b> serveurs</span>
            <span style={{ fontSize: 11, color: "#FBBF24" }}><b>{summary.changed}</b> modifiés</span>
            <span style={{ fontSize: 11, color: "#34D399" }}><b>{summary.added}</b> ajoutés</span>
            <span style={{ fontSize: 11, color: "#F87171" }}><b>{summary.removed}</b> retirés</span>
          </div>
        )}
      </div>

      {/* Search */}
      {fromSnap && (
        <div style={{ display: "flex", alignItems: "center", gap: 7, background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 9, padding: "5px 12px" }}>
          <Server size={13} color="#6B7280" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Rechercher un serveur..."
            style={{ flex: 1, background: "transparent", border: "none", color: "#E5E7EB", fontSize: 12, outline: "none" }} />
        </div>
      )}

      {/* Table diff */}
      {fromSnap && toSnap && (
        <div style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 12, overflow: "hidden" }}>
          <div style={{ maxHeight: 500, overflowY: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}>
              <thead>
                <tr style={{ position: "sticky", top: 0, background: "#0B0F19", zIndex: 1 }}>
                  <th style={{ textAlign: "left", padding: "8px 12px", color: "#6B7280", fontWeight: 600, borderBottom: "1px solid rgba(255,255,255,0.06)" }}>Serveur</th>
                  <th style={{ textAlign: "center", padding: "8px 6px", color: "#818CF8", fontWeight: 600, borderBottom: "1px solid rgba(255,255,255,0.06)" }} colSpan={3}><Cpu size={11} style={{ display: "inline", marginRight: 4 }} />CPU (%)</th>
                  <th style={{ textAlign: "center", padding: "8px 6px", color: "#EC4899", fontWeight: 600, borderBottom: "1px solid rgba(255,255,255,0.06)" }} colSpan={3}><MemoryStick size={11} style={{ display: "inline", marginRight: 4 }} />RAM (%)</th>
                  <th style={{ textAlign: "center", padding: "8px 6px", color: "#FBBF24", fontWeight: 600, borderBottom: "1px solid rgba(255,255,255,0.06)" }} colSpan={3}><HardDrive size={11} style={{ display: "inline", marginRight: 4 }} />Disque (%)</th>
                  <th style={{ textAlign: "center", padding: "8px 6px", color: "#EC4899", fontWeight: 600, borderBottom: "1px solid rgba(255,255,255,0.06)" }} colSpan={3}>RAM (Go)</th>
                  <th style={{ textAlign: "center", padding: "8px 6px", color: "#FBBF24", fontWeight: 600, borderBottom: "1px solid rgba(255,255,255,0.06)" }} colSpan={3}>Disque (Go)</th>
                </tr>
                <tr style={{ position: "sticky", top: 32, background: "#0B0F19", zIndex: 1 }}>
                  <th style={{ padding: "4px 12px" }}></th>
                  {["Avant", "Après", "Δ", "Avant", "Après", "Δ", "Avant", "Après", "Δ", "Avant", "Après", "Δ", "Avant", "Après", "Δ"].map((h, i) => (
                    <th key={i} style={{ textAlign: i % 3 === 2 ? "center" : "right", padding: "4px 6px", color: "#4B5563", fontWeight: 500, fontSize: 9, borderBottom: "1px solid rgba(255,255,255,0.06)" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map(d => (
                  <tr key={d.name} style={{
                    borderBottom: "1px solid rgba(255,255,255,0.04)",
                    background: d.added ? "rgba(52,211,153,0.04)" : d.removed ? "rgba(248,113,113,0.04)" : "transparent",
                  }}>
                    <td style={{ padding: "6px 12px", color: "#E5E7EB", fontWeight: 600, fontSize: 11 }}>
                      {d.name}
                      {d.added && <span style={{ marginLeft: 6, fontSize: 9, color: "#34D399", fontWeight: 700 }}>NOUVEAU</span>}
                      {d.removed && <span style={{ marginLeft: 6, fontSize: 9, color: "#F87171", fontWeight: 700 }}>SUPPRIMÉ</span>}
                    </td>
                    {[
                      { from: d.cpuFrom, to: d.cpuTo, delta: d.cpuDelta },
                      { from: d.ramFrom, to: d.ramTo, delta: d.ramDelta },
                      { from: d.diskFrom, to: d.diskTo, delta: d.diskDelta },
                      { from: d.ramGbFrom, to: d.ramGbTo, delta: d.ramGbDelta },
                      { from: d.diskGbFrom, to: d.diskGbTo, delta: d.diskGbDelta },
                    ].map((m, i) => (
                      <td key={i} style={{ padding: 0 }}>
                        <span style={{ display: "block", textAlign: "right", padding: "6px 6px", color: "#9CA3AF", fontFamily: "'JetBrains Mono', monospace", fontSize: 10 }}>{m.from ?? "—"}</span>
                        <span style={{ display: "none" }} />
                      </td>
                    ))}
                    {[
                      { from: d.cpuFrom, to: d.cpuTo, delta: d.cpuDelta },
                      { from: d.ramFrom, to: d.ramTo, delta: d.ramDelta },
                      { from: d.diskFrom, to: d.diskTo, delta: d.diskDelta },
                      { from: d.ramGbFrom, to: d.ramGbTo, delta: d.ramGbDelta },
                      { from: d.diskGbFrom, to: d.diskGbTo, delta: d.diskGbDelta },
                    ].map((m, i) => (
                      <td key={`to-${i}`} style={{ textAlign: "right", padding: "6px 6px", color: "#E5E7EB", fontFamily: "'JetBrains Mono', monospace", fontSize: 10 }}>{m.to ?? "—"}</td>
                    ))}
                    {[
                      { from: d.cpuFrom, to: d.cpuTo, delta: d.cpuDelta },
                      { from: d.ramFrom, to: d.ramTo, delta: d.ramDelta },
                      { from: d.diskFrom, to: d.diskTo, delta: d.diskDelta },
                      { from: d.ramGbFrom, to: d.ramGbTo, delta: d.ramGbDelta },
                      { from: d.diskGbFrom, to: d.diskGbTo, delta: d.diskGbDelta },
                    ].map((m, i) => (
                      <td key={`d-${i}`} style={{ textAlign: "center", padding: "6px 6px", fontFamily: "'JetBrains Mono', monospace", fontSize: 10 }}>
                        <span style={{ display: "inline-flex", alignItems: "center", gap: 3, color: deltaColor(m.delta), fontWeight: 700 }}>
                          <DeltaIcon delta={m.delta} />
                          {m.delta != null ? `${m.delta > 0 ? "+" : ""}${m.delta}` : "—"}
                        </span>
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {!fromSnap && (
        <div style={{ padding: "40px 16px", textAlign: "center", fontSize: 12, color: "#4B5563", background: "rgba(255,255,255,0.02)", borderRadius: 12, border: "1px solid rgba(255,255,255,0.07)" }}>
          Sélectionnez un snapshot de départ pour voir les évolutions.
        </div>
      )}
    </div>
  );
}
