import { useRef, useState } from "react";
import {
  FileSpreadsheet, Download, RotateCcw, CheckCircle,
  X, Loader2, Plug, KeyRound, Eye, EyeOff,
} from "lucide-react";
import * as XLSX from "xlsx";
import { setServers, resetServers, getServersMeta } from "../utils/servers";

const API_LS_KEY = "capacity-itcare-config";

function loadApiConfig() {
  try { return JSON.parse(localStorage.getItem(API_LS_KEY)) || { clientId: "", clientSecret: "" }; }
  catch { return { clientId: "", clientSecret: "" }; }
}

/* ── Transform ressource ITCare → colonnes reconnues par normalizeServer ── */
function itcareToRow(r) {
  const path = String(r.path || r.resourcePath || r.resourceType || "");

  /* OS : depuis champ explicite OU déduction depuis le path hiérarchique */
  let type = r.os || r.osName || r.osType || r.operatingSystem || r.family || r.type || "";
  if (!type) {
    const m = path.match(/Instance\/([^/]+)(?:\/([^/]+))?/i);
    type = m ? (m[2] || m[1]) : path.split("/").pop() || "";
  }

  /* Statut : normaliser les valeurs ITCare en texte lisible */
  const rawStatus = String(r.status || r.state || "");
  const statut = rawStatus === "RUNNING" ? "Running"
    : rawStatus === "STOPPED"  ? "Stopped"
    : rawStatus === "SUSPENDED" ? "Maintenance"
    : rawStatus || null;

  return {
    Name:          r.name || r.hostname || r.displayName || String(r.id || ""),
    Type:          type || "Unknown",
    Statut:        statut,
    CPU:           r.cpuUsage   ?? r.cpuPercent  ?? r.cpu  ?? null,
    RAM:           r.memoryGb   ?? r.ramGb       ?? r.memoryGB ?? r.memoryInGb ?? null,
    Stockage:      r.diskGb     ?? r.storageGb   ?? r.diskGB   ?? r.storageInGb ?? null,
    IP:            r.ip || r.ipAddress || r.privateIp || r.privateIpAddress || "",
    Service:       r.applicationName || r.application || r.service || r.serviceName || "",
    Environnement: r.environment || r.env || r.environmentName || "",
    creationTime:  r.createdAt || r.creationDate || r.creationTime || "",
    "Path ITCare": path,
    "ID ITCare":   String(r.id || ""),
  };
}

/* Colonnes du template Excel — entêtes correspondant au fichier utilisateur */
const TEMPLATE_ROWS = [
  { Name: "WEB-PROD-01",   Type: "Ubuntu 22.04 LTS",      Statut: "Running",     CPU: 45, RAM: 16,  Stockage: 256,  IP: "10.10.1.10", Service: "Portail Client", Environnement: "Production", creationTime: "2023-01-15" },
  { Name: "SQL-PROD-01",   Type: "Windows Server 2022",   Statut: "Running",     CPU: 62, RAM: 64,  Stockage: 2048, IP: "10.10.1.20", Service: "ERP Finance",   Environnement: "Recette",    creationTime: "2022-06-10" },
  { Name: "APP-METIER-01", Type: "Windows Server 2019",   Statut: "Maintenance", CPU: 40, RAM: 32,  Stockage: 512,  IP: "10.10.1.30", Service: "ERP M\u00e9tier",    Environnement: "Production", creationTime: "2021-09-22" },
  { Name: "REDIS-CACHE-01",Type: "Debian 12",             Statut: "Running",     CPU: 25, RAM: 32,  Stockage: 64,   IP: "10.10.1.40", Service: "Session Store", Environnement: "Production", creationTime: "2023-03-08" },
];

export default function ServerImport() {
  const fileRef = useRef(null);
  const [msg, setMsg] = useState(null);
  const [showApi, setShowApi] = useState(false);
  const [api, setApi] = useState(loadApiConfig);
  const [loading, setLoading] = useState(false);
  const [showSecret, setShowSecret] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);
  const meta = getServersMeta();

  const flash = (m) => { setMsg(m); setTimeout(() => setMsg(null), 5000); };

  /* ── Import Excel ── */
  const handleFile = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const data = await file.arrayBuffer();
      const wb = XLSX.read(data, { type: "array" });
      const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]]);
      if (rows.length === 0) throw new Error("vide");
      const count = setServers(rows, "excel", file.name);
      flash({ ok: true, text: `${count} serveurs importés depuis ${file.name}` });
    } catch {
      flash({ ok: false, text: "Fichier illisible — vérifiez les colonnes (Name, Type, CPU, RAM, Stockage…)" });
    }
    e.target.value = "";
  };

  /* ── Template ── */
  const downloadTemplate = () => {
    const ws = XLSX.utils.json_to_sheet(TEMPLATE_ROWS);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Serveurs");
    XLSX.writeFile(wb, "template-serveurs.xlsx");
  };

  /* ── Chargement ITCare ── */
  const fetchItcare = async () => {
    const clientId     = api.clientId.trim();
    const clientSecret = api.clientSecret.trim();
    if (!clientId || !clientSecret)
      return flash({ ok: false, text: "Renseignez le Client ID et le Client Secret ITCare" });
    setLoading(true);
    try {
      localStorage.setItem(API_LS_KEY, JSON.stringify({ clientId, clientSecret }));
      const res = await fetch("/api/itcare", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clientId, clientSecret }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`);
      const rawList = json.servers || json.data || json.items || [];
      if (rawList.length === 0) throw new Error("Aucune ressource retournée par ITCare");
      const rows  = rawList.map(itcareToRow);
      const count = setServers(rows, "api", "ITCare");
      flash({ ok: true, text: `${count} serveurs chargés depuis ITCare` });
      setShowApi(false);
    } catch (err) {
      flash({ ok: false, text: `Échec ITCare : ${err.message}` });
    } finally {
      setLoading(false);
    }
  };

  const btn = (color) => ({
    display: "flex", alignItems: "center", gap: 6, padding: "7px 14px", borderRadius: 9,
    background: `${color}14`, border: `1px solid ${color}38`, color,
    fontSize: 12, fontWeight: 600, cursor: "pointer", whiteSpace: "nowrap",
    transition: "background 0.15s",
  });

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8, alignItems: "flex-end" }}>
      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", justifyContent: "flex-end" }}>
        {/* Source actuelle */}
        <span style={{
          fontSize: 10, padding: "3px 10px", borderRadius: 12,
          background: meta.source === "demo" ? "rgba(255,255,255,0.05)" : "rgba(52,211,153,0.1)",
          border: `1px solid ${meta.source === "demo" ? "rgba(255,255,255,0.1)" : "rgba(52,211,153,0.25)"}`,
          color: meta.source === "demo" ? "#6B7280" : "#34D399", fontWeight: 600,
        }}>
          {meta.source === "demo" ? "Données de démo" :
            meta.source === "excel" ? `Excel : ${meta.label}` : `ITCare : ${meta.label}`}
        </span>

        <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" onChange={handleFile} style={{ display: "none" }} />
        <button style={btn("#34D399")} onClick={() => fileRef.current?.click()} title="Importer un inventaire serveurs (.xlsx)">
          <FileSpreadsheet size={13} /> Importer Excel
        </button>
        <button style={btn("#818CF8")} onClick={() => setShowApi(v => !v)} title="Charger depuis l'API ITCare">
          <Plug size={13} /> ITCare
        </button>
        <button style={btn("#6B7280")} onClick={downloadTemplate} title="Télécharger le modèle Excel">
          <Download size={13} /> Modèle
        </button>
        {meta.source !== "demo" && !confirmReset && (
          <button style={btn("#F87171")} onClick={() => setConfirmReset(true)} title="Supprimer tous les serveurs importés">
            <RotateCcw size={13} /> Effacer
          </button>
        )}
        {confirmReset && (
          <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "5px 10px", borderRadius: 9, background: "rgba(248,113,113,0.08)", border: "1px solid rgba(248,113,113,0.3)" }}>
            <span style={{ fontSize: 11, color: "#F87171", fontWeight: 600 }}>Supprimer tous les serveurs + snapshots ?</span>
            <button style={{ ...btn("#F87171"), padding: "3px 10px" }} onClick={() => { resetServers(); setConfirmReset(false); flash({ ok: true, text: "Inventaire effacé — données de démo restaurées" }); }}>Oui</button>
            <button style={{ ...btn("#6B7280"), padding: "3px 10px" }} onClick={() => setConfirmReset(false)}>Non</button>
          </div>
        )}
      </div>

      {/* Panneau ITCare */}
      {showApi && (
        <div style={{
          display: "flex", flexDirection: "column", gap: 8,
          background: "rgba(255,255,255,0.03)", border: "1px solid rgba(99,102,241,0.25)",
          borderRadius: 10, padding: "12px 14px", animation: "fadeIn 0.2s ease", minWidth: 340,
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 2 }}>
            <KeyRound size={13} color="#818CF8" />
            <span style={{ fontSize: 11, fontWeight: 700, color: "#818CF8", letterSpacing: "0.04em" }}>Connexion ITCare</span>
            <span style={{ fontSize: 10, color: "#4B5563", marginLeft: 4 }}>accounts.cegedim.cloud (OAuth2)</span>
          </div>
          <input
            value={api.clientId}
            onChange={e => setApi(a => ({ ...a, clientId: e.target.value }))}
            onKeyDown={e => e.key === "Enter" && fetchItcare()}
            placeholder="Client ID"
            autoComplete="username"
            style={{
              background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)",
              borderRadius: 7, color: "#E5E7EB", fontSize: 11, padding: "7px 10px",
              fontFamily: "'JetBrains Mono', monospace", outline: "none", width: "100%", boxSizing: "border-box",
            }}
          />
          <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
            <input
              value={api.clientSecret}
              onChange={e => setApi(a => ({ ...a, clientSecret: e.target.value }))}
              onKeyDown={e => e.key === "Enter" && fetchItcare()}
              placeholder="Client Secret"
              type={showSecret ? "text" : "password"}
              autoComplete="current-password"
              style={{
                flex: 1, background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)",
                borderRadius: 7, color: "#E5E7EB", fontSize: 11, padding: "7px 10px",
                fontFamily: "'JetBrains Mono', monospace", outline: "none",
              }}
            />
            <button
              onClick={() => setShowSecret(v => !v)}
              style={{ background: "none", border: "none", color: "#6B7280", cursor: "pointer", display: "flex", padding: 4 }}
              title={showSecret ? "Masquer" : "Afficher"}
            >
              {showSecret ? <EyeOff size={14} /> : <Eye size={14} />}
            </button>
          </div>
          <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
            <button style={{ ...btn("#6B7280"), fontSize: 11 }} onClick={() => setShowApi(false)}>Annuler</button>
            <button style={{ ...btn("#818CF8"), opacity: loading ? 0.6 : 1, fontSize: 11 }} onClick={fetchItcare} disabled={loading}>
              {loading ? <Loader2 size={13} style={{ animation: "spin 1s linear infinite" }} /> : <Plug size={13} />}
              {loading ? "Connexion…" : "Charger les serveurs"}
            </button>
          </div>
        </div>
      )}

      {/* Feedback */}
      {msg && (
        <div style={{
          display: "flex", alignItems: "center", gap: 6, padding: "5px 12px", borderRadius: 8,
          background: msg.ok ? "rgba(52,211,153,0.1)" : "rgba(248,113,113,0.1)",
          border: `1px solid ${msg.ok ? "rgba(52,211,153,0.25)" : "rgba(248,113,113,0.25)"}`,
          color: msg.ok ? "#34D399" : "#F87171", fontSize: 11, animation: "fadeIn 0.2s ease",
        }}>
          {msg.ok ? <CheckCircle size={12} /> : <X size={12} />} {msg.text}
        </div>
      )}
    </div>
  );
}
