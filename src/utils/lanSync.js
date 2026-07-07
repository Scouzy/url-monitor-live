/* ── Synchronisation LAN ────────────────────────────────────────────────────
   Permet de partager les données entre le PC (desktop) et un mobile/tablette
   connecté au MÊME réseau Wi-Fi, via le serveur Vite (host: true).

   Flux :
     Desktop → POST /api/sync  (après chargement ITCare ou changement d'état)
     Mobile  → GET  /api/sync  (au démarrage, pour obtenir les données fraîches)
     Mobile  → SSE  /api/sync/stream  (notification temps réel quand desktop pousse)

   Données synchronisées :
     • capacity-servers   — inventaire + métriques serveurs
     • capacity-snapshots — historique pour les graphiques de tendance
── */

const SYNC_URL    = '/api/sync';
const STREAM_URL  = '/api/sync/stream';
const SYNC_TS_KEY = 'g1oeil-lan-sync-ts';

/* Clés localStorage à synchroniser (lecture/écriture par chaîne brute) */
const SYNC_LS_KEYS = ['capacity-servers', 'capacity-snapshots'];

/* ── Push : le desktop envoie son état au serveur Vite ── */
export async function pushSync() {
  try {
    const payload = { syncedAt: Date.now(), data: {} };
    for (const key of SYNC_LS_KEYS) {
      const val = localStorage.getItem(key);
      if (val) payload.data[key] = val;
    }
    const res = await fetch(SYNC_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(5000),
    });
    if (res.ok) {
      localStorage.setItem(SYNC_TS_KEY, String(payload.syncedAt));
      console.log('[LAN Sync] Push OK →', Object.keys(payload.data).join(', '));
    }
  } catch {}
}

/* ── Pull : le mobile récupère l'état du desktop depuis le serveur ──
   Retourne true si de nouvelles données ont été appliquées (→ rechargement state). */
export async function pullSync() {
  try {
    const res = await fetch(SYNC_URL, { signal: AbortSignal.timeout(5000) });
    if (!res.ok) return false;
    const payload = await res.json();
    if (!payload?.syncedAt || !payload?.data) return false;

    const localTs = parseInt(localStorage.getItem(SYNC_TS_KEY) || '0');
    if (payload.syncedAt <= localTs) return false; /* déjà à jour */

    let applied = 0;
    for (const [key, val] of Object.entries(payload.data)) {
      if (SYNC_LS_KEYS.includes(key)) {
        try { localStorage.setItem(key, val); applied++; } catch {}
      }
    }
    if (applied > 0) {
      localStorage.setItem(SYNC_TS_KEY, String(payload.syncedAt));
      console.log('[LAN Sync] Pull OK ←', applied, 'clé(s) appliquée(s)');
      return true;
    }
    return false;
  } catch {
    return false;
  }
}

/* ── SSE : abonnement aux notifications du desktop ──
   onUpdate() est appelé quand le desktop pousse une mise à jour.
   Retourne une fonction de désabonnement. */
export function subscribeSyncStream(onUpdate) {
  let es = null;
  let retryTimeout = null;

  function connect() {
    try {
      es = new EventSource(STREAM_URL);
      es.onmessage = () => { onUpdate?.(); };
      es.onerror = () => {
        es?.close();
        es = null;
        retryTimeout = setTimeout(connect, 10_000);
      };
    } catch {}
  }

  connect();

  return () => {
    es?.close();
    clearTimeout(retryTimeout);
  };
}
