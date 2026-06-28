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

  async function fetchAllResources(token) {
    const all = [];
    let page = 0;
    const size = 200;
    while (true) {
      const r = await fetch(`${API_BASE}/compute/resources?page=${page}&size=${size}`, {
        headers: { 'Authorization': `Bearer ${token}` },
      });
      if (!r.ok) {
        const txt = await r.text().catch(() => '');
        throw new Error(`ITCare /compute/resources (${r.status}) — ${txt.slice(0, 200)}`);
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

  return {
    name: 'itcare-middleware',
    configureServer(server) {
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
            const { clientId, clientSecret } = JSON.parse(body || '{}');
            if (!clientId || !clientSecret)
              return res.end(JSON.stringify({ error: 'clientId et clientSecret sont requis' }));
            const token     = await getToken(clientId, clientSecret);
            const resources = await fetchAllResources(token);
            res.end(JSON.stringify({ servers: resources, total: resources.length }));
          } catch (e) {
            _tokenCache = null; // reset sur erreur
            res.statusCode = 500;
            res.end(JSON.stringify({ error: e.message }));
          }
        });
      });
    },
  };
}

export default defineConfig({
  plugins: [react(), sslCheckPlugin(), screenshotPlugin(), itcarePlugin()],
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
