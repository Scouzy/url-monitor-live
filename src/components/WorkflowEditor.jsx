import { useState } from "react";
import {
  Plus, Trash2, ChevronUp, ChevronDown, GitBranch, Play,
  CheckCircle, Clock, Bell, Shield, Terminal, GitFork,
} from "lucide-react";
import { loadWorkflows, saveWorkflows, makeWorkflow, makeStep } from "../utils/workflowStorage";

const STEP_TYPES = {
  action:    { label: "Action",       color: "#6366F1", Icon: Play },
  check:     { label: "Vérification", color: "#34D399", Icon: CheckCircle },
  notify:    { label: "Notification", color: "#FBBF24", Icon: Bell },
  wait:      { label: "Attente",      color: "#9CA3AF", Icon: Clock },
  approval:  { label: "Approbation",  color: "#F59E0B", Icon: Shield },
  script:    { label: "Script",       color: "#818CF8", Icon: Terminal },
  condition: { label: "Condition",    color: "#F472B6", Icon: GitFork },
};

const STEP_STATUS = {
  pending:     { label: "À faire",  color: "#4B5563" },
  in_progress: { label: "En cours", color: "#FBBF24" },
  done:        { label: "Terminé",  color: "#34D399" },
  skipped:     { label: "Ignoré",   color: "#6B7280" },
};

const WF_STATUS = {
  draft:    { label: "Brouillon", color: "#6B7280" },
  active:   { label: "Actif",     color: "#34D399" },
  paused:   { label: "En pause",  color: "#FBBF24" },
  archived: { label: "Archivé",   color: "#9CA3AF" },
};

const inp = (extra = {}) => ({
  background: "#0D1117", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 7,
  color: "#E5E7EB", fontSize: 11, padding: "5px 9px", outline: "none",
  fontFamily: "inherit", boxSizing: "border-box", width: "100%", ...extra,
});

export default function WorkflowEditor() {
  const [wfs, setWfs]       = useState(() => loadWorkflows());
  const [selId, setSelId]   = useState(null);
  const [expSteps, setExpSteps] = useState(new Set());

  const persist = (list) => { setWfs(list); saveWorkflows(list); };
  const sel = wfs.find(w => w.id === selId);

  const newWf = () => {
    const w = makeWorkflow();
    const next = [w, ...wfs];
    persist(next);
    setSelId(w.id);
  };

  const delWf = (id, e) => {
    e.stopPropagation();
    if (!window.confirm("Supprimer ce workflow ?")) return;
    persist(wfs.filter(w => w.id !== id));
    if (selId === id) setSelId(null);
  };

  const upd = (changes) =>
    persist(wfs.map(w => w.id === selId
      ? { ...w, ...changes, updatedAt: new Date().toISOString() } : w));

  const addStep = () => {
    if (!sel) return;
    const s = makeStep();
    upd({ steps: [...sel.steps, s] });
    setExpSteps(p => new Set([...p, s.id]));
  };

  const delStep = (sid) => {
    upd({ steps: sel.steps.filter(s => s.id !== sid) });
    setExpSteps(p => { const n = new Set(p); n.delete(sid); return n; });
  };

  const moveStep = (sid, dir) => {
    const steps = [...sel.steps];
    const i = steps.findIndex(s => s.id === sid);
    const j = i + dir;
    if (j < 0 || j >= steps.length) return;
    [steps[i], steps[j]] = [steps[j], steps[i]];
    upd({ steps });
  };

  const updStep = (sid, ch) =>
    upd({ steps: sel.steps.map(s => s.id === sid ? { ...s, ...ch } : s) });

  const toggleExp = (sid) =>
    setExpSteps(p => { const n = new Set(p); n.has(sid) ? n.delete(sid) : n.add(sid); return n; });

  const completedSteps = sel ? sel.steps.filter(s => s.status === "done").length : 0;

  return (
    <div style={{ display: "flex", height: "100%", background: "#0B0F19", color: "#F3F4F6", fontFamily: "'Inter', sans-serif" }}>

      {/* ── LEFT: liste des workflows ── */}
      <div style={{ width: 270, minWidth: 270, borderRight: "1px solid rgba(255,255,255,0.07)", display: "flex", flexDirection: "column", background: "#0D1117" }}>
        <div style={{ padding: "16px 14px 12px", borderBottom: "1px solid rgba(255,255,255,0.06)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
            <GitBranch size={15} color="#818CF8" />
            <span style={{ fontSize: 13, fontWeight: 700 }}>Workflows</span>
            <span style={{ fontSize: 10, padding: "1px 6px", borderRadius: 8, background: "rgba(129,140,248,0.15)", color: "#818CF8", fontWeight: 700 }}>{wfs.length}</span>
          </div>
          <button onClick={newWf} style={{ display: "flex", alignItems: "center", gap: 4, padding: "4px 10px", borderRadius: 7, background: "rgba(99,102,241,0.18)", border: "1px solid rgba(99,102,241,0.4)", color: "#818CF8", fontSize: 11, fontWeight: 600, cursor: "pointer" }}>
            <Plus size={11} /> Nouveau
          </button>
        </div>

        <div style={{ flex: 1, overflowY: "auto", padding: "6px 8px" }}>
          {wfs.length === 0 && (
            <div style={{ textAlign: "center", color: "#374151", padding: "48px 16px", fontSize: 12 }}>
              Aucun workflow.<br />Créez le premier.
            </div>
          )}
          {wfs.map(w => {
            const sc = WF_STATUS[w.status] || WF_STATUS.draft;
            const done = w.steps.filter(s => s.status === "done").length;
            const isAct = w.id === selId;
            return (
              <div key={w.id} onClick={() => setSelId(w.id)} style={{
                padding: "10px 12px", borderRadius: 9, marginBottom: 4, cursor: "pointer",
                background: isAct ? "rgba(99,102,241,0.12)" : "transparent",
                border: `1px solid ${isAct ? "rgba(99,102,241,0.3)" : "transparent"}`,
                transition: "all 0.15s",
              }}
                onMouseEnter={e => { if (!isAct) e.currentTarget.style.background = "rgba(255,255,255,0.04)"; }}
                onMouseLeave={e => { if (!isAct) e.currentTarget.style.background = "transparent"; }}
              >
                <div style={{ display: "flex", alignItems: "flex-start", gap: 6, justifyContent: "space-between" }}>
                  <span style={{ fontSize: 13, fontWeight: isAct ? 600 : 400, color: isAct ? "#E5E7EB" : "#9CA3AF", flex: 1, lineHeight: 1.35 }}>{w.name}</span>
                  <button onClick={e => delWf(w.id, e)} style={{ background: "none", border: "none", color: "#374151", cursor: "pointer", padding: 2, flexShrink: 0, display: "flex" }}
                    onMouseEnter={e => e.currentTarget.style.color = "#F87171"}
                    onMouseLeave={e => e.currentTarget.style.color = "#374151"}>
                    <Trash2 size={11} />
                  </button>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 5, flexWrap: "wrap" }}>
                  <span style={{ fontSize: 9, padding: "1px 6px", borderRadius: 6, background: `${sc.color}22`, color: sc.color, fontWeight: 700 }}>{sc.label}</span>
                  <span style={{ fontSize: 10, color: "#374151" }}>{w.steps.length} étape{w.steps.length !== 1 ? "s" : ""}</span>
                  {w.steps.length > 0 && <span style={{ fontSize: 10, color: "#34D399" }}>{done}/{w.steps.length} ✓</span>}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* ── RIGHT: éditeur ── */}
      {!sel ? (
        <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <div style={{ textAlign: "center", color: "#374151" }}>
            <GitBranch size={44} color="#1F2937" style={{ marginBottom: 14 }} />
            <div style={{ fontSize: 14, marginBottom: 6 }}>Sélectionnez ou créez un workflow</div>
            <div style={{ fontSize: 11, color: "#4B5563" }}>Organisez vos procédures d'intervention étape par étape</div>
          </div>
        </div>
      ) : (
        <div style={{ flex: 1, overflowY: "auto", padding: "24px 32px 48px" }}>

          {/* Header */}
          <div style={{ marginBottom: 22 }}>
            <input
              value={sel.name}
              onChange={e => upd({ name: e.target.value })}
              style={{ ...inp({ background: "transparent", border: "none", fontSize: 22, fontWeight: 700, color: "#F9FAFB", padding: "0 0 4px" }) }}
            />
            <div style={{ display: "flex", gap: 10, alignItems: "center", marginTop: 6, flexWrap: "wrap" }}>
              <span style={{ fontSize: 10, color: "#4B5563" }}>Statut :</span>
              <select value={sel.status} onChange={e => upd({ status: e.target.value })}
                style={{ background: "#151B27", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 6, color: WF_STATUS[sel.status]?.color || "#9CA3AF", fontSize: 11, fontWeight: 600, padding: "2px 8px", cursor: "pointer" }}>
                {Object.entries(WF_STATUS).map(([k, v]) => <option key={k} value={k} style={{ color: "#E5E7EB" }}>{v.label}</option>)}
              </select>
              {sel.steps.length > 0 && (
                <span style={{ fontSize: 10, color: "#34D399" }}>{completedSteps}/{sel.steps.length} étapes terminées</span>
              )}
              <span style={{ fontSize: 10, color: "#374151", marginLeft: "auto" }}>
                Modifié {new Date(sel.updatedAt).toLocaleDateString("fr-FR")}
              </span>
            </div>
          </div>

          {/* Description + Déclencheur */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 28 }}>
            <div>
              <label style={{ fontSize: 11, color: "#6B7280", display: "block", marginBottom: 5 }}>Description</label>
              <textarea value={sel.description} onChange={e => upd({ description: e.target.value })}
                rows={3} placeholder="Objectif et contexte du workflow…"
                style={{ ...inp({ resize: "vertical" }) }} />
            </div>
            <div>
              <label style={{ fontSize: 11, color: "#6B7280", display: "block", marginBottom: 5 }}>Déclencheur</label>
              <textarea value={sel.trigger} onChange={e => upd({ trigger: e.target.value })}
                rows={3} placeholder="Événement ou condition qui déclenche ce workflow…"
                style={{ ...inp({ resize: "vertical" }) }} />
            </div>
          </div>

          {/* Steps header */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: "#9CA3AF" }}>
              Étapes <span style={{ color: "#374151", fontWeight: 400 }}>({sel.steps.length})</span>
            </span>
            <button onClick={addStep} style={{ display: "flex", alignItems: "center", gap: 5, padding: "5px 13px", borderRadius: 7, background: "rgba(52,211,153,0.12)", border: "1px solid rgba(52,211,153,0.3)", color: "#34D399", fontSize: 11, fontWeight: 600, cursor: "pointer" }}>
              <Plus size={12} /> Ajouter une étape
            </button>
          </div>

          {sel.steps.length === 0 && (
            <div style={{ textAlign: "center", padding: "36px 0", color: "#374151", fontSize: 12, borderRadius: 10, border: "1px dashed rgba(255,255,255,0.06)" }}>
              Aucune étape — cliquez "Ajouter une étape" pour commencer
            </div>
          )}

          {sel.steps.map((step, idx) => {
            const tc  = STEP_TYPES[step.type] || STEP_TYPES.action;
            const sc  = STEP_STATUS[step.status] || STEP_STATUS.pending;
            const isExp = expSteps.has(step.id);
            return (
              <div key={step.id} style={{ background: "#151B27", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 10, marginBottom: 7, overflow: "hidden" }}>
                {/* Step row */}
                <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 13px", cursor: "pointer" }} onClick={() => toggleExp(step.id)}>
                  <span style={{ fontSize: 11, color: "#4B5563", fontFamily: "monospace", minWidth: 18, textAlign: "right" }}>{idx + 1}</span>
                  <span style={{ fontSize: 10, padding: "2px 7px", borderRadius: 5, background: `${tc.color}20`, color: tc.color, fontWeight: 700, flexShrink: 0 }}>{tc.label}</span>
                  <input value={step.title} onChange={e => { e.stopPropagation(); updStep(step.id, { title: e.target.value }); }}
                    onClick={e => e.stopPropagation()}
                    style={{ flex: 1, background: "transparent", border: "none", color: "#E5E7EB", fontSize: 13, fontWeight: 500, outline: "none" }} />
                  <span style={{ fontSize: 9, padding: "1px 6px", borderRadius: 5, background: `${sc.color}20`, color: sc.color, fontWeight: 600, flexShrink: 0 }}>{sc.label}</span>
                  <div style={{ display: "flex", alignItems: "center", gap: 2, flexShrink: 0 }} onClick={e => e.stopPropagation()}>
                    <button onClick={() => moveStep(step.id, -1)} disabled={idx === 0}
                      style={{ background: "none", border: "none", color: idx === 0 ? "#1F2937" : "#4B5563", cursor: idx === 0 ? "default" : "pointer", padding: 2, display: "flex" }}>
                      <ChevronUp size={13} />
                    </button>
                    <button onClick={() => moveStep(step.id, 1)} disabled={idx === sel.steps.length - 1}
                      style={{ background: "none", border: "none", color: idx === sel.steps.length - 1 ? "#1F2937" : "#4B5563", cursor: idx === sel.steps.length - 1 ? "default" : "pointer", padding: 2, display: "flex" }}>
                      <ChevronDown size={13} />
                    </button>
                    <button onClick={() => delStep(step.id)}
                      style={{ background: "none", border: "none", color: "#374151", cursor: "pointer", padding: 2, display: "flex" }}
                      onMouseEnter={e => e.currentTarget.style.color = "#F87171"}
                      onMouseLeave={e => e.currentTarget.style.color = "#374151"}>
                      <Trash2 size={12} />
                    </button>
                  </div>
                </div>

                {/* Step detail */}
                {isExp && (
                  <div style={{ borderTop: "1px solid rgba(255,255,255,0.05)", padding: "12px 13px", display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 10 }}>
                    <div>
                      <label style={{ fontSize: 10, color: "#4B5563", display: "block", marginBottom: 3 }}>Type</label>
                      <select value={step.type} onChange={e => updStep(step.id, { type: e.target.value })}
                        style={{ ...inp({ padding: "4px 7px" }) }}>
                        {Object.entries(STEP_TYPES).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                      </select>
                    </div>
                    <div>
                      <label style={{ fontSize: 10, color: "#4B5563", display: "block", marginBottom: 3 }}>Statut</label>
                      <select value={step.status} onChange={e => updStep(step.id, { status: e.target.value })}
                        style={{ ...inp({ padding: "4px 7px", color: STEP_STATUS[step.status]?.color || "#E5E7EB" }) }}>
                        {Object.entries(STEP_STATUS).map(([k, v]) => <option key={k} value={k} style={{ color: "#E5E7EB" }}>{v.label}</option>)}
                      </select>
                    </div>
                    <div>
                      <label style={{ fontSize: 10, color: "#4B5563", display: "block", marginBottom: 3 }}>Responsable</label>
                      <input value={step.responsible} onChange={e => updStep(step.id, { responsible: e.target.value })}
                        placeholder="Équipe / personne…" style={{ ...inp({ padding: "4px 7px" }) }} />
                    </div>
                    <div>
                      <label style={{ fontSize: 10, color: "#4B5563", display: "block", marginBottom: 3 }}>Durée estimée</label>
                      <input value={step.duration} onChange={e => updStep(step.id, { duration: e.target.value })}
                        placeholder="30min, 2h…" style={{ ...inp({ padding: "4px 7px" }) }} />
                    </div>
                    <div style={{ gridColumn: "1 / -1" }}>
                      <label style={{ fontSize: 10, color: "#4B5563", display: "block", marginBottom: 3 }}>Description / Instructions</label>
                      <textarea value={step.description} onChange={e => updStep(step.id, { description: e.target.value })}
                        rows={2} placeholder="Détails, commandes, liens utiles…"
                        style={{ ...inp({ resize: "vertical" }) }} />
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
