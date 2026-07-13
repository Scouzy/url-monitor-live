import { useState, useEffect, useCallback } from "react";
import {
  Clock, Bell, BellOff, Database, Activity, Server, Globe,
  Plus, Trash2, RefreshCw, Download, Upload, AlertTriangle,
  CheckCircle, XCircle, Zap, HardDrive, Cpu, MemoryStick,
  Webhook, Mail, TestTube, Save,
} from "lucide-react";
import {
  schedulerApi, notificationsApi, systemApi, serverMetricsApi, exportApi,
} from "../utils/backendApi";
import { isLoggedIn } from "../utils/backendAuth";

const card = { background: "rgba(255,255,255,0.025)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 14, overflow: "hidden" };

function SectionHead({ icon, label, extra }) {
  return (
    <div style={{ padding: "12px 18px", borderBottom: "1px solid rgba(255,255,255,0.06)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <div style={{ opacity: 0.5 }}>{icon}</div>
        <span style={{ fontSize: 11, fontWeight: 700, color: "#9CA3AF", letterSpacing: "0.08em", textTransform: "uppercase" }}>{label}</span>
      </div>
      {extra}
    </div>
  );
}

function Row({ left, right }) {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 18px", borderBottom: "1px solid rgba(255,255,255,0.04)", gap: 16 }}>
      <div style={{ flex: 1, minWidth: 0 }}>{left}</div>
      <div style={{ flexShrink: 0 }}>{right}</div>
    </div>
  );
}

function LabelPair({ title, sub }) {
  return (
    <div>
      <div style={{ fontSize: 13, fontWeight: 600, color: "#E5E7EB", marginBottom: 2 }}>{title}</div>
      <div style={{ fontSize: 11, color: "#6B7280" }}>{sub}</div>
    </div>
  );
}

function ToggleBtn({ on, onClick, onLabel = "Activé", offLabel = "Désactivé" }) {
  return (
    <button onClick={onClick} style={{
      display: "flex", alignItems: "center", gap: 6, padding: "5px 14px", borderRadius: 20,
      background: on ? "rgba(52,211,153,0.1)" : "rgba(255,255,255,0.04)",
      border: `1px solid ${on ? "rgba(52,211,153,0.3)" : "rgba(255,255,255,0.1)"}`,
      color: on ? "#34D399" : "#6B7280", fontSize: 11, fontWeight: 700, cursor: "pointer",
    }}>
      {on ? <CheckCircle size={12} /> : <XCircle size={12} />}
      {on ? onLabel : offLabel}
    </button>
  );
}

/* ═══════════════════════════════════════════════════════════════
   SCHEDULER PANEL
   ═══════════════════════════════════════════════════════════════ */
function SchedulerPanel({ allUrls }) {
  const [schedules, setSchedules] = useState([]);
  const [loading, setLoading] = useState(true);
  const [results, setResults] = useState([]);

  const load = useCallback(async () => {
    setLoading(true);
    const [s, r] = await Promise.all([schedulerApi.list(), schedulerApi.results(20)]);
    setSchedules(s.error ? [] : s);
    setResults(r.error ? [] : r);
    setLoading(false);
  }, []);

  useEffect(() => { if (isLoggedIn()) load(); }, [load]);

  const toggleSchedule = async (sched) => {
    await schedulerApi.update(sched.id, { interval_seconds: sched.interval_seconds, enabled: !sched.enabled });
    load();
  };

  const updateInterval = async (sched, seconds) => {
    await schedulerApi.update(sched.id, { interval_seconds: seconds, enabled: !!sched.enabled });
    load();
  };

  const deleteSchedule = async (id) => {
    await schedulerApi.delete(id);
    load();
  };

  const scheduleUrl = async (urlId) => {
    await schedulerApi.scheduleUrl(urlId, 300, true);
    load();
  };

  const unscheduledUrls = allUrls.filter(u => !schedules.some(s => s.url_config_id === u.id));

  return (
    <div style={card}>
      <SectionHead icon={<Clock size={14} />} label="Scheduler — Checks automatisés backend"
        extra={
          <button onClick={load} style={{ fontSize: 10, padding: "3px 9px", borderRadius: 6, background: "rgba(99,102,241,0.12)", border: "1px solid rgba(99,102,241,0.25)", color: "#A5B4FC", cursor: "pointer", fontWeight: 600, display: "flex", alignItems: "center", gap: 4 }}>
            <RefreshCw size={10} /> Actualiser
          </button>
        } />

      {loading ? (
        <div style={{ padding: "20px 18px", fontSize: 12, color: "#6B7280" }}>Chargement...</div>
      ) : schedules.length === 0 ? (
        <div style={{ padding: "16px 18px", fontSize: 12, color: "#4B5563" }}>
          Aucun schedule actif. Sélectionnez une URL ci-dessous pour activer les checks backend.
        </div>
      ) : (
        schedules.map(s => (
          <Row
            key={s.id}
            left={
              <LabelPair
                title={s.url || s.url_name || `URL #${s.url_config_id}`}
                sub={`Dernier check: ${s.last_check_at || "jamais"} · Statut: ${s.last_status || "—"}`}
              />
            }
            right={
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <select value={s.interval_seconds} onChange={e => updateInterval(s, +e.target.value)}
                  style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 6, color: "#E5E7EB", fontSize: 11, padding: "3px 8px", cursor: "pointer" }}>
                  {[60, 120, 300, 600, 900, 1800, 3600].map(v => <option key={v} value={v} style={{ background: "#1F2937" }}>{v >= 60 ? `${v / 60}min` : `${v}s`}</option>)}
                </select>
                <ToggleBtn on={!!s.enabled} onClick={() => toggleSchedule(s)} />
                <button onClick={() => deleteSchedule(s.id)} style={{ background: "none", border: "none", color: "#F87171", cursor: "pointer", padding: 4 }}>
                  <Trash2 size={13} />
                </button>
              </div>
            }
          />
        ))
      )}

      {unscheduledUrls.length > 0 && (
        <div style={{ padding: "10px 18px", borderTop: "1px solid rgba(255,255,255,0.04)" }}>
          <div style={{ fontSize: 10, color: "#4B5563", marginBottom: 6 }}>Ajouter un schedule :</div>
          <select onChange={e => { if (e.target.value) { scheduleUrl(+e.target.value); e.target.value = ""; } }}
            style={{ width: "100%", background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 8, color: "#9CA3AF", fontSize: 12, padding: "6px 10px", cursor: "pointer" }}>
            <option value="">— Sélectionner une URL —</option>
            {unscheduledUrls.map(u => <option key={u.id} value={u.id} style={{ background: "#1F2937" }}>{u.url}</option>)}
          </select>
        </div>
      )}

      {results.length > 0 && (
        <div style={{ padding: "10px 18px", borderTop: "1px solid rgba(255,255,255,0.04)" }}>
          <div style={{ fontSize: 10, color: "#4B5563", marginBottom: 6 }}>20 derniers checks backend :</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 3, maxHeight: 150, overflowY: "auto" }}>
            {results.map((r, i) => (
              <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 10, fontFamily: "'JetBrains Mono', monospace" }}>
                <span style={{ width: 7, height: 7, borderRadius: "50%", background: r.status === "online" ? "#34D399" : r.status === "offline" ? "#F87171" : "#FBBF24", flexShrink: 0 }} />
                <span style={{ color: "#9CA3AF", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.url}</span>
                <span style={{ color: r.status === "online" ? "#34D399" : "#F87171", fontWeight: 700 }}>{r.status}</span>
                <span style={{ color: "#4B5563" }}>{r.response_time}ms</span>
                <span style={{ color: "#374151" }}>{r.checked_at?.slice(11, 19)}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   NOTIFICATIONS PANEL
   ═══════════════════════════════════════════════════════════════ */
function NotificationsPanel() {
  const [channels, setChannels] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [newCh, setNewCh] = useState({ name: "", type: "webhook", url: "", email: "" });
  const [testResult, setTestResult] = useState({});

  const load = useCallback(async () => {
    setLoading(true);
    const r = await notificationsApi.listChannels();
    setChannels(r.error ? [] : r);
    setLoading(false);
  }, []);

  useEffect(() => { if (isLoggedIn()) load(); }, [load]);

  const addChannel = async () => {
    if (!newCh.name) return;
    const config = newCh.type === "webhook" ? { url: newCh.url } : { to: newCh.email };
    await notificationsApi.createChannel(newCh.name, newCh.type, config);
    setNewCh({ name: "", type: "webhook", url: "", email: "" });
    setShowAdd(false);
    load();
  };

  const toggleChannel = async (ch) => {
    await notificationsApi.updateChannel(ch.id, { name: ch.name, type: ch.type, config: ch.config, triggers: ch.triggers, enabled: !ch.enabled });
    load();
  };

  const deleteChannel = async (id) => {
    await notificationsApi.deleteChannel(id);
    load();
  };

  const testChannel = async (id) => {
    setTestResult(s => ({ ...s, [id]: "loading" }));
    const r = await notificationsApi.test(id);
    setTestResult(s => ({ ...s, [id]: r.error ? "error" : "ok" }));
    setTimeout(() => setTestResult(s => { const n = { ...s }; delete n[id]; return n; }), 3000);
  };

  return (
    <div style={card}>
      <SectionHead icon={<Bell size={14} />} label="Canaux de notification backend"
        extra={
          <button onClick={() => setShowAdd(!showAdd)} style={{ fontSize: 10, padding: "3px 9px", borderRadius: 6, background: "rgba(99,102,241,0.12)", border: "1px solid rgba(99,102,241,0.25)", color: "#A5B4FC", cursor: "pointer", fontWeight: 600, display: "flex", alignItems: "center", gap: 4 }}>
            <Plus size={10} /> Ajouter
          </button>
        } />

      {showAdd && (
        <div style={{ padding: "12px 18px", borderBottom: "1px solid rgba(255,255,255,0.04)", display: "flex", flexDirection: "column", gap: 8 }}>
          <input placeholder="Nom du canal..." value={newCh.name} onChange={e => setNewCh({ ...newCh, name: e.target.value })}
            style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 8, color: "#E5E7EB", fontSize: 12, padding: "6px 10px" }} />
          <select value={newCh.type} onChange={e => setNewCh({ ...newCh, type: e.target.value })}
            style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 8, color: "#E5E7EB", fontSize: 12, padding: "6px 10px" }}>
            <option value="webhook" style={{ background: "#1F2937" }}>Webhook (Slack/Teams)</option>
            <option value="email" style={{ background: "#1F2937" }}>Email</option>
          </select>
          {newCh.type === "webhook" ? (
            <input placeholder="URL du webhook..." value={newCh.url} onChange={e => setNewCh({ ...newCh, url: e.target.value })}
              style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 8, color: "#E5E7EB", fontSize: 12, padding: "6px 10px" }} />
          ) : (
            <input placeholder="Email destinataire..." value={newCh.email} onChange={e => setNewCh({ ...newCh, email: e.target.value })}
              style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 8, color: "#E5E7EB", fontSize: 12, padding: "6px 10px" }} />
          )}
          <button onClick={addChannel} style={{ padding: "6px 14px", borderRadius: 8, background: "rgba(99,102,241,0.15)", border: "1px solid rgba(99,102,241,0.3)", color: "#A5B4FC", fontSize: 12, fontWeight: 700, cursor: "pointer", alignSelf: "flex-start" }}>
            <Save size={12} style={{ marginRight: 4, display: "inline" }} /> Créer
          </button>
        </div>
      )}

      {loading ? (
        <div style={{ padding: "20px 18px", fontSize: 12, color: "#6B7280" }}>Chargement...</div>
      ) : channels.length === 0 ? (
        <div style={{ padding: "16px 18px", fontSize: 12, color: "#4B5563" }}>
          Aucun canal configuré. Ajoutez un webhook Slack/Teams ou un email pour recevoir les alertes backend.
        </div>
      ) : (
        channels.map(ch => (
          <Row
            key={ch.id}
            left={
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                {ch.type === "webhook" ? <Webhook size={14} color="#818CF8" /> : <Mail size={14} color="#34D399" />}
                <LabelPair
                  title={ch.name}
                  sub={`${ch.type} · ${ch.config?.url || ch.config?.to || "N/A"} · Triggers: ${ch.triggers}`}
                />
              </div>
            }
            right={
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <button onClick={() => testChannel(ch.id)} title="Tester"
                  style={{ background: "rgba(251,191,36,0.08)", border: "1px solid rgba(251,191,36,0.2)", borderRadius: 6, padding: "4px 8px", cursor: "pointer", display: "flex", alignItems: "center" }}>
                  {testResult[ch.id] === "loading" ? <RefreshCw size={12} className="spin" color="#FBBF24" /> :
                   testResult[ch.id] === "ok" ? <CheckCircle size={12} color="#34D399" /> :
                   testResult[ch.id] === "error" ? <XCircle size={12} color="#F87171" /> :
                   <TestTube size={12} color="#FBBF24" />}
                </button>
                <ToggleBtn on={!!ch.enabled} onClick={() => toggleChannel(ch)} />
                <button onClick={() => deleteChannel(ch.id)} style={{ background: "none", border: "none", color: "#F87171", cursor: "pointer", padding: 4 }}>
                  <Trash2 size={13} />
                </button>
              </div>
            }
          />
        ))
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   BACKUP / RESTORE PANEL
   ═══════════════════════════════════════════════════════════════ */
function BackupPanel() {
  const [backups, setBackups] = useState([]);
  const [loading, setLoading] = useState(true);
  const [action, setAction] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    const r = await systemApi.listBackups();
    setBackups(r.error ? [] : r);
    setLoading(false);
  }, []);

  useEffect(() => { if (isLoggedIn()) load(); }, [load]);

  const createBackup = async () => {
    setAction("backup");
    await systemApi.backup();
    setAction(null);
    load();
  };

  const deleteBackup = async (filename) => {
    await systemApi.deleteBackup(filename);
    load();
  };

  const restoreBackup = async (file) => {
    setAction("restore");
    await systemApi.restore(file);
    setAction(null);
  };

  return (
    <div style={card}>
      <SectionHead icon={<Database size={14} />} label="Backup & Restore base de données"
        extra={
          <button onClick={createBackup} disabled={action === "backup"}
            style={{ fontSize: 10, padding: "3px 9px", borderRadius: 6, background: "rgba(52,211,153,0.12)", border: "1px solid rgba(52,211,153,0.25)", color: "#34D399", cursor: "pointer", fontWeight: 600, display: "flex", alignItems: "center", gap: 4 }}>
            {action === "backup" ? <RefreshCw size={10} className="spin" /> : <Plus size={10} />} Créer un backup
          </button>
        } />

      {loading ? (
        <div style={{ padding: "20px 18px", fontSize: 12, color: "#6B7280" }}>Chargement...</div>
      ) : backups.length === 0 ? (
        <div style={{ padding: "16px 18px", fontSize: 12, color: "#4B5563" }}>
          Aucun backup. Cliquez sur "Créer un backup" pour exporter la base SQLite.
        </div>
      ) : (
        backups.map(b => (
          <Row
            key={b.filename}
            left={
              <LabelPair
                title={b.filename}
                sub={`${(b.size / 1024).toFixed(0)} KB · ${new Date(b.created).toLocaleString("fr-FR")}`}
              />
            }
            right={
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <button onClick={() => deleteBackup(b.filename)} style={{ background: "none", border: "none", color: "#F87171", cursor: "pointer", padding: 4 }}>
                  <Trash2 size={13} />
                </button>
              </div>
            }
          />
        ))
      )}

      <div style={{ padding: "10px 18px", borderTop: "1px solid rgba(255,255,255,0.04)", display: "flex", alignItems: "center", gap: 10 }}>
        <Upload size={14} color="#818CF8" />
        <label style={{ fontSize: 12, color: "#6B7280", cursor: "pointer", display: "flex", alignItems: "center", gap: 6 }}>
          {action === "restore" ? <RefreshCw size={12} className="spin" /> : "Restaurer depuis un fichier..."}
          <input type="file" accept=".db" style={{ display: "none" }} onChange={e => {
            if (e.target.files[0]) restoreBackup(e.target.files[0]);
            e.target.value = "";
          }} />
        </label>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   SYSTEM METRICS PANEL
   ═══════════════════════════════════════════════════════════════ */
function SystemMetricsPanel() {
  const [metrics, setMetrics] = useState(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const r = await systemApi.metrics();
    setMetrics(r.error ? null : r);
    setLoading(false);
  }, []);

  useEffect(() => {
    if (!isLoggedIn()) return;
    load();
    const interval = setInterval(load, 10000);
    return () => clearInterval(interval);
  }, [load]);

  if (loading && !metrics) return (
    <div style={card}>
      <SectionHead icon={<Activity size={14} />} label="Observabilité backend" />
      <div style={{ padding: "20px 18px", fontSize: 12, color: "#6B7280" }}>Chargement...</div>
    </div>
  );

  if (!metrics) return (
    <div style={card}>
      <SectionHead icon={<Activity size={14} />} label="Observabilité backend" />
      <div style={{ padding: "16px 18px", fontSize: 12, color: "#F87171" }}>Backend injoignable</div>
    </div>
  );

  const memMB = (metrics.memory?.rss / 1024 / 1024).toFixed(1);
  const heapUsed = (metrics.memory?.heapUsed / 1024 / 1024).toFixed(1);
  const heapTotal = (metrics.memory?.heapTotal / 1024 / 1024).toFixed(1);
  const dbSizeKB = (metrics.db?.size / 1024).toFixed(0);
  const uptimeH = Math.floor(metrics.uptime_seconds / 3600);
  const uptimeM = Math.floor((metrics.uptime_seconds % 3600) / 60);

  return (
    <div style={card}>
      <SectionHead icon={<Activity size={14} />} label="Observabilité backend"
        extra={
          <button onClick={load} style={{ fontSize: 10, padding: "3px 9px", borderRadius: 6, background: "rgba(99,102,241,0.12)", border: "1px solid rgba(99,102,241,0.25)", color: "#A5B4FC", cursor: "pointer", fontWeight: 600, display: "flex", alignItems: "center", gap: 4 }}>
            <RefreshCw size={10} /> Actualiser
          </button>
        } />

      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 0 }}>
        {[
          { icon: <Clock size={14} color="#818CF8" />, label: "Uptime", value: `${uptimeH}h ${uptimeM}m`, color: "#818CF8" },
          { icon: <Activity size={14} color="#34D399" />, label: "Requêtes", value: metrics.totalRequests, color: "#34D399" },
          { icon: <MemoryStick size={14} color="#FBBF24" />, label: "Mémoire RSS", value: `${memMB} MB`, color: "#FBBF24" },
          { icon: <HardDrive size={14} color="#F472B6" />, label: "DB Size", value: `${dbSizeKB} KB`, color: "#F472B6" },
        ].map(s => (
          <div key={s.label} style={{ padding: "12px 14px", borderBottom: "1px solid rgba(255,255,255,0.04)", borderRight: "1px solid rgba(255,255,255,0.04)", display: "flex", alignItems: "center", gap: 10 }}>
            {s.icon}
            <div>
              <div style={{ fontSize: 16, fontWeight: 800, color: s.color, fontFamily: "'JetBrains Mono', monospace" }}>{s.value}</div>
              <div style={{ fontSize: 10, color: "#6B7280" }}>{s.label}</div>
            </div>
          </div>
        ))}
      </div>

      <div style={{ padding: "10px 18px", fontSize: 10, color: "#4B5563" }}>
        Heap: {heapUsed} / {heapTotal} MB · CPU: user {Math.round(metrics.cpu?.user / 1000)}ms · system {Math.round(metrics.cpu?.system / 1000)}ms
      </div>

      {metrics.routes && metrics.routes.length > 0 && (
        <div style={{ padding: "10px 18px", borderTop: "1px solid rgba(255,255,255,0.04)" }}>
          <div style={{ fontSize: 10, color: "#4B5563", marginBottom: 6 }}>Top routes par nombre de requêtes :</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 3, maxHeight: 120, overflowY: "auto" }}>
            {metrics.routes.slice(0, 10).map((r, i) => (
              <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 10, fontFamily: "'JetBrains Mono', monospace" }}>
                <span style={{ color: "#9CA3AF", flex: 1 }}>{r.route}</span>
                <span style={{ color: "#818CF8", fontWeight: 700 }}>{r.count}x</span>
                <span style={{ color: "#6B7280" }}>avg {r.avgMs}ms</span>
                <span style={{ color: "#4B5563" }}>max {r.maxMs}ms</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   EXPORT BACKEND PANEL
   ═══════════════════════════════════════════════════════════════ */
function ExportBackendPanel() {
  const [busy, setBusy] = useState(null);

  const doExport = async (type) => {
    setBusy(type);
    let url;
    if (type === "servers") url = exportApi.serversXlsx();
    else if (type === "urls") url = exportApi.urlsXlsx();
    else if (type === "report") url = exportApi.reportPdf();
    await exportApi.downloadExport(url);
    setBusy(null);
  };

  return (
    <div style={card}>
      <SectionHead icon={<Download size={14} />} label="Export backend (Excel / Rapport)" />
      <div style={{ padding: "12px 18px", display: "flex", gap: 10, flexWrap: "wrap" }}>
        <button onClick={() => doExport("servers")} disabled={busy === "servers"}
          style={{ display: "flex", alignItems: "center", gap: 6, padding: "6px 14px", borderRadius: 20, background: "rgba(52,211,153,0.1)", border: "1px solid rgba(52,211,153,0.25)", color: "#34D399", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
          {busy === "servers" ? <RefreshCw size={12} className="spin" /> : <Download size={12} />} Export serveurs (.xlsx)
        </button>
        <button onClick={() => doExport("urls")} disabled={busy === "urls"}
          style={{ display: "flex", alignItems: "center", gap: 6, padding: "6px 14px", borderRadius: 20, background: "rgba(99,102,241,0.1)", border: "1px solid rgba(99,102,241,0.25)", color: "#A5B4FC", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
          {busy === "urls" ? <RefreshCw size={12} className="spin" /> : <Download size={12} />} Export URLs (.xlsx)
        </button>
        <button onClick={() => doExport("report")} disabled={busy === "report"}
          style={{ display: "flex", alignItems: "center", gap: 6, padding: "6px 14px", borderRadius: 20, background: "rgba(251,191,36,0.1)", border: "1px solid rgba(251,191,36,0.25)", color: "#FBBF24", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
          {busy === "report" ? <RefreshCw size={12} className="spin" /> : <Download size={12} />} Rapport PDF
        </button>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   MAIN BACKEND PANEL — assemblé
   ═══════════════════════════════════════════════════════════════ */
export default function BackendPanel({ allUrls }) {
  if (!isLoggedIn()) {
    return (
      <div style={card}>
        <SectionHead icon={<Server size={14} />} label="Intégration backend" />
        <div style={{ padding: "20px 18px", fontSize: 12, color: "#6B7280", textAlign: "center" }}>
          Connectez-vous pour accéder aux fonctionnalités backend (scheduler, notifications, backup, observabilité).
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <SchedulerPanel allUrls={allUrls} />
      <NotificationsPanel />
      <ExportBackendPanel />
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
        <BackupPanel />
        <SystemMetricsPanel />
      </div>
    </div>
  );
}
