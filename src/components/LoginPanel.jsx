import { useState } from "react";
import { X, User, Lock, LogIn, LogOut, Loader } from "lucide-react";
import { login, logout, isLoggedIn, getAuthUser, verifyToken, pushUrlsToBackend, startHeartbeat, stopHeartbeat, sendAuditLog } from "../utils/backendAuth";

export default function LoginPanel({ groups, onAuthChange }) {
  const [open, setOpen] = useState(false);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [syncStatus, setSyncStatus] = useState("");
  const [loggedIn, setLoggedIn] = useState(isLoggedIn());
  const [user, setUser] = useState(getAuthUser());

  const handleLogin = async () => {
    if (!username || !password) { setError("Champs manquants"); return; }
    setLoading(true);
    setError("");
    try {
      const u = await login(username, password);
      setUser(u);
      setLoggedIn(true);
      setOpen(false);
      onAuthChange?.(u);
      /* Démarrer le heartbeat pour tracer la synchro */
      startHeartbeat(() => ({
        urlsCount: groups?.reduce((acc, g) => acc + (g.urls?.length || 0), 0) || 0,
        serversCount: 0,
      }));
      /* Auto-sync des URLs au login */
      if (groups?.length) {
        const result = await pushUrlsToBackend(groups);
        if (result.ok) {
          setSyncStatus(`${result.imported} URL(s) synchronisée(s)`);
          setTimeout(() => setSyncStatus(""), 4000);
        }
      }
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = async () => {
    stopHeartbeat();
    await logout();
    setLoggedIn(false);
    setUser(null);
    onAuthChange?.(null);
  };

  const handleSync = async () => {
    if (!groups?.length) return;
    setSyncStatus("Synchronisation...");
    try {
      const result = await pushUrlsToBackend(groups);
      if (result.ok) {
        setSyncStatus(`${result.imported} importée(s), ${result.skipped} existante(s)`);
      } else {
        setSyncStatus(`Erreur: ${result.error}`);
      }
    } catch (e) {
      setSyncStatus(`Erreur: ${e.message}`);
    }
    setTimeout(() => setSyncStatus(""), 4000);
  };

  if (loggedIn) {
    return (
      <>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {syncStatus && (
            <span style={{ fontSize: 10, color: "#34D399", fontWeight: 600 }}>{syncStatus}</span>
          )}
          <button
            onClick={handleSync}
            title="Synchroniser les URLs vers le backend"
            style={{
              display: "flex", alignItems: "center", gap: 5, padding: "5px 10px",
              borderRadius: 7, fontSize: 11, fontWeight: 600, cursor: "pointer",
              border: "1px solid rgba(99,102,241,0.3)", background: "rgba(99,102,241,0.1)",
              color: "#818CF8", transition: "all 0.2s",
            }}
            onMouseEnter={e => { e.currentTarget.style.background = "rgba(99,102,241,0.2)"; }}
            onMouseLeave={e => { e.currentTarget.style.background = "rgba(99,102,241,0.1)"; }}
          >
            Sync URLs
          </button>
          <div style={{
            display: "flex", alignItems: "center", gap: 6, padding: "5px 10px",
            borderRadius: 7, background: "rgba(52,211,153,0.1)", border: "1px solid rgba(52,211,153,0.2)",
          }}>
            <div style={{ width: 7, height: 7, borderRadius: "50%", background: "#34D399" }} />
            <span style={{ fontSize: 11, fontWeight: 600, color: "#34D399" }}>{user?.username}</span>
          </div>
          <button
            onClick={handleLogout}
            title="Déconnexion"
            style={{
              display: "flex", alignItems: "center", justifyContent: "center",
              width: 30, height: 30, borderRadius: 7, cursor: "pointer",
              border: "1px solid rgba(248,113,113,0.2)", background: "rgba(248,113,113,0.08)",
              color: "#F87171", transition: "all 0.2s",
            }}
            onMouseEnter={e => { e.currentTarget.style.background = "rgba(248,113,113,0.15)"; }}
            onMouseLeave={e => { e.currentTarget.style.background = "rgba(248,113,113,0.08)"; }}
          >
            <LogOut size={14} />
          </button>
        </div>
      </>
    );
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        style={{
          display: "flex", alignItems: "center", gap: 6, padding: "6px 14px",
          borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: "pointer",
          border: "1px solid rgba(99,102,241,0.3)", background: "rgba(99,102,241,0.1)",
          color: "#818CF8", transition: "all 0.2s",
        }}
        onMouseEnter={e => { e.currentTarget.style.background = "rgba(99,102,241,0.2)"; }}
        onMouseLeave={e => { e.currentTarget.style.background = "rgba(99,102,241,0.1)"; }}
      >
        <LogIn size={14} />
        Connexion
      </button>

      {open && (
        <div
          onClick={() => setOpen(false)}
          style={{
            position: "fixed", top: 0, left: 0, right: 0, bottom: 0,
            background: "rgba(0,0,0,0.6)", display: "flex",
            alignItems: "center", justifyContent: "center", padding: 20,
            zIndex: 9999, animation: "fadeIn 0.15s ease",
          }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{
              background: "#111827", border: "1px solid rgba(255,255,255,0.1)",
              borderRadius: 16, padding: 28, width: "100%", maxWidth: 360,
              maxHeight: "90vh", overflowY: "auto",
              display: "flex", flexDirection: "column", gap: 16,
              margin: "auto",
              boxSizing: "border-box",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <img src="./g1oeil_icone_app.svg" alt="G1Oeil" style={{ width: 28, height: 28 }} />
                <div>
                  <div style={{ fontSize: 16, fontWeight: 700, color: "#E5E7EB" }}>G1Oeil</div>
                  <div style={{ fontSize: 11, color: "#6B7280" }}>Connexion au backend</div>
                </div>
              </div>
              <button onClick={() => setOpen(false)} style={{ background: "none", border: "none", color: "#6B7280", cursor: "pointer" }}>
                <X size={18} />
              </button>
            </div>

            {error && (
              <div style={{
                padding: "8px 12px", borderRadius: 8, fontSize: 12, fontWeight: 600,
                background: "rgba(248,113,113,0.1)", border: "1px solid rgba(248,113,113,0.2)",
                color: "#F87171",
              }}>
                {error}
              </div>
            )}

            <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, color: "#6B7280", fontWeight: 600 }}>
                <User size={12} /> Utilisateur
              </div>
              <input
                value={username}
                onChange={e => setUsername(e.target.value)}
                onKeyDown={e => e.key === "Enter" && handleLogin()}
                placeholder="admin"
                autoComplete="username"
                style={{
                  background: "#0D1117", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8,
                  color: "#E5E7EB", fontSize: 13, padding: "9px 12px", outline: "none",
                  fontFamily: "inherit", width: "100%", boxSizing: "border-box",
                }}
                autoFocus
              />
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, color: "#6B7280", fontWeight: 600 }}>
                <Lock size={12} /> Mot de passe
              </div>
              <input
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                onKeyDown={e => e.key === "Enter" && handleLogin()}
                placeholder="••••••••"
                autoComplete="current-password"
                style={{
                  background: "#0D1117", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8,
                  color: "#E5E7EB", fontSize: 13, padding: "9px 12px", outline: "none",
                  fontFamily: "inherit", width: "100%", boxSizing: "border-box",
                }}
              />
            </div>

            <button
              onClick={handleLogin}
              disabled={loading}
              style={{
                display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
                padding: "10px 0", borderRadius: 8, fontSize: 13, fontWeight: 600,
                cursor: loading ? "not-allowed" : "pointer", border: "none",
                background: loading ? "rgba(99,102,241,0.3)" : "#6366F1", color: "white",
                transition: "all 0.2s", fontFamily: "inherit",
              }}
            >
              {loading ? <Loader size={14} className="animate-spin" /> : <LogIn size={14} />}
              {loading ? "Connexion..." : "Se connecter"}
            </button>

            <div style={{ fontSize: 10, color: "#4B5563", textAlign: "center" }}>
              Compte par défaut: admin / admin123
            </div>
          </div>
        </div>
      )}
    </>
  );
}
