import { useState, useMemo, useCallback, useEffect } from "react";
import { ShieldCheck, ShieldAlert, ShieldX, RefreshCw, Search, Globe, Calendar, Download, FileSpreadsheet, Server } from "lucide-react";
import { checkSsl } from "../utils/checkSsl";
import { exportUrlsExcel } from "../utils/exportData";
import { sslApi } from "../utils/backendApi";
import { isLoggedIn } from "../utils/backendAuth";

function getDomain(url) {
  try { return new URL(url).hostname; } catch { return url; }
}

function sslStatus(days) {
  if (days == null) return { label: "Inconnu", color: "#6B7280", Icon: ShieldCheck, bg: "rgba(107,114,128,0.1)" };
  if (days <= 0) return { label: "Expiré", color: "#F87171", Icon: ShieldX, bg: "rgba(248,113,113,0.1)" };
  if (days <= 7) return { label: "Critique", color: "#F87171", Icon: ShieldAlert, bg: "rgba(248,113,113,0.1)" };
  if (days <= 30) return { label: "Attention", color: "#FBBF24", Icon: ShieldAlert, bg: "rgba(251,191,36,0.1)" };
  return { label: "Valide", color: "#34D399", Icon: ShieldCheck, bg: "rgba(52,211,153,0.1)" };
}

export default function SslCertificates({ groups = [], allUrls = [] }) {
  const [search, setSearch] = useState("");
  const [checking, setChecking] = useState(new Set());
  const [sslData, setSslData] = useState(() => {
    const map = {};
    allUrls.forEach(u => { if (u.sslInfo) map[u.url] = u.sslInfo; });
    return map;
  });
  const [lastCheckAll, setLastCheckAll] = useState(null);
  const [backendCerts, setBackendCerts] = useState([]);
  const [backendLoading, setBackendLoading] = useState(false);

  /* Charger les certs depuis le backend au démarrage */
  useEffect(() => {
    if (!isLoggedIn()) return;
    sslApi.list().then(r => { if (!r.error) setBackendCerts(r); });
  }, []);

  const checkAllBackend = useCallback(async () => {
    setBackendLoading(true);
    const r = await sslApi.checkAll();
    if (!r.error) {
      const certs = await sslApi.list();
      if (!certs.error) setBackendCerts(certs);
    }
    setBackendLoading(false);
  }, []);

  const httpsUrls = useMemo(() => allUrls.filter(u => u.url.startsWith("https://")), [allUrls]);

  const checkOne = useCallback(async (url) => {
    setChecking(prev => new Set(prev).add(url));
    try {
      const info = await checkSsl(url);
      if (!info.error && !info.notHttps) {
        setSslData(prev => ({ ...prev, [url]: info }));
      }
    } catch {}
    setChecking(prev => { const s = new Set(prev); s.delete(url); return s; });
  }, []);

  const checkAll = useCallback(async () => {
    setLastCheckAll(new Date());
    for (const u of httpsUrls) {
      await checkOne(u.url);
    }
  }, [httpsUrls, checkOne]);

  const sslList = useMemo(() => {
    /* Index backend certs by URL for quick lookup */
    const backendMap = {};
    backendCerts.forEach(c => { backendMap[c.url] = c; });

    return httpsUrls
      .map(u => {
        const info = sslData[u.url] || u.sslInfo;
        const bc = backendMap[u.url];
        const group = groups.find(g => g.urls.some(gu => gu.url === u.url));
        return {
          url: u.url,
          domain: getDomain(u.url),
          group: group?.name || "—",
          daysLeft: bc?.days_left ?? info?.daysLeft ?? null,
          validTo: bc?.expiry_date || info?.validTo || null,
          issuer: bc?.issuer || info?.issuer || null,
          notHttps: info?.notHttps,
          source: bc ? "backend" : (info ? "frontend" : null),
        };
      })
      .filter(item => {
        if (!search) return true;
        const q = search.toLowerCase();
        return item.url.toLowerCase().includes(q) || item.domain.toLowerCase().includes(q) || (item.issuer || "").toLowerCase().includes(q);
      })
      .sort((a, b) => (a.daysLeft ?? 9999) - (b.daysLeft ?? 9999));
  }, [httpsUrls, sslData, groups, search, backendCerts]);

  const stats = useMemo(() => {
    const valid = sslList.filter(s => s.daysLeft != null && s.daysLeft > 30).length;
    const warning = sslList.filter(s => s.daysLeft != null && s.daysLeft > 7 && s.daysLeft <= 30).length;
    const critical = sslList.filter(s => s.daysLeft != null && s.daysLeft <= 7).length;
    const unknown = sslList.filter(s => s.daysLeft == null).length;
    return { valid, warning, critical, unknown, total: sslList.length };
  }, [sslList]);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20, paddingBottom: 24 }}>

      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <ShieldCheck size={18} color="#34D399" />
          <span style={{ fontSize: 14, fontWeight: 600, color: "#E5E7EB" }}>Certificats SSL centralisés</span>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          {lastCheckAll && (
            <span style={{ fontSize: 10, color: "#6B7280" }}>
              Dernière vérification: {lastCheckAll.toLocaleTimeString("fr-FR")}
            </span>
          )}
          <button onClick={checkAll} disabled={checking.size > 0} style={{
            display: "flex", alignItems: "center", gap: 5, padding: "6px 14px", borderRadius: 8,
            background: "rgba(99,102,241,0.1)", border: "1px solid rgba(99,102,241,0.2)",
            color: "#818CF8", fontSize: 11, fontWeight: 600, cursor: checking.size > 0 ? "wait" : "pointer",
            opacity: checking.size > 0 ? 0.6 : 1,
          }}>
            <RefreshCw size={13} className={checking.size > 0 ? "spin" : ""} /> Vérifier tout
          </button>
          {isLoggedIn() && (
            <button onClick={checkAllBackend} disabled={backendLoading} title="Vérification côté backend (TLS direct)" style={{
              display: "flex", alignItems: "center", gap: 5, padding: "6px 14px", borderRadius: 8,
              background: "rgba(168,85,247,0.1)", border: "1px solid rgba(168,85,247,0.2)",
              color: "#C084FC", fontSize: 11, fontWeight: 600, cursor: backendLoading ? "wait" : "pointer",
              opacity: backendLoading ? 0.6 : 1,
            }}>
              {backendLoading ? <RefreshCw size={13} className="spin" /> : <Server size={13} />} Via backend
            </button>
          )}
          <button onClick={() => exportUrlsExcel(groups)} style={{
            display: "flex", alignItems: "center", gap: 5, padding: "6px 14px", borderRadius: 8,
            background: "rgba(52,211,153,0.1)", border: "1px solid rgba(52,211,153,0.2)",
            color: "#34D399", fontSize: 11, fontWeight: 600, cursor: "pointer",
          }}>
            <FileSpreadsheet size={13} /> Export
          </button>
        </div>
      </div>

      {/* KPIs */}
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
        {[
          { label: "Valides (>30j)", value: stats.valid, color: "#34D399", Icon: ShieldCheck },
          { label: "Attention (≤30j)", value: stats.warning, color: "#FBBF24", Icon: ShieldAlert },
          { label: "Critiques (≤7j)", value: stats.critical, color: "#F87171", Icon: ShieldX },
          { label: "Inconnus", value: stats.unknown, color: "#6B7280", Icon: ShieldCheck },
        ].map(({ label, value, color, Icon }) => (
          <div key={label} style={{ flex: "1 1 140px", background: "rgba(255,255,255,0.025)", border: `1px solid ${color}22`, borderRadius: 14, padding: "14px 16px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 8 }}>
              <div style={{ width: 24, height: 24, borderRadius: 7, background: `${color}18`, display: "flex", alignItems: "center", justifyContent: "center" }}>
                <Icon size={12} color={color} />
              </div>
              <span style={{ fontSize: 10, color: "#6B7280", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em" }}>{label}</span>
            </div>
            <div style={{ fontSize: 26, fontWeight: 800, color, fontFamily: "'JetBrains Mono', monospace" }}>{value}</div>
          </div>
        ))}
      </div>

      {/* Search */}
      <div style={{ display: "flex", alignItems: "center", gap: 7, background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 9, padding: "5px 12px" }}>
        <Search size={13} color="#6B7280" />
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Rechercher par domaine, URL ou émetteur..."
          style={{ flex: 1, background: "transparent", border: "none", color: "#E5E7EB", fontSize: 12, outline: "none" }} />
      </div>

      {/* Table */}
      <div style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 12, overflow: "hidden" }}>
        {sslList.length === 0 ? (
          <div style={{ padding: "40px 16px", textAlign: "center", fontSize: 12, color: "#4B5563" }}>
            <Globe size={28} style={{ marginBottom: 10, opacity: 0.2 }} />
            <div>Aucune URL HTTPS à surveiller. Les certificats SSL sont vérifiés automatiquement pour les URLs en https://</div>
          </div>
        ) : (
          <div style={{ maxHeight: 500, overflowY: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
              <thead>
                <tr style={{ position: "sticky", top: 0, background: "#0B0F19", zIndex: 1 }}>
                  <th style={{ textAlign: "left", padding: "8px 14px", color: "#6B7280", fontWeight: 600, borderBottom: "1px solid rgba(255,255,255,0.06)" }}>Domaine</th>
                  <th style={{ textAlign: "left", padding: "8px 14px", color: "#6B7280", fontWeight: 600, borderBottom: "1px solid rgba(255,255,255,0.06)" }}>Groupe</th>
                  <th style={{ textAlign: "center", padding: "8px 14px", color: "#6B7280", fontWeight: 600, borderBottom: "1px solid rgba(255,255,255,0.06)" }}>Statut</th>
                  <th style={{ textAlign: "right", padding: "8px 14px", color: "#6B7280", fontWeight: 600, borderBottom: "1px solid rgba(255,255,255,0.06)" }}>Jours restants</th>
                  <th style={{ textAlign: "left", padding: "8px 14px", color: "#6B7280", fontWeight: 600, borderBottom: "1px solid rgba(255,255,255,0.06)" }}>Expiration</th>
                  <th style={{ textAlign: "left", padding: "8px 14px", color: "#6B7280", fontWeight: 600, borderBottom: "1px solid rgba(255,255,255,0.06)" }}>Émetteur</th>
                  <th style={{ textAlign: "center", padding: "8px 14px", color: "#6B7280", fontWeight: 600, borderBottom: "1px solid rgba(255,255,255,0.06)" }}>Action</th>
                </tr>
              </thead>
              <tbody>
                {sslList.map(item => {
                  const st = sslStatus(item.daysLeft);
                  return (
                    <tr key={item.url} style={{ borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
                      <td style={{ padding: "8px 14px", color: "#E5E7EB", fontWeight: 600, fontFamily: "'JetBrains Mono', monospace", fontSize: 11 }}>{item.domain}</td>
                      <td style={{ padding: "8px 14px", color: "#9CA3AF", fontSize: 11 }}>{item.group}</td>
                      <td style={{ padding: "8px 14px", textAlign: "center" }}>
                        <span style={{ display: "inline-flex", alignItems: "center", gap: 4, padding: "2px 8px", borderRadius: 6, fontSize: 10, fontWeight: 700, background: st.bg, color: st.color, border: `1px solid ${st.color}30` }}>
                          <st.Icon size={11} /> {st.label}
                        </span>
                      </td>
                      <td style={{ textAlign: "right", padding: "8px 14px", fontFamily: "'JetBrains Mono', monospace", fontWeight: 700, color: st.color }}>
                        {item.daysLeft != null ? `${item.daysLeft}j` : "—"}
                      </td>
                      <td style={{ padding: "8px 14px", color: "#9CA3AF", fontSize: 11 }}>{item.validTo || "—"}</td>
                      <td style={{ padding: "8px 14px", color: "#6B7280", fontSize: 11, maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{item.issuer || "—"}</td>
                      <td style={{ textAlign: "center", padding: "8px 14px" }}>
                        <button onClick={() => checkOne(item.url)} disabled={checking.has(item.url)} style={{
                          padding: "3px 8px", borderRadius: 6, fontSize: 10, cursor: "pointer",
                          background: "rgba(99,102,241,0.1)", border: "1px solid rgba(99,102,241,0.2)", color: "#818CF8",
                          opacity: checking.has(item.url) ? 0.5 : 1,
                        }}>{checking.has(item.url) ? "..." : "Vérifier"}</button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } } .spin { animation: spin 1s linear infinite; }`}</style>
    </div>
  );
}
