const KEY = "url-monitor-workflows";
const MAX = 300;

export function makeStep(data = {}) {
  return {
    id: crypto.randomUUID(),
    title: data.title || "Nouvelle étape",
    type: data.type || "action",
    description: data.description || "",
    responsible: data.responsible || "",
    duration: data.duration || "",
    phase: data.phase || "",
    status: "pending",
  };
}

export function makeWorkflow(data = {}) {
  const now = new Date().toISOString();
  const base = {
    id: crypto.randomUUID(),
    name: data.name || "Nouveau workflow",
    description: data.description || "",
    status: "draft",
    trigger: "",
    steps: data.steps || [],
    tags: [],
    wfType: data.wfType || "generic",
    createdAt: now,
    updatedAt: now,
  };
  if (data.wfType === "mep") {
    Object.assign(base, {
      criticite: data.criticite || "normal",
      datePrevisionnelle: data.datePrevisionnelle || "",
      livrable: data.livrable || "",
      chefDeProjet: data.chefDeProjet || "",
      application: data.application || "",
      environnement: data.environnement || "Production",
    });
  }
  return base;
}

export function loadWorkflows() {
  try { return JSON.parse(localStorage.getItem(KEY) || "[]"); } catch { return []; }
}

export function saveWorkflows(wfs) {
  try {
    localStorage.setItem(KEY, JSON.stringify(wfs.slice(0, MAX)));
    window.dispatchEvent(new CustomEvent("workflows-changed", { detail: wfs }));
  } catch {}
}
