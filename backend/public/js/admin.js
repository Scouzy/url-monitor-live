/* ── G1Oeil Admin SPA ── */

const API = "";
let token = localStorage.getItem("g1oeil-admin-token") || null;
let currentUser = null;

/* ── Helpers ── */
async function api(path, opts = {}) {
  const headers = { "Content-Type": "application/json", ...opts.headers };
  if (token) headers["Authorization"] = `Bearer ${token}`;
  const r = await fetch(`${API}${path}`, { ...opts, headers });
  if (r.status === 401) { logout(); throw new Error("Non autorisé"); }
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data.error || `HTTP ${r.status}`);
  return data;
}

function toast(msg, type = "success") {
  const el = document.createElement("div");
  el.className = `toast toast-${type}`;
  el.textContent = msg;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 3000);
}

function el(tag, props = {}, ...children) {
  const e = document.createElement(tag);
  const PROP_KEYS = ["value", "disabled", "selected", "checked", "readOnly", "autocomplete", "for", "colSpan", "rowSpan"];
  for (const [k, v] of Object.entries(props)) {
    if (k === "style" && typeof v === "object") Object.assign(e.style, v);
    else if (k === "className") e.className = v;
    else if (k.startsWith("on")) e.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k === "html") e.innerHTML = v;
    else if (PROP_KEYS.includes(k)) e[k] = v;
    else e.setAttribute(k, v);
  }
  const flat = children.flat(Infinity);
  for (const c of flat) {
    if (c == null || c === false) continue;
    if (typeof c === "string" || typeof c === "number") e.appendChild(document.createTextNode(String(c)));
    else if (c instanceof Node) e.appendChild(c);
  }
  return e;
}

function clearApp() { document.getElementById("app").innerHTML = ""; }

/* Convert a UTC datetime string (from SQLite) to local time display */
function fmtDate(s) {
  if (!s) return "—";
  const d = new Date(s.includes("T") ? s : s.replace(" ", "T") + "Z");
  if (isNaN(d)) return s;
  return d.toLocaleString("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

function fmtDateShort(s) {
  if (!s) return "—";
  const d = new Date(s.includes("T") ? s : s.replace(" ", "T") + "Z");
  if (isNaN(d)) return s;
  return d.toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric" });
}

/* ── Auth ── */
function logout() {
  token = null;
  currentUser = null;
  localStorage.removeItem("g1oeil-admin-token");
  renderLogin();
}

async function checkAuth() {
  if (!token) return renderLogin();
  try {
    currentUser = await api("/api/auth/me");
    renderDashboard();
  } catch {
    renderLogin();
  }
}

/* ── Login View ── */
function renderLogin() {
  clearApp();
  const card = el("div", { className: "login-card" },
    el("div", { style: { display: "flex", alignItems: "center", gap: "10px", marginBottom: "16px" } },
      el("img", { src: "/g1oeil_icone_app-black.svg", alt: "G1Oeil", style: { width: "36px", height: "36px" } }),
      el("div", {},
        el("h1", { style: { marginBottom: "0" } }, "G1Oeil"),
        el("p", { style: { fontSize: "12px", color: "var(--text-muted)" } }, "Administration"),
      ),
    ),
    el("div", { className: "form-group" },
      el("label", {}, "Utilisateur"),
      el("input", { id: "login-user", placeholder: "admin", autocomplete: "username" }),
    ),
    el("div", { className: "form-group" },
      el("label", {}, "Mot de passe"),
      el("input", { id: "login-pass", type: "password", placeholder: "••••••••", autocomplete: "current-password" }),
    ),
    el("button", { className: "btn btn-primary btn-block", onclick: async () => {
      const username = document.getElementById("login-user").value;
      const password = document.getElementById("login-pass").value;
      try {
        const data = await api("/api/auth/login", {
          method: "POST",
          body: JSON.stringify({ username, password }),
        });
        token = data.token;
        currentUser = data.user;
        localStorage.setItem("g1oeil-admin-token", token);
        renderDashboard();
      } catch (e) { toast(e.message, "error"); }
    } }, "Se connecter"),
  );
  document.getElementById("app").appendChild(el("div", { className: "login-wrap" }, card));
}

/* ── Dashboard Layout ── */
let currentView = "urls";

function renderDashboard() {
  clearApp();
  const layout = el("div", { className: "layout" });

  /* Sidebar */
  const sidebar = el("div", { className: "sidebar" },
    el("div", { className: "sidebar-header" },
      el("img", { src: "/g1oeil_icone_app-black.svg", alt: "G1Oeil", style: { width: "28px", height: "28px" } }),
      el("span", {}, "G1Oeil Admin"),
    ),
    el("nav", { className: "sidebar-nav" },
      ...[
        ["urls", "🔗", "URLs & Images"],
        ["apis", "🔌", "APIs"],
        ["users", "👤", "Utilisateurs"],
        ["logs", "📋", "Logs"],
      ].map(([key, icon, label]) =>
        el("button", {
          className: `nav-item ${currentView === key ? "active" : ""}`,
          onclick: () => { currentView = key; renderDashboard(); },
        },
          el("span", { className: "nav-icon" }, icon),
          el("span", {}, label),
        )
      ),
    ),
    el("div", { className: "sidebar-footer" },
      el("div", { className: "user-info" }, `${currentUser?.username} (${currentUser?.role})`),
      el("button", { className: "btn btn-secondary btn-sm btn-block", onclick: logout }, "Déconnexion"),
    ),
  );

  const main = el("div", { className: "main" });
  layout.appendChild(sidebar);
  layout.appendChild(main);
  document.getElementById("app").appendChild(layout);

  /* Render current view */
  if (currentView === "urls") renderUrlsView(main);
  else if (currentView === "apis") renderApisView(main);
  else if (currentView === "users") renderUsersView(main);
  else if (currentView === "logs") renderLogsView(main);
}

/* ── URLs View ── */
async function renderUrlsView(container) {
  container.appendChild(el("div", { className: "main-header" },
    el("h2", {}, "URLs & Images de référence"),
    el("button", { className: "btn btn-primary", onclick: () => renderUrlModal(null) }, "+ Ajouter une URL"),
  ));

  const tableWrap = el("div", { className: "table-wrap" });
  container.appendChild(tableWrap);

  try {
    const urls = await api("/api/urls");
    if (!urls.length) {
      tableWrap.appendChild(el("div", { className: "card", style: { textAlign: "center", color: "var(--text-muted)" } }, "Aucune URL configurée"));
      return;
    }

    /* ── KPI ── */
    const total = urls.length;
    const simple = urls.filter(u => u.mode === "simple").length;
    const authed = urls.filter(u => u.mode === "authenticated").length;
    const withSteps = urls.filter(u => u.steps?.length > 0).length;
    const totalSteps = urls.reduce((sum, u) => sum + (u.steps?.length || 0), 0);
    const namedUrls = urls.filter(u => u.name);
    const uniqueNames = new Set(namedUrls.map(u => u.name)).size;

    const kpiData = [
      { label: "Total URLs", value: total, color: "#6366F1", icon: "🔗" },
      { label: "Mode Simple", value: simple, sub: `${Math.round(simple / total * 100)}%`, color: "#10B981", icon: "⚡" },
      { label: "Mode Authentifié", value: authed, sub: `${Math.round(authed / total * 100)}%`, color: "#F59E0B", icon: "🔐" },
      { label: "Avec étapes", value: withSteps, sub: `${totalSteps} étapes`, color: "#EC4899", icon: "📋" },
      { label: "URLs par nom", value: uniqueNames, sub: `${namedUrls.length} URL(s) nommée(s)`, color: "#8B5CF6", icon: "🏷️" },
    ];

    const kpiRow = el("div", { style: { display: "grid", gridTemplateColumns: `repeat(${kpiData.length}, 1fr)`, gap: "12px", marginBottom: "16px" } },
      ...kpiData.map(k => el("div", { className: "card", style: { padding: "14px 16px", display: "flex", flexDirection: "column", gap: "6px" } },
        el("div", { style: { display: "flex", alignItems: "center", justifyContent: "space-between" } },
          el("span", { style: { fontSize: 11, color: "var(--text-muted)", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.04em" } }, k.label),
          el("span", { style: { fontSize: 16 } }, k.icon),
        ),
        el("div", { style: { display: "flex", alignItems: "baseline", gap: "6px" } },
          el("span", { style: { fontSize: 24, fontWeight: 800, color: k.color, fontFamily: "monospace" } }, String(k.value)),
          k.sub && el("span", { style: { fontSize: 11, color: "var(--text-dim)" } }, k.sub),
        ),
      ))
    );
    tableWrap.appendChild(kpiRow);

    /* ── Répartition par mode (barres horizontales) ── */
    const modeData = [
      { label: "Simple (HEAD)", count: simple, color: "#10B981" },
      { label: "Authentifiée", count: authed, color: "#F59E0B" },
    ];
    const maxMode = Math.max(...modeData.map(m => m.count), 1);
    const modeCard = el("div", { className: "card", style: { padding: "14px 16px", marginBottom: "16px" } },
      el("div", { style: { fontSize: 12, fontWeight: 700, color: "var(--text-muted)", marginBottom: "10px", textTransform: "uppercase", letterSpacing: "0.04em" } }, "Répartition par mode"),
      ...modeData.map(m => el("div", { style: { display: "flex", alignItems: "center", gap: "10px", marginBottom: "6px" } },
        el("span", { style: { width: "120px", fontSize: 12, color: "var(--text)" } }, m.label),
        el("div", { style: { flex: 1, height: 22, background: "rgba(255,255,255,0.04)", borderRadius: 6, overflow: "hidden" } },
          el("div", { style: { width: `${(m.count / maxMode) * 100}%`, height: "100%", background: m.color, borderRadius: 6, transition: "width 0.4s ease", display: "flex", alignItems: "center", justifyContent: "flex-end", paddingRight: "6px" } },
            el("span", { style: { fontSize: 10, fontWeight: 700, color: "#fff" } }, String(m.count)),
          ),
        ),
        el("span", { style: { width: "40px", textAlign: "right", fontSize: 11, color: "var(--text-dim)", fontFamily: "monospace" } }, `${Math.round(m.count / total * 100)}%`),
      )),
    );
    tableWrap.appendChild(modeCard);

    const table = el("table", {},
      el("thead", {},
        el("tr", {},
          el("th", {}, "ID"),
          el("th", {}, "URL"),
          el("th", {}, "Nom"),
          el("th", {}, "Mode"),
          el("th", {}, "Étapes"),
          el("th", {}, "Actions"),
        )
      ),
      el("tbody", {},
        ...urls.map(u => el("tr", {},
          el("td", {}, String(u.id)),
          el("td", { style: { maxWidth: "300px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" } }, u.url),
          el("td", {}, u.name || "—"),
          el("td", {}, el("span", { className: `badge ${u.mode === "authenticated" ? "badge-primary" : "badge-success"}` }, u.mode)),
          el("td", {}, String(u.steps?.length || 0)),
          el("td", { style: { display: "flex", gap: "6px" } },
            el("button", { className: "btn btn-secondary btn-sm", onclick: () => renderUrlModal(u) }, "Éditer"),
            el("button", { className: "btn btn-secondary btn-sm", onclick: () => renderStepsModal(u) }, "Étapes"),
            el("button", { className: "btn btn-secondary btn-sm", onclick: () => runCompare(u) }, "Tester"),
            el("button", { className: "btn btn-danger btn-sm", onclick: async () => {
              if (!confirm(`Supprimer ${u.url} ?`)) return;
              try { await api(`/api/urls/${u.id}`, { method: "DELETE" }); toast("URL supprimée"); renderDashboard(); }
              catch (e) { toast(e.message, "error"); }
            } }, "Suppr."),
          )
        ))
      )
    );
    tableWrap.appendChild(table);
  } catch (e) {
    tableWrap.appendChild(el("div", { className: "card" }, `Erreur: ${e.message}`));
  }
}

function renderUrlModal(url) {
  const overlay = el("div", { className: "modal-overlay" });
  const modal = el("div", { className: "modal" },
    el("div", { className: "modal-header" },
      el("h3", {}, url ? "Modifier l'URL" : "Ajouter une URL"),
      el("button", { className: "modal-close", onclick: () => overlay.remove() }, "×"),
    ),
    el("div", { className: "form-group" },
      el("label", {}, "URL *"),
      el("input", { id: "m-url", value: url?.url || "", placeholder: "https://app.example.com" }),
    ),
    el("div", { className: "form-group" },
      el("label", {}, "Nom"),
      el("input", { id: "m-name", value: url?.name || "", placeholder: "Mon application" }),
    ),
    el("div", { className: "form-group" },
      el("label", {}, "Mode"),
      el("select", { id: "m-mode" },
        el("option", { value: "simple", ...(url?.mode === "simple" ? { selected: true } : {}) }, "Simple (HEAD)"),
        el("option", { value: "authenticated", ...(url?.mode === "authenticated" ? { selected: true } : {}) }, "Authentifiée"),
      ),
    ),
    el("div", { className: "form-row" },
      el("div", { className: "form-group" },
        el("label", {}, "URL de connexion"),
        el("input", { id: "m-authurl", value: url?.auth_url || "", placeholder: "https://app.example.com/login" }),
      ),
      el("div", { className: "form-group" },
        el("label", {}, "Page d'accueil"),
        el("input", { id: "m-homeurl", value: url?.home_url || "", placeholder: "https://app.example.com/dashboard" }),
      ),
    ),
    el("div", { className: "form-row" },
      el("div", { className: "form-group" },
        el("label", {}, "Champ login"),
        el("input", { id: "m-loginfield", value: url?.login_field || "username", placeholder: "username" }),
      ),
      el("div", { className: "form-group" },
        el("label", {}, "Champ mot de passe"),
        el("input", { id: "m-passfield", value: url?.password_field || "password", placeholder: "password" }),
      ),
    ),
    el("div", { className: "form-row" },
      el("div", { className: "form-group" },
        el("label", {}, "Identifiant"),
        el("input", { id: "m-login", value: url?.login || "", placeholder: "admin" }),
      ),
      el("div", { className: "form-group" },
        el("label", {}, "Mot de passe"),
        el("input", { id: "m-pass", type: "password", value: url?.password || "", placeholder: "••••••••" }),
      ),
    ),
    el("div", { className: "form-group" },
      el("label", {}, "Onglet à vérifier"),
      el("input", { id: "m-taburl", value: url?.tab_url || "", placeholder: "https://app.example.com/monitoring" }),
    ),
    el("div", { style: { display: "flex", gap: "10px", marginTop: "20px" } },
      el("button", { className: "btn btn-primary", onclick: async () => {
        const body = {
          url: document.getElementById("m-url").value,
          name: document.getElementById("m-name").value,
          mode: document.getElementById("m-mode").value,
          auth_url: document.getElementById("m-authurl").value,
          home_url: document.getElementById("m-homeurl").value,
          login_field: document.getElementById("m-loginfield").value,
          password_field: document.getElementById("m-passfield").value,
          login: document.getElementById("m-login").value,
          password: document.getElementById("m-pass").value,
          tab_url: document.getElementById("m-taburl").value,
        };
        try {
          if (url) await api(`/api/urls/${url.id}`, { method: "PUT", body: JSON.stringify(body) });
          else await api("/api/urls", { method: "POST", body: JSON.stringify(body) });
          toast(url ? "URL modifiée" : "URL créée");
          overlay.remove();
          renderDashboard();
        } catch (e) { toast(e.message, "error"); }
      } }, "Enregistrer"),
      el("button", { className: "btn btn-secondary", onclick: () => overlay.remove() }, "Annuler"),
    ),
  );
  overlay.appendChild(modal);
  document.body.appendChild(overlay);
}

/* ── Steps Modal ── */
async function renderStepsModal(url) {
  const overlay = el("div", { className: "modal-overlay" });
  const modal = el("div", { className: "modal", style: { maxWidth: "640px" } },
    el("div", { className: "modal-header" },
      el("h3", {}, `Étapes — ${url.name || url.url}`),
      el("button", { className: "modal-close", onclick: () => overlay.remove() }, "×"),
    ),
    el("div", { id: "steps-list" }, el("p", { style: { color: "var(--text-muted)" } }, "Chargement...")),
    el("div", { style: { display: "flex", gap: "10px", marginTop: "16px" } },
      el("button", { className: "btn btn-primary btn-sm", onclick: () => addStep(url, overlay) }, "+ Ajouter une étape"),
    ),
  );
  overlay.appendChild(modal);
  document.body.appendChild(overlay);
  await loadSteps(url, overlay);
}

async function loadSteps(url, overlay) {
  const container = document.getElementById("steps-list");
  container.innerHTML = "";
  try {
    const urls = await api("/api/urls");
    const full = urls.find(u => u.id === url.id);
    const steps = full?.steps || [];
    if (!steps.length) {
      container.appendChild(el("p", { style: { color: "var(--text-muted)" } }, "Aucune étape configurée"));
      return;
    }
    for (const step of steps) {
      const row = el("div", { className: "step-image-row" },
        el("div", { style: { flex: 1 } },
          el("div", { style: { fontWeight: 600, fontSize: 13 } }, `Étape ${step.step_index}: ${step.step_name}`),
          el("div", { style: { fontSize: 11, color: "var(--text-muted)" } }, `Threshold: ${step.threshold}`),
        ),
        step.reference_image
          ? el("img", { src: `/api/urls/images/${step.reference_image}`, alt: "Référence" })
          : el("div", { className: "no-img" }, "Pas d'image"),
        el("div", { style: { display: "flex", flexDirection: "column", gap: "4px" } },
          el("button", { className: "btn btn-secondary btn-sm", onclick: () => uploadStepImage(url, step, overlay) }, "Upload"),
          step.reference_image
            ? el("button", { className: "btn btn-danger btn-sm", onclick: async () => {
              try { await api(`/api/urls/${url.id}/steps/${step.id}/image`, { method: "DELETE" }); toast("Image supprimée"); loadSteps(url, overlay); }
              catch (e) { toast(e.message, "error"); }
            } }, "Suppr. img")
            : null,
          el("button", { className: "btn btn-danger btn-sm", onclick: async () => {
            try { await api(`/api/urls/${url.id}/steps/${step.id}`, { method: "DELETE" }); toast("Étape supprimée"); loadSteps(url, overlay); }
            catch (e) { toast(e.message, "error"); }
          } }, "Suppr."),
        ),
      );
      container.appendChild(row);
    }
  } catch (e) {
    container.appendChild(el("p", { style: { color: "var(--danger)" } }, `Erreur: ${e.message}`));
  }
}

function addStep(url, overlay) {
  const stepIndex = prompt("Numéro d'étape (1=URL, 2=Auth, 3=Accueil, 4=Onglet):");
  if (!stepIndex) return;
  const stepName = prompt("Nom de l'étape:", `Étape ${stepIndex}`);
  api(`/api/urls/${url.id}/steps`, {
    method: "POST",
    body: JSON.stringify({ step_index: parseInt(stepIndex), step_name: stepName || `Étape ${stepIndex}` }),
  }).then(() => { toast("Étape ajoutée"); loadSteps(url, overlay); })
    .catch(e => toast(e.message, "error"));
}

function uploadStepImage(url, step, overlay) {
  const input = el("input", { type: "file", accept: "image/png,image/jpeg", style: { display: "none" } });
  input.onchange = async () => {
    const file = input.files[0];
    if (!file) return;
    const formData = new FormData();
    formData.append("image", file);
    try {
      const r = await fetch(`/api/urls/${url.id}/steps/${step.id}/image`, {
        method: "POST",
        headers: { "Authorization": `Bearer ${token}` },
        body: formData,
      });
      if (!r.ok) { const d = await r.json().catch(() => ({})); throw new Error(d.error || "Upload échoué"); }
      toast("Image uploadée");
      loadSteps(url, overlay);
    } catch (e) { toast(e.message, "error"); }
  };
  document.body.appendChild(input);
  input.click();
  input.remove();
}

/* ── Compare Test ── */
async function runCompare(url) {
  toast("Test en cours...", "success");
  try {
    const result = await api(`/api/compare/${url.id}`, { method: "POST" });
    if (result.ok) {
      toast("Toutes les étapes OK", "success");
    } else {
      const failed = result.results.filter(r => !r.ok);
      toast(`${failed.length} étape(s) en échec (code ${result.error_code || "—"})`, "error");
      renderCompareResult(url, result);
    }
  } catch (e) { toast(e.message, "error"); }
}

function renderCompareResult(url, result) {
  const overlay = el("div", { className: "modal-overlay" });
  const modal = el("div", { className: "modal", style: { maxWidth: "720px" } },
    el("div", { className: "modal-header" },
      el("h3", {}, `Résultat du test — ${url.name || url.url}`),
      el("button", { className: "modal-close", onclick: () => overlay.remove() }, "×"),
    ),
    ...result.results.map(r => {
      const diffInfo = r.diff && !r.diff.error ? ` — Diff: ${r.diff.diffPercent}%` : "";
      const errorCode = r.error_code ? ` (Code ${r.error_code})` : "";
      return el("div", { className: "card", style: { marginBottom: "10px" } },
        el("div", { style: { display: "flex", alignItems: "center", gap: "10px" } },
          el("span", { className: `badge ${r.ok ? "badge-success" : "badge-danger"}` }, r.ok ? "OK" : "ÉCHEC"),
          el("span", { style: { fontWeight: 600 } }, `Étape ${r.step}: ${r.name}`),
          el("span", { style: { color: "var(--text-muted)", fontSize: 12 } }, `${r.status}${diffInfo}${errorCode}`),
        ),
        r.diff?.diffImageUrl ? el("div", { style: { marginTop: "10px" } },
          el("div", { style: { fontSize: 12, color: "var(--text-muted)", marginBottom: "4px" } }, "Image diff:"),
          el("img", { src: r.diff.diffImageUrl, style: { maxWidth: "100%", borderRadius: "8px", border: "1px solid var(--border)" } }),
        ) : null,
        r.diff?.liveImageUrl ? el("div", { style: { marginTop: "10px" } },
          el("div", { style: { fontSize: 12, color: "var(--text-muted)", marginBottom: "4px" } }, "Screenshot live:"),
          el("img", { src: r.diff.liveImageUrl, style: { maxWidth: "100%", borderRadius: "8px", border: "1px solid var(--border)" } }),
        ) : null,
      );
    }),
    el("button", { className: "btn btn-secondary", onclick: () => overlay.remove() }, "Fermer"),
  );
  overlay.appendChild(modal);
  document.body.appendChild(overlay);
}

/* ── APIs View ── */
async function renderApisView(container) {
  container.appendChild(el("div", { className: "main-header" },
    el("h2", {}, "Gestion des APIs"),
    el("button", { className: "btn btn-primary", onclick: () => renderApiModal(null) }, "+ Ajouter une API"),
  ));

  const tableWrap = el("div", { className: "table-wrap" });
  container.appendChild(tableWrap);

  try {
    const apis = await api("/api/apis");
    if (!apis.length) {
      tableWrap.appendChild(el("div", { className: "card", style: { textAlign: "center", color: "var(--text-muted)" } }, "Aucune API configurée"));
      return;
    }
    const table = el("table", {},
      el("thead", {}, el("tr", {},
        el("th", {}, "ID"), el("th", {}, "Nom"), el("th", {}, "Base URL"),
        el("th", {}, "Auth"), el("th", {}, "Actions"),
      )),
      el("tbody", {},
        ...apis.map(a => el("tr", {},
          el("td", {}, String(a.id)),
          el("td", {}, a.name),
          el("td", { style: { maxWidth: "300px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" } }, a.base_url),
          el("td", {}, el("span", { className: "badge badge-primary" }, a.auth_type)),
          el("td", { style: { display: "flex", gap: "6px" } },
            el("button", { className: "btn btn-secondary btn-sm", onclick: () => renderApiModal(a) }, "Éditer"),
            el("button", { className: "btn btn-secondary btn-sm", onclick: async () => {
              toast("Test en cours...", "success");
              try { const r = await api(`/api/apis/${a.id}/test`, { method: "POST" }); toast(r.ok ? `OK (${r.status})` : `Échec: ${r.error || r.status}`, r.ok ? "success" : "error"); }
              catch (e) { toast(e.message, "error"); }
            } }, "Tester"),
            el("button", { className: "btn btn-danger btn-sm", onclick: async () => {
              if (!confirm(`Supprimer ${a.name} ?`)) return;
              try { await api(`/api/apis/${a.id}`, { method: "DELETE" }); toast("API supprimée"); renderDashboard(); }
              catch (e) { toast(e.message, "error"); }
            } }, "Suppr."),
          )
        ))
      )
    );
    tableWrap.appendChild(table);
  } catch (e) {
    tableWrap.appendChild(el("div", { className: "card" }, `Erreur: ${e.message}`));
  }
}

function renderApiModal(apiCfg) {
  const overlay = el("div", { className: "modal-overlay" });
  const modal = el("div", { className: "modal" },
    el("div", { className: "modal-header" },
      el("h3", {}, apiCfg ? "Modifier l'API" : "Ajouter une API"),
      el("button", { className: "modal-close", onclick: () => overlay.remove() }, "×"),
    ),
    el("div", { className: "form-group" },
      el("label", {}, "Nom *"),
      el("input", { id: "a-name", value: apiCfg?.name || "", placeholder: "ITCare API" }),
    ),
    el("div", { className: "form-group" },
      el("label", {}, "Base URL *"),
      el("input", { id: "a-baseurl", value: apiCfg?.base_url || "", placeholder: "https://api.example.com/v1" }),
    ),
    el("div", { className: "form-group" },
      el("label", {}, "Type d'authentification"),
      el("select", { id: "a-authtype" },
        ["bearer", "oauth2", "api_key", "none"].map(t =>
          el("option", { value: t, ...(apiCfg?.auth_type === t ? { selected: true } : {}) }, t)
        )
      ),
    ),
    el("div", { className: "form-row" },
      el("div", { className: "form-group" },
        el("label", {}, "Token URL (OAuth2)"),
        el("input", { id: "a-tokenurl", value: apiCfg?.token_url || "", placeholder: "https://auth.example.com/token" }),
      ),
      el("div", { className: "form-group" },
        el("label", {}, "API Key"),
        el("input", { id: "a-apikey", value: apiCfg?.api_key || "", placeholder: "xxx-xxx-xxx" }),
      ),
    ),
    el("div", { className: "form-row" },
      el("div", { className: "form-group" },
        el("label", {}, "Client ID"),
        el("input", { id: "a-clientid", value: apiCfg?.client_id || "" }),
      ),
      el("div", { className: "form-group" },
        el("label", {}, "Client Secret"),
        el("input", { id: "a-clientsecret", type: "password", value: apiCfg?.client_secret || "" }),
      ),
    ),
    el("div", { className: "form-row" },
      el("div", { className: "form-group" },
        el("label", {}, "Username"),
        el("input", { id: "a-username", value: apiCfg?.username || "" }),
      ),
      el("div", { className: "form-group" },
        el("label", {}, "Password"),
        el("input", { id: "a-password", type: "password", value: apiCfg?.password || "" }),
      ),
    ),
    el("div", { className: "form-group" },
      el("label", {}, "Headers (JSON)"),
      el("textarea", { id: "a-headers", rows: 3, placeholder: '{"X-Custom-Header": "value"}' }, apiCfg?.headers ? JSON.stringify(apiCfg.headers, null, 2) : ""),
    ),
    el("div", { style: { display: "flex", gap: "10px", marginTop: "20px" } },
      el("button", { className: "btn btn-primary", onclick: async () => {
        let headers = {};
        const hdrText = document.getElementById("a-headers").value.trim();
        if (hdrText) { try { headers = JSON.parse(hdrText); } catch { toast("Headers JSON invalide", "error"); return; } }
        const body = {
          name: document.getElementById("a-name").value,
          base_url: document.getElementById("a-baseurl").value,
          auth_type: document.getElementById("a-authtype").value,
          token_url: document.getElementById("a-tokenurl").value,
          api_key: document.getElementById("a-apikey").value,
          client_id: document.getElementById("a-clientid").value,
          client_secret: document.getElementById("a-clientsecret").value,
          username: document.getElementById("a-username").value,
          password: document.getElementById("a-password").value,
          headers,
        };
        try {
          if (apiCfg) await api(`/api/apis/${apiCfg.id}`, { method: "PUT", body: JSON.stringify(body) });
          else await api("/api/apis", { method: "POST", body: JSON.stringify(body) });
          toast(apiCfg ? "API modifiée" : "API créée");
          overlay.remove();
          renderDashboard();
        } catch (e) { toast(e.message, "error"); }
      } }, "Enregistrer"),
      el("button", { className: "btn btn-secondary", onclick: () => overlay.remove() }, "Annuler"),
    ),
  );
  overlay.appendChild(modal);
  document.body.appendChild(overlay);
}

/* ── Users View ── */
async function renderUsersView(container) {
  container.appendChild(el("div", { className: "main-header" },
    el("h2", {}, "Utilisateurs"),
    currentUser?.role === "superadmin" ? el("button", { className: "btn btn-primary", onclick: () => renderUserModal(null) }, "+ Créer un compte") : null,
  ));

  const tableWrap = el("div", { className: "table-wrap" });
  container.appendChild(tableWrap);

  try {
    const users = await api("/api/auth/users");
    const table = el("table", {},
      el("thead", {}, el("tr", {},
        el("th", {}, "ID"), el("th", {}, "Utilisateur"), el("th", {}, "Email"),
        el("th", {}, "Rôle"), el("th", {}, "Statut"), el("th", {}, "Créé"), el("th", {}, "Dernière connexion"),
        el("th", {}, "Actions"),
      )),
      el("tbody", {},
        ...users.map(u => el("tr", {},
          el("td", {}, String(u.id)),
          el("td", {}, u.username),
          el("td", {}, u.email),
          el("td", {}, el("span", { className: `badge ${u.role === "superadmin" ? "badge-warning" : "badge-primary"}` }, u.role)),
          el("td", {}, el("span", { className: `badge ${u.status === "pending" ? "badge-danger" : "badge-success"}` }, u.status || "approved")),
          el("td", {}, fmtDateShort(u.created_at)),
          el("td", {}, fmtDate(u.last_login)),
          el("td", { style: { display: "flex", gap: "6px" } },
            currentUser?.role === "superadmin" && u.id !== currentUser.id ? [
              ...(u.status === "pending" ? [
                el("button", { className: "btn btn-primary btn-sm", onclick: async () => {
                  try { await api(`/api/auth/users/${u.id}/approve`, { method: "PUT" }); toast("Compte approuvé"); renderDashboard(); }
                  catch (e) { toast(e.message, "error"); }
                } }, "Approuver"),
                el("button", { className: "btn btn-danger btn-sm", onclick: async () => {
                  if (!confirm(`Rejeter ${u.username} ?`)) return;
                  try { await api(`/api/auth/users/${u.id}/reject`, { method: "PUT" }); toast("Compte rejeté"); renderDashboard(); }
                  catch (e) { toast(e.message, "error"); }
                } }, "Rejeter"),
              ] : []),
              el("button", { className: "btn btn-secondary btn-sm", onclick: () => renderUserModal(u) }, "Éditer"),
              el("button", { className: "btn btn-danger btn-sm", onclick: async () => {
                if (!confirm(`Supprimer ${u.username} ?`)) return;
                try { await api(`/api/auth/users/${u.id}`, { method: "DELETE" }); toast("Utilisateur supprimé"); renderDashboard(); }
                catch (e) { toast(e.message, "error"); }
              } }, "Suppr."),
            ] : [el("span", { style: { color: "var(--text-dim)", fontSize: 11 } }, "—")]
          )
        ))
      )
    );
    tableWrap.appendChild(table);
  } catch (e) {
    tableWrap.appendChild(el("div", { className: "card" }, `Erreur: ${e.message}`));
  }
}

function renderUserModal(user) {
  const overlay = el("div", { className: "modal-overlay" });
  const modal = el("div", { className: "modal", style: { maxWidth: "420px" } },
    el("div", { className: "modal-header" },
      el("h3", {}, user ? "Modifier l'utilisateur" : "Créer un compte"),
      el("button", { className: "modal-close", onclick: () => overlay.remove() }, "×"),
    ),
    el("div", { className: "form-group" },
      el("label", {}, "Utilisateur *"),
      el("input", { id: "u-username", value: user?.username || "", placeholder: "john.doe", ...(user ? { disabled: true } : {}) }),
    ),
    el("div", { className: "form-group" },
      el("label", {}, "Email *"),
      el("input", { id: "u-email", value: user?.email || "", placeholder: "john@example.com" }),
    ),
    el("div", { className: "form-group" },
      el("label", {}, user ? "Nouveau mot de passe (vide = inchangé)" : "Mot de passe *"),
      el("input", { id: "u-password", type: "password", placeholder: "••••••••" }),
    ),
    el("div", { className: "form-group" },
      el("label", {}, "Rôle"),
      el("select", { id: "u-role" },
        el("option", { value: "admin", ...(user?.role === "admin" ? { selected: true } : {}) }, "Admin"),
        el("option", { value: "superadmin", ...(user?.role === "superadmin" ? { selected: true } : {}) }, "Superadmin"),
      ),
    ),
    el("div", { style: { display: "flex", gap: "10px", marginTop: "20px" } },
      el("button", { className: "btn btn-primary", onclick: async () => {
        const body = {
          email: document.getElementById("u-email").value,
          role: document.getElementById("u-role").value,
        };
        const pwd = document.getElementById("u-password").value;
        if (pwd) body.password = pwd;
        if (!user) body.username = document.getElementById("u-username").value;
        try {
          if (user) await api(`/api/auth/users/${user.id}`, { method: "PUT", body: JSON.stringify(body) });
          else await api("/api/auth/register", { method: "POST", body: JSON.stringify(body) });
          toast(user ? "Utilisateur modifié" : "Compte créé");
          overlay.remove();
          renderDashboard();
        } catch (e) { toast(e.message, "error"); }
      } }, "Enregistrer"),
      el("button", { className: "btn btn-secondary", onclick: () => overlay.remove() }, "Annuler"),
    ),
  );
  overlay.appendChild(modal);
  document.body.appendChild(overlay);
}

/* ── Logs View ── */
let logsFilter = "all";

async function renderLogsView(container) {
  const header = el("div", { className: "main-header" },
    el("h2", {}, "Logs de supervision"),
    el("div", { style: { display: "flex", gap: "8px", alignItems: "center" } },
      el("select", {
        id: "logs-filter",
        onchange: (e) => { logsFilter = e.target.value; renderDashboard(); },
        style: { background: "var(--bg-input)", border: "1px solid var(--border)", borderRadius: 8, color: "var(--text)", fontSize: 12, padding: "6px 10px", cursor: "pointer" },
      },
        el("option", { value: "all", ...(logsFilter === "all" ? { selected: true } : {}) }, "Toutes catégories"),
        el("option", { value: "auth", ...(logsFilter === "auth" ? { selected: true } : {}) }, "Authentification"),
        el("option", { value: "url", ...(logsFilter === "url" ? { selected: true } : {}) }, "URLs"),
        el("option", { value: "api", ...(logsFilter === "api" ? { selected: true } : {}) }, "APIs"),
        el("option", { value: "user", ...(logsFilter === "user" ? { selected: true } : {}) }, "Utilisateurs"),
        el("option", { value: "sync", ...(logsFilter === "sync" ? { selected: true } : {}) }, "Synchronisation"),
        el("option", { value: "system", ...(logsFilter === "system" ? { selected: true } : {}) }, "Système"),
        el("option", { value: "itcare", ...(logsFilter === "itcare" ? { selected: true } : {}) }, "ITCare"),
      ),
      currentUser?.role === "superadmin"
        ? el("button", { className: "btn btn-danger btn-sm", onclick: async () => {
          if (!confirm("Vider tous les logs d'audit ?")) return;
          try { await api("/api/audit", { method: "DELETE" }); toast("Logs vidés"); renderDashboard(); }
          catch (e) { toast(e.message, "error"); }
        } }, "Vider")
        : null,
    ),
  );
  container.appendChild(header);

  /* ── Audit logs ── */
  const auditCard = el("div", { className: "card" },
    el("div", { className: "card-header" },
      el("h3", {}, "Journal d'audit"),
      el("span", { style: { fontSize: 12, color: "var(--text-muted)" } }, "Connexions, modifications, synchronisation"),
    ),
    el("div", { id: "audit-logs", style: { maxHeight: "500px", overflowY: "auto" } }, el("p", { style: { color: "var(--text-muted)" } }, "Chargement...")),
  );
  container.appendChild(auditCard);

  try {
    const logs = await api(`/api/audit?category=${logsFilter}&limit=200`);
    const auditDiv = document.getElementById("audit-logs");
    auditDiv.innerHTML = "";
    if (!logs.length) {
      auditDiv.appendChild(el("p", { style: { color: "var(--text-muted)", textAlign: "center", padding: "20px" } }, "Aucun log d'audit"));
    } else {
      const sevColors = { info: "badge-primary", warning: "badge-warning", error: "badge-danger" };
      const catLabels = {
        auth: "Auth", url: "URL", api: "API", user: "User", sync: "Sync",
        system: "Système", itcare: "ITCare",
      };
      const table = el("table", {},
        el("thead", {}, el("tr", {},
          el("th", {}, "Date"), el("th", {}, "Catégorie"), el("th", {}, "Action"),
          el("th", {}, "Utilisateur"), el("th", {}, "Détail"), el("th", {}, "Sévérité"), el("th", {}, "Source"),
        )),
        el("tbody", {},
          ...logs.map(l => el("tr", {},
            el("td", { style: { whiteSpace: "nowrap", fontSize: 11, fontFamily: "monospace" } }, fmtDate(l.created_at)),
            el("td", {}, el("span", { className: "badge badge-primary" }, catLabels[l.category] || l.category)),
            el("td", { style: { fontWeight: 600 } }, l.action),
            el("td", {}, l.username || "—"),
            el("td", { style: { maxWidth: "400px", fontSize: 12, color: "var(--text-muted)" } }, l.detail || "—"),
            el("td", {}, el("span", { className: `badge ${sevColors[l.severity] || "badge-primary"}` }, l.severity)),
            el("td", {}, el("span", { style: { fontSize: 10, color: l.source === "frontend" ? "var(--primary-hover)" : "var(--text-dim)" } }, l.source)),
          ))
        )
      );
      auditDiv.appendChild(table);
    }
  } catch (e) {
    document.getElementById("audit-logs").innerHTML = "";
    document.getElementById("audit-logs").appendChild(el("p", { style: { color: "var(--danger)" } }, `Erreur: ${e.message}`));
  }

  /* ── Check logs (comparaison d'images) ── */
  const checkCard = el("div", { className: "card", style: { marginTop: "16px" } },
    el("div", { className: "card-header" },
      el("h3", {}, "Logs de comparaison d'images"),
      el("span", { style: { fontSize: 12, color: "var(--text-muted)" } }, "Code 622, screenshots, diffs"),
    ),
    el("div", { id: "check-logs", style: { maxHeight: "300px", overflowY: "auto" } }, el("p", { style: { color: "var(--text-muted)" } }, "Chargement...")),
  );
  container.appendChild(checkCard);

  try {
    const urls = await api("/api/urls");
    const checkDiv = document.getElementById("check-logs");
    checkDiv.innerHTML = "";
    let hasLogs = false;
    for (const u of urls) {
      const logs = await api(`/api/compare/logs/${u.id}`);
      if (!logs.length) continue;
      hasLogs = true;
      checkDiv.appendChild(el("div", { style: { marginBottom: "12px" } },
        el("div", { style: { fontWeight: 600, fontSize: 13, marginBottom: "6px" } }, u.name || u.url),
        el("table", {},
          el("thead", {}, el("tr", {},
            el("th", {}, "Date"), el("th", {}, "Étape"), el("th", {}, "Statut"),
            el("th", {}, "Code"), el("th", {}, "Diff %"),
          )),
          el("tbody", {},
            ...logs.map(l => el("tr", {},
              el("td", { style: { fontSize: 11, fontFamily: "monospace", whiteSpace: "nowrap" } }, fmtDate(l.checked_at)),
              el("td", {}, `Étape ${l.step_index}`),
              el("td", {}, el("span", { className: `badge ${l.error_code ? "badge-danger" : "badge-success"}` }, l.status || "—")),
              el("td", {}, l.error_code ? String(l.error_code) : "—"),
              el("td", {}, l.diff_percent != null ? `${l.diff_percent}%` : "—"),
            ))
          )
        ),
      ));
    }
    if (!hasLogs) {
      checkDiv.appendChild(el("p", { style: { color: "var(--text-muted)", textAlign: "center", padding: "20px" } }, "Aucun log de comparaison"));
    }
  } catch (e) {
    document.getElementById("check-logs").innerHTML = "";
    document.getElementById("check-logs").appendChild(el("p", { style: { color: "var(--danger)" } }, `Erreur: ${e.message}`));
  }
}

/* ── Init ── */
checkAuth();
