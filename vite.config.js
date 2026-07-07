import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tls from 'node:tls'
import { existsSync, readFileSync, writeFileSync, statSync, mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

function sslCheckPlugin() {
  return {
    name: 'ssl-check-middleware',
    configureServer(server) {
      server.middlewares.use('/api/ssl-check', (req, res) => {
        const qs = (req.url || '').split('?')[1] || '';
        const urlParam = new URLSearchParams(qs).get('url');
        res.setHeader('Content-Type', 'application/json');
        res.setHeader('Access-Control-Allow-Origin', '*');
        if (!urlParam) return res.end(JSON.stringify({ error: 'Missing url' }));
        let hostname;
        try { hostname = new URL(urlParam).hostname; }
        catch { return res.end(JSON.stringify({ error: 'Invalid URL' })); }
        if (!urlParam.startsWith('https://'))
          return res.end(JSON.stringify({ notHttps: true }));
        const socket = tls.connect(
          { host: hostname, port: 443, servername: hostname, rejectUnauthorized: false },
          () => {
            try {
              const cert = socket.getPeerCertificate();
              socket.destroy();
              if (!cert?.valid_to) return res.end(JSON.stringify({ error: 'No cert data' }));
              const notAfter  = new Date(cert.valid_to);
              const notBefore = new Date(cert.valid_from);
              const daysLeft  = Math.ceil((notAfter - new Date()) / 864e5);
              res.end(JSON.stringify({
                subject:   cert.subject?.CN || hostname,
                issuer:    cert.issuer?.O || cert.issuer?.CN || 'Unknown',
                notBefore: notBefore.toISOString(),
                notAfter:  notAfter.toISOString(),
                daysLeft,
                valid: daysLeft > 0,
              }));
            } catch (e) { res.end(JSON.stringify({ error: e.message })); }
          }
        );
        socket.setTimeout(8000, () => { socket.destroy(); res.end(JSON.stringify({ error: 'Timeout' })); });
        socket.on('error', e => res.end(JSON.stringify({ error: e.code || e.message, invalid: true })));
      });
    },
  };
}

function screenshotPlugin() {
  const CHROME_PATHS = [
    process.env.CHROME_PATH,
    process.env.LOCALAPPDATA && `${process.env.LOCALAPPDATA}\\Google\\Chrome\\Application\\chrome.exe`,
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    process.env.LOCALAPPDATA && `${process.env.LOCALAPPDATA}\\Microsoft\\Edge\\Application\\msedge.exe`,
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
    '/usr/bin/google-chrome', '/usr/bin/chromium-browser', '/usr/bin/chromium',
  ].filter(Boolean);

  const findBrowser = () => CHROME_PATHS.find(p => { try { return existsSync(p); } catch { return false; } }) || null;

  /* ── Cache disque + mémoire ── */
  const CACHE_TTL = 60 * 60 * 1000;
  const CACHE_DIR = join(tmpdir(), 'url-monitor-shots');
  try { mkdirSync(CACHE_DIR, { recursive: true }); } catch {}
  const memCache = new Map();

  function cacheKey(url) {
    return Buffer.from(url).toString('base64').replace(/[/+=]/g, '_').slice(0, 48);
  }
  function getCached(url) {
    const m = memCache.get(url);
    if (m && Date.now() - m.ts < CACHE_TTL) return m.buf;
    try {
      const fp = join(CACHE_DIR, cacheKey(url) + '.jpg');
      const mtime = statSync(fp).mtimeMs;
      if (Date.now() - mtime < CACHE_TTL) {
        const buf = readFileSync(fp);
        memCache.set(url, { buf, ts: mtime });
        return buf;
      }
    } catch {}
    return null;
  }
  function setCache(url, buf) {
    memCache.set(url, { buf, ts: Date.now() });
    try { writeFileSync(join(CACHE_DIR, cacheKey(url) + '.jpg'), buf); } catch {}
  }

  /* ── Concurrence max 3 captures simultanées ── */
  let concurrent = 0;
  const MAX_CONCURRENT = 3;
  const captureQueue = [];
  function enqueue(task) {
    return new Promise((resolve, reject) => {
      const run = () => {
        concurrent++;
        task().then(resolve).catch(reject).finally(() => {
          concurrent--;
          if (captureQueue.length) {
            try { captureQueue.shift()(); } catch {}
          }
        });
      };
      if (concurrent < MAX_CONCURRENT) run();
      else captureQueue.push(run);
    });
  }

  /* ── Gestion du navigateur ── */
  let browser = null;
  let launching = null;

  async function getBrowser(puppeteer) {
    if (browser) return browser;
    if (launching) return launching;
    const exe = findBrowser();
    if (!exe) throw new Error('Chrome/Edge introuvable. Définissez CHROME_PATH.');
    launching = puppeteer.launch({
      executablePath: exe,
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--window-size=1280,800'],
    }).then(b => {
      browser = b; launching = null;
      b.on('disconnected', () => { browser = null; launching = null; });
      return b;
    }).catch(e => { launching = null; throw e; });
    return launching;
  }

  return {
    name: 'screenshot-middleware',
    configureServer(server) {
      /* Pré-chauffe Chrome au démarrage de Vite */
      (async () => {
        try {
          const pup = (await import('puppeteer-core')).default;
          await getBrowser(pup);
          console.log('\x1b[36m[screenshot]\x1b[0m Chrome prêt');
        } catch (e) { console.log('\x1b[33m[screenshot]\x1b[0m Pré-chauffe ignorée:', e.message); }
      })();

      server.middlewares.use('/api/screenshot', async (req, res) => {
        const qs = (req.url || '').split('?')[1] || '';
        const params = new URLSearchParams(qs);
        const urlParam = params.get('url');
        const nocache = params.has('nocache');

        res.setHeader('Access-Control-Allow-Origin', '*');
        if (!urlParam) {
          res.statusCode = 400; res.setHeader('Content-Type', 'application/json');
          return res.end(JSON.stringify({ error: 'Missing url' }));
        }

        /* Retour immédiat si en cache */
        if (!nocache) {
          const cached = getCached(urlParam);
          if (cached) {
            res.setHeader('Content-Type', 'image/jpeg');
            res.setHeader('Cache-Control', 'public, max-age=3600');
            res.setHeader('X-Cache', 'HIT');
            return res.end(cached);
          }
        }

        let puppeteer;
        try { puppeteer = (await import('puppeteer-core')).default; }
        catch {
          res.statusCode = 503; res.setHeader('Content-Type', 'application/json');
          return res.end(JSON.stringify({ error: 'puppeteer-core non installé' }));
        }

        try {
          const buf = await enqueue(async () => {
            /* Réinitialiser le browser si la connexion CDP est rompue */
            const b = await getBrowser(puppeteer);
            const page = await b.newPage();
            try {
              await page.setViewport({ width: 1280, height: 800 });
              if (nocache) await page.setCacheEnabled(false);
              await page.setExtraHTTPHeaders({ 'Accept-Language': 'fr-FR,fr;q=0.9,en;q=0.8' });
              /* Bloquer polices externes, médias et tracking pour accélérer le chargement */
              await page.setRequestInterception(true);
              page.on('request', req => {
                const rt = req.resourceType();
                if (rt === 'font' || rt === 'media' || rt === 'websocket') req.abort().catch(() => {});
                else req.continue().catch(() => {});
              });
              /* SPAs (hash routing) ont besoin de plus de temps pour que JS rende la page */
              const isSpa = urlParam.includes('#');
              await page.goto(urlParam, { waitUntil: 'domcontentloaded', timeout: 12000 }).catch(() => {});
              await new Promise(r => setTimeout(r, isSpa ? 2500 : 600));
              return await page.screenshot({ type: 'jpeg', quality: 78, clip: { x: 0, y: 0, width: 1280, height: 800 } });
            } finally {
              await page.close().catch(() => {});
            }
          });
          if (!nocache) setCache(urlParam, buf);
          res.setHeader('Content-Type', 'image/jpeg');
          res.setHeader('Cache-Control', 'public, max-age=3600');
          res.setHeader('X-Cache', 'MISS');
          res.end(buf);
        } catch (e) {
          /* Réinitialiser Chrome si connexion rompue */
          if (e?.message && (e.message.includes('Protocol') || e.message.includes('Target closed') || e.message.includes('Session closed'))) {
            browser = null; launching = null;
          }
          if (!res.headersSent) {
            res.statusCode = 500; res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ error: e.message }));
          }
        }
      });

      /* Empêche un ProtocolError Puppeteer de tuer le processus Vite */
      process.on('unhandledRejection', (reason) => {
        const msg = reason?.message || String(reason);
        if (msg.includes('Protocol') || msg.includes('Target closed') || msg.includes('Session closed') || msg.includes('puppeteer')) {
          browser = null; launching = null;
          console.warn('\x1b[33m[screenshot]\x1b[0m Chrome reconnecté après erreur:', msg.split('\n')[0]);
        }
      });
    },
  };
}

/* ── Plugin LAN Sync : partage d'état entre desktop et mobile (même réseau) ─── */
function lanSyncPlugin() {
  let _state = null;        // dernier état poussé
  const _clients = new Set(); // clients SSE connectés

  return {
    name: 'lan-sync-middleware',
    configureServer(server) {

      /* ── SSE stream : notifications temps réel ── */
      server.middlewares.use('/api/sync/stream', (req, res) => {
        res.setHeader('Content-Type', 'text/event-stream');
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('Connection', 'keep-alive');
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.flushHeaders?.();

        /* Envoyer immédiatement le timestamp si un état existe déjà */
        if (_state) {
          res.write(`data: ${JSON.stringify({ syncedAt: _state.syncedAt })}\n\n`);
        } else {
          res.write(': connected\n\n');
        }

        _clients.add(res);
        req.on('close', () => { _clients.delete(res); });
      });

      /* ── GET/POST /api/sync ── */
      server.middlewares.use('/api/sync', (req, res) => {
        res.setHeader('Content-Type', 'application/json');
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
        if (req.method === 'OPTIONS') { res.statusCode = 204; return res.end(); }

        /* GET — retourne l'état actuel */
        if (req.method === 'GET') {
          if (!_state) { res.statusCode = 204; return res.end('{}'); }
          return res.end(JSON.stringify(_state));
        }

        /* POST — enregistre le nouvel état et notifie les clients SSE */
        if (req.method === 'POST') {
          let body = '';
          req.on('data', d => { body += d; });
          req.on('end', () => {
            try {
              _state = JSON.parse(body);
              const msg = `data: ${JSON.stringify({ syncedAt: _state.syncedAt })}\n\n`;
              for (const client of _clients) {
                try { client.write(msg); } catch { _clients.delete(client); }
              }
              console.log(`\x1b[36m[LAN Sync]\x1b[0m État reçu — ${Object.keys(_state.data || {}).join(', ')} — ${_clients.size} client(s) connecté(s)`);
              return res.end(JSON.stringify({ ok: true, clients: _clients.size }));
            } catch (e) {
              res.statusCode = 400;
              return res.end(JSON.stringify({ error: e.message }));
            }
          });
          return;
        }

        res.statusCode = 405;
        res.end(JSON.stringify({ error: 'Method not allowed' }));
      });
    },
  };
}

/* ── Plugin ITCare : proxy OAuth2 + ressources compute ─────────────────────── */
function itcarePlugin() {
  const TOKEN_URL = 'https://accounts.cegedim.cloud/auth/realms/cloud/protocol/openid-connect/token';
  const API_BASE  = 'https://api.cegedim.cloud/itcare';
  let _tokenCache = null; // { token, expiry }

  async function getToken(clientId, clientSecret) {
    if (_tokenCache && _tokenCache.expiry > Date.now()) return _tokenCache.token;
    const creds = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
    const r = await fetch(TOKEN_URL, {
      method: 'POST',
      headers: { 'Authorization': `Basic ${creds}`, 'Content-Type': 'application/x-www-form-urlencoded' },
      body: 'grant_type=client_credentials',
    });
    if (!r.ok) {
      const txt = await r.text().catch(() => '');
      throw new Error(`Auth ITCare échouée (${r.status}) — ${txt.slice(0, 200)}`);
    }
    const { access_token, expires_in } = await r.json();
    _tokenCache = { token: access_token, expiry: Date.now() + Math.max((expires_in - 30) * 1000, 0) };
    return access_token;
  }

  /* Patterns qui identifient une ressource de type Instance / VM */
  function isInstance(r) {
    const rt   = String(r.resourceType || '').toUpperCase();
    const cat  = String(r.category     || '').toUpperCase();
    const fam  = String(r.family       || '').toUpperCase();
    const path = String(r.path         || '').toLowerCase();
    const lbl  = String(r.label        || r.prettyLabel || '').toUpperCase();

    /* Exclusions explicites (LB, FW, storage, réseau…) */
    const exclude = ['LOAD_BALANCER','FIREWALL','SWITCH','ROUTER','STORAGE',
      'NAS','SAN','CONTAINER','KUBERNETES','DATABASE','CDN','DNS'];
    if (exclude.some(x => rt.includes(x) || cat.includes(x) || fam.includes(x))) return false;

    /* Inclusions positives */
    const include = ['INSTANCE','VIRTUAL_MACHINE','VM','SERVER','PHYSIC'];
    if (include.some(x => rt.includes(x) || cat.includes(x) || fam.includes(x))) return true;

    /* Déduction par le chemin (ex. /compute/instances/…) */
    if (path.startsWith('/compute') || path.includes('/instance') || path.includes('/vm')) return true;

    /* Déduction par le label */
    if (lbl.includes('INSTANCE') || lbl.includes('VIRTUAL') || lbl.includes('SERVER')) return true;

    return false;
  }

  async function fetchAllPages(token, endpoint) {
    const all = [];
    let page = 0;
    const size = 200;
    while (true) {
      const u = new URL(endpoint);
      u.searchParams.set('page', page);
      u.searchParams.set('size', size);
      const r = await fetch(u.toString(), {
        headers: { 'Authorization': `Bearer ${token}` },
      });
      if (!r.ok) {
        const txt = await r.text().catch(() => '');
        throw new Error(`${endpoint} (${r.status}) — ${txt.slice(0, 200)}`);
      }
      const data = await r.json();
      const items = Array.isArray(data) ? data
        : data.content || data.resources || data.items || data.data || [];
      all.push(...items);
      const totalPages = data.totalPages ?? data.total_pages;
      if (items.length < size || (totalPages != null && page + 1 >= totalPages)) break;
      page++;
    }
    return all;
  }

  async function fetchAllResources(token) {
    /* 1. Essayer le endpoint dédié /compute/instances */
    try {
      const probe = await fetch(`${API_BASE}/compute/instances?page=0&size=1`, {
        headers: { 'Authorization': `Bearer ${token}` },
        signal: AbortSignal.timeout(6000),
      });
      if (probe.ok) {
        console.log('\x1b[36m[ITCare]\x1b[0m Endpoint /compute/instances disponible — utilisation.');
        return fetchAllPages(token, `${API_BASE}/compute/instances`);
      }
    } catch {}

    /* 2. Fallback : /compute/resources avec filtre côté serveur si supporté */
    let filtered = [];
    try {
      const probe = await fetch(`${API_BASE}/compute/resources?resourceType=INSTANCE&page=0&size=1`, {
        headers: { 'Authorization': `Bearer ${token}` },
        signal: AbortSignal.timeout(6000),
      });
      if (probe.ok) {
        const d = await probe.json();
        const items = Array.isArray(d) ? d : d.content || d.items || d.data || [];
        /* Vérifier que le filtre a bien réduit les résultats */
        if (items.length > 0 && items.every(r => isInstance(r))) {
          console.log('\x1b[36m[ITCare]\x1b[0m Filtre resourceType=INSTANCE accepté par l\'API.');
          return fetchAllPages(token, `${API_BASE}/compute/resources?resourceType=INSTANCE`);
        }
      }
    } catch {}

    /* 3. Dernier recours : tout récupérer et filtrer côté proxy */
    console.log('\x1b[36m[ITCare]\x1b[0m Filtre local : chargement de toutes les ressources puis filtre Instances…');
    const all = await fetchAllPages(token, `${API_BASE}/compute/resources`);
    filtered = all.filter(isInstance);
    console.log(`\x1b[36m[ITCare]\x1b[0m ${all.length} ressources totales → ${filtered.length} instances conservées.`);
    return filtered;
  }

  /* Champs "utiles" déjà présents dans la liste : on ne re-fetche que s'il en manque */
  const LIST_FIELDS = new Set([
    'id','name','path','status','environment','serviceName','serviceId',
    'category','cloudId','cloudName','productName','resourceType',
    'supportLevel','supportPhase','type','family','internalResourceId',
    'creationTime','creationUser','comment',
  ]);

  /* Champs confirmés via DevTools sur GET /compute/instances/{internalResourceId} :
     ram, cpu, storage, backup{backupSystem,size,type,lastDate}, backupPolicyDetails{backups,policies},
     patchParty{excluded,exclusionReason,patchGroup,patchDate,patchTag}, network, loadbalancers,
     availabilityZone, area, region, replication, isMemberOFLoadBalancer, ipAddress */
  const DETAIL_FIELDS_WANTED = ['ipAddress','cpu','ram','storage','backup','backupPolicyDetails',
    'backupStatus','patchParty','network','loadbalancers','availabilityZone','area','region',
    'replication','isMemberOFLoadBalancer','storageMoveInProgress','authenticationDomain'];

  /* Sonde GET {path}/{internalResourceId} sur le 1er item pour détecter les champs supplémentaires
     confirmé via DevTools : GET /compute/instances/{internalResourceId} (path vient de la liste) */
  async function probeDetailEndpoint(token, path, id) {
    try {
      const r = await fetch(`${API_BASE}${path}/${id}`, {
        headers: { 'Authorization': `Bearer ${token}` },
        signal: AbortSignal.timeout(6000),
      });
      if (!r.ok) return null;
      const data = await r.json();
      const extraKeys = Object.keys(data).filter(k => !LIST_FIELDS.has(k));
      const usefulKeys = extraKeys.filter(k => DETAIL_FIELDS_WANTED.includes(k));
      console.log(`\x1b[36m[ITCare]\x1b[0m GET ${path}/{id} — champs supplémentaires :`, extraKeys.join(' | ') || '(aucun)');
      console.log('\x1b[36m[ITCare]\x1b[0m Champs utiles trouvés :', usefulKeys.join(' | ') || '(aucun)');
      return { extraKeys, usefulKeys, sample: data };
    } catch (e) {
      console.log('\x1b[33m[ITCare]\x1b[0m Endpoint détail indisponible :', e.message);
      return null;
    }
  }

  /* Enrichit chaque ressource avec les données du endpoint détail (batch de 10) —
     source de vérité pour ram/cpu/storage/backup/patchParty (corrige les valeurs erronées de la liste) */
  async function enrichWithDetails(resources, token) {
    if (resources.length === 0) return resources;

    const first = resources.find(r => r.path && r.internalResourceId) || resources[0];
    const probe = await probeDetailEndpoint(token, first.path || '/compute/instances', first.internalResourceId || first.id);
    if (!probe) { console.log('\x1b[33m[ITCare]\x1b[0m Endpoint détail indisponible pour toutes les ressources.'); return resources; }

    console.log(`\x1b[36m[ITCare]\x1b[0m Enrichissement détail de ${resources.length} ressources (batch 10)…`);
    const BATCH = 10;
    const result = [...resources];
    for (let i = 0; i < result.length; i += BATCH) {
      await Promise.all(result.slice(i, i + BATCH).map(async (r, bi) => {
        try {
          const id = r.internalResourceId || r.id;
          const path = r.path || '/compute/instances';
          const res = await fetch(`${API_BASE}${path}/${id}`, {
            headers: { 'Authorization': `Bearer ${token}` },
            signal: AbortSignal.timeout(8000),
          });
          if (res.ok) result[i + bi] = { ...r, ...(await res.json()) };
        } catch {}
      }));
    }
    console.log('\x1b[36m[ITCare]\x1b[0m Enrichissement détail terminé.');
    return result;
  }

  /* Stockage détaillé par point de montage — confirmé via DevTools :
     GET {path}/{internalResourceId}/storage → { totalSizeDisks, fileSystems:[{mountingPoint,sizeOf,free}], totalSizeFileSystems } */
  async function enrichWithStorage(resources, token) {
    if (resources.length === 0) return resources;
    console.log(`\x1b[36m[ITCare]\x1b[0m Stockage détaillé : interrogation de ${resources.length} ressources…`);
    const BATCH = 10;
    const result = [...resources];
    let found = 0;
    for (let i = 0; i < result.length; i += BATCH) {
      await Promise.all(result.slice(i, i + BATCH).map(async (r, bi) => {
        try {
          const id = r.internalResourceId || r.id;
          const path = r.path || '/compute/instances';
          const res = await fetch(`${API_BASE}${path}/${id}/storage`, {
            headers: { 'Authorization': `Bearer ${token}` },
            signal: AbortSignal.timeout(8000),
          });
          if (!res.ok) return;
          const data = await res.json();
          if (data && Array.isArray(data.fileSystems)) { result[i + bi] = { ...result[i + bi], _storage: data }; found++; }
        } catch {}
      }));
    }
    console.log(`\x1b[36m[ITCare]\x1b[0m Stockage détaillé : ${found}/${resources.length} ressources renseignées.`);
    return result;
  }

  /* Snapshots — confirmé via DevTools : GET {path}/{internalResourceId}/snapshots (souvent vide, 204) */
  async function enrichWithSnapshots(resources, token) {
    if (resources.length === 0) return resources;
    console.log(`\x1b[36m[ITCare]\x1b[0m Snapshots : interrogation de ${resources.length} ressources…`);
    const BATCH = 10;
    const result = [...resources];
    let found = 0;
    for (let i = 0; i < result.length; i += BATCH) {
      await Promise.all(result.slice(i, i + BATCH).map(async (r, bi) => {
        try {
          const id = r.internalResourceId || r.id;
          const path = r.path || '/compute/instances';
          const res = await fetch(`${API_BASE}${path}/${id}/snapshots`, {
            headers: { 'Authorization': `Bearer ${token}` },
            signal: AbortSignal.timeout(8000),
          });
          if (!res.ok) return;
          const text = await res.text();
          if (!text) return;
          const data = JSON.parse(text);
          const arr = Array.isArray(data) ? data : (data.content || []);
          if (arr.length > 0) { result[i + bi] = { ...result[i + bi], _snapshots: arr }; found++; }
        } catch {}
      }));
    }
    console.log(`\x1b[36m[ITCare]\x1b[0m Snapshots : ${found}/${resources.length} ressources avec snapshot(s).`);
    return result;
  }

  /* Monitoring temps réel — confirmé via DevTools :
     GET /monitoring/resources/{internalResourceId}/chart?start=&end=&graph-name=&points=
     Linux   (confirmé) : SYS_LNX_CPU_USAGE.total_cpu_avg (%) | SYS_LNX_MEMORY_USAGE.used_prct (%) + used/memory (bytes)
     Windows (confirmé) : SYS_WIN_CPU_USAGE.cpu (%)           | SYS_WIN_PHYSICAL_MEMORY["physical %"] (%) + physical (Go, déjà en Go) */
  const MONITORING_GRAPHS = {
    windows: { cpu: 'SYS_WIN_CPU_USAGE', cpuKey: 'cpu',           mem: 'SYS_WIN_PHYSICAL_MEMORY', memPctKey: 'physical %', memGbKey: 'physical' },
    linux:   { cpu: 'SYS_LNX_CPU_USAGE', cpuKey: 'total_cpu_avg', mem: 'SYS_LNX_MEMORY_USAGE',     memPctKey: 'used_prct',  memGbKey: null },
  };

  /* Dernière valeur numérique valide d'une série [[ts, val], ...] */
  function latestPoint(series) {
    if (!Array.isArray(series)) return null;
    for (let i = series.length - 1; i >= 0; i--) {
      const v = series[i]?.[1];
      if (typeof v === 'number' && Number.isFinite(v)) return v;
    }
    return null;
  }

  async function fetchChart(id, token, graphName) {
    const end = Math.floor(Date.now() / 1000);
    const start = end - 2 * 3600; // fenêtre de 2h — réponse plus légère, dernière valeur toujours fiable
    const url = `${API_BASE}/monitoring/resources/${id}/chart?start=${start}&end=${end}&graph-name=${graphName}&points=30`;
    const res = await fetch(url, { headers: { 'Authorization': `Bearer ${token}` }, signal: AbortSignal.timeout(5000) });
    if (!res.ok) return null;
    const data = await res.json();
    /* La réponse est { "{id}": { "{graphName}": {...} } }.
       Essayer la clé exacte (r.id numérique) puis la première disponible en fallback. */
    const graphData = data?.[String(id)] ?? Object.values(data || {})[0] ?? null;
    return graphData?.[graphName] ?? null;
  }

  async function enrichWithMonitoring(resources, token) {
    if (resources.length === 0) return resources;
    console.log(`\x1b[36m[ITCare]\x1b[0m Monitoring CPU/RAM temps réel : interrogation de ${resources.length} ressources…`);
    const BATCH = 8;
    const result = [...resources];
    let found = 0;
    for (let i = 0; i < result.length; i += BATCH) {
      await Promise.all(result.slice(i, i + BATCH).map(async (r, bi) => {
        try {
          /* Monitoring utilise le r.id numérique de la liste (ex: 5350129) — PAS internalResourceId */
          const id = r.id ?? r.internalResourceId;
          const isWin = /windows/i.test(String(r.family || '')) || /windows/i.test(String(r.path || ''));
          if (i === 0 && bi === 0) {
            console.log(`\x1b[36m[ITCare]\x1b[0m Monitoring debug 1er srv : r.id=${r.id} | internalResourceId=${r.internalResourceId} | id utilisé=${id} | family=${r.family} | isWin=${isWin}`);
          }
          const g = isWin ? MONITORING_GRAPHS.windows : MONITORING_GRAPHS.linux;
          const [cpuSeries, memSeries] = await Promise.all([
            fetchChart(id, token, g.cpu),
            fetchChart(id, token, g.mem),
          ]);
          const cpuPct  = latestPoint(cpuSeries?.[g.cpuKey]);
          const ramPct  = latestPoint(memSeries?.[g.memPctKey]);
          /* Windows: physical est déjà en Go | Linux: used est en bytes */
          const ramUsedGb = isWin
            ? (g.memGbKey ? latestPoint(memSeries?.[g.memGbKey]) : null)
            : (() => { const b = latestPoint(memSeries?.used); return b != null ? b / 1073741824 : null; })();
          const ramTotalGb = isWin
            ? null
            : (() => { const b = latestPoint(memSeries?.memory); return b != null ? b / 1073741824 : null; })();
          if (cpuPct != null || ramPct != null) {
            result[i + bi] = {
              ...result[i + bi],
              _monitoring: {
                cpuPct:    cpuPct    != null ? Math.round(cpuPct    * 10) / 10 : null,
                ramPct:    ramPct    != null ? Math.round(ramPct    * 10) / 10 : null,
                ramUsedGb: ramUsedGb != null ? Math.round(ramUsedGb * 10) / 10 : null,
                ramTotalGb: ramTotalGb != null ? Math.round(ramTotalGb * 10) / 10 : null,
              },
            };
            found++;
          }
        } catch {}
      }));
    }
    console.log(`\x1b[36m[ITCare]\x1b[0m Monitoring CPU/RAM temps réel : ${found}/${resources.length} ressources renseignées.`);
    return result;
  }

  function parseAuthToken(bodyObj) {
    const { clientId, clientSecret, token: userToken } = bodyObj;
    if (userToken && userToken.trim())
      return { mode: 'token', value: userToken.trim().replace(/^Bearer\s+/i, '') };
    if (clientId && clientSecret)
      return { mode: 'credentials', clientId, clientSecret };
    return null;
  }

  return {
    name: 'itcare-middleware',
    configureServer(server) {

      /* ── /api/itcare : chargement complet ── */
      server.middlewares.use('/api/itcare', (req, res) => {
        res.setHeader('Content-Type', 'application/json');
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
        if (req.method === 'OPTIONS') { res.statusCode = 204; return res.end(); }
        if (req.method !== 'POST')    { res.statusCode = 405; return res.end(JSON.stringify({ error: 'POST requis' })); }

        let body = '';
        req.on('data', d => { body += d; });
        req.on('end', async () => {
          try {
            const parsed = parseAuthToken(JSON.parse(body || '{}'));
            if (!parsed) return res.end(JSON.stringify({ error: 'Fournissez soit un token de session, soit le clientId et clientSecret' }));
            const token = parsed.mode === 'token' ? parsed.value : await getToken(parsed.clientId, parsed.clientSecret);
            let resources = await fetchAllResources(token);

            /* Log dimensionnement dans le terminal Vite */
            if (resources.length > 0) {
              const sample = resources.find(r => r.cpu != null) || resources[0];
              console.log('\x1b[36m[ITCare]\x1b[0m', resources.length, 'instances chargées');
              console.log('\x1b[36m[ITCare]\x1b[0m Dimensionnement (1er serveur avec données) :');
              console.log(`\x1b[36m[ITCare]\x1b[0m  cpu=${sample.cpu} | ram=${sample.ram} | storage=${sample.storage} | totalSizeDisks=${sample.totalSizeDisks} | ipAddress=${sample.ipAddress}`);
              console.log(`\x1b[36m[ITCare]\x1b[0m  name=${sample.name} | env=${sample.environment} | serviceName=${sample.serviceName}`);
            }

            /* ── Stratégie d'enrichissement optimisée ─────────────────────────────────
               - Details + Storage en parallèle (endpoints distincts, pas de conflit)
               - enrichWithSnapshots supprimé (retourne toujours 0/237, overhead inutile)
               - Monitoring séquentiel conservé (évite le throttling côté API ITCare) */
            const _t0 = Date.now();
            const [withDetails, withStorage] = await Promise.all([
              enrichWithDetails([...resources], token),
              enrichWithStorage([...resources], token),
            ]);
            resources = withDetails.map((r, i) => ({
              ...r,
              ...(withStorage[i]?._storage ? { _storage: withStorage[i]._storage } : {}),
            }));
            resources = await enrichWithMonitoring(resources, token);
            console.log(`\x1b[36m[ITCare]\x1b[0m Enrichissement total terminé en ${Date.now() - _t0}ms`);

            if (resources.length > 0) {
              const s2 = resources.find(r => r.ram != null) || resources[0];
              console.log(`\x1b[36m[ITCare]\x1b[0m Apr\u00e8s enrichissement : ram=${s2.ram} | cpu=${s2.cpu} | storage=${s2.storage} | backup=${JSON.stringify(s2.backup)} | patchGroup=${s2.patchParty?.patchGroup}`);
              const s3 = resources.find(r => r._monitoring?.cpuPct != null) || resources[0];
              console.log(`\x1b[36m[ITCare]\x1b[0m Monitoring : cpuPct=${s3._monitoring?.cpuPct} | ramPct=${s3._monitoring?.ramPct} | ramUsedGb=${s3._monitoring?.ramUsedGb}`);
            }

            res.end(JSON.stringify({
              servers: resources,
              total: resources.length,
              _sample: resources.slice(0, 2),   /* 2 premiers items bruts pour debug navigateur */
            }));
          } catch (e) {
            _tokenCache = null;
            res.statusCode = 500;
            res.end(JSON.stringify({ error: e.message }));
          }
        });
      });

      /* ── /api/itcare-subprobe : sonde les sub-endpoints sur un serveur donné ── */
      server.middlewares.use('/api/itcare-subprobe', (req, res) => {
        res.setHeader('Content-Type', 'application/json');
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
        if (req.method === 'OPTIONS') { res.statusCode = 204; return res.end(); }
        if (req.method !== 'POST')    { res.statusCode = 405; return res.end(JSON.stringify({ error: 'POST requis' })); }
        let body = '';
        req.on('data', d => { body += d; });
        req.on('end', async () => {
          try {
            const payload = JSON.parse(body || '{}');
            const parsed = parseAuthToken(payload);
            if (!parsed) return res.end(JSON.stringify({ error: 'Auth manquante' }));
            const { resourceId } = payload;
            if (!resourceId) return res.end(JSON.stringify({ error: 'resourceId manquant' }));
            const token = parsed.mode === 'token' ? parsed.value : await getToken(parsed.clientId, parsed.clientSecret);
            const results = {};
            const SUBPROBE_PATHS = ['backup-policies', 'networks', 'history', 'tags', 'patch-policy'];
            await Promise.allSettled(SUBPROBE_PATHS.map(async (path) => {
              try {
                const r = await fetch(`${API_BASE}/compute/resources/${resourceId}/${path}`, {
                  headers: { 'Authorization': `Bearer ${token}` },
                  signal: AbortSignal.timeout(6000),
                });
                results[path] = { status: r.status, available: r.ok };
                if (r.ok) {
                  const data = await r.json();
                  results[path].sample = Array.isArray(data) ? data.slice(0, 2) : data;
                  results[path].keys = Array.isArray(data)
                    ? (data[0] ? Object.keys(data[0]) : [])
                    : Object.keys(data);
                }
              } catch (e) { results[path] = { available: false, error: e.message }; }
            }));
            res.end(JSON.stringify({ resourceId, results }));
          } catch (e) {
            res.statusCode = 500;
            res.end(JSON.stringify({ error: e.message }));
          }
        });
      });

      /* ── /api/itcare-inspect : retourne les items bruts sans transformation ── */
      server.middlewares.use('/api/itcare-inspect', (req, res) => {
        res.setHeader('Content-Type', 'application/json');
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
        if (req.method === 'OPTIONS') { res.statusCode = 204; return res.end(); }
        if (req.method !== 'POST')    { res.statusCode = 405; return res.end(JSON.stringify({ error: 'POST requis' })); }

        let body = '';
        req.on('data', d => { body += d; });
        req.on('end', async () => {
          try {
            const parsed = parseAuthToken(JSON.parse(body || '{}'));
            if (!parsed) return res.end(JSON.stringify({ error: 'Auth manquante' }));
            const token = parsed.mode === 'token' ? parsed.value : await getToken(parsed.clientId, parsed.clientSecret);
            const resources = await fetchAllResources(token);
            /* Tous les champs de la liste */
            const allKeys = [...new Set(resources.flatMap(r => Object.keys(r)))].sort();
            /* Sonde le endpoint détail sur le 1er item */
            const firstR = resources.find(r => r.path && r.internalResourceId) || resources[0];
            const detail = resources.length > 0
              ? await probeDetailEndpoint(token, firstR.path || '/compute/instances', firstR.internalResourceId || firstR.id)
              : null;
            /* Trouve un item qui a cpu ET/OU ipAddress pour montrer des valeurs réelles */
            const richSample = resources.find(r => r.cpu != null || r.ipAddress || r.ram != null || r.network) || resources[0];
            /* Résumé des valeurs réelles pour les champs clés */
            const fieldValues = {};
            const keyFields = ['cpu','ram','storage','totalSizeDisks','disk','ipAddress','network','labelArea','labelDataCenter','labelRegion'];
            for (const k of keyFields) {
              const vals = resources.map(r => r[k]).filter(v => v != null && v !== '');
              if (vals.length > 0) fieldValues[k] = { count: vals.length, example: vals[0] };
            }
            res.end(JSON.stringify({
              total: resources.length,
              allKeys,
              sample: resources.slice(0, 3),
              richSample,
              fieldValues,
              detailEndpoint: detail ? {
                available: true,
                extraKeys: detail.extraKeys,
                usefulKeys: detail.usefulKeys,
                sample: detail.sample,
              } : { available: false },
            }));
          } catch (e) {
            _tokenCache = null;
            res.statusCode = 500;
            res.end(JSON.stringify({ error: e.message }));
          }
        });
      });

    },
  };
}

export default defineConfig({
  plugins: [react(), sslCheckPlugin(), screenshotPlugin(), lanSyncPlugin(), itcarePlugin()],
  server: {
    port: 5173,
    strictPort: true,
    host: true,
  },
  base: './',
  build: {
    outDir: 'dist',
    sourcemap: false,
    rollupOptions: {
      output: {
        manualChunks: {
          vendor: ['react', 'react-dom'],
          charts: ['recharts'],
        },
      },
    },
  },
})
