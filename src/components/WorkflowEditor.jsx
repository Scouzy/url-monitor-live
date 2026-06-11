import { useState } from "react";
import {
  Plus, Trash2, ChevronUp, ChevronDown, GitBranch, Play,
  CheckCircle, Clock, Bell, Shield, Terminal, GitFork, Rocket,
  Calendar, User, Package, Layers, ChevronRight, AlertTriangle,
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

/* Ordre du plus critique au moins critique (référentiel société) */
const MEP_CRITICITE = {
  normal:          { label: "Normal",          color: "#F87171", bg: "rgba(248,113,113,0.08)",  border: "rgba(248,113,113,0.3)",  desc: "Très Critique · rigueur maximale",     rank: 1 },
  normal_urgent:   { label: "Normal-Urgent",   color: "#FB923C", bg: "rgba(251,146,60,0.08)",   border: "rgba(251,146,60,0.3)",   desc: "Urgence Critique · rigueur maximale",  rank: 2 },
  standard_urgent: { label: "Standard-Urgent", color: "#FBBF24", bg: "rgba(251,191,36,0.08)",   border: "rgba(251,191,36,0.3)",   desc: "Urgence métier · processus allégé",   rank: 3 },
  standard:        { label: "Standard",        color: "#818CF8", bg: "rgba(129,140,248,0.08)",  border: "rgba(129,140,248,0.3)",  desc: "Processus standard · risque maîtrisé", rank: 4 },
};

const MEP_PHASES = {
  pre:  { label: "Pré-déploiement",  color: "#818CF8" },
  mep:  { label: "Déploiement",      color: "#FBBF24" },
  post: { label: "Post-déploiement", color: "#34D399" },
};

/* Templates classés du plus critique (normal) au moins critique (standard) */
const MEP_TEMPLATES = {
  /* Rang 1 — Normal : Très Critique · rigueur maximale (processus le plus complet) */
  normal: [
    { title: "Vérification du bilan de qualification",    type: "check",    phase: "pre",  responsible: "Dev / IT",        duration: "15min", description: "Contrôler que le dossier de qualification est complet et validé" },
    { title: "Communication de la fenêtre de MeP",       type: "notify",   phase: "pre",  responsible: "Chef de projet",   duration: "10min", description: "Notifier toutes les équipes de la plage horaire retenue" },
    { title: "Validation Go/No-Go — DSSI",               type: "approval", phase: "pre",  responsible: "DSSI / Resp. MeP", duration: "20min", description: "Recueillir l'approbation formelle avant démarrage" },
    { title: "Sauvegarde complète + plan de rollback",   type: "action",   phase: "pre",  responsible: "IT",               duration: "30min", description: "Sauvegarder base de données, fichiers et documenter la procédure de retour arrière" },
    { title: "Vérification de l'environnement cible",    type: "check",    phase: "pre",  responsible: "IT",               duration: "15min", description: "Contrôler l'état des services, espace disque, connectivité" },
    { title: "Arrêt des services applicatifs",           type: "action",   phase: "mep",  responsible: "IT",               duration: "5min",  description: "Arrêter proprement les services dans l'ordre défini" },
    { title: "Déploiement des livrables",                type: "script",   phase: "mep",  responsible: "Dev / IT",         duration: "20min", description: "Copier et installer les artefacts sur l'environnement cible" },
    { title: "Application des scripts SQL / migrations", type: "script",   phase: "mep",  responsible: "DBA",              duration: "15min", description: "Exécuter les migrations de schéma dans l'ordre correct" },
    { title: "Mise à jour des configurations",           type: "action",   phase: "mep",  responsible: "IT",               duration: "10min", description: "Appliquer les fichiers de config spécifiques à la production" },
    { title: "Redémarrage des services",                 type: "action",   phase: "mep",  responsible: "IT",               duration: "5min",  description: "Redémarrer les services dans l'ordre de dépendance" },
    { title: "Smoke tests / validation fonctionnelle",   type: "check",    phase: "post", responsible: "Dev / MOA",        duration: "30min", description: "Exécuter le jeu de tests critiques défini dans le dossier" },
    { title: "Vérification des logs applicatifs",        type: "check",    phase: "post", responsible: "IT",               duration: "15min", description: "Contrôler l'absence d'erreurs dans les logs applicatifs et système" },
    { title: "Validation des performances",              type: "check",    phase: "post", responsible: "Dev / IT",         duration: "20min", description: "Vérifier que les temps de réponse sont conformes aux SLA" },
    { title: "Communication de clôture et PV de MeP",   type: "notify",   phase: "post", responsible: "Chef de projet",   duration: "10min", description: "Envoyer le bilan de MeP et archiver le PV signé" },
  ],
  /* Rang 2 — Normal-Urgent : Urgence Critique · rigueur maximale */
  normal_urgent: [
    { title: "Approbation urgente Go/No-Go",             type: "approval", phase: "pre",  responsible: "DSSI / Resp. MeP", duration: "10min", description: "Obtenir l'aval formel malgré l'urgence" },
    { title: "Notification d'urgence aux équipes",       type: "notify",   phase: "pre",  responsible: "Chef de projet",   duration: "5min",  description: "Alerter toutes les équipes concernées immédiatement" },
    { title: "Sauvegarde + plan de rollback immédiat",   type: "action",   phase: "pre",  responsible: "IT",               duration: "20min", description: "Point de restauration minimal avant démarrage" },
    { title: "Arrêt des services",                       type: "action",   phase: "mep",  responsible: "IT",               duration: "5min"  },
    { title: "Déploiement prioritaire",                  type: "script",   phase: "mep",  responsible: "Dev / IT",         duration: "15min" },
    { title: "Configuration + redémarrage",              type: "action",   phase: "mep",  responsible: "IT",               duration: "10min" },
    { title: "Tests de non-régression prioritaires",     type: "check",    phase: "post", responsible: "Dev",              duration: "20min", description: "Vérifier les fonctionnalités critiques impactées" },
    { title: "Validation métier",                        type: "check",    phase: "post", responsible: "MOA",              duration: "15min" },
    { title: "Communication de clôture urgente",         type: "notify",   phase: "post", responsible: "Chef de projet",   duration: "5min"  },
  ],
  /* Rang 3 — Standard-Urgent : Urgence métier · processus allégé */
  standard_urgent: [
    { title: "Communication aux équipes",                type: "notify",   phase: "pre",  responsible: "Chef de projet",   duration: "10min" },
    { title: "Sauvegarde / point de restauration",       type: "action",   phase: "pre",  responsible: "IT",               duration: "20min" },
    { title: "Arrêt des services applicatifs",           type: "action",   phase: "mep",  responsible: "IT",               duration: "5min"  },
    { title: "Déploiement des livrables",                type: "script",   phase: "mep",  responsible: "Dev / IT",         duration: "20min" },
    { title: "Configuration et redémarrage",             type: "action",   phase: "mep",  responsible: "IT",               duration: "10min" },
    { title: "Validation fonctionnelle",                 type: "check",    phase: "post", responsible: "Dev / MOA",        duration: "20min" },
    { title: "Communication de fin de MeP",              type: "notify",   phase: "post", responsible: "Chef de projet",   duration: "5min"  },
  ],
  /* Rang 4 — Standard : Processus standard · risque maîtrisé */
  standard: [
    { title: "Notification de la MeP planifiée",         type: "notify",   phase: "pre",  responsible: "Chef de projet",   duration: "5min"  },
    { title: "Sauvegarde rapide",                        type: "action",   phase: "pre",  responsible: "IT",               duration: "10min" },
    { title: "Déploiement des livrables",                type: "script",   phase: "mep",  responsible: "Dev / IT",         duration: "15min" },
    { title: "Redémarrage des services",                 type: "action",   phase: "mep",  responsible: "IT",               duration: "5min"  },
    { title: "Validation rapide",                        type: "check",    phase: "post", responsible: "Dev / MOA",        duration: "15min" },
    { title: "Communication de fin de MeP",              type: "notify",   phase: "post", responsible: "Chef de projet",   duration: "5min"  },
  ],
};

const inp = (extra = {}) => ({
  background: "#0D1117", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 7,
  color: "#E5E7EB", fontSize: 11, padding: "5px 9px", outline: "none",
  fontFamily: "inherit", boxSizing: "border-box", width: "100%", ...extra,
});

/* ── Composant réutilisable : une étape ── */
function StepRow({ step, idx, total, onToggle, onUpdate, onMove, onDelete, expanded }) {
  const tc = STEP_TYPES[step.type] || STEP_TYPES.action;
  const sc = STEP_STATUS[step.status] || STEP_STATUS.pending;
  return (
    <div style={{ background: "#151B27", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 10, marginBottom: 6, overflow: "hidden" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 12px", cursor: "pointer" }} onClick={onToggle}>
        <span style={{ fontSize: 10, color: "#374151", fontFamily: "monospace", minWidth: 16, textAlign: "right" }}>{idx + 1}</span>
        <tc.Icon size={11} color={tc.color} style={{ flexShrink: 0 }} />
        <span style={{ fontSize: 9, padding: "1px 6px", borderRadius: 5, background: `${tc.color}20`, color: tc.color, fontWeight: 700, flexShrink: 0 }}>{tc.label}</span>
        <input value={step.title}
          onChange={e => { e.stopPropagation(); onUpdate({ title: e.target.value }); }}
          onClick={e => e.stopPropagation()}
          style={{ flex: 1, background: "transparent", border: "none", color: "#E5E7EB", fontSize: 12, fontWeight: 500, outline: "none", minWidth: 0 }} />
        <span
          title="Cliquer pour changer le statut"
          onClick={e => { e.stopPropagation(); const keys = Object.keys(STEP_STATUS); onUpdate({ status: keys[(keys.indexOf(step.status) + 1) % keys.length] }); }}
          style={{ fontSize: 9, padding: "1px 6px", borderRadius: 5, background: `${sc.color}20`, color: sc.color, fontWeight: 600, flexShrink: 0, cursor: "pointer" }}>
          {sc.label}
        </span>
        <div style={{ display: "flex", gap: 1, flexShrink: 0 }} onClick={e => e.stopPropagation()}>
          <button onClick={() => onMove(-1)} disabled={idx === 0} style={{ background: "none", border: "none", color: idx === 0 ? "#1F2937" : "#4B5563", cursor: idx === 0 ? "default" : "pointer", padding: 2, display: "flex" }}><ChevronUp size={12} /></button>
          <button onClick={() => onMove(1)} disabled={idx === total - 1} style={{ background: "none", border: "none", color: idx === total - 1 ? "#1F2937" : "#4B5563", cursor: idx === total - 1 ? "default" : "pointer", padding: 2, display: "flex" }}><ChevronDown size={12} /></button>
          <button onClick={onDelete} style={{ background: "none", border: "none", color: "#374151", cursor: "pointer", padding: 2, display: "flex" }}
            onMouseEnter={e => e.currentTarget.style.color = "#F87171"}
            onMouseLeave={e => e.currentTarget.style.color = "#374151"}>
            <Trash2 size={11} />
          </button>
        </div>
      </div>
      {expanded && (
        <div style={{ borderTop: "1px solid rgba(255,255,255,0.05)", padding: "10px 12px", display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 10 }}>
          <div>
            <label style={{ fontSize: 10, color: "#4B5563", display: "block", marginBottom: 3 }}>Type</label>
            <select value={step.type} onChange={e => onUpdate({ type: e.target.value })} style={{ ...inp({ padding: "4px 7px" }) }}>
              {Object.entries(STEP_TYPES).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
            </select>
          </div>
          <div>
            <label style={{ fontSize: 10, color: "#4B5563", display: "block", marginBottom: 3 }}>Statut</label>
            <select value={step.status} onChange={e => onUpdate({ status: e.target.value })} style={{ ...inp({ padding: "4px 7px", color: STEP_STATUS[step.status]?.color }) }}>
              {Object.entries(STEP_STATUS).map(([k, v]) => <option key={k} value={k} style={{ color: "#E5E7EB" }}>{v.label}</option>)}
            </select>
          </div>
          <div>
            <label style={{ fontSize: 10, color: "#4B5563", display: "block", marginBottom: 3 }}>Responsable</label>
            <input value={step.responsible} onChange={e => onUpdate({ responsible: e.target.value })} placeholder="Équipe / personne…" style={{ ...inp({ padding: "4px 7px" }) }} />
          </div>
          <div>
            <label style={{ fontSize: 10, color: "#4B5563", display: "block", marginBottom: 3 }}>Durée estimée</label>
            <input value={step.duration} onChange={e => onUpdate({ duration: e.target.value })} placeholder="30min, 2h…" style={{ ...inp({ padding: "4px 7px" }) }} />
          </div>
          <div style={{ gridColumn: "1 / -1" }}>
            <label style={{ fontSize: 10, color: "#4B5563", display: "block", marginBottom: 3 }}>Description / Instructions</label>
            <textarea value={step.description} onChange={e => onUpdate({ description: e.target.value })}
              rows={2} placeholder="Détails, commandes, liens utiles…" style={{ ...inp({ resize: "vertical" }) }} />
          </div>
        </div>
      )}
    </div>
  );
}

/* ── Éditeur générique ── */
function GenericEditor({ sel, upd, addStep, delStep, moveStep, updStep, toggleExp, expSteps }) {
  const done = sel.steps.filter(s => s.status === "done").length;
  return (
    <div style={{ flex: 1, overflowY: "auto", padding: "24px 32px 48px" }}>
      <input value={sel.name} onChange={e => upd({ name: e.target.value })}
        style={{ ...inp({ background: "transparent", border: "none", fontSize: 22, fontWeight: 700, color: "#F9FAFB", padding: "0 0 4px" }) }} />
      <div style={{ display: "flex", gap: 10, alignItems: "center", marginTop: 6, marginBottom: 20, flexWrap: "wrap" }}>
        <span style={{ fontSize: 10, color: "#4B5563" }}>Statut :</span>
        <select value={sel.status} onChange={e => upd({ status: e.target.value })}
          style={{ background: "#151B27", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 6, color: WF_STATUS[sel.status]?.color || "#9CA3AF", fontSize: 11, fontWeight: 600, padding: "2px 8px", cursor: "pointer" }}>
          {Object.entries(WF_STATUS).map(([k, v]) => <option key={k} value={k} style={{ color: "#E5E7EB" }}>{v.label}</option>)}
        </select>
        {sel.steps.length > 0 && <span style={{ fontSize: 10, color: "#34D399" }}>{done}/{sel.steps.length} étapes terminées</span>}
        <span style={{ fontSize: 10, color: "#374151", marginLeft: "auto" }}>Modifié {new Date(sel.updatedAt).toLocaleDateString("fr-FR")}</span>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 24 }}>
        <div>
          <label style={{ fontSize: 11, color: "#6B7280", display: "block", marginBottom: 5 }}>Description</label>
          <textarea value={sel.description} onChange={e => upd({ description: e.target.value })} rows={3} placeholder="Objectif et contexte…" style={{ ...inp({ resize: "vertical" }) }} />
        </div>
        <div>
          <label style={{ fontSize: 11, color: "#6B7280", display: "block", marginBottom: 5 }}>Déclencheur</label>
          <textarea value={sel.trigger || ""} onChange={e => upd({ trigger: e.target.value })} rows={3} placeholder="Événement déclencheur…" style={{ ...inp({ resize: "vertical" }) }} />
        </div>
      </div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
        <span style={{ fontSize: 13, fontWeight: 600, color: "#9CA3AF" }}>Étapes <span style={{ color: "#374151", fontWeight: 400 }}>({sel.steps.length})</span></span>
        <button onClick={() => addStep()} style={{ display: "flex", alignItems: "center", gap: 5, padding: "5px 13px", borderRadius: 7, background: "rgba(52,211,153,0.12)", border: "1px solid rgba(52,211,153,0.3)", color: "#34D399", fontSize: 11, fontWeight: 600, cursor: "pointer" }}>
          <Plus size={12} /> Ajouter une étape
        </button>
      </div>
      {sel.steps.length === 0 && (
        <div style={{ textAlign: "center", padding: "36px 0", color: "#374151", fontSize: 12, borderRadius: 10, border: "1px dashed rgba(255,255,255,0.06)" }}>
          Aucune étape — cliquez "Ajouter une étape" pour commencer
        </div>
      )}
      {sel.steps.map((step, idx) => (
        <StepRow key={step.id} step={step} idx={idx} total={sel.steps.length}
          expanded={expSteps.has(step.id)} onToggle={() => toggleExp(step.id)}
          onUpdate={ch => updStep(step.id, ch)} onMove={dir => moveStep(step.id, dir)} onDelete={() => delStep(step.id)} />
      ))}
    </div>
  );
}

/* ── Vue Schéma : encart éditable ── */
function SchemaCard({ step, phMeta, isEditing, onToggleEdit, onUpdate, onDelete }) {
  const tc   = STEP_TYPES[step.type]   || STEP_TYPES.action;
  const sc   = STEP_STATUS[step.status] || STEP_STATUS.pending;
  const isDone = step.status === "done";
  return (
    <div style={{
      background: isDone ? `${phMeta.color}12` : "#0F1520",
      border: `1.5px solid ${isDone ? phMeta.color : isEditing ? `${phMeta.color}60` : "rgba(255,255,255,0.09)"}`,
      borderRadius: 10, padding: "10px 12px",
      boxShadow: isEditing ? `0 0 0 2px ${phMeta.color}22` : "none",
      transition: "border 0.15s, box-shadow 0.15s",
    }}>
      {/* Barre de titre */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 7, gap: 6 }}>
        <span style={{ fontSize: 9, padding: "1px 6px", borderRadius: 4, background: `${tc.color}22`, color: tc.color, fontWeight: 700, flexShrink: 0 }}>{tc.label}</span>
        <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
          <span
            title="Cliquer pour changer le statut"
            onClick={e => { e.stopPropagation(); const keys = Object.keys(STEP_STATUS); onUpdate({ status: keys[(keys.indexOf(step.status)+1)%keys.length] }); }}
            style={{ fontSize: 9, padding: "1px 6px", borderRadius: 4, background: `${sc.color}20`, color: sc.color, fontWeight: 600, cursor: "pointer", flexShrink: 0 }}>
            {sc.label}
          </span>
          <button onClick={e => { e.stopPropagation(); onToggleEdit(); }}
            title={isEditing ? "Réduire" : "Modifier"}
            style={{ background: "none", border: "none", color: isEditing ? phMeta.color : "#374151", cursor: "pointer", padding: "1px 3px", fontSize: 12, lineHeight: 1 }}>
            ✎
          </button>
          <button onClick={e => { e.stopPropagation(); onDelete(); }}
            style={{ background: "none", border: "none", color: "#374151", cursor: "pointer", padding: 1, display: "flex" }}
            onMouseEnter={e => e.currentTarget.style.color="#F87171"}
            onMouseLeave={e => e.currentTarget.style.color="#374151"}>
            <Trash2 size={11} />
          </button>
        </div>
      </div>

      {isEditing ? (
        <div onClick={e => e.stopPropagation()} style={{ display: "flex", flexDirection: "column", gap: 5 }}>
          <input value={step.title} onChange={e => onUpdate({ title: e.target.value })}
            placeholder="Titre de l'action…"
            style={{ ...inp({ padding: "5px 8px", fontSize: 11, fontWeight: 600 }) }} />
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 5 }}>
            <input value={step.responsible} onChange={e => onUpdate({ responsible: e.target.value })}
              placeholder="Responsable…" style={{ ...inp({ padding: "4px 7px", fontSize: 10 }) }} />
            <input value={step.duration} onChange={e => onUpdate({ duration: e.target.value })}
              placeholder="Durée…" style={{ ...inp({ padding: "4px 7px", fontSize: 10 }) }} />
          </div>
          <select value={step.type} onChange={e => onUpdate({ type: e.target.value })}
            style={{ ...inp({ padding: "4px 7px", fontSize: 10 }) }}>
            {Object.entries(STEP_TYPES).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
          </select>
          <textarea value={step.description || ""} onChange={e => onUpdate({ description: e.target.value })}
            rows={2} placeholder="Instructions, commandes, remarques…"
            style={{ ...inp({ padding: "4px 7px", fontSize: 10, resize: "vertical" }) }} />
        </div>
      ) : (
        <div onClick={onToggleEdit} style={{ cursor: "pointer" }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: "#E5E7EB", lineHeight: 1.35, marginBottom: isDone ? 0 : 5, textDecoration: isDone ? "line-through" : "none", opacity: isDone ? 0.6 : 1 }}>
            {step.title}
          </div>
          {(step.responsible || step.duration) && (
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {step.responsible && <span style={{ fontSize: 9, color: "#4B5563" }}>👤 {step.responsible}</span>}
              {step.duration    && <span style={{ fontSize: 9, color: "#374151" }}>⏱ {step.duration}</span>}
            </div>
          )}
          {step.description && (
            <div style={{ fontSize: 9, color: "#374151", marginTop: 4, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{step.description}</div>
          )}
        </div>
      )}
    </div>
  );
}

/* ── Vue Schéma : diagramme de flux fléché ── */
function MepSchema({ sel, updStep, delStep, addStep }) {
  const [editingId, setEditingId] = useState(null);
  const phaseKeys = Object.keys(MEP_PHASES);
  const otherSteps = sel.steps.filter(s => !MEP_PHASES[s.phase]);

  const arrow = (color = "rgba(255,255,255,0.12)") => (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", height: 24, justifyContent: "center" }}>
      <div style={{ width: 1.5, flex: 1, background: color }} />
      <div style={{ width: 0, height: 0, borderLeft: "5px solid transparent", borderRight: "5px solid transparent", borderTop: `7px solid ${color}` }} />
    </div>
  );

  return (
    <div style={{ overflowX: "auto", overflowY: "auto", padding: "24px 28px 48px", height: "100%", boxSizing: "border-box" }}>
      <div style={{ display: "flex", alignItems: "flex-start", gap: 0, minWidth: "max-content" }}>
        {phaseKeys.map((phKey, phIdx) => {
          const phMeta  = MEP_PHASES[phKey];
          const steps   = sel.steps.filter(s => s.phase === phKey);
          const pDone   = steps.filter(s => s.status === "done").length;
          const isLast  = phIdx === phaseKeys.length - 1 && otherSteps.length === 0;

          return (
            <div key={phKey} style={{ display: "flex", alignItems: "flex-start", gap: 0 }}>
              {/* Colonne de phase */}
              <div style={{ width: 255 }}>
                {/* En-tête de phase */}
                <div style={{ background: `${phMeta.color}14`, border: `1px solid ${phMeta.color}35`, borderRadius: "10px 10px 0 0", padding: "10px 14px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
                    <div style={{ width: 3, height: 14, borderRadius: 2, background: phMeta.color }} />
                    <span style={{ fontSize: 11, fontWeight: 700, color: phMeta.color }}>{phMeta.label}</span>
                  </div>
                  <span style={{ fontSize: 10, color: pDone === steps.length && steps.length > 0 ? phMeta.color : "#374151", fontWeight: pDone === steps.length && steps.length > 0 ? 700 : 400 }}>{pDone}/{steps.length}</span>
                </div>
                {/* Corps */}
                <div style={{ border: `1px solid ${phMeta.color}20`, borderTop: "none", borderRadius: "0 0 10px 10px", padding: "12px", minHeight: 100, background: "rgba(0,0,0,0.18)" }}>
                  {steps.map((step, idx) => (
                    <div key={step.id}>
                      <SchemaCard step={step} phMeta={phMeta}
                        isEditing={editingId === step.id}
                        onToggleEdit={() => setEditingId(editingId === step.id ? null : step.id)}
                        onUpdate={ch => updStep(step.id, ch)}
                        onDelete={() => { delStep(step.id); if (editingId === step.id) setEditingId(null); }} />
                      {idx < steps.length - 1 && arrow(`${phMeta.color}60`)}
                    </div>
                  ))}
                  {steps.length === 0 && (
                    <div style={{ color: "#374151", fontSize: 10, textAlign: "center", padding: "16px 0" }}>Aucune étape</div>
                  )}
                  <button onClick={() => addStep(phKey)} style={{ marginTop: steps.length > 0 ? 10 : 0, width: "100%", display: "flex", alignItems: "center", justifyContent: "center", gap: 5, padding: "7px", borderRadius: 8, background: `${phMeta.color}08`, border: `1px dashed ${phMeta.color}35`, color: phMeta.color, fontSize: 10, fontWeight: 600, cursor: "pointer" }}>
                    <Plus size={10} /> Ajouter
                  </button>
                </div>
              </div>

              {/* Flèche de transition entre phases */}
              {!isLast && (
                <div style={{ width: 48, display: "flex", flexDirection: "column", alignItems: "center", paddingTop: 50 }}>
                  <div style={{ display: "flex", alignItems: "center" }}>
                    <div style={{ width: 28, height: 1.5, background: "rgba(255,255,255,0.13)" }} />
                    <div style={{ width: 0, height: 0, borderTop: "5px solid transparent", borderBottom: "5px solid transparent", borderLeft: "8px solid rgba(255,255,255,0.18)" }} />
                  </div>
                </div>
              )}
            </div>
          );
        })}

        {/* Colonne "Autres" si des étapes n'ont pas de phase */}
        {otherSteps.length > 0 && (
          <div style={{ display: "flex", alignItems: "flex-start", gap: 0 }}>
            <div style={{ width: 48, display: "flex", flexDirection: "column", alignItems: "center", paddingTop: 50 }}>
              <div style={{ display: "flex", alignItems: "center" }}>
                <div style={{ width: 28, height: 1.5, background: "rgba(255,255,255,0.08)" }} />
                <div style={{ width: 0, height: 0, borderTop: "5px solid transparent", borderBottom: "5px solid transparent", borderLeft: "8px solid rgba(255,255,255,0.1)" }} />
              </div>
            </div>
            <div style={{ width: 255 }}>
              <div style={{ background: "rgba(75,85,99,0.1)", border: "1px solid rgba(75,85,99,0.25)", borderRadius: "10px 10px 0 0", padding: "10px 14px" }}>
                <span style={{ fontSize: 11, fontWeight: 700, color: "#4B5563" }}>Autres étapes</span>
              </div>
              <div style={{ border: "1px solid rgba(75,85,99,0.15)", borderTop: "none", borderRadius: "0 0 10px 10px", padding: "12px", background: "rgba(0,0,0,0.18)" }}>
                {otherSteps.map((step, idx) => (
                  <div key={step.id}>
                    <SchemaCard step={step} phMeta={{ color: "#4B5563" }}
                      isEditing={editingId === step.id}
                      onToggleEdit={() => setEditingId(editingId === step.id ? null : step.id)}
                      onUpdate={ch => updStep(step.id, ch)}
                      onDelete={() => { delStep(step.id); if (editingId === step.id) setEditingId(null); }} />
                    {idx < otherSteps.length - 1 && arrow("rgba(75,85,99,0.5)")}
                  </div>
                ))}
                <button onClick={() => addStep("")} style={{ marginTop: 10, width: "100%", display: "flex", alignItems: "center", justifyContent: "center", gap: 5, padding: "7px", borderRadius: 8, background: "rgba(75,85,99,0.08)", border: "1px dashed rgba(75,85,99,0.3)", color: "#4B5563", fontSize: 10, cursor: "pointer" }}>
                  <Plus size={10} /> Ajouter
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/* ── Éditeur MeP ── */
function MepEditor({ sel, upd, addStep, delStep, moveStep, updStep, toggleExp, expSteps }) {
  const [mepView, setMepView] = useState("etapes"); // "etapes" | "schema"
  const crit = MEP_CRITICITE[sel.criticite] || MEP_CRITICITE.normal;
  const done = sel.steps.filter(s => s.status === "done").length;
  const pct  = sel.steps.length > 0 ? Math.round((done / sel.steps.length) * 100) : 0;

  const phaseSteps = (ph) => sel.steps.filter(s => s.phase === ph);
  const otherSteps = sel.steps.filter(s => !MEP_PHASES[s.phase]);

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>

      {/* Bandeau criticité + onglets vues */}
      <div style={{ background: crit.bg, borderBottom: `2px solid ${crit.border}`, padding: "12px 28px", display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", flexShrink: 0 }}>
        <Rocket size={16} color={crit.color} />
        <div style={{ flex: 1 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <span style={{ fontSize: 11, fontWeight: 800, color: crit.color, textTransform: "uppercase", letterSpacing: "0.08em" }}>Mise en Production</span>
            <span style={{ fontSize: 11, padding: "2px 10px", borderRadius: 20, background: crit.bg, color: crit.color, fontWeight: 700, border: `1px solid ${crit.border}` }}>{crit.label}</span>
            <span style={{ fontSize: 10, color: `${crit.color}88` }}>{crit.desc}</span>
          </div>
        </div>
        {/* Onglets Étapes / Schéma */}
        <div style={{ display: "flex", gap: 4, background: "rgba(0,0,0,0.25)", borderRadius: 8, padding: 3 }}>
          {[["etapes", "📋 Étapes"], ["schema", "🔀 Schéma"]].map(([k, label]) => (
            <button key={k} onClick={() => setMepView(k)} style={{ padding: "4px 12px", borderRadius: 6, border: "none", fontFamily: "inherit", fontSize: 11, fontWeight: mepView === k ? 700 : 400, cursor: "pointer", background: mepView === k ? crit.bg : "transparent", color: mepView === k ? crit.color : "#6B7280", boxShadow: mepView === k ? `0 0 0 1px ${crit.border}` : "none", transition: "all 0.15s" }}>
              {label}
            </button>
          ))}
        </div>
        <select value={sel.criticite} onChange={e => upd({ criticite: e.target.value })}
          style={{ background: "#0D1117", border: `1px solid ${crit.border}`, borderRadius: 7, color: crit.color, fontSize: 11, fontWeight: 700, padding: "3px 9px", cursor: "pointer" }}>
          {Object.entries(MEP_CRITICITE).map(([k, v]) => <option key={k} value={k} style={{ color: "#E5E7EB" }}>{v.label} — {v.desc}</option>)}
        </select>
        <select value={sel.status} onChange={e => upd({ status: e.target.value })}
          style={{ background: "#0D1117", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 7, color: WF_STATUS[sel.status]?.color || "#9CA3AF", fontSize: 11, fontWeight: 600, padding: "3px 9px", cursor: "pointer" }}>
          {Object.entries(WF_STATUS).map(([k, v]) => <option key={k} value={k} style={{ color: "#E5E7EB" }}>{v.label}</option>)}
        </select>
      </div>

      {/* Vue Schéma — flux fléché */}
      {mepView === "schema" && (
        <MepSchema sel={sel} updStep={updStep} delStep={delStep} addStep={addStep} />
      )}

      {/* Vue Étapes */}
      {mepView === "etapes" && (
      <div style={{ flex: 1, overflowY: "auto", padding: "0 0 48px" }}>
      <div style={{ padding: "18px 28px 0" }}>

        {/* Titre */}
        <input value={sel.name} onChange={e => upd({ name: e.target.value })}
          style={{ ...inp({ background: "transparent", border: "none", fontSize: 20, fontWeight: 700, color: "#F9FAFB", padding: "0 0 2px", marginBottom: 16 }) }} />

        {/* Méta-données MeP */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12, marginBottom: 20, padding: "16px", background: "rgba(255,255,255,0.02)", borderRadius: 12, border: "1px solid rgba(255,255,255,0.06)" }}>
          {[
            [Calendar, "Date prévisionnelle", "datePrevisionnelle", "date", "AAAA-MM-JJ"],
            [Package, "Livrable / version",   "livrable",           "text", "v1.2.0 — correctif #123"],
            [User,    "Chef de projet",        "chefDeProjet",       "text", "Prénom NOM"],
            [Layers,  "Application",           "application",        "text", "Nom de l'application"],
            [Terminal,"Environnement",         "environnement",      "text", "Production"],
            [GitBranch,"Description",          "description",        "text", "Objet de la MeP…"],
          ].map(([Icon, label, key, type, ph]) => (
            <div key={key}>
              <label style={{ fontSize: 10, color: "#4B5563", display: "flex", alignItems: "center", gap: 4, marginBottom: 4 }}>
                <Icon size={10} />{label}
              </label>
              <input type={type} value={sel[key] || ""} onChange={e => upd({ [key]: e.target.value })}
                placeholder={ph} style={{ ...inp({ padding: "5px 8px" }) }} />
            </div>
          ))}
        </div>

        {/* Barre de progression globale */}
        <div style={{ marginBottom: 24 }}>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 5, fontSize: 11 }}>
            <span style={{ color: "#6B7280" }}>Progression globale</span>
            <span style={{ color: pct === 100 ? "#34D399" : crit.color, fontWeight: 700 }}>{done}/{sel.steps.length} étapes · {pct}%</span>
          </div>
          <div style={{ height: 6, borderRadius: 3, background: "rgba(255,255,255,0.06)" }}>
            <div style={{ width: `${pct}%`, height: "100%", borderRadius: 3, background: pct === 100 ? "#34D399" : crit.color, transition: "width 0.5s ease" }} />
          </div>
          <div style={{ display: "flex", gap: 16, marginTop: 8 }}>
            {Object.entries(MEP_PHASES).map(([ph, pm]) => {
              const pSteps = phaseSteps(ph);
              const pDone  = pSteps.filter(s => s.status === "done").length;
              return (
                <div key={ph} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 10, color: "#4B5563" }}>
                  <div style={{ width: 8, height: 8, borderRadius: 2, background: pm.color, opacity: 0.7 }} />
                  <span style={{ color: pm.color, fontWeight: 600 }}>{pm.label}</span>
                  <span>{pDone}/{pSteps.length}</span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Étapes groupées par phase */}
        {Object.entries(MEP_PHASES).map(([phKey, phMeta]) => {
          const steps = phaseSteps(phKey);
          const phDone = steps.filter(s => s.status === "done").length;
          return (
            <div key={phKey} style={{ marginBottom: 20 }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <div style={{ width: 3, height: 16, borderRadius: 2, background: phMeta.color }} />
                  <span style={{ fontSize: 12, fontWeight: 700, color: phMeta.color }}>{phMeta.label}</span>
                  <span style={{ fontSize: 10, color: "#374151" }}>{phDone}/{steps.length}</span>
                </div>
                <button onClick={() => addStep(phKey)} style={{ display: "flex", alignItems: "center", gap: 4, padding: "3px 10px", borderRadius: 6, background: `${phMeta.color}12`, border: `1px solid ${phMeta.color}30`, color: phMeta.color, fontSize: 10, fontWeight: 600, cursor: "pointer" }}>
                  <Plus size={10} /> Ajouter
                </button>
              </div>
              {steps.length === 0 && (
                <div style={{ textAlign: "center", padding: "14px", color: "#374151", fontSize: 11, borderRadius: 8, border: "1px dashed rgba(255,255,255,0.05)" }}>
                  Aucune étape dans cette phase
                </div>
              )}
              {steps.map(step => {
                const idx = sel.steps.indexOf(step);
                return (
                  <StepRow key={step.id} step={step} idx={idx} total={sel.steps.length}
                    expanded={expSteps.has(step.id)} onToggle={() => toggleExp(step.id)}
                    onUpdate={ch => updStep(step.id, ch)} onMove={dir => moveStep(step.id, dir)} onDelete={() => delStep(step.id)} />
                );
              })}
            </div>
          );
        })}

        {/* Étapes sans phase */}
        {otherSteps.length > 0 && (
          <div style={{ marginBottom: 20 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
              <span style={{ fontSize: 12, fontWeight: 600, color: "#4B5563" }}>Autres étapes</span>
              <button onClick={() => addStep("")} style={{ display: "flex", alignItems: "center", gap: 4, padding: "3px 10px", borderRadius: 6, background: "rgba(75,85,99,0.12)", border: "1px solid rgba(75,85,99,0.3)", color: "#6B7280", fontSize: 10, cursor: "pointer" }}>
                <Plus size={10} /> Ajouter
              </button>
            </div>
            {otherSteps.map(step => {
              const idx = sel.steps.indexOf(step);
              return (
                <StepRow key={step.id} step={step} idx={idx} total={sel.steps.length}
                  expanded={expSteps.has(step.id)} onToggle={() => toggleExp(step.id)}
                  onUpdate={ch => updStep(step.id, ch)} onMove={dir => moveStep(step.id, dir)} onDelete={() => delStep(step.id)} />
              );
            })}
          </div>
        )}
      </div>
      </div>
      )}
    </div>
  );
}

/* ── Composant principal ── */
export default function WorkflowEditor() {
  const [wfs, setWfs]           = useState(() => loadWorkflows());
  const [selId, setSelId]       = useState(null);
  const [expSteps, setExpSteps] = useState(new Set());
  const [filterType, setFilter] = useState("all");
  const [mepPicker, setMepPicker] = useState(false);

  const persist = (list) => { setWfs(list); saveWorkflows(list); };
  const sel = wfs.find(w => w.id === selId);

  const newGenericWf = () => {
    const w = makeWorkflow({ wfType: "generic" });
    persist([w, ...wfs]);
    setSelId(w.id);
    setMepPicker(false);
  };

  const newMepWf = (criticite) => {
    const crit  = MEP_CRITICITE[criticite];
    const steps = (MEP_TEMPLATES[criticite] || []).map(data => makeStep(data));
    const w = makeWorkflow({
      wfType: "mep", criticite, steps,
      name: `MeP ${crit.label} — ${new Date().toLocaleDateString("fr-FR")}`,
      environnement: "Production",
    });
    persist([w, ...wfs]);
    setSelId(w.id);
    setMepPicker(false);
    setExpSteps(new Set());
  };

  const delWf = (id, e) => {
    e.stopPropagation();
    if (!window.confirm("Supprimer ce workflow ?")) return;
    persist(wfs.filter(w => w.id !== id));
    if (selId === id) setSelId(null);
  };

  const upd = (changes) =>
    persist(wfs.map(w => w.id === selId ? { ...w, ...changes, updatedAt: new Date().toISOString() } : w));

  const addStep = (phase = "") => {
    if (!sel) return;
    const s = makeStep({ phase });
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

  const mepCount     = wfs.filter(w => w.wfType === "mep").length;
  const genericCount = wfs.filter(w => w.wfType !== "mep").length;
  const filtered     = wfs.filter(w =>
    filterType === "mep" ? w.wfType === "mep" : filterType === "generic" ? w.wfType !== "mep" : true);

  return (
    <div style={{ display: "flex", height: "100%", background: "#0B0F19", color: "#F3F4F6", fontFamily: "'Inter', sans-serif" }}>

      {/* ── PANNEAU GAUCHE ── */}
      <div style={{ width: 295, minWidth: 295, borderRight: "1px solid rgba(255,255,255,0.07)", display: "flex", flexDirection: "column", background: "#0D1117" }}>

        {/* En-tête + boutons créer */}
        <div style={{ padding: "14px 12px 10px", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 10 }}>
            <GitBranch size={14} color="#818CF8" />
            <span style={{ fontSize: 13, fontWeight: 700 }}>Workflows</span>
            <span style={{ fontSize: 10, padding: "1px 6px", borderRadius: 8, background: "rgba(129,140,248,0.15)", color: "#818CF8", fontWeight: 700 }}>{wfs.length}</span>
          </div>
          <div style={{ display: "flex", gap: 6 }}>
            <button onClick={newGenericWf} style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 4, padding: "6px 0", borderRadius: 8, background: "rgba(99,102,241,0.12)", border: "1px solid rgba(99,102,241,0.3)", color: "#818CF8", fontSize: 11, fontWeight: 600, cursor: "pointer" }}>
              <Plus size={11} /> Générique
            </button>
            <button onClick={() => setMepPicker(p => !p)} style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 4, padding: "6px 0", borderRadius: 8, background: mepPicker ? "rgba(248,113,113,0.15)" : "rgba(251,191,36,0.1)", border: `1px solid ${mepPicker ? "rgba(248,113,113,0.4)" : "rgba(251,191,36,0.28)"}`, color: mepPicker ? "#F87171" : "#FBBF24", fontSize: 11, fontWeight: 600, cursor: "pointer" }}>
              <Rocket size={11} /> Mise en Prod
            </button>
          </div>

          {/* Sélecteur de criticité */}
          {mepPicker && (
            <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 4 }}>
              <div style={{ fontSize: 10, color: "#4B5563", marginBottom: 2 }}>Choisir la criticité :</div>
              {Object.entries(MEP_CRITICITE).map(([k, v]) => (
                <button key={k} onClick={() => newMepWf(k)} style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 10px", borderRadius: 8, background: v.bg, border: `1px solid ${v.border}`, color: v.color, fontSize: 11, fontWeight: 600, cursor: "pointer", textAlign: "left" }}>
                  <AlertTriangle size={11} style={{ flexShrink: 0 }} />
                  <div style={{ flex: 1 }}>
                    <div>{v.label}</div>
                    <div style={{ fontSize: 9, color: `${v.color}88`, fontWeight: 400, marginTop: 1 }}>{v.desc}</div>
                  </div>
                  <ChevronRight size={11} opacity={0.5} />
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Onglets filtre */}
        <div style={{ display: "flex", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
          {[["all", "Tous", wfs.length], ["mep", "MeP", mepCount], ["generic", "Génériques", genericCount]].map(([k, label, count]) => (
            <button key={k} onClick={() => setFilter(k)} style={{ flex: 1, padding: "8px 4px", border: "none", background: "none", borderBottom: `2px solid ${filterType === k ? "#818CF8" : "transparent"}`, color: filterType === k ? "#818CF8" : "#4B5563", fontSize: 10, fontWeight: filterType === k ? 700 : 400, cursor: "pointer" }}>
              {label} <span style={{ fontSize: 9, opacity: 0.7 }}>{count}</span>
            </button>
          ))}
        </div>

        {/* Liste */}
        <div style={{ flex: 1, overflowY: "auto", padding: "6px 8px" }}>
          {filtered.length === 0 && (
            <div style={{ textAlign: "center", color: "#374151", padding: "40px 16px", fontSize: 12 }}>
              Aucun workflow.<br />Créez le premier.
            </div>
          )}
          {filtered.map(w => {
            const sc   = WF_STATUS[w.status] || WF_STATUS.draft;
            const crit = w.wfType === "mep" ? MEP_CRITICITE[w.criticite] : null;
            const done = w.steps.filter(s => s.status === "done").length;
            const isAct = w.id === selId;
            return (
              <div key={w.id} onClick={() => setSelId(w.id)} style={{ padding: "9px 10px", borderRadius: 9, marginBottom: 4, cursor: "pointer", background: isAct ? (crit ? `${crit.color}12` : "rgba(99,102,241,0.12)") : "transparent", border: `1px solid ${isAct ? (crit ? crit.border : "rgba(99,102,241,0.3)") : "transparent"}`, transition: "all 0.15s" }}
                onMouseEnter={e => { if (!isAct) e.currentTarget.style.background = "rgba(255,255,255,0.04)"; }}
                onMouseLeave={e => { if (!isAct) e.currentTarget.style.background = "transparent"; }}>
                <div style={{ display: "flex", alignItems: "flex-start", gap: 6, justifyContent: "space-between" }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 5, marginBottom: 4 }}>
                      {w.wfType === "mep"
                        ? <Rocket size={10} color={crit?.color || "#FBBF24"} style={{ flexShrink: 0 }} />
                        : <GitBranch size={10} color="#6B7280" style={{ flexShrink: 0 }} />}
                      <span style={{ fontSize: 12, fontWeight: isAct ? 600 : 400, color: isAct ? "#E5E7EB" : "#9CA3AF", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{w.name}</span>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 5, flexWrap: "wrap" }}>
                      {crit && <span style={{ fontSize: 9, padding: "1px 6px", borderRadius: 6, background: crit.bg, color: crit.color, fontWeight: 700, border: `1px solid ${crit.border}` }}>{crit.label}</span>}
                      <span style={{ fontSize: 9, padding: "1px 5px", borderRadius: 5, background: `${sc.color}20`, color: sc.color, fontWeight: 600 }}>{sc.label}</span>
                      {w.steps.length > 0 && <span style={{ fontSize: 9, color: "#374151" }}>{done}/{w.steps.length} ✓</span>}
                    </div>
                  </div>
                  <button onClick={e => delWf(w.id, e)} style={{ background: "none", border: "none", color: "#374151", cursor: "pointer", padding: 2, flexShrink: 0, display: "flex" }}
                    onMouseEnter={e => e.currentTarget.style.color = "#F87171"}
                    onMouseLeave={e => e.currentTarget.style.color = "#374151"}>
                    <Trash2 size={11} />
                  </button>
                </div>
                {w.steps.length > 0 && (
                  <div style={{ marginTop: 6, height: 2, borderRadius: 2, background: "rgba(255,255,255,0.04)" }}>
                    <div style={{ width: `${Math.round((done / w.steps.length) * 100)}%`, height: "100%", borderRadius: 2, background: crit?.color || "#818CF8", transition: "width 0.4s" }} />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* ── PANNEAU DROIT ── */}
      {!sel ? (
        <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <div style={{ textAlign: "center", color: "#374151" }}>
            <GitBranch size={44} color="#1F2937" style={{ marginBottom: 14 }} />
            <div style={{ fontSize: 14, marginBottom: 6 }}>Sélectionnez ou créez un workflow</div>
            <div style={{ fontSize: 11, color: "#4B5563" }}>Workflows génériques ou procédures de Mise en Production</div>
          </div>
        </div>
      ) : sel.wfType === "mep" ? (
        <MepEditor sel={sel} upd={upd} addStep={addStep} delStep={delStep} moveStep={moveStep} updStep={updStep} toggleExp={toggleExp} expSteps={expSteps} />
      ) : (
        <GenericEditor sel={sel} upd={upd} addStep={addStep} delStep={delStep} moveStep={moveStep} updStep={updStep} toggleExp={toggleExp} expSteps={expSteps} />
      )}
    </div>
  );
}
