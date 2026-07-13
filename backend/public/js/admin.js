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
let sidebarCollapsed = false;

function renderDashboard() {
  clearApp();
  const layout = el("div", { className: "layout" });

  /* Sidebar */
  const sidebar = el("div", { className: `sidebar${sidebarCollapsed ? " collapsed" : ""}` },
    el("div", { className: "sidebar-header" },
      el("button", { className: "sidebar-toggle", onclick: () => { sidebarCollapsed = !sidebarCollapsed; renderDashboard(); } }, "\u2630"),
      !sidebarCollapsed && el("img", { src: "/g1oeil_icone_app-black.svg", alt: "G1Oeil", style: { width: "28px", height: "28px" } }),
      !sidebarCollapsed && el("span", {}, "G1Oeil Admin"),
    ),
    el("nav", { className: "sidebar-nav" },
      ...[
        ["urls", "\uD83D\uDD17", "URLs & Images"],
        ["apis", "\uD83D\uDD0C", "APIs"],
        ["scheduler", "\u23F0", "Scheduler"],
        ["notifications", "\uD83D\uDD14", "Notifications"],
        ["metrics", "\uD83D\uDCCA", "M\u00E9triques Serveurs"],
        ["ssl", "\uD83D\uDD12", "Certificats SSL"],
        ["system", "\uD83D\uDDA0", "Syst\u00E8me"],
        ["users", "\uD83D\uDC64", "Utilisateurs"],
        ["logs", "\uD83D\uDCCB", "Logs"],
      ].map(([key, icon, label]) =>
        el("button", {
          className: `nav-item ${currentView === key ? "active" : ""}`,
          onclick: () => { currentView = key; renderDashboard(); },
        },
          el("span", { className: "nav-icon" }, icon),
          !sidebarCollapsed && el("span", {}, label),
        )
      ),
    ),
    el("div", { className: "sidebar-footer" },
      !sidebarCollapsed && el("div", { className: "user-info" }, `${currentUser?.username} (${currentUser?.role})`),
      !sidebarCollapsed && el("button", { className: "btn btn-secondary btn-sm btn-block", onclick: logout }, "D\u00e9connexion"),
      sidebarCollapsed && el("button", { className: "btn btn-secondary btn-sm btn-block", onclick: logout, title: "D\u00e9connexion" }, "\u23FB"),
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
  else if (currentView === "scheduler") renderSchedulerView(main);
  else if (currentView === "notifications") renderNotificationsView(main);
  else if (currentView === "metrics") renderMetricsView(main);
  else if (currentView === "ssl") renderSslView(main);
  else if (currentView === "system") renderSystemView(main);
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

    /* ── Search bar ── */
    const searchBar = el("div", { className: "search-bar" },
      el("span", { style: { fontSize: 14, color: "var(--text-muted)" } }, "\uD83D\uDD0D"),
      el("input", { id: "url-search", placeholder: "Rechercher par URL, nom ou mode...", oninput: (e) => {
        const q = e.target.value.toLowerCase().trim();
        const rows = scrollBody.querySelectorAll("tr");
        let visible = 0;
        rows.forEach(r => {
          const text = r.textContent.toLowerCase();
          const match = !q || text.includes(q);
          r.style.display = match ? "" : "none";
          if (match) visible++;
        });
        searchCount.textContent = `${visible} / ${urls.length} URL(s)`;
      } }),
      el("span", { id: "url-search-count", style: { fontSize: 11, color: "var(--text-dim)", whiteSpace: "nowrap" } }, `${urls.length} URL(s)`),
    );
    tableWrap.appendChild(searchBar);
    const searchCount = searchBar.querySelector("#url-search-count");

    /* ── Scrollable URL list ── */
    const scrollList = el("div", { className: "scroll-list" });
    const scrollBody = el("tbody");
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
      scrollBody,
    );

    const buildRow = (u) => el("tr", {},
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
    );
    urls.forEach(u => scrollBody.appendChild(buildRow(u)));
    scrollList.appendChild(table);
    tableWrap.appendChild(scrollList);

    /* ── Scroll-to-top button ── */
    const scrollTopBtn = el("button", {
      className: "btn btn-secondary btn-sm",
      style: { position: "fixed", right: "32px", bottom: "32px", zIndex: 50, borderRadius: "50%", width: "40px", height: "40px", padding: "0", display: "none", alignItems: "center", justifyContent: "center", fontSize: "18px" },
      onclick: () => scrollList.scrollTo({ top: 0, behavior: "smooth" }),
    }, "\u2191");
    scrollList.addEventListener("scroll", () => {
      scrollTopBtn.style.display = scrollList.scrollTop > 100 ? "flex" : "none";
    });
    document.body.appendChild(scrollTopBtn);
    /* Cleanup on re-render */
    const observer = new MutationObserver(() => { scrollTopBtn.remove(); observer.disconnect(); });
    observer.observe(document.getElementById("app"), { childList: true, subtree: false });
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
    el("div", { style: { display: "flex", gap: "8px" } },
      el("button", { className: "btn btn-primary", onclick: () => renderApiModal(null) }, "+ Ajouter une API"),
      el("button", { className: "btn btn-secondary", onclick: () => renderApiKeyModal() }, "+ Cl\u00e9 d'acc\u00e8s externe"),
    ),
  ));

  const tableWrap = el("div", { className: "table-wrap" });
  container.appendChild(tableWrap);

  try {
    const apis = await api("/api/apis");

    /* ── KPIs ── */
    const total = apis.length;
    const byAuth = {};
    apis.forEach(a => { byAuth[a.auth_type] = (byAuth[a.auth_type] || 0) + 1; });
    const kpiData = [
      { label: "Total APIs", value: total, color: "#6366F1", icon: "\uD83D\uDD0C" },
      { label: "OAuth2", value: byAuth["oauth2"] || 0, color: "#F59E0B", icon: "\uD83D\uDD11" },
      { label: "Bearer", value: byAuth["bearer"] || 0, color: "#10B981", icon: "\uD83D\uDD10" },
      { label: "API Key", value: byAuth["api_key"] || 0, color: "#EC4899", icon: "\uD83D\uDD11" },
      { label: "Aucune", value: byAuth["none"] || 0, color: "#6B7280", icon: "\u26A0\uFE0F" },
    ];
    const kpiRow = el("div", { style: { display: "grid", gridTemplateColumns: `repeat(${kpiData.length}, 1fr)`, gap: "12px", marginBottom: "16px" } },
      ...kpiData.map(k => el("div", { className: "card", style: { padding: "14px 16px", display: "flex", flexDirection: "column", gap: "6px" } },
        el("div", { style: { display: "flex", alignItems: "center", justifyContent: "space-between" } },
          el("span", { style: { fontSize: 11, color: "var(--text-muted)", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.04em" } }, k.label),
          el("span", { style: { fontSize: 16 } }, k.icon),
        ),
        el("span", { style: { fontSize: 24, fontWeight: 800, color: k.color, fontFamily: "monospace" } }, String(k.value)),
      ))
    );
    tableWrap.appendChild(kpiRow);

    /* ── Search bar ── */
    const apiSearchBody = el("tbody");
    const searchCount = el("span", { style: { fontSize: 11, color: "var(--text-dim)", whiteSpace: "nowrap" } }, `${apis.length} API(s)`);
    const searchBar = el("div", { className: "search-bar" },
      el("span", { style: { fontSize: 14, color: "var(--text-muted)" } }, "\uD83D\uDD0D"),
      el("input", { placeholder: "Rechercher par nom, URL ou type d'auth...", oninput: (e) => {
        const q = e.target.value.toLowerCase().trim();
        const rows = apiSearchBody.querySelectorAll("tr");
        let visible = 0;
        rows.forEach(r => {
          const text = r.textContent.toLowerCase();
          const match = !q || text.includes(q);
          r.style.display = match ? "" : "none";
          if (match) visible++;
        });
        searchCount.textContent = `${visible} / ${apis.length} API(s)`;
      } }),
      searchCount,
    );
    tableWrap.appendChild(searchBar);

    /* ── APIs table in scrollable container ── */
    if (!apis.length) {
      tableWrap.appendChild(el("div", { className: "card", style: { textAlign: "center", color: "var(--text-muted)" } }, "Aucune API configur\u00e9e"));
    } else {
      const scrollList = el("div", { className: "scroll-list" });
      const table = el("table", {},
        el("thead", {}, el("tr", {},
          el("th", {}, "ID"), el("th", {}, "Nom"), el("th", {}, "Base URL"),
          el("th", {}, "Auth"), el("th", {}, "Cr\u00e9\u00e9e"), el("th", {}, "Actions"),
        )),
        apiSearchBody,
      );
      apis.forEach(a => apiSearchBody.appendChild(el("tr", {},
        el("td", {}, String(a.id)),
        el("td", { style: { fontWeight: 600 } }, a.name),
        el("td", { style: { maxWidth: "300px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" } }, a.base_url),
        el("td", {}, el("span", { className: `badge ${a.auth_type === "oauth2" ? "badge-warning" : a.auth_type === "none" ? "badge-danger" : "badge-primary"}` }, a.auth_type)),
        el("td", { style: { fontSize: 11, fontFamily: "monospace", whiteSpace: "nowrap" } }, fmtDateShort(a.created_at)),
        el("td", { style: { display: "flex", gap: "6px" } },
          el("button", { className: "btn btn-secondary btn-sm", onclick: () => renderApiModal(a) }, "\u00C9diter"),
          el("button", { className: "btn btn-secondary btn-sm", onclick: async () => {
            toast("Test en cours...", "success");
            try { const r = await api(`/api/apis/${a.id}/test`, { method: "POST" }); toast(r.ok ? `OK (${r.status})` : `\u00C9chec: ${r.error || r.status}`, r.ok ? "success" : "error"); }
            catch (e) { toast(e.message, "error"); }
          } }, "Tester"),
          el("button", { className: "btn btn-secondary btn-sm", onclick: () => {
            navigator.clipboard.writeText(a.base_url).then(() => toast("URL copi\u00e9e"));
          } }, "Copier"),
          el("button", { className: "btn btn-danger btn-sm", onclick: async () => {
            if (!confirm(`Supprimer ${a.name} ?`)) return;
            try { await api(`/api/apis/${a.id}`, { method: "DELETE" }); toast("API supprim\u00e9e"); renderDashboard(); }
            catch (e) { toast(e.message, "error"); }
          } }, "Suppr."),
        )
      )));
      scrollList.appendChild(table);
      tableWrap.appendChild(scrollList);
    }

    /* ── External API Keys section ── */
    tableWrap.appendChild(el("div", { style: { marginTop: "20px", marginBottom: "8px", fontSize: 14, fontWeight: 700, color: "var(--text)" } }, "\uD83D\uDD11 Cl\u00e9s d'acc\u00e8s externe"));
    tableWrap.appendChild(el("p", { style: { fontSize: 12, color: "var(--text-muted)", marginBottom: "12px" } }, "Permettez \u00e0 une application externe de se connecter \u00e0 G1Oeil via une cl\u00e9 API. Utilisez l'endpoint POST /api/api-keys/auth avec le header X-API-Key pour l'authentification."));

    try {
      const keys = await api("/api/api-keys");
      if (!keys.length) {
        tableWrap.appendChild(el("div", { className: "card", style: { textAlign: "center", color: "var(--text-muted)" } }, "Aucune cl\u00e9 d'acc\u00e8s configur\u00e9e"));
      } else {
        const keysScroll = el("div", { className: "scroll-list", style: { maxHeight: "300px" } });
        const keysTable = el("table", {},
          el("thead", {}, el("tr", {},
            el("th", {}, "ID"), el("th", {}, "Application"), el("th", {}, "Description"),
            el("th", {}, "Permissions"), el("th", {}, "Statut"), el("th", {}, "Derni\u00e8re utilisation"), el("th", {}, "Actions"),
          )),
          el("tbody", {},
            ...keys.map(k => el("tr", {},
              el("td", {}, String(k.id)),
              el("td", { style: { fontWeight: 600 } }, k.app_name),
              el("td", { style: { maxWidth: "200px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: "var(--text-muted)" } }, k.description || "—"),
              el("td", {}, el("span", { className: `badge ${k.permissions === "read" ? "badge-primary" : "badge-warning"}` }, k.permissions)),
              el("td", {}, el("span", { className: `badge ${k.is_active ? "badge-success" : "badge-danger"}` }, k.is_active ? "Active" : "D\u00e9sactiv\u00e9e")),
              el("td", { style: { fontSize: 11, fontFamily: "monospace", whiteSpace: "nowrap" } }, fmtDate(k.last_used)),
              el("td", { style: { display: "flex", gap: "6px" } },
                el("button", { className: "btn btn-secondary btn-sm", onclick: async () => {
                  try { await api(`/api/api-keys/${k.id}`, { method: "PUT", body: JSON.stringify({ is_active: !k.is_active }) }); toast(k.is_active ? "Cl\u00e9 d\u00e9sactiv\u00e9e" : "Cl\u00e9 activ\u00e9e"); renderDashboard(); }
                  catch (e) { toast(e.message, "error"); }
                } }, k.is_active ? "D\u00e9sactiver" : "Activer"),
                el("button", { className: "btn btn-danger btn-sm", onclick: async () => {
                  if (!confirm(`R\u00e9voquer d\u00e9finitivement la cl\u00e9 de ${k.app_name} ?`)) return;
                  try { await api(`/api/api-keys/${k.id}`, { method: "DELETE" }); toast("Cl\u00e9 r\u00e9voqu\u00e9e"); renderDashboard(); }
                  catch (e) { toast(e.message, "error"); }
                } }, "R\u00e9voquer"),
              )
            ))
          )
        );
        keysScroll.appendChild(keysTable);
        tableWrap.appendChild(keysScroll);
      }
    } catch (e) {
      tableWrap.appendChild(el("div", { className: "card" }, `Erreur cl\u00e9s API: ${e.message}`));
    }
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

/* ── API Key Modal (generate new key for external app) ── */
function renderApiKeyModal() {
  const overlay = el("div", { className: "modal-overlay" });
  const modal = el("div", { className: "modal", style: { maxWidth: "520px" } },
    el("div", { className: "modal-header" },
      el("h3", {}, "Cr\u00e9er une cl\u00e9 d'acc\u00e8s externe"),
      el("button", { className: "modal-close", onclick: () => overlay.remove() }, "\u00D7"),
    ),
    el("p", { style: { fontSize: 12, color: "var(--text-muted)", marginBottom: "16px" } }, "Cette cl\u00e9 permet \u00e0 une application externe de s'authentifier aupr\u00e8s de l'API G1Oeil. La cl\u00e9 ne sera affich\u00e9e qu'une seule fois."),
    el("div", { className: "form-group" },
      el("label", {}, "Nom de l'application *"),
      el("input", { id: "ak-appname", placeholder: "Mon Application" }),
    ),
    el("div", { className: "form-group" },
      el("label", {}, "Description"),
      el("input", { id: "ak-desc", placeholder: "Acc\u00e8s en lecture aux URLs" }),
    ),
    el("div", { className: "form-group" },
      el("label", {}, "Permissions"),
      el("select", { id: "ak-perms" },
        el("option", { value: "read" }, "Lecture seule (GET)"),
        el("option", { value: "readwrite" }, "Lecture + \u00E9criture (GET, POST, PUT, DELETE)"),
      ),
    ),
    el("div", { id: "ak-result", style: { display: "none" } }),
    el("div", { style: { display: "flex", gap: "10px", marginTop: "20px" } },
      el("button", { className: "btn btn-primary", onclick: async () => {
        const app_name = document.getElementById("ak-appname").value.trim();
        if (!app_name) { toast("Nom requis", "error"); return; }
        const description = document.getElementById("ak-desc").value.trim();
        const permissions = document.getElementById("ak-perms").value;
        try {
          const result = await api("/api/api-keys", { method: "POST", body: JSON.stringify({ app_name, description, permissions }) });
          const resultDiv = document.getElementById("ak-result");
          resultDiv.style.display = "block";
          resultDiv.innerHTML = "";
          resultDiv.appendChild(el("div", { className: "api-key-box" },
            el("code", {}, result.key),
            el("button", { className: "btn btn-secondary btn-sm", onclick: () => {
              navigator.clipboard.writeText(result.key).then(() => toast("Cl\u00e9 copi\u00e9e"));
            } }, "Copier"),
          ));
          resultDiv.appendChild(el("p", { style: { fontSize: 11, color: "var(--warning)", marginTop: "8px" } }, "\u26A0\uFE0F Conservez cette cl\u00e9 en lieu s\u00fbr. Elle ne sera plus affich\u00e9e."));
          toast("Cl\u00e9 d'acc\u00e8s cr\u00e9\u00e9e");
        } catch (e) { toast(e.message, "error"); }
      } }, "G\u00e9n\u00e9rer la cl\u00e9"),
      el("button", { className: "btn btn-secondary", onclick: () => { overlay.remove(); renderDashboard(); } }, "Fermer"),
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

/* ── Scheduler View ── */
async function renderSchedulerView(container) {
  container.innerHTML = "";
  container.appendChild(el("div", { className: "main-header" },
    el("h2", {}, "Scheduler — Checks automatisés"),
    el("button", { className: "btn btn-secondary", onclick: () => renderSchedulerView(container) }, "Actualiser"),
  ));

  const wrap = el("div", {});
  container.appendChild(wrap);

  try {
    const schedules = await api("/api/scheduler/");
    const urls = await api("/api/urls");

    /* KPIs */
    const enabled = schedules.filter(s => s.enabled).length;
    const online = schedules.filter(s => s.last_status === "online").length;
    const offline = schedules.filter(s => s.last_status === "offline").length;

    wrap.appendChild(el("div", { style: { display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "12px", marginBottom: "16px" } },
      el("div", { className: "card", style: { padding: "14px 16px" } }, el("div", { style: { fontSize: 11, color: "var(--text-muted)", textTransform: "uppercase" } }, "Schedules"), el("div", { style: { fontSize: 24, fontWeight: 800, color: "var(--primary-hover)", fontFamily: "monospace" } }, String(schedules.length))),
      el("div", { className: "card", style: { padding: "14px 16px" } }, el("div", { style: { fontSize: 11, color: "var(--text-muted)", textTransform: "uppercase" } }, "Actifs"), el("div", { style: { fontSize: 24, fontWeight: 800, color: "var(--success)", fontFamily: "monospace" } }, String(enabled))),
      el("div", { className: "card", style: { padding: "14px 16px" } }, el("div", { style: { fontSize: 11, color: "var(--text-muted)", textTransform: "uppercase" } }, "En ligne"), el("div", { style: { fontSize: 24, fontWeight: 800, color: "var(--success)", fontFamily: "monospace" } }, String(online))),
      el("div", { className: "card", style: { padding: "14px 16px" } }, el("div", { style: { fontSize: 11, color: "var(--text-muted)", textTransform: "uppercase" } }, "Hors ligne"), el("div", { style: { fontSize: 24, fontWeight: 800, color: "var(--danger)", fontFamily: "monospace" } }, String(offline))),
    ));

    /* Add schedule form */
    const unscheduled = urls.filter(u => !schedules.some(s => s.url_config_id === u.id));
    if (unscheduled.length > 0) {
      const select = el("select", { style: { background: "var(--bg-input)", border: "1px solid var(--border)", borderRadius: "8px", color: "var(--text)", fontSize: "13px", padding: "8px 12px", flex: 1 } },
        el("option", { value: "" }, "— Sélectionner une URL —"),
        ...unscheduled.map(u => el("option", { value: u.id }, u.url)),
      );
      const intervalSel = el("select", { style: { background: "var(--bg-input)", border: "1px solid var(--border)", borderRadius: "8px", color: "var(--text)", fontSize: "13px", padding: "8px 12px" } },
        ...[[60, "1min"], [120, "2min"], [300, "5min"], [600, "10min"], [900, "15min"], [1800, "30min"], [3600, "1h"]].map(([v, l]) => el("option", { value: v }, l)),
      );
      wrap.appendChild(el("div", { className: "card", style: { display: "flex", gap: "10px", alignItems: "center" } },
        el("span", { style: { fontSize: 13, color: "var(--text-muted)", fontWeight: 600 } }, "Ajouter un schedule:"),
        select,
        intervalSel,
        el("button", { className: "btn btn-primary btn-sm", onclick: async () => {
          if (!select.value) return;
          try { await api(`/api/scheduler/url/${select.value}`, { method: "POST", body: JSON.stringify({ interval_seconds: +intervalSel.value, enabled: true }) }); toast("Schedule créé"); renderSchedulerView(container); } catch (e) { toast(e.message, "error"); }
        } }, "Créer"),
      ));
    }

    /* Schedules table */
    if (schedules.length === 0) {
      wrap.appendChild(el("div", { className: "card", style: { textAlign: "center", color: "var(--text-muted)" } }, "Aucun schedule configuré"));
    } else {
      const tbody = schedules.map(s => el("tr", {},
        el("td", { style: { fontFamily: "monospace", fontSize: 12 } }, s.url || `#${s.url_config_id}`),
        el("td", {}, s.interval_seconds >= 60 ? `${s.interval_seconds / 60}min` : `${s.interval_seconds}s`),
        el("td", {}, el("span", { className: `badge ${s.enabled ? "badge-success" : "badge-warning"}` }, s.enabled ? "Actif" : "Pause")),
        el("td", {}, s.last_status ? el("span", { className: `badge ${s.last_status === "online" ? "badge-success" : "badge-danger"}` }, s.last_status) : "—"),
        el("td", {}, s.last_response_time ? `${s.last_response_time}ms` : "—"),
        el("td", { style: { fontSize: 11, fontFamily: "monospace" } }, fmtDate(s.last_check_at)),
        el("td", { style: { display: "flex", gap: "6px" } },
          el("button", { className: "btn btn-secondary btn-sm", onclick: async () => {
            try { await api(`/api/scheduler/${s.id}`, { method: "PUT", body: JSON.stringify({ interval_seconds: s.interval_seconds, enabled: !s.enabled }) }); toast(s.enabled ? "Pause" : "Activé"); renderSchedulerView(container); } catch (e) { toast(e.message, "error"); }
          } }, s.enabled ? "Pause" : "Activer"),
          el("button", { className: "btn btn-danger btn-sm", onclick: async () => {
            try { await api(`/api/scheduler/${s.id}`, { method: "DELETE" }); toast("Supprimé"); renderSchedulerView(container); } catch (e) { toast(e.message, "error"); }
          } }, "Supprimer"),
        ),
      ));
      wrap.appendChild(el("div", { className: "scroll-list" },
        el("table", {},
          el("thead", {}, el("tr", {},
            el("th", {}, "URL"), el("th", {}, "Intervalle"), el("th", {}, "Statut"), el("th", {}, "Dernier check"), el("th", {}, "Réponse"), el("th", {}, "Date"), el("th", {}, "Actions"),
          )),
          el("tbody", {}, ...tbody),
        ),
      ));
    }

    /* Recent results */
    try {
      const results = await api("/api/scheduler/results?limit=30");
      if (results.length > 0) {
        wrap.appendChild(el("h3", { style: { marginTop: "20px", marginBottom: "10px", fontSize: 15 } }, "30 derniers checks backend"));
        wrap.appendChild(el("div", { className: "scroll-list", style: { maxHeight: 300 } },
          el("table", {},
            el("thead", {}, el("tr", {}, el("th", {}, "URL"), el("th", {}, "Statut"), el("th", {}, "Temps"), el("th", {}, "Erreur"), el("th", {}, "Date"))),
            el("tbody", {}, ...results.map(r => el("tr", {},
              el("td", { style: { fontFamily: "monospace", fontSize: 11 } }, r.url),
              el("td", {}, el("span", { className: `badge ${r.status === "online" ? "badge-success" : "badge-danger"}` }, r.status)),
              el("td", {}, r.response_time ? `${r.response_time}ms` : "—"),
              el("td", { style: { fontSize: 11, color: "var(--danger)" } }, r.error_message || "—"),
              el("td", { style: { fontSize: 11, fontFamily: "monospace" } }, fmtDate(r.checked_at)),
            ))),
          ),
        ));
      }
    } catch {}
  } catch (e) {
    wrap.appendChild(el("div", { className: "card", style: { color: "var(--danger)" } }, `Erreur: ${e.message}`));
  }
}

/* ── Notifications View ── */
async function renderNotificationsView(container) {
  container.innerHTML = "";
  container.appendChild(el("div", { className: "main-header" },
    el("h2", {}, "Canaux de notification"),
    el("button", { className: "btn btn-primary", onclick: () => renderNotifModal(container) }, "+ Ajouter un canal"),
  ));

  const wrap = el("div", {});
  container.appendChild(wrap);

  try {
    const channels = await api("/api/notifications/channels");
    if (channels.length === 0) {
      wrap.appendChild(el("div", { className: "card", style: { textAlign: "center", color: "var(--text-muted)" } }, "Aucun canal configuré. Ajoutez un webhook Slack/Teams ou un email."));
      return;
    }

    const tbody = channels.map(ch => {
      const cfg = typeof ch.config === "string" ? JSON.parse(ch.config) : ch.config;
      return el("tr", {},
        el("td", { style: { fontWeight: 600 } }, ch.name),
        el("td", {}, el("span", { className: `badge ${ch.type === "webhook" ? "badge-primary" : "badge-success"}` }, ch.type)),
        el("td", { style: { fontFamily: "monospace", fontSize: 11, color: "var(--text-muted)" } }, cfg.url || cfg.to || "—"),
        el("td", { style: { fontSize: 11 } }, ch.triggers),
        el("td", {}, el("span", { className: `badge ${ch.enabled ? "badge-success" : "badge-warning"}` }, ch.enabled ? "Actif" : "Désactivé")),
        el("td", { style: { display: "flex", gap: "6px" } },
          el("button", { className: "btn btn-secondary btn-sm", onclick: async () => {
            try { await api("/api/notifications/test", { method: "POST", body: JSON.stringify({ channelId: ch.id }) }); toast("Test envoyé"); } catch (e) { toast(e.message, "error"); }
          } }, "Tester"),
          el("button", { className: "btn btn-secondary btn-sm", onclick: async () => {
            try { await api(`/api/notifications/channels/${ch.id}`, { method: "PUT", body: JSON.stringify({ name: ch.name, type: ch.type, config: cfg, triggers: ch.triggers, enabled: !ch.enabled }) }); toast(ch.enabled ? "Désactivé" : "Activé"); renderNotificationsView(container); } catch (e) { toast(e.message, "error"); }
          } }, ch.enabled ? "Désactiver" : "Activer"),
          el("button", { className: "btn btn-danger btn-sm", onclick: async () => {
            try { await api(`/api/notifications/channels/${ch.id}`, { method: "DELETE" }); toast("Supprimé"); renderNotificationsView(container); } catch (e) { toast(e.message, "error"); }
          } }, "Supprimer"),
        ),
      );
    });
    wrap.appendChild(el("div", { className: "scroll-list" },
      el("table", {},
        el("thead", {}, el("tr", {}, el("th", {}, "Nom"), el("th", {}, "Type"), el("th", {}, "Cible"), el("th", {}, "Déclencheurs"), el("th", {}, "Statut"), el("th", {}, "Actions"))),
        el("tbody", {}, ...tbody),
      ),
    ));
  } catch (e) {
    wrap.appendChild(el("div", { className: "card", style: { color: "var(--danger)" } }, `Erreur: ${e.message}`));
  }
}

function renderNotifModal(container) {
  const overlay = el("div", { className: "modal-overlay", onclick: e => { if (e.target === overlay) overlay.remove(); } });
  const typeSel = el("select", { style: { background: "var(--bg-input)", border: "1px solid var(--border)", borderRadius: "8px", color: "var(--text)", fontSize: "13px", padding: "9px 12px", width: "100%" } },
    el("option", { value: "webhook" }, "Webhook (Slack/Teams)"),
    el("option", { value: "email" }, "Email"),
  );
  const urlInput = el("input", { placeholder: "https://hooks.slack.com/services/...", style: { width: "100%" } });
  typeSel.addEventListener("change", () => {
    urlInput.placeholder = typeSel.value === "webhook" ? "https://hooks.slack.com/services/..." : "admin@example.com";
  });
  overlay.appendChild(el("div", { className: "modal" },
    el("div", { className: "modal-header" }, el("h3", {}, "Nouveau canal de notification"), el("button", { className: "modal-close", onclick: () => overlay.remove() }, "×")),
    el("div", { className: "form-group" }, el("label", {}, "Nom"), el("input", { id: "notif-name", placeholder: "Slack Alertes" })),
    el("div", { className: "form-group" }, el("label", {}, "Type"), typeSel),
    el("div", { className: "form-group" }, el("label", {}, typeSel.value === "webhook" ? "URL du webhook" : "Email destinataire"), urlInput),
    el("div", { className: "form-group" }, el("label", {}, "Déclencheurs"), el("input", { id: "notif-triggers", value: "status_change,check_fail", style: { width: "100%" } })),
    el("button", { className: "btn btn-primary btn-block", onclick: async () => {
      const name = document.getElementById("notif-name").value;
      if (!name) return toast("Nom requis", "error");
      const config = typeSel.value === "webhook" ? { url: urlInput.value } : { to: urlInput.value };
      try { await api("/api/notifications/channels", { method: "POST", body: JSON.stringify({ name, type: typeSel.value, config, triggers: document.getElementById("notif-triggers").value }) }); toast("Canal créé"); overlay.remove(); renderNotificationsView(container); } catch (e) { toast(e.message, "error"); }
    } }, "Créer"),
  ));
  document.body.appendChild(overlay);
}

/* ── Server Metrics View ── */
async function renderMetricsView(container) {
  container.innerHTML = "";
  container.appendChild(el("div", { className: "main-header" },
    el("h2", {}, "Métriques serveurs"),
    el("button", { className: "btn btn-secondary", onclick: () => renderMetricsView(container) }, "Actualiser"),
  ));

  const wrap = el("div", {});
  container.appendChild(wrap);

  try {
    const latest = await api("/api/servers/metrics/latest");
    if (latest.length === 0) {
      wrap.appendChild(el("div", { className: "card", style: { textAlign: "center", color: "var(--text-muted)" } }, "Aucune métrique reçue. Les agents VPS ou le frontend enverront les données automatiquement."));
      return;
    }

    /* KPIs */
    const avgCpu = (latest.reduce((s, m) => s + (m.cpu || 0), 0) / latest.length).toFixed(1);
    const avgRam = (latest.reduce((s, m) => s + (m.ram || 0), 0) / latest.length).toFixed(1);
    const avgDisk = (latest.reduce((s, m) => s + (m.disk || 0), 0) / latest.length).toFixed(1);
    const alerts = latest.filter(m => (m.cpu > 80) || (m.ram > 80) || (m.disk > 80)).length;

    wrap.appendChild(el("div", { style: { display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "12px", marginBottom: "16px" } },
      el("div", { className: "card", style: { padding: "14px 16px" } }, el("div", { style: { fontSize: 11, color: "var(--text-muted)", textTransform: "uppercase" } }, "Serveurs"), el("div", { style: { fontSize: 24, fontWeight: 800, color: "var(--primary-hover)", fontFamily: "monospace" } }, String(latest.length))),
      el("div", { className: "card", style: { padding: "14px 16px" } }, el("div", { style: { fontSize: 11, color: "var(--text-muted)", textTransform: "uppercase" } }, "CPU moyen"), el("div", { style: { fontSize: 24, fontWeight: 800, color: avgCpu > 80 ? "var(--danger)" : "var(--success)", fontFamily: "monospace" } }, `${avgCpu}%`)),
      el("div", { className: "card", style: { padding: "14px 16px" } }, el("div", { style: { fontSize: 11, color: "var(--text-muted)", textTransform: "uppercase" } }, "RAM moyenne"), el("div", { style: { fontSize: 24, fontWeight: 800, color: avgRam > 80 ? "var(--danger)" : "var(--success)", fontFamily: "monospace" } }, `${avgRam}%`)),
      el("div", { className: "card", style: { padding: "14px 16px" } }, el("div", { style: { fontSize: 11, color: "var(--text-muted)", textTransform: "uppercase" } }, "Alertes (>80%)"), el("div", { style: { fontSize: 24, fontWeight: 800, color: alerts > 0 ? "var(--danger)" : "var(--success)", fontFamily: "monospace" } }, String(alerts))),
    ));

    /* Table */
    const tbody = latest.map(m => {
      const cpuColor = m.cpu > 80 ? "var(--danger)" : m.cpu > 60 ? "var(--warning)" : "var(--success)";
      const ramColor = m.ram > 80 ? "var(--danger)" : m.ram > 60 ? "var(--warning)" : "var(--success)";
      const diskColor = m.disk > 80 ? "var(--danger)" : m.disk > 60 ? "var(--warning)" : "var(--success)";
      return el("tr", {},
        el("td", { style: { fontWeight: 600 } }, m.server_name),
        el("td", { style: { fontFamily: "monospace", fontWeight: 700, color: cpuColor } }, m.cpu != null ? `${m.cpu}%` : "—"),
        el("td", { style: { fontFamily: "monospace", fontWeight: 700, color: ramColor } }, m.ram != null ? `${m.ram}%` : "—"),
        el("td", { style: { fontFamily: "monospace", fontWeight: 700, color: diskColor } }, m.disk != null ? `${m.disk}%` : "—"),
        el("td", {}, m.cores || "—"),
        el("td", {}, m.ram_gb ? `${m.ram_gb} Go` : "—"),
        el("td", { style: { fontSize: 11, fontFamily: "monospace" } }, fmtDate(m.ts)),
        el("td", {},
          el("button", { className: "btn btn-secondary btn-sm", onclick: async () => {
            try { const hist = await api(`/api/servers/${encodeURIComponent(m.server_name)}/history?limit=50`); renderMetricsHistoryModal(m.server_name, hist); } catch (e) { toast(e.message, "error"); }
          } }, "Historique"),
        ),
      );
    });
    wrap.appendChild(el("div", { className: "scroll-list" },
      el("table", {},
        el("thead", {}, el("tr", {}, el("th", {}, "Serveur"), el("th", {}, "CPU"), el("th", {}, "RAM"), el("th", {}, "Disque"), el("th", {}, "Cores"), el("th", {}, "RAM Go"), el("th", {}, "Timestamp"), el("th", {}, "Actions"))),
        el("tbody", {}, ...tbody),
      ),
    ));
  } catch (e) {
    wrap.appendChild(el("div", { className: "card", style: { color: "var(--danger)" } }, `Erreur: ${e.message}`));
  }
}

function renderMetricsHistoryModal(name, history) {
  const overlay = el("div", { className: "modal-overlay", onclick: e => { if (e.target === overlay) overlay.remove(); } });
  overlay.appendChild(el("div", { className: "modal", style: { maxWidth: 700 } },
    el("div", { className: "modal-header" }, el("h3", {}, `Historique — ${name}`), el("button", { className: "modal-close", onclick: () => overlay.remove() }, "×")),
    el("div", { className: "scroll-list", style: { maxHeight: 400 } },
      el("table", {},
        el("thead", {}, el("tr", {}, el("th", {}, "Date"), el("th", {}, "CPU"), el("th", {}, "RAM"), el("th", {}, "Disque"))),
        el("tbody", {}, ...history.map(h => el("tr", {},
          el("td", { style: { fontSize: 11, fontFamily: "monospace" } }, fmtDate(h.ts)),
          el("td", { style: { fontFamily: "monospace" } }, h.cpu != null ? `${h.cpu}%` : "—"),
          el("td", { style: { fontFamily: "monospace" } }, h.ram != null ? `${h.ram}%` : "—"),
          el("td", { style: { fontFamily: "monospace" } }, h.disk != null ? `${h.disk}%` : "—"),
        ))),
      ),
    ),
  ));
  document.body.appendChild(overlay);
}

/* ── SSL View ── */
let sslAutoSynced = false;

async function renderSslView(container) {
  container.innerHTML = "";
  container.appendChild(el("div", { className: "main-header" },
    el("h2", {}, "Certificats SSL"),
    el("div", { style: { display: "flex", gap: "8px" } },
      el("button", { className: "btn btn-secondary", onclick: () => renderSslView(container) }, "Actualiser"),
      el("button", { className: "btn btn-primary", onclick: async () => {
        try { toast("Vérification en cours..."); const r = await api("/api/ssl/check-all", { method: "POST" }); toast(`${r.checked} certificat(s) vérifié(s)`); sslAutoSynced = true; renderSslView(container); } catch (e) { toast(e.message, "error"); }
      } }, "Vérifier tout"),
    ),
  ));

  const wrap = el("div", {});
  container.appendChild(wrap);

  try {
    /* Charger certs ET urls en parallèle */
    const [certs, urls] = await Promise.all([
      api("/api/ssl/"),
      api("/api/urls"),
    ]);

    /* URLs HTTPS depuis url_configs */
    const httpsUrls = (urls || []).filter(u => u.url && u.url.startsWith("https://"));
    const certMap = {};
    (certs || []).forEach(c => { certMap[c.url] = c; });

    /* Auto-sync: si pas de certs mais des URLs HTTPS existent, lancer check-all une fois */
    if (sslAutoSynced === false && (certs || []).length === 0 && httpsUrls.length > 0) {
      sslAutoSynced = true;
      wrap.appendChild(el("div", { className: "card", style: { textAlign: "center", color: "var(--text-muted)", padding: "20px" } },
        `Synchronisation de ${httpsUrls.length} URL(s) HTTPS en cours...`,
      ));
      try {
        await api("/api/ssl/check-all", { method: "POST" });
        toast(`${httpsUrls.length} certificat(s) synchronisé(s)`);
        renderSslView(container);
        return;
      } catch (e) {
        toast(e.message, "error");
      }
    }

    /* KPIs — compter sur les URLs HTTPS, pas seulement les certs vérifiés */
    const total = httpsUrls.length;
    const valid = httpsUrls.filter(u => certMap[u.url]?.days_left > 30).length;
    const warning = httpsUrls.filter(u => { const d = certMap[u.url]?.days_left; return d != null && d <= 30 && d > 7; }).length;
    const critical = httpsUrls.filter(u => { const d = certMap[u.url]?.days_left; return d != null && d <= 7 && d > 0; }).length;
    const expired = httpsUrls.filter(u => { const d = certMap[u.url]?.days_left; return d != null && d <= 0; }).length;
    const unchecked = httpsUrls.filter(u => !certMap[u.url]).length;

    wrap.appendChild(el("div", { style: { display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: "12px", marginBottom: "16px" } },
      el("div", { className: "card", style: { padding: "14px 16px" } }, el("div", { style: { fontSize: 11, color: "var(--text-muted)", textTransform: "uppercase" } }, "URLs HTTPS"), el("div", { style: { fontSize: 24, fontWeight: 800, color: "var(--primary-hover)", fontFamily: "monospace" } }, String(total))),
      el("div", { className: "card", style: { padding: "14px 16px" } }, el("div", { style: { fontSize: 11, color: "var(--text-muted)", textTransform: "uppercase" } }, "Valides (>30j)"), el("div", { style: { fontSize: 24, fontWeight: 800, color: "var(--success)", fontFamily: "monospace" } }, String(valid))),
      el("div", { className: "card", style: { padding: "14px 16px" } }, el("div", { style: { fontSize: 11, color: "var(--text-muted)", textTransform: "uppercase" } }, "Attention (≤30j)"), el("div", { style: { fontSize: 24, fontWeight: 800, color: "var(--warning)", fontFamily: "monospace" } }, String(warning))),
      el("div", { className: "card", style: { padding: "14px 16px" } }, el("div", { style: { fontSize: 11, color: "var(--text-muted)", textTransform: "uppercase" } }, "Critiques (≤7j)"), el("div", { style: { fontSize: 24, fontWeight: 800, color: "var(--danger)", fontFamily: "monospace" } }, String(critical + expired))),
      el("div", { className: "card", style: { padding: "14px 16px" } }, el("div", { style: { fontSize: 11, color: "var(--text-muted)", textTransform: "uppercase" } }, "Non vérifiés"), el("div", { style: { fontSize: 24, fontWeight: 800, color: unchecked > 0 ? "var(--warning)" : "var(--success)", fontFamily: "monospace" } }, String(unchecked))),
    ));

    /* Table — toutes les URLs HTTPS, avec ou sans cert */
    if (total === 0) {
      wrap.appendChild(el("div", { className: "card", style: { textAlign: "center", color: "var(--text-muted)" } }, "Aucune URL HTTPS dans la base. Ajoutez des URLs en https:// dans l'onglet \"URLs & Images\"."));
      return;
    }

    const sortedUrls = httpsUrls
      .map(u => {
        const c = certMap[u.url];
        return {
          url: u.url,
          name: u.name || "",
          issuer: c?.issuer || null,
          expiry_date: c?.expiry_date || null,
          days_left: c?.days_left ?? null,
          status: c?.status || "unchecked",
          last_checked: c?.last_checked || null,
        };
      })
      .sort((a, b) => (a.days_left ?? -1) - (b.days_left ?? -1));

    const tbody = sortedUrls.map(item => {
      const color = item.days_left == null ? "var(--text-muted)" : item.days_left <= 0 ? "var(--danger)" : item.days_left <= 7 ? "var(--danger)" : item.days_left <= 30 ? "var(--warning)" : "var(--success)";
      const badgeClass = item.status === "valid" ? "badge-success" : item.status === "warning" ? "badge-warning" : item.status === "critical" || item.status === "expired" ? "badge-danger" : "badge-primary";
      const badgeLabel = item.status === "valid" ? "Valide" : item.status === "warning" ? "Attention" : item.status === "critical" ? "Critique" : item.status === "expired" ? "Expiré" : "Non vérifié";
      return el("tr", {},
        el("td", { style: { fontFamily: "monospace", fontSize: 12 } }, item.url),
        el("td", { style: { fontSize: 11, color: "var(--text-muted)" } }, item.name || "—"),
        el("td", { style: { fontSize: 11 } }, item.issuer || "—"),
        el("td", { style: { fontSize: 11, fontFamily: "monospace" } }, item.expiry_date ? fmtDateShort(item.expiry_date) : "—"),
        el("td", { style: { fontFamily: "monospace", fontWeight: 700, color } }, item.days_left != null ? `${item.days_left}j` : "—"),
        el("td", {}, el("span", { className: `badge ${badgeClass}` }, badgeLabel)),
        el("td", { style: { fontSize: 11, fontFamily: "monospace" } }, item.last_checked ? fmtDate(item.last_checked) : "—"),
        el("td", {},
          el("button", { className: "btn btn-secondary btn-sm", onclick: async () => {
            try { toast("Vérification..."); await api("/api/ssl/check", { method: "POST", body: JSON.stringify({ url: item.url }) }); toast("Certificat vérifié"); renderSslView(container); } catch (e) { toast(e.message, "error"); }
          } }, "Vérifier"),
        ),
      );
    });
    wrap.appendChild(el("div", { className: "scroll-list" },
      el("table", {},
        el("thead", {}, el("tr", {}, el("th", {}, "URL"), el("th", {}, "Nom"), el("th", {}, "Émetteur"), el("th", {}, "Expiration"), el("th", {}, "Jours restants"), el("th", {}, "Statut"), el("th", {}, "Dernière vérif."), el("th", {}, "Action"))),
        el("tbody", {}, ...tbody),
      ),
    ));
  } catch (e) {
    wrap.appendChild(el("div", { className: "card", style: { color: "var(--danger)" } }, `Erreur: ${e.message}`));
  }
}

/* ── System View (Backup + Observabilité) ── */
async function renderSystemView(container) {
  container.innerHTML = "";
  container.appendChild(el("div", { className: "main-header" },
    el("h2", {}, "Système — Backup & Observabilité"),
    el("button", { className: "btn btn-secondary", onclick: () => renderSystemView(container) }, "Actualiser"),
  ));

  const wrap = el("div", {});
  container.appendChild(wrap);

  /* ── Observabilité ── */
  try {
    const m = await api("/api/system/metrics");
    const memMB = (m.memory.rss / 1024 / 1024).toFixed(1);
    const heapUsed = (m.memory.heapUsed / 1024 / 1024).toFixed(1);
    const heapTotal = (m.memory.heapTotal / 1024 / 1024).toFixed(1);
    const dbKB = (m.db.size / 1024).toFixed(0);
    const upH = Math.floor(m.uptime_seconds / 3600);
    const upM = Math.floor((m.uptime_seconds % 3600) / 60);

    wrap.appendChild(el("h3", { style: { marginBottom: "10px", fontSize: 15 } }, "Observabilité backend"));
    wrap.appendChild(el("div", { style: { display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "12px", marginBottom: "16px" } },
      el("div", { className: "card", style: { padding: "14px 16px" } }, el("div", { style: { fontSize: 11, color: "var(--text-muted)", textTransform: "uppercase" } }, "Uptime"), el("div", { style: { fontSize: 22, fontWeight: 800, color: "var(--primary-hover)", fontFamily: "monospace" } }, `${upH}h ${upM}m`)),
      el("div", { className: "card", style: { padding: "14px 16px" } }, el("div", { style: { fontSize: 11, color: "var(--text-muted)", textTransform: "uppercase" } }, "Requêtes"), el("div", { style: { fontSize: 22, fontWeight: 800, color: "var(--success)", fontFamily: "monospace" } }, String(m.totalRequests))),
      el("div", { className: "card", style: { padding: "14px 16px" } }, el("div", { style: { fontSize: 11, color: "var(--text-muted)", textTransform: "uppercase" } }, "Mémoire RSS"), el("div", { style: { fontSize: 22, fontWeight: 800, color: "var(--warning)", fontFamily: "monospace" } }, `${memMB} MB`)),
      el("div", { className: "card", style: { padding: "14px 16px" } }, el("div", { style: { fontSize: 11, color: "var(--text-muted)", textTransform: "uppercase" } }, "DB Size"), el("div", { style: { fontSize: 22, fontWeight: 800, color: "#F472B6", fontFamily: "monospace" } }, `${dbKB} KB`)),
    ));

    wrap.appendChild(el("div", { className: "card", style: { fontSize: 12, color: "var(--text-muted)" } },
      `Heap: ${heapUsed} / ${heapTotal} MB · CPU user: ${Math.round(m.cpu.user / 1000)}ms · CPU system: ${Math.round(m.cpu.system / 1000)}ms`,
    ));

    /* Top routes */
    if (m.routes && m.routes.length > 0) {
      wrap.appendChild(el("div", { className: "card" },
        el("div", { style: { fontWeight: 600, marginBottom: "10px" } }, "Top routes"),
        el("div", { className: "scroll-list", style: { maxHeight: 200 } },
          el("table", {},
            el("thead", {}, el("tr", {}, el("th", {}, "Route"), el("th", {}, "Count"), el("th", {}, "Avg ms"), el("th", {}, "Max ms"))),
            el("tbody", {}, ...m.routes.slice(0, 10).map(r => el("tr", {},
              el("td", { style: { fontFamily: "monospace", fontSize: 11 } }, r.route),
              el("td", { style: { fontFamily: "monospace", fontWeight: 700, color: "var(--primary-hover)" } }, String(r.count)),
              el("td", { style: { fontFamily: "monospace" } }, String(r.avgMs)),
              el("td", { style: { fontFamily: "monospace" } }, String(r.maxMs)),
            ))),
          ),
        ),
      ));
    }
  } catch (e) {
    wrap.appendChild(el("div", { className: "card", style: { color: "var(--danger)" } }, `Erreur métriques: ${e.message}`));
  }

  /* ── Export ── */
  wrap.appendChild(el("h3", { style: { marginTop: "20px", marginBottom: "10px", fontSize: 15 } }, "Export de données"));
  wrap.appendChild(el("div", { className: "card", style: { display: "flex", gap: "10px", flexWrap: "wrap" } },
    el("button", { className: "btn btn-primary", onclick: async () => {
      try { const r = await fetch("/api/export/servers?format=xlsx", { headers: { Authorization: `Bearer ${token}` } }); const blob = await r.blob(); const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = "serveurs.xlsx"; a.click(); toast("Export serveurs téléchargé"); } catch (e) { toast(e.message, "error"); }
    } }, "Export serveurs (.xlsx)"),
    el("button", { className: "btn btn-primary", onclick: async () => {
      try { const r = await fetch("/api/export/urls?format=xlsx", { headers: { Authorization: `Bearer ${token}` } }); const blob = await r.blob(); const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = "urls.xlsx"; a.click(); toast("Export URLs téléchargé"); } catch (e) { toast(e.message, "error"); }
    } }, "Export URLs (.xlsx)"),
    el("button", { className: "btn btn-secondary", onclick: async () => {
      try { const r = await fetch("/api/export/report?format=pdf", { headers: { Authorization: `Bearer ${token}` } }); const blob = await r.blob(); const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = "rapport-g1oeil.html"; a.click(); toast("Rapport téléchargé"); } catch (e) { toast(e.message, "error"); }
    } }, "Rapport PDF"),
  ));

  /* ── Backup / Restore ── */
  wrap.appendChild(el("h3", { style: { marginTop: "20px", marginBottom: "10px", fontSize: 15 } }, "Backup & Restore"));
  const backupCard = el("div", { className: "card" });
  backupCard.appendChild(el("div", { style: { display: "flex", gap: "10px", marginBottom: "16px" } },
    el("button", { className: "btn btn-primary", onclick: async () => {
      try { const r = await api("/api/system/backup", { method: "POST" }); toast(`Backup créé: ${r.filename} (${(r.size / 1024).toFixed(0)} KB)`); renderSystemView(container); } catch (e) { toast(e.message, "error"); }
    } }, "Créer un backup"),
    el("label", { className: "btn btn-secondary", style: { cursor: "pointer" } },
      "Restaurer depuis un fichier...",
      el("input", { type: "file", accept: ".db", style: { display: "none" }, onchange: async (e) => {
        if (!e.target.files[0]) return;
        const fd = new FormData(); fd.append("backup", e.target.files[0]);
        try { const r = await fetch("/api/system/restore", { method: "POST", headers: { Authorization: `Bearer ${token}` }, body: fd }); const data = await r.json(); toast(data.message || data.error); renderSystemView(container); } catch (e) { toast(e.message, "error"); }
        e.target.value = "";
      } }),
    ),
  ));

  try {
    const backups = await api("/api/system/backups");
    if (backups.length > 0) {
      const tbody = backups.map(b => el("tr", {},
        el("td", { style: { fontFamily: "monospace", fontSize: 11 } }, b.filename),
        el("td", {}, `${(b.size / 1024).toFixed(0)} KB`),
        el("td", { style: { fontSize: 11, fontFamily: "monospace" } }, fmtDate(b.created.toISOString ? b.created.toISOString() : b.created)),
        el("td", {},
          el("button", { className: "btn btn-danger btn-sm", onclick: async () => {
            try { await api(`/api/system/backups/${encodeURIComponent(b.filename)}`, { method: "DELETE" }); toast("Backup supprimé"); renderSystemView(container); } catch (e) { toast(e.message, "error"); }
          } }, "Supprimer"),
        ),
      ));
      backupCard.appendChild(el("div", { className: "scroll-list", style: { maxHeight: 250 } },
        el("table", {},
          el("thead", {}, el("tr", {}, el("th", {}, "Fichier"), el("th", {}, "Taille"), el("th", {}, "Date"), el("th", {}, "Actions"))),
          el("tbody", {}, ...tbody),
        ),
      ));
    } else {
      backupCard.appendChild(el("div", { style: { color: "var(--text-muted)", textAlign: "center", padding: "16px" } }, "Aucun backup"));
    }
  } catch {}
  wrap.appendChild(backupCard);
}

/* ── Init ── */
checkAuth();
