import { useRef, useState } from "react";
import {
  FileSpreadsheet, Download, RotateCcw, CheckCircle,
  X, Loader2, Plug, KeyRound, Eye, EyeOff, Search,
} from "lucide-react";
import * as XLSX from "xlsx";
import { setServers, resetServers, getServersMeta } from "../utils/servers";

const API_LS_KEY = "capacity-itcare-config";

function loadApiConfig() {
  try { return JSON.parse(localStorage.getItem(API_LS_KEY)) || { clientId: "", clientSecret: "", authMode: "credentials" }; }
  catch { return { clientId: "", clientSecret: "", authMode: "credentials" }; }
}

/* ── Helpers ── */
function firstOf(...vals) { for (const v of vals) if (v != null && v !== "") return v; return null; }

function mbToGb(v) { return v != null ? Math.round(v / 1024 * 10) / 10 : null; }

/* ── Extraction du nom d'application depuis serviceName ──
   Format ITCare : "FRANCE COMPETENCES - ETAPE - DEV"
   → cloudName = "FRANCE COMPETENCES", appName = "ETAPE", environment = "DEV"
── */
function parseAppName(serviceName, cloudName, environment) {
  if (!serviceName) return "";
  const parts = serviceName.split(" - ").map(s => s.trim());
  if (parts.length < 2) return serviceName;
  /* Normalisation accents + casse : "France Compétences" === "FRANCE COMPETENCES" */
  const norm = s => s.trim().toUpperCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  const firstMatch = cloudName && norm(parts[0]) === norm(cloudName);
  const lastMatch  = environment && norm(parts[parts.length - 1]) === norm(environment);
  /* Détection des environnements connus par mot-clé (même si environment est null/différent) */
  const ENV_KEYWORDS = /^(PROD|PRODUCTION|RECETTE|UAT|QUALIF|STAGING|PREPROD|DEV|DEVELOPPEMENT|TEST|INTEGRATION|INTEG|QA)$/i;
  const lastIsEnv = lastMatch || ENV_KEYWORDS.test(parts[parts.length - 1]);
  /* Heuristique : 3 parties + dernier = environnement connu → la 1ère est un préfixe organisation
     (couvre le cas cloudName = null ou sans accent correspondant) */
  const skipFirst = firstMatch || (parts.length >= 3 && lastIsEnv);
  const middle = parts.slice(skipFirst ? 1 : 0, lastIsEnv ? -1 : undefined);
  return middle.join(" - ") || serviceName;
}

/* ── Transform ressource ITCare → colonnes reconnues par normalizeServer ──
   Champs confirmés par l'API (inspect) :
   category | cloudId | cloudName | comment | creationTime | creationUser |
   environment | family | id | internalResourceId | name | path | productName |
   resourceType | serviceId | serviceName | status | supportLevel | supportPhase | type
   + champs enrichis via GET /compute/instances/{internalResourceId} (confirmé DevTools) :
     ram, cpu, storage, ipAddress, backup{backupSystem,size,type,lastDate},
     backupPolicyDetails{backups,policies}, patchParty{patchGroup,patchDate,patchTag,excluded}
   + GET .../storage → _storage{fileSystems,totalSizeFileSystems,totalSizeDisks}
   + GET .../snapshots → _snapshots[]
── */
function itcareToRow(r) {
  const path = String(r.path || "");

  /* ── OS / Type ──
     `family`      → famille OS ("Windows", "Linux"…)
     `label`       → libellé lisible (disponible via endpoint détail)
     `prettyLabel` → variante lisible
     `path`        → ex. "/compute/instances/Windows/Server2022" */
  let osType = String(r.family || "");
  if (!osType) {
    /* Déduction depuis le path */
    const m = path.match(/(Windows|Linux|Ubuntu|Debian|RedHat|CentOS|Rocky|Alpine|VMware)/i);
    osType = m ? m[1] : String(r.type || r.resourceType || "");
  }
  /* Libellé lisible pour l'affichage UI */
  const displayLabel = String(r.prettyLabel || r.label || "");

  /* ── Statut ── (ACTIVE = valeur réelle de l'API ITCare) */
  const rawSt = String(r.status || "").toUpperCase();
  const statut = ["RUNNING","ACTIVE","ON","STARTED","UP"].includes(rawSt)       ? "Running"
    : ["STOPPED","OFF","INACTIVE","DOWN","HALTED"].includes(rawSt)               ? "Stopped"
    : ["SUSPENDED","MAINTENANCE","IN_MAINTENANCE","PAUSED"].includes(rawSt)      ? "Maintenance"
    : r.status || null;

  /* ── IP ──
     `ipAddress` confirmé dans la liste + `network` peut être objet ou string ── */
  let ip = firstOf(r.ip, r.ipAddress, r.privateIp, r.mainIp, r.primaryIp);
  if (!ip && Array.isArray(r.ipAddresses) && r.ipAddresses.length) {
    const f = r.ipAddresses[0];
    ip = typeof f === "string" ? f : firstOf(f.address, f.ip, f.value);
  }
  if (!ip && r.network) {
    if (typeof r.network === "string") ip = r.network;
    else ip = firstOf(r.network.ip, r.network.ipAddress, r.network.address, r.network.privateIp);
  }
  if (!ip && Array.isArray(r.networkInterfaces) && r.networkInterfaces.length) {
    const ni = r.networkInterfaces[0];
    ip = firstOf(ni.ip, ni.ipAddress);
  }

  /* ── CPU ──
     `r.cpu` = nb vCPU confirmé (ex: 2) ── */
  const cores  = firstOf(r.cpu, r.cpuCount, r.vcpuCount, r.vcpu, r.cores, r.nbCpu, r.numberOfCpu);
  /* CPU% temps réel — confirmé via GET /monitoring/resources/{id}/chart?graph-name=SYS_LNX_CPU_USAGE → r._monitoring.cpuPct */
  const cpuPct = firstOf(r._monitoring?.cpuPct, r.cpuUsage, r.cpuPercent, r.cpuLoad, r.cpuUtilization);

  /* ── RAM (Go) ──
     `r.ram` = Go confirmé (ex: 8) ── */
  let ramGb = firstOf(r.ram, r.ramSize, r.memoryGb, r.ramGb, r.memoryGB, r.memorySizeGb, r.totalMemoryGb);
  if (ramGb == null) {
    const mb = firstOf(r.memoryMb, r.memoryMB, r.memory, r.totalMemory, r.memorySize, r.ramMb);
    if (mb != null) ramGb = mb > 1000 ? mbToGb(mb) : mb;
  }
  /* RAM% temps réel — confirmé via GET /monitoring/resources/{id}/chart?graph-name=SYS_LNX_MEMORY_USAGE → r._monitoring.ramPct (used_prct) */
  const ramPct    = firstOf(r._monitoring?.ramPct, r.memoryUsage, r.ramUsage, r.memoryPercent, r.ramPercent);
  const ramUsedGb = r._monitoring?.ramUsedGb;

  /* ── Stockage (Go) ──
     `r.storage` et `r.totalSizeDisks` confirmés dans la liste ── */
  let diskGb = firstOf(r.storage, r.totalSizeDisks, r.disk, r.diskGb, r.storageGb, r.diskGB,
                       r.diskSizeGb, r.totalDiskGb, r.totalStorageGb);
  if (diskGb == null) {
    const mb = firstOf(r.diskMb, r.storageMb);
    if (mb != null) diskGb = mb > 1000 ? mbToGb(mb) : mb;
  }
  const diskPct = firstOf(r.diskUsage, r.storageUsage, r.diskPercent);

  /* ── Application / badge ──
     Format `serviceName` : "FRANCE COMPETENCES - ETAPE - DEV"
     → on retire le préfixe cloudName et le suffixe environment ── */
  const service = parseAppName(r.serviceName, r.cloudName, r.environment);

  /* Datacenter / zone */
  const datacenter = firstOf(r.labelDataCenter, r.labelRegion, r.labelAvailabilityZone, r.labelArea) || "";

  /* NOTE : ne pas inclure CPU/RAM%/Stockage% à null :
     - "RAM%" → flat key "ram" (collision avec RAM → écrase la valeur GB !)
     - "Stockage%" → flat key "stockage" (même collision)
     - CPU null → fallback 30% dans normalizeServer → affichage trompeur
     Aucune métrique d'usage n'est disponible via l'API ITCare. */
  /* ── Backup — confirmé via GET /compute/instances/{id} → r.backup + r.backupPolicyDetails ── */
  const backupStatus  = String(r.backupStatus != null ? (r.backupStatus ? "Oui" : "Non") : "");
  const backupObj      = r.backup || {};
  const lastBackupDate = backupObj.lastDate || "";
  const backupStorageGb = backupObj.size != null ? backupObj.size : null;
  const backupSystem   = backupObj.backupSystem || "";
  const bkPolicy        = (r.backupPolicyDetails?.policies || [])[0] || {};
  const backupPolicyLabel = bkPolicy.label || bkPolicy.name || (r.backupPolicyDetails?.backups?.length
    ? r.backupPolicyDetails.backups.map(b => b.type || "").filter(Boolean).join(", ") : "");
  const backupRetentionDays = Object.values(bkPolicy.frequencies || {})[0]?.retention;

  /* ── Patch party — confirmé via GET /compute/instances/{id} → r.patchParty ── */
  const patch = r.patchParty || {};
  const patchLastDate      = patch.patchDate || "";
  const patchTag           = patch.patchTag || "";
  const patchGroup         = patch.patchGroup ? `Groupe ${patch.patchGroup}` : "";
  const patchExcluded      = patch.excluded === true;
  const patchExclusionReason = patch.exclusionReason || "";

  /* ── Stockage détaillé — confirmé via GET /compute/instances/{id}/storage → r._storage ── */
  const _storage = r._storage || {};
  const fileSystems = _storage.fileSystems || _storage.disks || _storage.volumes || [];
  const volumesJson = fileSystems.length > 0 ? JSON.stringify(fileSystems.map(fs => {
    const total = fs.sizeOf ?? fs.size ?? fs.total ?? fs.capacity ?? null;
    const free  = fs.free ?? fs.available ?? fs.freeSpace ?? null;
    const used  = (total != null && free != null) ? Math.round((total - free) * 100) / 100 : (fs.used ?? fs.usedSpace ?? null);
    const pct   = (total && used != null) ? Math.round((used / total) * 100) : (fs.pct ?? fs.percentage ?? null);
    return { mount: fs.mountingPoint || fs.mount || fs.path || fs.device || "", total, used, free, pct };
  })) : "";
  const storageConfiguredGb = _storage.totalSizeFileSystems ?? _storage.totalSize ?? null;
  const storageUsedGb = fileSystems.length > 0
    ? Math.round(fileSystems.reduce((s, fs) => s + ((fs.sizeOf ?? fs.size ?? fs.total ?? 0) - (fs.free ?? fs.available ?? 0)), 0) * 100) / 100
    : null;

  /* ── Utilisation Disque (%) — Windows : volume C: | Linux : total global (sum used / sum total) ── */
  const isWindows = /windows/i.test(osType) || /windows/i.test(path);
  let diskUsagePct = null;
  if (fileSystems.length > 0) {
    const pctOf = (fs) => {
      const t = fs.sizeOf ?? fs.size ?? fs.total ?? 0;
      const f = fs.free ?? fs.available ?? 0;
      return t > 0 ? Math.round(((t - f) / t) * 100) : null;
    };
    if (isWindows) {
      const cDrive = fileSystems.find(fs => /^c[:\\/]*$/i.test(String(fs.mountingPoint || fs.mount || "").trim()));
      diskUsagePct = cDrive ? pctOf(cDrive) : pctOf(fileSystems[0]);
    } else {
      /* Linux : total global = (sum sizeOf - sum free) / sum sizeOf
         = la barre agrégée affichée en haut de la section Volumes (ex: 418.99/626.66 → 67%) */
      const totalSizeOf = fileSystems.reduce((s, fs) => s + (fs.sizeOf ?? fs.size ?? fs.total ?? 0), 0);
      const totalFree   = fileSystems.reduce((s, fs) => s + (fs.free ?? fs.available ?? 0), 0);
      diskUsagePct = totalSizeOf > 0 ? Math.round(((totalSizeOf - totalFree) / totalSizeOf) * 100) : null;
    }
  }

  /* ── Snapshots — confirmé via GET /compute/instances/{id}/snapshots → r._snapshots ── */
  const snapArr = Array.isArray(r._snapshots) ? r._snapshots : [];
  const snapshotsJson = snapArr.length > 0 ? JSON.stringify(snapArr.map(s => ({
    name: firstOf(s.name, s.description, s.id) || "",
    date: firstOf(s.createdAt, s.creationDate, s.creationTime, s.date) || "",
    size: firstOf(s.sizeGb, s.diskSizeGb, s.storageSizeGb, s.size),
    desc: firstOf(s.description, s.comment) || "",
  }))) : "";

  return {
    Name:            r.name || String(r.id || ""),
    Type:            displayLabel || osType || "Unknown",
    Statut:          statut,
    Cores:           cores != null ? String(cores) : null,
    RAM:             ramGb,
    Stockage:        diskGb,
    IP:              ip || "",
    Service:         service,
    Environnement:   String(r.environment || ""),
    Datacenter:      datacenter,
    /* --- infos OS / infra --- */
    "OS Family":     osType,
    "Resource Type": String(r.resourceType || r.type || ""),
    Category:        String(r.category || ""),
    Cloud:           String(r.cloudName || ""),
    "Product":       String(r.productName || ""),
    Support:         [r.supportLevel, r.supportPhase].filter(Boolean).join(" / "),
    "Service Full":  String(r.serviceName || ""),
    "ServiceKey":    String(r.serviceKey || ""),
    "Total Disques": r.totalSizeDisks != null ? String(r.totalSizeDisks) : "",
    "Réplication":   String(r.replicationStatus || ""),
    ...((diskUsagePct ?? diskPct) != null ? { "Utilisation Disque": diskUsagePct ?? diskPct } : {}),
    ...(cpuPct != null ? { "Utilisation CPU": cpuPct } : {}),
    ...(ramPct != null ? { "Utilisation RAM": ramPct } : {}),
    ...(ramUsedGb != null ? { "RAM Consommée": `${ramUsedGb} Go` } : {}),
    /* --- backup --- */
    "Backup":              backupStatus,
    ...(backupPolicyLabel  ? { "Backup Policy":        backupPolicyLabel } : {}),
    ...(lastBackupDate     ? { "Dernière Sauvegarde":  lastBackupDate } : {}),
    ...(backupStorageGb != null ? { "Stockage Sauvegarde":  `${backupStorageGb} Go` } : {}),
    ...(backupRetentionDays ? { "Rétention Sauvegarde": `${backupRetentionDays} jours` } : {}),
    ...(backupSystem       ? { "Système Sauvegarde":    backupSystem } : {}),
    /* --- patch party --- */
    ...(patchLastDate ? { "Dernière Patch Party": patchLastDate } : {}),
    ...(patchTag      ? { "Patch Tag":            patchTag }      : {}),
    ...(patchGroup    ? { "Groupe Patch":          patchGroup }   : {}),
    ...(patchExcluded ? { "Patch Exclu":           patchExclusionReason || "Oui" } : {}),
    /* --- stockage détaillé (JSON) --- */
    ...(storageConfiguredGb != null ? { "Stockage Configuré": `${storageConfiguredGb} Go` } : {}),
    ...(storageUsedGb       != null ? { "Stockage Utilisé":   `${storageUsedGb} Go` } : {}),
    ...(volumesJson   ? { "_Volumes":   volumesJson }   : {}),
    ...(snapshotsJson ? { "_Snapshots": snapshotsJson } : {}),
    /* --- dates --- */
    creationTime:    r.creationTime || "",
    "ITCare Path":   path,
    "ITCare ID":     String(r.id || ""),
  };
}

/* Colonnes du template Excel — entêtes correspondant au fichier utilisateur */
const TEMPLATE_ROWS = [
  { Name: "WEB-PROD-01",   Type: "Ubuntu 22.04 LTS",      Statut: "Running",     CPU: 45, RAM: 16,  Stockage: 256,  IP: "10.10.1.10", Service: "Portail Client", Environnement: "Production", creationTime: "2023-01-15" },
  { Name: "SQL-PROD-01",   Type: "Windows Server 2022",   Statut: "Running",     CPU: 62, RAM: 64,  Stockage: 2048, IP: "10.10.1.20", Service: "ERP Finance",   Environnement: "Recette",    creationTime: "2022-06-10" },
  { Name: "APP-METIER-01", Type: "Windows Server 2019",   Statut: "Maintenance", CPU: 40, RAM: 32,  Stockage: 512,  IP: "10.10.1.30", Service: "ERP M\u00e9tier",    Environnement: "Production", creationTime: "2021-09-22" },
  { Name: "REDIS-CACHE-01",Type: "Debian 12",             Statut: "Running",     CPU: 25, RAM: 32,  Stockage: 64,   IP: "10.10.1.40", Service: "Session Store", Environnement: "Production", creationTime: "2023-03-08" },
];

export default function ServerImport({ isMobile = false }) {
  const fileRef = useRef(null);
  const [msg, setMsg] = useState(null);
  const [showApi, setShowApi] = useState(false);
  const [api, setApi] = useState(loadApiConfig);
  const [loading, setLoading] = useState(false);
  const [showSecret, setShowSecret] = useState(false);
  const [userToken, setUserToken] = useState("");
  const [confirmReset, setConfirmReset] = useState(false);
  const [inspect, setInspect] = useState(null);   /* { allKeys, sample } */
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

  /* ── Inspection des champs bruts ITCare ── */
  const inspectItcare = async () => {
    const isTokenMode = api.authMode === "token";
    let body;
    if (isTokenMode) {
      const tok = userToken.trim().replace(/^Bearer\s+/i, "");
      if (!tok) return flash({ ok: false, text: "Collez votre token de session ITCare" });
      body = { token: tok };
    } else {
      const clientId = api.clientId.trim(), clientSecret = api.clientSecret.trim();
      if (!clientId || !clientSecret) return flash({ ok: false, text: "Renseignez les identifiants ITCare" });
      body = { clientId, clientSecret };
    }
    setLoading(true);
    try {
      const res = await fetch("/api/itcare-inspect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`);
      setInspect(json);
    } catch (err) {
      flash({ ok: false, text: `Inspection échouée : ${err.message}` });
    } finally {
      setLoading(false);
    }
  };

  /* ── Chargement ITCare ── */
  const fetchItcare = async () => {
    const isTokenMode = api.authMode === "token";
    let body;
    if (isTokenMode) {
      const tok = userToken.trim().replace(/^Bearer\s+/i, "");
      if (!tok) return flash({ ok: false, text: "Collez votre token de session ITCare" });
      body = { token: tok };
    } else {
      const clientId     = api.clientId.trim();
      const clientSecret = api.clientSecret.trim();
      if (!clientId || !clientSecret)
        return flash({ ok: false, text: "Renseignez le Client ID et le Client Secret ITCare" });
      localStorage.setItem(API_LS_KEY, JSON.stringify({ clientId, clientSecret, authMode: "credentials" }));
      body = { clientId, clientSecret };
    }
    setLoading(true);
    try {
      const res = await fetch("/api/itcare", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
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
    display: "flex", alignItems: "center", gap: isMobile ? 4 : 6, padding: isMobile ? "5px 8px" : "7px 14px", borderRadius: 9,
    background: `${color}14`, border: `1px solid ${color}38`, color,
    fontSize: isMobile ? 11 : 12, fontWeight: 600, cursor: "pointer", whiteSpace: "nowrap",
    transition: "background 0.15s",
  });

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: isMobile ? 6 : 8, alignItems: "flex-end" }}>
      <div style={{ display: "flex", gap: isMobile ? 5 : 8, alignItems: "center", flexWrap: "wrap", justifyContent: "flex-end" }}>
        {/* Source actuelle */}
        {!isMobile && (
        <span style={{
          fontSize: 10, padding: "3px 10px", borderRadius: 12,
          background: meta.source === "demo" ? "rgba(255,255,255,0.05)" : "rgba(52,211,153,0.1)",
          border: `1px solid ${meta.source === "demo" ? "rgba(255,255,255,0.1)" : "rgba(52,211,153,0.25)"}`,
          color: meta.source === "demo" ? "#6B7280" : "#34D399", fontWeight: 600,
        }}>
          {meta.source === "demo" ? "Données de démo" :
            meta.source === "excel" ? `Excel : ${meta.label}` : `ITCare : ${meta.label}`}
        </span>
        )}

        <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" onChange={handleFile} style={{ display: "none" }} />
        <button style={btn("#34D399")} onClick={() => fileRef.current?.click()} title="Importer un inventaire serveurs (.xlsx)">
          <FileSpreadsheet size={isMobile ? 14 : 13} />{!isMobile && " Importer Excel"}
        </button>
        <button style={btn("#818CF8")} onClick={() => { setShowApi(v => !v); setInspect(null); }} title="Charger depuis l'API ITCare">
          <Plug size={isMobile ? 14 : 13} />{!isMobile && " ITCare"}
        </button>
        <button style={btn("#6B7280")} onClick={downloadTemplate} title="Télécharger le modèle Excel">
          <Download size={isMobile ? 14 : 13} />{!isMobile && " Modèle"}
        </button>
        {meta.source !== "demo" && !confirmReset && (
          <button style={btn("#F87171")} onClick={() => setConfirmReset(true)} title="Supprimer tous les serveurs importés">
            <RotateCcw size={isMobile ? 14 : 13} />{!isMobile && " Effacer"}
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
          borderRadius: 10, padding: "12px 14px", animation: "fadeIn 0.2s ease", minWidth: 360,
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 2 }}>
            <KeyRound size={13} color="#818CF8" />
            <span style={{ fontSize: 11, fontWeight: 700, color: "#818CF8", letterSpacing: "0.04em" }}>Connexion ITCare</span>
          </div>

          {/* Toggle mode */}
          <div style={{ display: "flex", gap: 4, background: "rgba(255,255,255,0.04)", borderRadius: 7, padding: 3 }}>
            {[["credentials", "Client ID / Secret"], ["token", "Token de session"]].map(([mode, label]) => (
              <button
                key={mode}
                onClick={() => setApi(a => ({ ...a, authMode: mode }))}
                style={{
                  flex: 1, padding: "5px 0", borderRadius: 5, fontSize: 10, fontWeight: 600, cursor: "pointer",
                  border: "none", transition: "background 0.15s, color 0.15s",
                  background: api.authMode === mode ? "rgba(129,140,248,0.25)" : "transparent",
                  color: api.authMode === mode ? "#818CF8" : "#6B7280",
                }}
              >{label}</button>
            ))}
          </div>

          {api.authMode === "credentials" ? (
            <>
              <span style={{ fontSize: 10, color: "#4B5563" }}>accounts.cegedim.cloud — OAuth2 client_credentials</span>
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
            </>
          ) : (
            <>
              <span style={{ fontSize: 10, color: "#4B5563" }}>
                Collez le Bearer token copié depuis l'onglet Réseau (DevTools) sur ITCare
              </span>
              <textarea
                value={userToken}
                onChange={e => setUserToken(e.target.value)}
                placeholder="eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9…"
                rows={4}
                style={{
                  background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)",
                  borderRadius: 7, color: "#E5E7EB", fontSize: 10, padding: "7px 10px",
                  fontFamily: "'JetBrains Mono', monospace", outline: "none",
                  width: "100%", boxSizing: "border-box", resize: "vertical",
                }}
              />
              <span style={{ fontSize: 10, color: "#6B7280" }}>
                Le préfixe <code style={{ color: "#818CF8" }}>Bearer </code> est accepté, il sera retiré automatiquement.
              </span>
            </>
          )}

          <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
            <button style={{ ...btn("#6B7280"), fontSize: 11 }} onClick={() => setShowApi(false)}>Annuler</button>
            <button style={{ ...btn("#F59E0B"), opacity: loading ? 0.6 : 1, fontSize: 11 }} onClick={inspectItcare} disabled={loading} title="Inspecter les champs disponibles dans l'API ITCare">
              {loading ? <Loader2 size={13} style={{ animation: "spin 1s linear infinite" }} /> : <Search size={13} />}
              {loading ? "Chargement…" : "Inspecter"}
            </button>
            <button style={{ ...btn("#818CF8"), opacity: loading ? 0.6 : 1, fontSize: 11 }} onClick={fetchItcare} disabled={loading}>
              {loading ? <Loader2 size={13} style={{ animation: "spin 1s linear infinite" }} /> : <Plug size={13} />}
              {loading ? "Connexion…" : "Charger les serveurs"}
            </button>
          </div>
        </div>
      )}

      {/* Panneau d'inspection des champs bruts */}
      {inspect && (
        <div style={{
          display: "flex", flexDirection: "column", gap: 8,
          background: "rgba(245,158,11,0.04)", border: "1px solid rgba(245,158,11,0.25)",
          borderRadius: 10, padding: "12px 14px", animation: "fadeIn 0.2s ease", maxWidth: 620,
        }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: "#F59E0B" }}>
              Champs API ITCare — liste ({inspect.total} ressources)
            </span>
            <button onClick={() => setInspect(null)} style={{ background: "none", border: "none", color: "#6B7280", cursor: "pointer", display: "flex" }}><X size={12} /></button>
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "4px 6px" }}>
            {inspect.allKeys.map(k => (
              <span key={k} style={{
                fontSize: 10, padding: "2px 7px", borderRadius: 4,
                background: "rgba(245,158,11,0.12)", border: "1px solid rgba(245,158,11,0.2)", color: "#D97706",
                fontFamily: "'JetBrains Mono', monospace",
              }}>{k}</span>
            ))}
          </div>

          {/* Résultat du endpoint détail */}
          {inspect.detailEndpoint && (
            <div style={{ borderTop: "1px solid rgba(245,158,11,0.15)", paddingTop: 8 }}>
              <span style={{ fontSize: 10, fontWeight: 700, color: inspect.detailEndpoint.available ? "#34D399" : "#F87171" }}>
                GET /compute/resources/&#123;id&#125; : {inspect.detailEndpoint.available ? "disponible" : "non disponible"}
              </span>
              {inspect.detailEndpoint.available && inspect.detailEndpoint.usefulKeys?.length > 0 && (
                <>
                  <div style={{ fontSize: 10, color: "#6B7280", marginTop: 4 }}>
                    Champs supplémentaires utiles (IP / CPU / RAM / Disque) :
                  </div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: "4px 6px", marginTop: 4 }}>
                    {inspect.detailEndpoint.usefulKeys.map(k => (
                      <span key={k} style={{
                        fontSize: 10, padding: "2px 7px", borderRadius: 4,
                        background: "rgba(52,211,153,0.12)", border: "1px solid rgba(52,211,153,0.2)", color: "#34D399",
                        fontFamily: "'JetBrains Mono', monospace",
                      }}>{k}</span>
                    ))}
                  </div>
                </>
              )}
              {inspect.detailEndpoint.available && inspect.detailEndpoint.usefulKeys?.length === 0 && (
                <div style={{ fontSize: 10, color: "#9CA3AF", marginTop: 4 }}>
                  Aucun champ IP/CPU/RAM supplémentaire — ces données ne sont pas disponibles via ce endpoint.
                </div>
              )}
            </div>
          )}

          {/* Résumé des champs clés avec valeurs réelles */}
          {inspect.fieldValues && Object.keys(inspect.fieldValues).length > 0 && (
            <div style={{ borderTop: "1px solid rgba(245,158,11,0.15)", paddingTop: 8 }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: "#F59E0B", marginBottom: 4 }}>
                Champs avec valeurs réelles (sur {inspect.total} serveurs) :
              </div>
              {Object.entries(inspect.fieldValues).map(([k, v]) => (
                <div key={k} style={{ fontSize: 10, color: "#D1D5DB", marginBottom: 2 }}>
                  <span style={{ color: "#34D399", fontFamily: "'JetBrains Mono', monospace" }}>{k}</span>
                  {" "}→ {v.count} serveur(s), ex : <span style={{ color: "#F59E0B" }}>{JSON.stringify(v.example)}</span>
                </div>
              ))}
            </div>
          )}
          {inspect.fieldValues && Object.keys(inspect.fieldValues).length === 0 && (
            <div style={{ fontSize: 10, color: "#9CA3AF", borderTop: "1px solid rgba(245,158,11,0.15)", paddingTop: 8 }}>
              Aucune valeur trouvée pour cpu / ram / disk / ipAddress / network / labelArea sur les {inspect.total} serveurs.
            </div>
          )}

          <details style={{ fontSize: 10, color: "#9CA3AF" }}>
            <summary style={{ cursor: "pointer", color: "#F59E0B", fontWeight: 600, fontSize: 10 }}>1er objet brut — liste (cliquer)</summary>
            <pre style={{ marginTop: 6, background: "rgba(0,0,0,0.3)", padding: "8px 10px", borderRadius: 6, overflowX: "auto", fontSize: 10, color: "#D1D5DB", maxHeight: 250, overflowY: "auto" }}>{JSON.stringify(inspect.sample?.[0], null, 2)}</pre>
          </details>
          {inspect.richSample && inspect.richSample !== inspect.sample?.[0] && (
            <details style={{ fontSize: 10, color: "#9CA3AF" }}>
              <summary style={{ cursor: "pointer", color: "#34D399", fontWeight: 600, fontSize: 10 }}>Serveur avec cpu/ip/réseau renseigné (cliquer)</summary>
              <pre style={{ marginTop: 6, background: "rgba(0,0,0,0.3)", padding: "8px 10px", borderRadius: 6, overflowX: "auto", fontSize: 10, color: "#D1D5DB", maxHeight: 300, overflowY: "auto" }}>{JSON.stringify(inspect.richSample, null, 2)}</pre>
            </details>
          )}
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

/* ── Exports pour l'auto-refresh dans App.jsx ── */
export { itcareToRow, API_LS_KEY };
