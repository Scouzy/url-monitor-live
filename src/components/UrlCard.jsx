import { useState, useEffect, useRef } from "react";
import {
  RefreshCw, Trash2, Zap, Clock, Globe, ExternalLink,
  ImageOff, Loader, KeyRound, Eye, EyeOff,
  User, Lock, Check, Pencil, X, Pause, Play, Activity,
} from "lucide-react";
import { STATUS_CONFIG, getStatus, formatTime } from "../constants";
import { computeMetrics, formatUptime, formatMs, formatDuration, uptimeColor } from "../utils/metrics";
import PulsingDot from "./PulsingDot";
import Sparkline from "./Sparkline";
import StatusTimeline from "./StatusTimeline";

function getDomain(url) {
  try { return new URL(url).hostname; } catch { return url; }
}

const FAVICON_SVCS = [
  d => `https://www.google.com/s2/favicons?domain=${d}&sz=64`,
  d => `https://icons.duckduckgo.com/ip3/${d}.ico`,
];
function isIpOrLocal(d) {
  return /^(\d{1,3}\.){3}\d{1,3}$/.test(d) || d === 'localhost';
}
function FaviconImg({ url, size = 28 }) {
  const [idx, setIdx] = useState(0);
  const domain = getDomain(url);
  if (isIpOrLocal(domain) || idx >= FAVICON_SVCS.length)
    return <Globe size={size - 6} color="#4B5563" />;
  return (
    <img src={FAVICON_SVCS[idx](domain)} alt={domain} width={size} height={size}
      style={{ borderRadius: 6, objectFit: "contain" }}
      onError={() => setIdx(i => i + 1)} />
  );
}

function formatDate(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' });
}

const SCREENSHOT_SERVICES = [
  (url, fresh) => `/api/screenshot?url=${encodeURIComponent(url)}${fresh ? "&nocache=1" : ""}`,
  (url, fresh) =>
    `https://api.microlink.io/?url=${encodeURIComponent(url)}&screenshot=true&meta=false&embed=screenshot.url${fresh ? "&force=true" : ""}`,
  (url) => `https://free.pagepeeker.com/v2/thumbs.php?size=x&url=${encodeURIComponent(url)}`,
];

function ScreenshotPreview({ url, statusColor, index = 0 }) {
  const [phase, setPhase] = useState("pending");   // pending | loading | loaded | error
  const [imgSrc, setImgSrc] = useState(null);
  const [forceRefresh, setForceRefresh] = useState(false);
  const containerRef = useRef(null);

  /* ── IntersectionObserver ── */
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    let t;
    const obs = new IntersectionObserver(([e]) => {
      if (e.isIntersecting) {
        t = setTimeout(() => setPhase("loading"), index < 3 ? 0 : (index - 2) * 100);
        obs.disconnect();
      }
    }, { threshold: 0.05, rootMargin: "200px" });
    obs.observe(el);
    return () => { obs.disconnect(); clearTimeout(t); };
  }, [index]);

  /* ── Course entre services : tous lancés en parallèle, premier chargé = affiché ── */
  useEffect(() => {
    if (phase !== "loading") return;
    let cancelled = false;

    /* Les SPAs (hash routing) ne sont pas bien gérées par les services externes */
    const isSpa = url.includes('#');
    const sources = forceRefresh
      ? [`/api/screenshot?url=${encodeURIComponent(url)}&nocache=1`]
      : isSpa
        ? [`/api/screenshot?url=${encodeURIComponent(url)}`]
        : [
            `/api/screenshot?url=${encodeURIComponent(url)}`,
            `https://api.microlink.io/?url=${encodeURIComponent(url)}&screenshot=true&meta=false&embed=screenshot.url`,
            `https://free.pagepeeker.com/v2/thumbs.php?size=x&url=${encodeURIComponent(url)}`,
          ];

    let resolved = false;
    const timers = [];

    sources.forEach((src, i) => {
      /* Délai minimal (0 / 50 / 100 ms) pour favoriser le cache local
         sans bloquer les sources externes */
      const t = setTimeout(() => {
        if (cancelled || resolved) return;
        const img = new Image();
        img.onload = () => {
          if (!resolved && !cancelled) {
            resolved = true;
            setImgSrc(src);
            setForceRefresh(false);
            setPhase("loaded");
          }
        };
        img.src = src;
      }, i * 50);
      timers.push(t);
    });

    /* Timeout global 12 s → erreur */
    const errT = setTimeout(() => {
      if (!resolved && !cancelled) setPhase("error");
    }, 12000);
    timers.push(errT);

    return () => { cancelled = true; timers.forEach(clearTimeout); };
  }, [phase, url, forceRefresh]);

  const retry  = () => { setImgSrc(null); setForceRefresh(false); setPhase("loading"); };
  const reload = () => { setImgSrc(null); setForceRefresh(true);  setPhase("loading"); };

  return (
    <div ref={containerRef} style={{ position: "relative", width: "100%", height: 200, background: "#0D1117", overflow: "hidden" }}>

      {/* Skeleton shimmer */}
      {phase === "pending" && (
        <div style={{ position: "absolute", inset: 0, background: "linear-gradient(90deg, #0D1117 0%, #161B22 50%, #0D1117 100%)", backgroundSize: "200% 100%", animation: "shimmer 2s infinite linear" }} />
      )}

      {/* Spinner */}
      {phase === "loading" && (
        <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 8 }}>
          <div style={{ color: "#6366F1", animation: "spin 1s linear infinite" }}><Loader size={18} /></div>
          <span style={{ fontSize: 10, color: "#4B5563" }}>Chargement de l'aperçu…</span>
        </div>
      )}

      {/* Erreur */}
      {phase === "error" && (
        <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 6 }}>
          <ImageOff size={20} color="#374151" />
          <span style={{ fontSize: 10, color: "#4B5563" }}>Aperçu indisponible</span>
          <button onClick={retry} style={{ fontSize: 10, color: "#6366F1", background: "none", border: "none", cursor: "pointer", textDecoration: "underline" }}>Réessayer</button>
        </div>
      )}

      {/* Image — affichée dès que imgSrc est connu */}
      {imgSrc && (
        <img src={imgSrc} alt="Aperçu"
          style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", objectPosition: "top", opacity: phase === "loaded" ? 1 : 0, transition: "opacity 0.5s ease" }}
        />
      )}

      {/* Dégradé bas */}
      {phase === "loaded" && (
        <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, height: 48, background: "linear-gradient(to bottom, transparent, rgba(11,15,25,0.95))", pointerEvents: "none" }} />
      )}

      {/* Bouton reload */}
      {phase !== "pending" && (
        <button onClick={reload} title="Rafraîchir l'aperçu"
          style={{ position: "absolute", top: 8, left: 8, zIndex: 2, background: "rgba(0,0,0,0.55)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 6, padding: 4, cursor: "pointer", color: "#6B7280", display: "flex", transition: "color 0.2s, background 0.2s" }}
          onMouseEnter={e => { e.currentTarget.style.color = "#E5E7EB"; e.currentTarget.style.background = "rgba(99,102,241,0.4)"; }}
          onMouseLeave={e => { e.currentTarget.style.color = "#6B7280"; e.currentTarget.style.background = "rgba(0,0,0,0.55)"; }}>
          <RefreshCw size={10} />
        </button>
      )}

      {/* Point statut */}
      <div style={{ position: "absolute", top: 8, right: 8, width: 8, height: 8, borderRadius: "50%", background: statusColor, boxShadow: `0 0 6px ${statusColor}` }} />
    </div>
  );
}

function formatHttpStatus(status) {
  if (!status && status !== 0) return null;
  if (status === "CORS") return { label: "200 OK", ok: true };
  if (status === "Timeout") return { label: "Timeout (>10s)", ok: false };
  if (status === "Erreur") return { label: "Erreur réseau", ok: false };
  const code = Number(status);
  if (!isNaN(code)) {
    const ok = code < 400;
    const texts = { 200: "200 OK", 201: "201 Created", 301: "301 Redirect", 302: "302 Found", 304: "304 Not Modified", 400: "400 Bad Request", 401: "401 Unauthorized", 403: "403 Forbidden", 404: "404 Not Found", 500: "500 Server Error", 502: "502 Bad Gateway", 503: "503 Unavailable" };
    return { label: texts[code] || `${code}`, ok };
  }
  return { label: String(status), ok: false };
}

const BTN = { background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 7, padding: 5, color: "#9CA3AF", cursor: "pointer", display: "flex", transition: "color 0.2s" };

const GROUP_BADGE = { fontSize: 10, padding: "2px 9px", borderRadius: 10, background: "rgba(99,102,241,0.28)", color: "#C4B5FD", border: "1px solid rgba(139,92,246,0.45)", whiteSpace: "nowrap", flexShrink: 0, fontWeight: 600, letterSpacing: "0.01em" };

export default function UrlCard({ entry, index = 0, viewMode = "grid", groupName = null, onRemove, onCheck, checking, onUpdateCredentials, onUpdateUrl, onTogglePause, onUpdateMonitoring }) {
  const status = getStatus(entry);
  const cfg = STATUS_CONFIG[status];
  const Icon = cfg.icon;
  const domain = getDomain(entry.url);

  const [credsOpen, setCredsOpen] = useState(false);
  const [showPwd, setShowPwd] = useState(false);
  const [login, setLogin] = useState(entry.credentials?.login || "");
  const [password, setPassword] = useState(entry.credentials?.password || "");
  const [previewUrl, setPreviewUrl] = useState(entry.credentials?.previewUrl || "");
  const [saved, setSaved] = useState(false);
  const [copied, setCopied] = useState(false);
  const [monOpen, setMonOpen] = useState(false);
  const mon = entry.monitoring || { mode: "simple", authUrl: "", loginField: "username", passwordField: "password", login: "", password: "", homeUrl: "", tabUrl: "", steps: [] };
  const [monMode, setMonMode] = useState(mon.mode || "simple");
  const [monAuthUrl, setMonAuthUrl] = useState(mon.authUrl || "");
  const [monLoginField, setMonLoginField] = useState(mon.loginField || "username");
  const [monPasswordField, setMonPasswordField] = useState(mon.passwordField || "password");
  const [monLogin, setMonLogin] = useState(mon.login || "");
  const [monPassword, setMonPassword] = useState(mon.password || "");
  const [monHomeUrl, setMonHomeUrl] = useState(mon.homeUrl || "");
  const [monTabUrl, setMonTabUrl] = useState(mon.tabUrl || "");
  const [monSaved, setMonSaved] = useState(false);

  const [metricsOpen, setMetricsOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editUrl, setEditUrl] = useState(entry.url);
  const editInputRef = useRef(null);

  useEffect(() => {
    if (editing && editInputRef.current) {
      editInputRef.current.focus();
      editInputRef.current.select();
    }
  }, [editing]);

  const saveUrl = () => {
    let url = editUrl.trim();
    if (!url) return;
    if (!/^https?:\/\//i.test(url)) url = "https://" + url;
    onUpdateUrl(url);
    setEditing(false);
  };

  const cancelEdit = () => { setEditUrl(entry.url); setEditing(false); };

  const hasCreds = !!(entry.credentials?.login || entry.credentials?.password);

  /* ── VUE LISTE ── */
  if (viewMode === "list") {
    const httpStatus = formatHttpStatus(entry.status);
    if (editing) return (
      <div style={{
        display: "flex", alignItems: "center", gap: 8,
        background: "rgba(99,102,241,0.08)", border: "1px solid rgba(99,102,241,0.25)",
        borderRadius: 10, padding: "8px 12px",
      }}>
        <div style={{ width: 28, height: 28, borderRadius: 7, flexShrink: 0, background: "rgba(0,0,0,0.3)", border: "1px solid rgba(255,255,255,0.08)", display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden" }}>
          <FaviconImg url={editUrl || entry.url} size={18} />
        </div>
        <input ref={editInputRef} value={editUrl} onChange={e => setEditUrl(e.target.value)}
          onKeyDown={e => { if (e.key === "Enter") saveUrl(); if (e.key === "Escape") cancelEdit(); }}
          placeholder="https://..."
          style={{ flex: 1, background: "rgba(255,255,255,0.06)", border: "1px solid rgba(99,102,241,0.4)", borderRadius: 7, color: "#E5E7EB", fontSize: 12, padding: "6px 10px", fontFamily: "'JetBrains Mono', monospace", outline: "none", minWidth: 0 }}
        />
        <button onClick={saveUrl} style={{ ...BTN, color: "#34D399", background: "rgba(52,211,153,0.12)", border: "1px solid rgba(52,211,153,0.3)" }}><Check size={12} /></button>
        <button onClick={cancelEdit} style={BTN}><X size={12} /></button>
      </div>
    );
    return (
      <div style={{
        display: "flex", flexDirection: "column",
        background: "rgba(255,255,255,0.025)",
        border: `1px solid ${checking ? cfg.color + "40" : "rgba(255,255,255,0.06)"}`,
        borderRadius: 10, overflow: "hidden", transition: "border-color 0.3s",
      }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 12px" }}>
        {/* Favicon */}
        <div style={{ width: 30, height: 30, borderRadius: 8, flexShrink: 0, background: "rgba(0,0,0,0.3)", border: "1px solid rgba(255,255,255,0.07)", display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden" }}>
          <FaviconImg url={entry.url} size={20} />
        </div>
        <PulsingDot color={cfg.color} checking={checking} />
        {/* Domain + URL */}
        <div style={{ flex: 2, minWidth: 0 }}>
          <a href={entry.url} target="_blank" rel="noopener noreferrer" style={{ textDecoration: "none", display: "flex", alignItems: "center", gap: 4 }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: "#F3F4F6", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1, minWidth: 0 }}>{domain}</span>
            <ExternalLink size={9} color="#6B7280" style={{ flexShrink: 0 }} />
            {hasCreds && <KeyRound size={9} color="#818CF8" style={{ flexShrink: 0 }} />}
          </a>
          <div style={{ fontSize: 10, color: "#4B5563", fontFamily: "'JetBrains Mono', monospace", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{entry.url}</div>
        </div>
        {groupName && <span style={GROUP_BADGE}>{groupName}</span>}
        {/* Status badge */}
        <div style={{ display: "inline-flex", alignItems: "center", gap: 4, padding: "3px 9px", borderRadius: 20, background: cfg.bg, color: cfg.color, fontSize: 11, fontWeight: 600, flexShrink: 0 }}>
          <Icon size={11} /> {cfg.label}
        </div>
        {/* Response time */}
        {entry.responseTime != null && (
          <span style={{ display: "flex", alignItems: "center", gap: 3, fontSize: 11, color: "#F59E0B", fontFamily: "'JetBrains Mono', monospace", flexShrink: 0 }}>
            <Zap size={10} /> {entry.responseTime} ms
          </span>
        )}
        {/* Last check */}
        {entry.lastCheck && (
          <span style={{ display: "flex", alignItems: "center", gap: 3, fontSize: 10, color: "#4B5563", fontFamily: "'JetBrains Mono', monospace", flexShrink: 0 }}>
            <Clock size={10} /> {formatTime(entry.lastCheck)}
          </span>
        )}
        {/* HTTP status */}
        {httpStatus && (
          <span style={{ fontSize: 10, fontFamily: "'JetBrains Mono', monospace", fontWeight: 700, padding: "2px 7px", borderRadius: 5, flexShrink: 0,
            background: httpStatus.ok ? "rgba(52,211,153,0.08)" : "rgba(248,113,113,0.1)",
            color: httpStatus.ok ? "#34D399" : "#F87171",
            border: `1px solid ${httpStatus.ok ? "rgba(52,211,153,0.2)" : "rgba(248,113,113,0.2)"}`
          }}>{httpStatus.label}</span>
        )}
        {/* SSL badge (vue liste) */}
        {entry.url.startsWith('https://') && (() => {
          const ssl = entry.sslInfo;
          if (!ssl || ssl.notHttps) return null;
          if (ssl.error || ssl.invalid)
            return <span title="Certificat invalide" style={{ display: "flex", alignItems: "center", gap: 2, fontSize: 10, color: "#F87171", flexShrink: 0 }}><Lock size={10} /> !</span>;
          const clr = ssl.daysLeft <= 0 ? "#F87171" : ssl.daysLeft < 30 ? "#FBBF24" : "#34D399";
          return (
            <span title={`SSL : ${ssl.issuer} · Expire ${formatDate(ssl.notAfter)}`}
              style={{ display: "flex", alignItems: "center", gap: 3, fontSize: 10, flexShrink: 0, color: clr }}>
              <Lock size={10} />
              {ssl.daysLeft > 0 ? `${ssl.daysLeft}j` : 'Expiré'}
            </span>
          );
        })()}
        {/* Mini sparkline */}
        <div style={{ width: 80, flexShrink: 0 }}>
          <Sparkline data={entry.history} color={cfg.color} />
        </div>
        {/* Actions */}
        <div style={{ display: "flex", gap: 4, flexShrink: 0, marginLeft: "auto" }}>
          <button onClick={onCheck} disabled={entry.paused} title="Tester" style={BTN}
            onMouseEnter={e => { if (!entry.paused) e.currentTarget.style.color = "#F3F4F6"; }}
            onMouseLeave={e => e.currentTarget.style.color = "#9CA3AF"}>
            <RefreshCw size={12} style={{ animation: checking ? "spin 1s linear infinite" : "none", opacity: entry.paused ? 0.35 : 1 }} />
          </button>
          <button onClick={onTogglePause} title={entry.paused ? "Reprendre le monitoring" : "Mettre en pause"} style={BTN}
            onMouseEnter={e => e.currentTarget.style.color = entry.paused ? "#34D399" : "#FBBF24"}
            onMouseLeave={e => e.currentTarget.style.color = "#9CA3AF"}>
            {entry.paused ? <Play size={12} /> : <Pause size={12} />}
          </button>
          <button onClick={() => setEditing(true)} title="Modifier l'URL" style={BTN}
            onMouseEnter={e => e.currentTarget.style.color = "#818CF8"}
            onMouseLeave={e => e.currentTarget.style.color = "#9CA3AF"}>
            <Pencil size={12} />
          </button>
          <button onClick={onRemove} title="Supprimer" style={BTN}
            onMouseEnter={e => e.currentTarget.style.color = "#F87171"}
            onMouseLeave={e => e.currentTarget.style.color = "#9CA3AF"}>
            <Trash2 size={12} />
          </button>
        </div>
      </div>
      <div style={{ padding: "0 12px 8px" }}>
        <StatusTimeline history={entry.history} />
      </div>
      </div>
    );
  }

  const save = () => {
    onUpdateCredentials({ login, password, previewUrl });
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  };

  const saveMonitoring = () => {
    onUpdateMonitoring?.({
      mode: monMode,
      authUrl: monAuthUrl,
      loginField: monLoginField,
      passwordField: monPasswordField,
      login: monLogin,
      password: monPassword,
      homeUrl: monHomeUrl,
      tabUrl: monTabUrl,
      steps: mon.steps || [],
    });
    setMonSaved(true);
    setTimeout(() => setMonSaved(false), 2500);
  };

  const hasMonitoring = mon.mode === "authenticated" && !!mon.authUrl;

  const connect = async () => {
    const text = [
      login ? `Login : ${login}` : null,
      password ? `Mot de passe : ${password}` : null,
    ].filter(Boolean).join("\n");
    if (text) {
      try { await navigator.clipboard.writeText(text); } catch { /* silencieux */ }
    }
    window.open(entry.url, "_blank", "noopener,noreferrer");
    setCopied(true);
    setTimeout(() => setCopied(false), 3000);
  };

  return (
    <div style={{
      background: "rgba(255,255,255,0.025)",
      border: `1px solid ${entry.paused ? "rgba(251,191,36,0.35)" : checking ? cfg.color + "50" : "rgba(255,255,255,0.07)"}`,
      borderRadius: 14, overflow: "hidden",
      transition: "border-color 0.3s, box-shadow 0.3s",
      boxShadow: entry.paused ? "0 0 0 0" : checking ? `0 0 24px ${cfg.color}12` : "0 2px 8px rgba(0,0,0,0.2)",
      opacity: entry.paused ? 0.72 : 1,
    }}>

      {/* ── En-tête ── */}
      {editing ? (
        /* Mode édition URL */
        <div style={{
          display: "flex", alignItems: "center", gap: 10,
          background: "rgba(99,102,241,0.08)", borderBottom: "1px solid rgba(99,102,241,0.25)",
          padding: "10px 12px",
        }}>
          <div style={{
            width: 34, height: 34, borderRadius: 8, flexShrink: 0,
            background: "rgba(0,0,0,0.3)", border: "1px solid rgba(255,255,255,0.08)",
            display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden",
          }}>
            <FaviconImg url={editUrl || entry.url} size={22} />
          </div>
          <input
            ref={editInputRef}
            value={editUrl}
            onChange={e => setEditUrl(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter") saveUrl(); if (e.key === "Escape") cancelEdit(); }}
            placeholder="https://..."
            style={{
              flex: 1, background: "rgba(255,255,255,0.06)", border: "1px solid rgba(99,102,241,0.4)",
              borderRadius: 7, color: "#E5E7EB", fontSize: 12, padding: "7px 10px",
              fontFamily: "'JetBrains Mono', monospace", outline: "none", minWidth: 0,
            }}
          />
          <button onClick={saveUrl} title="Enregistrer" style={{
            background: "rgba(52,211,153,0.12)", border: "1px solid rgba(52,211,153,0.3)",
            borderRadius: 7, padding: 6, color: "#34D399", cursor: "pointer", display: "flex", flexShrink: 0,
          }}><Check size={13} /></button>
          <button onClick={cancelEdit} title="Annuler" style={{
            background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)",
            borderRadius: 7, padding: 6, color: "#6B7280", cursor: "pointer", display: "flex", flexShrink: 0,
          }}><X size={13} /></button>
        </div>
      ) : (
        /* Mode normal — en-tête cliquable */
        <a
          href={entry.url} target="_blank" rel="noopener noreferrer"
          style={{
            display: "flex", alignItems: "center", gap: 12,
            background: `linear-gradient(135deg, ${cfg.color}18, ${cfg.color}06)`,
            borderBottom: `1px solid ${cfg.color}20`,
            padding: "13px 14px 11px", textDecoration: "none",
            transition: "background 0.2s",
          }}
          onMouseEnter={e => e.currentTarget.style.background = `linear-gradient(135deg, ${cfg.color}28, ${cfg.color}10)`}
          onMouseLeave={e => e.currentTarget.style.background = `linear-gradient(135deg, ${cfg.color}18, ${cfg.color}06)`}
        >
          <div style={{
            width: 36, height: 36, borderRadius: 9, flexShrink: 0,
            background: "rgba(0,0,0,0.3)", border: "1px solid rgba(255,255,255,0.08)",
            display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden",
          }}>
            <FaviconImg url={entry.url} size={24} />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 4, marginBottom: 2 }}>
              <span style={{ fontSize: 13, fontWeight: 700, color: "#F3F4F6",
                overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1, minWidth: 0 }}>
                {domain}
              </span>
              <ExternalLink size={10} color="#6B7280" style={{ flexShrink: 0 }} />
              {hasCreds && <KeyRound size={10} color="#818CF8" style={{ flexShrink: 0 }} title="Identifiants renseignés" />}
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <div style={{ fontSize: 10, color: "#4B5563", fontFamily: "'JetBrains Mono', monospace",
                overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1, minWidth: 0 }}>
                {entry.url}
              </div>
              {groupName && <span style={GROUP_BADGE}>{groupName}</span>}
            </div>
          </div>
          <div style={{ display: "flex", gap: 4, flexShrink: 0 }} onClick={e => e.preventDefault()}>
            <button onClick={e => { e.preventDefault(); if (!entry.paused) onCheck(); }} disabled={entry.paused} title="Tester" style={{
              background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)",
              borderRadius: 7, padding: 5, color: "#9CA3AF", cursor: entry.paused ? "default" : "pointer", display: "flex", transition: "color 0.2s",
            }}
              onMouseEnter={e => { if (!entry.paused) e.currentTarget.style.color = "#F3F4F6"; }}
              onMouseLeave={e => e.currentTarget.style.color = "#9CA3AF"}>
              <RefreshCw size={12} style={{ animation: checking ? "spin 1s linear infinite" : "none", opacity: entry.paused ? 0.35 : 1 }} />
            </button>
            <button onClick={e => { e.preventDefault(); onTogglePause(); }}
              title={entry.paused ? "Reprendre le monitoring" : "Mettre en pause"}
              style={{
                background: entry.paused ? "rgba(52,211,153,0.1)" : "rgba(255,255,255,0.06)",
                border: entry.paused ? "1px solid rgba(52,211,153,0.3)" : "1px solid rgba(255,255,255,0.1)",
                borderRadius: 7, padding: 5, color: entry.paused ? "#34D399" : "#9CA3AF",
                cursor: "pointer", display: "flex", transition: "color 0.2s",
              }}
              onMouseEnter={e => e.currentTarget.style.color = entry.paused ? "#6EE7B7" : "#FBBF24"}
              onMouseLeave={e => e.currentTarget.style.color = entry.paused ? "#34D399" : "#9CA3AF"}>
              {entry.paused ? <Play size={12} /> : <Pause size={12} />}
            </button>
            <button onClick={e => { e.preventDefault(); setEditing(true); }} title="Modifier l'URL" style={{
              background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)",
              borderRadius: 7, padding: 5, color: "#9CA3AF", cursor: "pointer", display: "flex", transition: "color 0.2s",
            }}
              onMouseEnter={e => e.currentTarget.style.color = "#818CF8"}
              onMouseLeave={e => e.currentTarget.style.color = "#9CA3AF"}>
              <Pencil size={12} />
            </button>
            <button onClick={e => { e.preventDefault(); onRemove(); }} title="Supprimer" style={{
              background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)",
              borderRadius: 7, padding: 5, color: "#9CA3AF", cursor: "pointer", display: "flex", transition: "color 0.2s",
            }}
              onMouseEnter={e => e.currentTarget.style.color = "#F87171"}
              onMouseLeave={e => e.currentTarget.style.color = "#9CA3AF"}>
              <Trash2 size={12} />
            </button>
          </div>
        </a>
      )}

      {/* ── Aperçu pleine largeur ── */}
      <ScreenshotPreview
        key={entry.credentials?.previewUrl || entry.url}
        url={entry.credentials?.previewUrl || entry.url}
        statusColor={cfg.color}
        index={index}
      />

      {/* ── Monitoring (toujours visible) ── */}
      <div style={{ padding: "11px 14px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 10, flexWrap: "wrap" }}>
          <PulsingDot color={entry.paused ? "#6B7280" : cfg.color} checking={!entry.paused && checking} />
          {entry.paused ? (
            <div style={{
              display: "inline-flex", alignItems: "center", gap: 5, padding: "3px 10px",
              borderRadius: 20, background: "rgba(251,191,36,0.1)", color: "#FBBF24",
              fontSize: 11, fontWeight: 700, border: "1px solid rgba(251,191,36,0.25)",
            }}>
              <Pause size={10} /> Monitoring suspendu
            </div>
          ) : (
            <div style={{
              display: "inline-flex", alignItems: "center", gap: 4, padding: "3px 9px",
              borderRadius: 20, background: cfg.bg, color: cfg.color, fontSize: 11, fontWeight: 600,
            }}>
              <Icon size={11} /> {cfg.label}
            </div>
          )}
          {entry.lastCheck && (
            <>
              <div style={{
                display: "inline-flex", alignItems: "center", gap: 4, padding: "3px 9px",
                borderRadius: 20, background: "rgba(255,255,255,0.04)", color: "#D1D5DB",
                fontSize: 11, fontFamily: "'JetBrains Mono', monospace",
              }}>
                <Zap size={11} /> {entry.responseTime} ms
              </div>
              <div style={{
                display: "inline-flex", alignItems: "center", gap: 4, padding: "3px 9px",
                borderRadius: 20, background: "rgba(255,255,255,0.04)", color: "#9CA3AF", fontSize: 11,
              }}>
                <Clock size={11} /> {formatTime(entry.lastCheck)}
              </div>
            </>
          )}
        </div>
        <div style={{ background: "rgba(0,0,0,0.25)", borderRadius: 8, padding: "6px 8px" }}>
          <Sparkline data={entry.history} color={cfg.color} />
        </div>
        <div style={{ padding: "4px 2px 0" }}>
          <StatusTimeline history={entry.history} />
        </div>

        {/* Code HTTP / statut réseau */}
        {entry.status != null && (() => {
          const s = formatHttpStatus(entry.status);
          if (!s) return null;
          return (
            <div style={{ marginTop: 8, display: "flex", alignItems: "center", gap: 6 }}>
              <span style={{ fontSize: 10, color: "#4B5563" }}>Dernière réponse :</span>
              <span style={{
                fontSize: 10, fontFamily: "'JetBrains Mono', monospace", fontWeight: 700,
                padding: "2px 7px", borderRadius: 5,
                background: s.ok ? "rgba(52,211,153,0.08)" : "rgba(248,113,113,0.1)",
                color: s.ok ? "#34D399" : "#F87171",
                border: `1px solid ${s.ok ? "rgba(52,211,153,0.2)" : "rgba(248,113,113,0.2)"}`,
              }}>
                {s.label}
              </span>
            </div>
          );
        })()}

        {/* Certificat SSL */}
        {entry.url.startsWith('https://') && !entry.sslInfo && (
          <div style={{ marginTop: 8, display: "flex", alignItems: "center", gap: 5,
            fontSize: 10, color: "#374151", fontStyle: "italic" }}>
            <Lock size={10} color="#374151" /> Vérification SSL en cours…
          </div>
        )}
        {entry.sslInfo && !entry.sslInfo.notHttps && (() => {
          const ssl = entry.sslInfo;
          const bad  = ssl.error || ssl.invalid;
          const warn = !bad && ssl.daysLeft < 30;
          const exp  = !bad && ssl.daysLeft <= 0;
          const clr  = bad || exp ? "#F87171" : warn ? "#FBBF24" : "#34D399";
          const badge = { bg: bad || exp ? "rgba(248,113,113,0.1)" : warn ? "rgba(251,191,36,0.1)" : "rgba(52,211,153,0.08)",
            text: clr, border: bad || exp ? "rgba(248,113,113,0.2)" : warn ? "rgba(251,191,36,0.2)" : "rgba(52,211,153,0.2)" };
          return (
            <div style={{ marginTop: 8, padding: "7px 10px", borderRadius: 8,
              background: "rgba(0,0,0,0.2)", border: "1px solid rgba(255,255,255,0.05)" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                <Lock size={11} color={clr} />
                <span style={{ fontSize: 10, color: "#6B7280", fontWeight: 600 }}>Certificat SSL</span>
                {bad ? (
                  <span style={{ fontSize: 10, color: "#F87171", fontWeight: 700 }}>Invalide / Erreur</span>
                ) : (
                  <>
                    <span style={{ fontSize: 10, fontFamily: "'JetBrains Mono', monospace", fontWeight: 700,
                      padding: "1px 6px", borderRadius: 4, background: badge.bg, color: badge.text, border: `1px solid ${badge.border}` }}>
                      {exp ? 'Expiré !' : `${ssl.daysLeft}j restants`}
                    </span>
                    <span style={{ fontSize: 10, color: "#4B5563" }}>{ssl.issuer}</span>
                  </>
                )}
              </div>
              {!bad && (
                <div style={{ marginTop: 4, fontSize: 9, color: "#374151", fontFamily: "'JetBrains Mono', monospace" }}>
                  {formatDate(ssl.notBefore)} → {formatDate(ssl.notAfter)}
                </div>
              )}
            </div>
          );
        })()}
      </div>

      {/* ── Section Métriques rétractable ── */}
      {(() => {
        const m = computeMetrics(entry.history);
        if (!m) return null;
        return (
          <div style={{ borderTop: "1px solid rgba(255,255,255,0.06)" }}>
            <button
              onClick={() => setMetricsOpen(o => !o)}
              style={{
                width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between",
                padding: "8px 14px", background: "rgba(0,0,0,0.15)", border: "none", cursor: "pointer",
                color: metricsOpen ? "#34D399" : "#4B5563", transition: "color 0.2s, background 0.2s",
              }}
              onMouseEnter={e => { e.currentTarget.style.background = "rgba(52,211,153,0.06)"; e.currentTarget.style.color = "#34D399"; }}
              onMouseLeave={e => { e.currentTarget.style.background = "rgba(0,0,0,0.15)"; e.currentTarget.style.color = metricsOpen ? "#34D399" : "#4B5563"; }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, fontWeight: 600 }}>
                <Zap size={12} /> Métriques
                <span style={{ fontSize: 10, fontWeight: 400, color: uptimeColor(m.uptime24h) }}>
                  {formatUptime(m.uptime24h)} / 24h
                </span>
              </div>
              <div style={{ fontSize: 10, transform: metricsOpen ? "rotate(180deg)" : "rotate(0deg)", transition: "transform 0.2s", lineHeight: 1 }}>▼</div>
            </button>
            {metricsOpen && (
              <div style={{ padding: "10px 14px 12px", animation: "fadeIn 0.15s ease" }}>
                {/* Uptime */}
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginBottom: 10 }}>
                  {[["24h", m.uptime24h], ["7j", m.uptime7d], ["30j", m.uptime30d]].map(([label, pct]) => (
                    <div key={label} style={{ background: "rgba(0,0,0,0.2)", borderRadius: 8, padding: "7px 8px", textAlign: "center" }}>
                      <div style={{ fontSize: 9, color: "#4B5563", marginBottom: 3 }}>Uptime {label}</div>
                      <div style={{ fontSize: 13, fontWeight: 700, color: uptimeColor(pct), fontFamily: "'JetBrains Mono', monospace" }}>
                        {pct !== null ? pct.toFixed(1) + "%" : "—"}
                      </div>
                    </div>
                  ))}
                </div>
                {/* Temps de réponse */}
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginBottom: 10 }}>
                  {[["P50", m.p50], ["P95", m.p95], ["P99", m.p99]].map(([label, val]) => (
                    <div key={label} style={{ background: "rgba(0,0,0,0.2)", borderRadius: 8, padding: "7px 8px", textAlign: "center" }}>
                      <div style={{ fontSize: 9, color: "#4B5563", marginBottom: 3 }}>{label}</div>
                      <div style={{ fontSize: 12, fontWeight: 700, color: "#F59E0B", fontFamily: "'JetBrains Mono', monospace" }}>
                        {formatMs(val)}
                      </div>
                    </div>
                  ))}
                </div>
                {/* Résumé */}
                <div style={{ display: "flex", gap: 12, flexWrap: "wrap", fontSize: 10, color: "#6B7280" }}>
                  <span><span style={{ color: "#9CA3AF", fontWeight: 600 }}>{m.totalChecks}</span> vérifications</span>
                  {m.incidentCount > 0 && <span><span style={{ color: "#F87171", fontWeight: 600 }}>{m.incidentCount}</span> incident{m.incidentCount > 1 ? "s" : ""}</span>}
                  {m.mttr && <span>MTTR <span style={{ color: "#34D399", fontWeight: 600 }}>{formatDuration(m.mttr)}</span></span>}
                </div>
              </div>
            )}
          </div>
        );
      })()}

      {/* ── Section Identifiants rétractable ── */}
      <div style={{ borderTop: "1px solid rgba(255,255,255,0.06)" }}>
        {/* Barre toggle */}
        <button
          onClick={() => setCredsOpen(o => !o)}
          style={{
            width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between",
            padding: "8px 14px", background: "rgba(0,0,0,0.15)", border: "none", cursor: "pointer",
            color: credsOpen ? "#818CF8" : "#4B5563", transition: "color 0.2s, background 0.2s",
          }}
          onMouseEnter={e => { e.currentTarget.style.background = "rgba(99,102,241,0.07)"; e.currentTarget.style.color = "#818CF8"; }}
          onMouseLeave={e => { e.currentTarget.style.background = "rgba(0,0,0,0.15)"; e.currentTarget.style.color = credsOpen ? "#818CF8" : "#4B5563"; }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, fontWeight: 600 }}>
            <KeyRound size={12} />
            Identifiants
            {hasCreds && (
              <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#818CF8", display: "inline-block" }} />
            )}
          </div>
          <div style={{
            fontSize: 10, transform: credsOpen ? "rotate(180deg)" : "rotate(0deg)",
            transition: "transform 0.2s", lineHeight: 1,
          }}>▼</div>
        </button>

        {/* Contenu rétractable */}
        {credsOpen && (
          <div style={{ padding: "12px 14px", display: "flex", flexDirection: "column", gap: 9, animation: "fadeIn 0.15s ease" }}>

            {/* Notification copié */}
            {copied && (
              <div style={{
                display: "flex", alignItems: "center", gap: 6, padding: "6px 10px",
                borderRadius: 7, background: "rgba(52,211,153,0.1)", border: "1px solid rgba(52,211,153,0.2)",
                color: "#34D399", fontSize: 11, animation: "fadeIn 0.2s ease",
              }}>
                <Check size={12} /> Identifiants copiés — collez-les sur la page de connexion
              </div>
            )}

            {/* URL d'aperçu */}
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <Globe size={13} color="#4B5563" style={{ flexShrink: 0 }} />
                <span style={{ fontSize: 10, color: "#4B5563", fontWeight: 600 }}>URL d'aperçu (page publique)</span>
              </div>
              <input
                type="url"
                value={previewUrl}
                onChange={e => { setPreviewUrl(e.target.value); setSaved(false); }}
                placeholder={`${entry.url} (identique si vide)`}
                autoComplete="off"
                style={{
                  width: "100%", background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.09)",
                  borderRadius: 7, color: "#E5E7EB", fontSize: 11, padding: "6px 10px",
                  fontFamily: "'JetBrains Mono', monospace", outline: "none", boxSizing: "border-box",
                }}
                onFocus={e => e.currentTarget.style.borderColor = "rgba(99,102,241,0.5)"}
                onBlur={e => e.currentTarget.style.borderColor = "rgba(255,255,255,0.09)"}
              />
              <span style={{ fontSize: 9, color: "#374151", paddingLeft: 2 }}>
                Optionnel — remplace l'aperçu par une page publique (ex : landing page)
              </span>
            </div>

            <div style={{ borderTop: "1px solid rgba(255,255,255,0.05)", margin: "2px 0" }} />

            {/* Login */}
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <User size={13} color="#4B5563" style={{ flexShrink: 0 }} />
              <input
                type="text"
                value={login}
                onChange={e => { setLogin(e.target.value); setSaved(false); }}
                placeholder="Identifiant / e-mail"
                autoComplete="off"
                style={{
                  flex: 1, background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.09)",
                  borderRadius: 7, color: "#E5E7EB", fontSize: 12, padding: "6px 10px",
                  fontFamily: "'JetBrains Mono', monospace", outline: "none",
                }}
                onFocus={e => e.currentTarget.style.borderColor = "rgba(99,102,241,0.5)"}
                onBlur={e => e.currentTarget.style.borderColor = "rgba(255,255,255,0.09)"}
              />
            </div>

            {/* Mot de passe */}
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <Lock size={13} color="#4B5563" style={{ flexShrink: 0 }} />
              <div style={{ flex: 1, position: "relative" }}>
                <input
                  type={showPwd ? "text" : "password"}
                  value={password}
                  onChange={e => { setPassword(e.target.value); setSaved(false); }}
                  placeholder="Mot de passe"
                  autoComplete="new-password"
                  style={{
                    width: "100%", background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.09)",
                    borderRadius: 7, color: "#E5E7EB", fontSize: 12, padding: "6px 34px 6px 10px",
                    fontFamily: "'JetBrains Mono', monospace", outline: "none", boxSizing: "border-box",
                  }}
                  onFocus={e => e.currentTarget.style.borderColor = "rgba(99,102,241,0.5)"}
                  onBlur={e => e.currentTarget.style.borderColor = "rgba(255,255,255,0.09)"}
                />
                <button type="button" onClick={() => setShowPwd(p => !p)} style={{
                  position: "absolute", right: 8, top: "50%", transform: "translateY(-50%)",
                  background: "none", border: "none", color: "#4B5563", cursor: "pointer",
                  display: "flex", padding: 2, transition: "color 0.2s",
                }}
                  onMouseEnter={e => e.currentTarget.style.color = "#9CA3AF"}
                  onMouseLeave={e => e.currentTarget.style.color = "#4B5563"}
                >
                  {showPwd ? <EyeOff size={12} /> : <Eye size={12} />}
                </button>
              </div>
            </div>

            {/* Boutons actions */}
            <div style={{ display: "flex", gap: 8 }}>
              {/* Se connecter */}
              <button
                onClick={connect}
                disabled={!hasCreds}
                title={!hasCreds ? "Renseignez d'abord les identifiants" : "Ouvre la page et copie les identifiants"}
                style={{
                  flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 5,
                  padding: "7px 0", borderRadius: 7, fontSize: 11, fontWeight: 600, cursor: hasCreds ? "pointer" : "not-allowed",
                  border: "1px solid rgba(99,102,241,0.3)",
                  background: hasCreds ? "rgba(99,102,241,0.15)" : "rgba(255,255,255,0.03)",
                  color: hasCreds ? "#818CF8" : "#374151",
                  transition: "all 0.2s",
                }}
                onMouseEnter={e => { if (hasCreds) { e.currentTarget.style.background = "rgba(99,102,241,0.25)"; e.currentTarget.style.borderColor = "rgba(99,102,241,0.5)"; } }}
                onMouseLeave={e => { if (hasCreds) { e.currentTarget.style.background = "rgba(99,102,241,0.15)"; e.currentTarget.style.borderColor = "rgba(99,102,241,0.3)"; } }}
              >
                <ExternalLink size={11} /> Se connecter
              </button>

              {/* Enregistrer */}
              <button
                onClick={save}
                style={{
                  flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 5,
                  padding: "7px 0", borderRadius: 7, fontSize: 11, fontWeight: 600, cursor: "pointer",
                  border: `1px solid ${saved ? "rgba(52,211,153,0.3)" : "rgba(255,255,255,0.1)"}`,
                  background: saved ? "rgba(52,211,153,0.1)" : "rgba(255,255,255,0.04)",
                  color: saved ? "#34D399" : "#6B7280",
                  transition: "all 0.2s",
                }}
              >
                {saved ? <><Check size={11} /> Enregistré</> : <><KeyRound size={11} /> Enregistrer</>}
              </button>
            </div>

          </div>
        )}
      </div>

      {/* ── Section Monitoring multi-étapes ── */}
      <div style={{ borderTop: "1px solid rgba(255,255,255,0.04)" }}>
        <button
          onClick={() => setMonOpen(o => !o)}
          style={{
            width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between",
            padding: "8px 14px", background: "rgba(0,0,0,0.15)", border: "none", cursor: "pointer",
            color: monOpen ? "#818CF8" : "#4B5563", transition: "color 0.2s, background 0.2s",
          }}
          onMouseEnter={e => { e.currentTarget.style.background = "rgba(99,102,241,0.07)"; e.currentTarget.style.color = "#818CF8"; }}
          onMouseLeave={e => { e.currentTarget.style.background = "rgba(0,0,0,0.15)"; e.currentTarget.style.color = monOpen ? "#818CF8" : "#4B5563"; }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, fontWeight: 600 }}>
            <Activity size={12} />
            Supervision multi-étapes
            {hasMonitoring && (
              <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#818CF8", display: "inline-block" }} />
            )}
          </div>
          <div style={{
            fontSize: 10, transform: monOpen ? "rotate(180deg)" : "rotate(0deg)",
            transition: "transform 0.2s", lineHeight: 1,
          }}>▼</div>
        </button>

        {monOpen && (
          <div style={{ padding: "12px 14px", display: "flex", flexDirection: "column", gap: 9, animation: "fadeIn 0.15s ease" }}>

            {/* Mode toggle */}
            <div style={{ display: "flex", gap: 4, background: "rgba(0,0,0,0.25)", borderRadius: 8, padding: 3 }}>
              {[["simple", "Simple (HEAD)"], ["authenticated", "Authentifiée"]].map(([k, label]) => (
                <button key={k} onClick={() => setMonMode(k)} style={{
                  flex: 1, padding: "5px 8px", borderRadius: 6, border: "none", fontFamily: "inherit",
                  fontSize: 10, fontWeight: monMode === k ? 700 : 400, cursor: "pointer",
                  background: monMode === k ? "rgba(99,102,241,0.15)" : "transparent",
                  color: monMode === k ? "#818CF8" : "#6B7280", transition: "all 0.15s",
                }}>{label}</button>
              ))}
            </div>

            {monMode === "authenticated" && (
              <>
                <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                  <span style={{ fontSize: 10, color: "#4B5563", fontWeight: 600 }}>URL de connexion (login)</span>
                  <input type="url" value={monAuthUrl} onChange={e => { setMonAuthUrl(e.target.value); setMonSaved(false); }}
                    placeholder="https://app.example.com/login" autoComplete="off"
                    style={{ background: "#0D1117", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 7, color: "#E5E7EB", fontSize: 11, padding: "5px 9px", outline: "none", boxSizing: "border-box", width: "100%" }} />
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                  <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                    <span style={{ fontSize: 10, color: "#4B5563", fontWeight: 600 }}>Champ login (name/CSS)</span>
                    <input value={monLoginField} onChange={e => { setMonLoginField(e.target.value); setMonSaved(false); }}
                      placeholder="username" autoComplete="off"
                      style={{ background: "#0D1117", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 7, color: "#E5E7EB", fontSize: 11, padding: "5px 9px", outline: "none", boxSizing: "border-box", width: "100%" }} />
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                    <span style={{ fontSize: 10, color: "#4B5563", fontWeight: 600 }}>Champ mot de passe</span>
                    <input value={monPasswordField} onChange={e => { setMonPasswordField(e.target.value); setMonSaved(false); }}
                      placeholder="password" autoComplete="off"
                      style={{ background: "#0D1117", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 7, color: "#E5E7EB", fontSize: 11, padding: "5px 9px", outline: "none", boxSizing: "border-box", width: "100%" }} />
                  </div>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                  <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                    <span style={{ fontSize: 10, color: "#4B5563", fontWeight: 600 }}>Identifiant</span>
                    <input value={monLogin} onChange={e => { setMonLogin(e.target.value); setMonSaved(false); }}
                      placeholder="admin" autoComplete="off"
                      style={{ background: "#0D1117", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 7, color: "#E5E7EB", fontSize: 11, padding: "5px 9px", outline: "none", boxSizing: "border-box", width: "100%" }} />
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                    <span style={{ fontSize: 10, color: "#4B5563", fontWeight: 600 }}>Mot de passe</span>
                    <input type="password" value={monPassword} onChange={e => { setMonPassword(e.target.value); setMonSaved(false); }}
                      placeholder="••••••••" autoComplete="off"
                      style={{ background: "#0D1117", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 7, color: "#E5E7EB", fontSize: 11, padding: "5px 9px", outline: "none", boxSizing: "border-box", width: "100%" }} />
                  </div>
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                  <span style={{ fontSize: 10, color: "#4B5563", fontWeight: 600 }}>Page d'accueil (après login)</span>
                  <input type="url" value={monHomeUrl} onChange={e => { setMonHomeUrl(e.target.value); setMonSaved(false); }}
                    placeholder="https://app.example.com/dashboard" autoComplete="off"
                    style={{ background: "#0D1117", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 7, color: "#E5E7EB", fontSize: 11, padding: "5px 9px", outline: "none", boxSizing: "border-box", width: "100%" }} />
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                  <span style={{ fontSize: 10, color: "#4B5563", fontWeight: 600 }}>Onglet à vérifier (optionnel)</span>
                  <input type="url" value={monTabUrl} onChange={e => { setMonTabUrl(e.target.value); setMonSaved(false); }}
                    placeholder="https://app.example.com/monitoring" autoComplete="off"
                    style={{ background: "#0D1117", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 7, color: "#E5E7EB", fontSize: 11, padding: "5px 9px", outline: "none", boxSizing: "border-box", width: "100%" }} />
                </div>
              </>
            )}

            {/* Résultats des étapes (dernier check) */}
            {mon.steps && mon.steps.length > 0 && (
              <div style={{ display: "flex", flexDirection: "column", gap: 4, marginTop: 4 }}>
                <span style={{ fontSize: 10, color: "#4B5563", fontWeight: 600 }}>Dernier check :</span>
                {mon.steps.map((s, i) => (
                  <div key={i} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 10 }}>
                    <span style={{ width: 7, height: 7, borderRadius: "50%", background: s.ok ? "#34D399" : "#F87171", flexShrink: 0 }} />
                    <span style={{ color: "#9CA3AF", flex: 1 }}>{s.name}</span>
                    <span style={{ color: s.ok ? "#34D399" : "#F87171", fontWeight: 600 }}>{s.status}</span>
                    <span style={{ color: "#4B5563", fontFamily: "monospace" }}>{s.time}ms</span>
                  </div>
                ))}
              </div>
            )}

            {/* Bouton enregistrer */}
            <button
              onClick={saveMonitoring}
              style={{
                display: "flex", alignItems: "center", justifyContent: "center", gap: 5,
                padding: "7px 0", borderRadius: 7, fontSize: 11, fontWeight: 600, cursor: "pointer",
                border: `1px solid ${monSaved ? "rgba(52,211,153,0.3)" : "rgba(255,255,255,0.1)"}`,
                background: monSaved ? "rgba(52,211,153,0.1)" : "rgba(255,255,255,0.04)",
                color: monSaved ? "#34D399" : "#6B7280",
                transition: "all 0.2s",
              }}
            >
              {monSaved ? <><Check size={11} /> Enregistré</> : <><Activity size={11} /> Enregistrer</>}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
