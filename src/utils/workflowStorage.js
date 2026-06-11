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
    status: "pending",
  };
}

export function makeWorkflow(data = {}) {
  const now = new Date().toISOString();
  return {
    id: crypto.randomUUID(),
    name: data.name || "Nouveau workflow",
    description: data.description || "",
    status: "draft",
    trigger: "",
    steps: [],
    tags: [],
    createdAt: now,
    updatedAt: now,
  };
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
