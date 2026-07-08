import { useState, useMemo, useSyncExternalStore } from "react";
import { Terminal, Download, Copy, CheckCircle, Server, Filter } from "lucide-react";
import { getServers, subscribeServers } from "../utils/servers";
import { loadVpsAgents } from "../utils/vpsAgents";

const PORT = 9099;

function isWindows(s) {
  return /windows/i.test(s.os || "");
}
function isLinux(s) {
  return !isWindows(s) && (s.ip || s.name);
}

function CodeBlock({ code, filename }) {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    navigator.clipboard.writeText(code).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000); });
  };
  const blob = new Blob([code], { type: "text/plain" });
  const url  = URL.createObjectURL(blob);
  return (
    <div style={{ position: "relative", borderRadius: 10, overflow: "hidden", border: "1px solid rgba(255,255,255,0.08)" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "7px 14px", background: "rgba(255,255,255,0.04)", borderBottom: "1px solid rgba(255,255,255,0.07)" }}>
        <span style={{ fontSize: 11, color: "#6B7280", fontFamily: "monospace" }}>{filename}</span>
        <div style={{ display: "flex", gap: 6 }}>
          <button onClick={copy} style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 10, padding: "3px 10px", borderRadius: 6, background: copied ? "rgba(52,211,153,0.15)" : "rgba(255,255,255,0.06)", border: `1px solid ${copied ? "rgba(52,211,153,0.35)" : "rgba(255,255,255,0.1)"}`, color: copied ? "#34D399" : "#9CA3AF", cursor: "pointer" }}>
            {copied ? <CheckCircle size={10} /> : <Copy size={10} />} {copied ? "Copié !" : "Copier"}
          </button>
          <a href={url} download={filename} style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 10, padding: "3px 10px", borderRadius: 6, background: "rgba(99,102,241,0.12)", border: "1px solid rgba(99,102,241,0.3)", color: "#818CF8", textDecoration: "none" }}>
            <Download size={10} /> Télécharger
          </a>
        </div>
      </div>
      <pre style={{ margin: 0, padding: "12px 14px", fontSize: 10, color: "#9CA3AF", fontFamily: "'JetBrains Mono', monospace", overflowX: "auto", maxHeight: 320, background: "#0B0F19", lineHeight: 1.6 }}>
        {code}
      </pre>
    </div>
  );
}

export default function AgentDeployMass({ servers: propServers }) {
  const storeServers = useSyncExternalStore(subscribeServers, getServers);
  const servers    = propServers || storeServers;
  const vpsAgents  = loadVpsAgents();
  const configuredUrls = new Set(vpsAgents.map(a => (a.url || "").replace(/\/+$/, "")));

  const [osFilter, setOsFilter]     = useState("all");
  const [sshUser, setSshUser]       = useState("root");
  const [winUser, setWinUser]       = useState("Administrateur");
  const [agentPort, setAgentPort]   = useState(String(PORT));
  const [sshKey, setSshKey]         = useState("~/.ssh/id_rsa");
  const [g1Ip, setG1Ip]             = useState("");
  const [bastionHost, setBastionHost] = useState("");
  const [bastionUser, setBastionUser] = useState("root");
  const [tab, setTab]               = useState("bash");

  const hasBastion = bastionHost.trim() !== "";
  const jumpArg    = hasBastion ? ` -J "${bastionUser}@${bastionHost}"` : "";
  const scpJumpArg = hasBastion ? ` -o "ProxyJump=${bastionUser}@${bastionHost}"` : "";

  const linuxServers   = useMemo(() => servers.filter(s => isLinux(s) && s.ip), [servers]);
  const windowsServers = useMemo(() => servers.filter(s => isWindows(s) && s.ip), [servers]);

  const shownLinux   = osFilter !== "windows" ? linuxServers   : [];
  const shownWindows = osFilter !== "linux"   ? windowsServers : [];

  /* ── Génération script Bash Linux (SSH loop) ── */
  const bashScript = useMemo(() => {
    if (linuxServers.length === 0) return "# Aucun serveur Linux avec IP dans l'inventaire";
    const ips = linuxServers.map(s => `  "${s.ip}"  # ${s.name}`).join("\n");
    const bastionLine = hasBastion
      ? `BASTION_USER="${bastionUser}"
BASTION_HOST="${bastionHost}"
SSH_JUMP="-J $BASTION_USER@$BASTION_HOST"`
      : `# Pas de bastion — exécutez ce script depuis un hôte avec accès SSH direct`;
    const sshCmd  = hasBastion ? `ssh -i "$SSH_KEY" $SSH_JUMP -o StrictHostKeyChecking=no` : `ssh -i "$SSH_KEY" -o StrictHostKeyChecking=no`;
    const scpCmd  = hasBastion ? `scp -i "$SSH_KEY" -o "ProxyJump=$BASTION_USER@$BASTION_HOST" -o StrictHostKeyChecking=no` : `scp -i "$SSH_KEY" -o StrictHostKeyChecking=no`;
    return `#!/bin/bash
# G1Oeil — Déploiement agent Linux en masse
# Prérequis : SSH sans mot de passe configuré (clé ${sshKey})${hasBastion ? `
# Bastion   : ${bastionUser}@${bastionHost} — accès SSH depuis ce poste requis` : ""}
# Usage     : chmod +x deploy-linux.sh && ./deploy-linux.sh

SSH_USER="${sshUser}"
SSH_KEY="${sshKey}"
AGENT_PORT="${agentPort}"
G1_IP="${g1Ip || "IP_G1OEIL"}"
REMOTE_DIR="/opt/g1oeil"
${bastionLine}

SERVERS=(
${ips}
)

for IP in "\${SERVERS[@]}"; do
  echo ">>> Déploiement sur $IP"

  # Créer répertoire distant
  ${sshCmd} "$SSH_USER@$IP" "mkdir -p $REMOTE_DIR"

  # Copier l'agent
  ${scpCmd} vps-agent-linux.py "$SSH_USER@$IP:$REMOTE_DIR/"

  # Copier le service systemd
  ${scpCmd} vps-agent.service "$SSH_USER@$IP:/etc/systemd/system/"

  # Configurer et démarrer le service
  ${sshCmd} "$SSH_USER@$IP" "\\
    sed -i 's|/opt/g1oeil/vps-agent.py|$REMOTE_DIR/vps-agent-linux.py|g' /etc/systemd/system/vps-agent.service && \\
    sed -i 's|9099|$AGENT_PORT|g' /etc/systemd/system/vps-agent.service && \\
    systemctl daemon-reload && \\
    systemctl enable --now vps-agent && \\
    ufw allow from $G1_IP to any port $AGENT_PORT proto tcp 2>/dev/null || firewall-cmd --add-port=$AGENT_PORT/tcp --permanent 2>/dev/null || true && \\
    echo 'OK: '\$IP"

  if [ $? -eq 0 ]; then
    echo "    ✓ $IP — agent démarré"
  else
    echo "    ✗ $IP — ÉCHEC"
  fi
done

echo ""
echo "Déploiement terminé. Vérifiez les agents dans G1Oeil > Serveurs > Agents VPS."
`;
  }, [linuxServers, sshUser, sshKey, agentPort, g1Ip, hasBastion, bastionUser, bastionHost]);

  /* ── Génération script Ansible ── */
  const ansibleInventory = useMemo(() => {
    const linuxLines   = linuxServers.map(s =>
      `${s.name} ansible_host=${s.ip} ansible_user=${sshUser}`
    ).join("\n");
    const windowsLines = windowsServers.map(s =>
      `${s.name} ansible_host=${s.ip} ansible_user=${winUser} ansible_connection=winrm ansible_winrm_transport=basic`
    ).join("\n");
    const jumpLine = hasBastion
      ? `\nansible_ssh_common_args='-o StrictHostKeyChecking=no -o ProxyCommand="ssh -W %h:%p -q ${bastionUser}@${bastionHost}"'`
      : "";
    return `[linux]
${linuxLines || "# Aucun serveur Linux avec IP"}${jumpLine}

[windows]
${windowsLines || "# Aucun serveur Windows avec IP"}
`;
  }, [linuxServers, windowsServers, sshUser, winUser, bastionHost, bastionUser]);

  const ansiblePlaybook = useMemo(() => `---
- name: Déploiement agent G1Oeil Linux
  hosts: linux
  become: yes
  vars:
    agent_port: ${agentPort}
    g1_ip: "${g1Ip || "IP_G1OEIL"}"
  tasks:
    - name: Créer répertoire /opt/g1oeil
      file: path=/opt/g1oeil state=directory

    - name: Copier vps-agent-linux.py
      copy: src=vps-agent-linux.py dest=/opt/g1oeil/vps-agent-linux.py mode=0755

    - name: Copier service systemd
      copy: src=vps-agent.service dest=/etc/systemd/system/vps-agent.service

    - name: Activer et démarrer le service
      systemd: name=vps-agent enabled=yes state=started daemon_reload=yes

    - name: Autoriser le port {{ agent_port }} depuis G1Oeil (ufw)
      ufw: rule=allow port="{{ agent_port }}" proto=tcp src="{{ g1_ip }}"
      ignore_errors: yes

- name: Déploiement agent G1Oeil Windows
  hosts: windows
  vars:
    agent_port: ${agentPort}
  tasks:
    - name: Créer répertoire C:\\G1Oeil
      win_file: path=C:\\G1Oeil state=directory

    - name: Copier vps-agent-windows.py
      win_copy: src=vps-agent-windows.py dest=C:\\G1Oeil\\vps-agent-windows.py

    - name: Créer tâche planifiée Windows
      win_scheduled_task:
        name: G1OeilAgent
        description: Agent de supervision G1Oeil
        actions:
          - path: python
            arguments: C:\\G1Oeil\\vps-agent-windows.py {{ agent_port }}
        triggers:
          - type: boot
        state: present
        enabled: yes
        run_level: highest
`, [agentPort, g1Ip]);

  /* ── Génération script PowerShell Windows (WinRM) ── */
  const psScript = useMemo(() => {
    if (windowsServers.length === 0) return "# Aucun serveur Windows avec IP dans l'inventaire";
    const ips = windowsServers.map(s => `  "${s.ip}"  # ${s.name}`).join("\n");
    const bastionBlock = hasBastion ? `
# ── Tunnel SSH via bastion ──────────────────────────────────────────────────
# Ce script utilise un tunnel SSH vers chaque cible via ${bastionUser}@${bastionHost}.
# Lancez d'abord un tunnel pour chaque IP cible :
#   ssh -L 5985:IP_CIBLE:5985 ${bastionUser}@${bastionHost}
# Puis remplacez les IPs dans \$Servers par "localhost" et ajustez les ports.
# Alternative : utilisez le script Bash + Ansible depuis un hôte Linux avec ProxyJump.
# ────────────────────────────────────────────────────────────────────────────
` : "";
    return `# G1Oeil — Déploiement agent Windows en masse (WinRM)
# Prérequis : WinRM activé sur les serveurs cibles
#             Enable-PSRemoting -Force  (à exécuter sur chaque cible une fois)
# Usage     : powershell -ExecutionPolicy Bypass -File deploy-windows.ps1
${bastionBlock}
param(
    [string]$WinUser = "${winUser}",
    [int]   $AgentPort = ${agentPort},
    [string]$G1Ip = "${g1Ip || "IP_G1OEIL"}"
)

$AgentSrc = Join-Path $PSScriptRoot "vps-agent-windows.py"
$Credential = Get-Credential -UserName $WinUser -Message "Mot de passe administrateur cibles"

$Servers = @(
${ips}
)

foreach ($IP in $Servers) {
    Write-Host ">>> Déploiement sur $IP" -ForegroundColor Cyan
    try {
        $Session = New-PSSession -ComputerName $IP -Credential $Credential -ErrorAction Stop

        Invoke-Command -Session $Session -ScriptBlock {
            param($Port, $G1)
            New-Item -ItemType Directory -Path "C:\\G1Oeil" -Force | Out-Null
            # Règle firewall
            netsh advfirewall firewall add rule name="G1Oeil Agent" dir=in action=allow protocol=TCP localport=$Port remoteip=$G1 | Out-Null
        } -ArgumentList $AgentPort, $G1Ip

        Copy-Item -Path $AgentSrc -Destination "C:\\G1Oeil\\vps-agent-windows.py" -ToSession $Session -Force

        Invoke-Command -Session $Session -ScriptBlock {
            param($Port)
            $Action  = New-ScheduledTaskAction -Execute "python" -Argument "C:\\G1Oeil\\vps-agent-windows.py $Port"
            $Trigger = New-ScheduledTaskTrigger -AtStartup
            $Settings = New-ScheduledTaskSettingsSet -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 1)
            Register-ScheduledTask -TaskName "G1OeilAgent" -Action $Action -Trigger $Trigger -Settings $Settings -RunLevel Highest -Force | Out-Null
            Start-ScheduledTask -TaskName "G1OeilAgent"
        } -ArgumentList $AgentPort

        Remove-PSSession $Session
        Write-Host "    ✓ $IP — agent démarré" -ForegroundColor Green
    } catch {
        Write-Host "    ✗ $IP — ÉCHEC : $_" -ForegroundColor Red
    }
}

Write-Host ""
Write-Host "Déploiement terminé. Vérifiez les agents dans G1Oeil > Serveurs > Agents VPS." -ForegroundColor Cyan
`;
  }, [windowsServers, winUser, agentPort, g1Ip, hasBastion, bastionUser, bastionHost]);

  const TABS = [
    { id: "bash",    label: `Bash SSH — Linux (${linuxServers.length})`,    disabled: linuxServers.length === 0 },
    { id: "ps1",     label: `PowerShell WinRM — Windows (${windowsServers.length})`, disabled: windowsServers.length === 0 },
    { id: "ansible", label: `Ansible (${linuxServers.length + windowsServers.length})`, disabled: linuxServers.length + windowsServers.length === 0 },
  ];

  const inp = { background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 7, color: "#E5E7EB", fontSize: 11, padding: "5px 9px", outline: "none", fontFamily: "'JetBrains Mono', monospace", width: 160 };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20, maxWidth: 900 }}>

      {/* Stats */}
      <div style={{ display: "flex", gap: 12 }}>
        {[
          { label: "Serveurs total", value: servers.length, color: "#818CF8" },
          { label: "Linux (avec IP)", value: linuxServers.length, color: "#34D399" },
          { label: "Windows (avec IP)", value: windowsServers.length, color: "#60A5FA" },
          { label: "Agents configurés", value: vpsAgents.length, color: "#FBBF24" },
        ].map(({ label, value, color }) => (
          <div key={label} style={{ flex: 1, textAlign: "center", padding: "12px 8px", background: "rgba(255,255,255,0.025)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 12 }}>
            <div style={{ fontSize: 24, fontWeight: 800, color, fontFamily: "monospace" }}>{value}</div>
            <div style={{ fontSize: 10, color: "#6B7280", marginTop: 3 }}>{label}</div>
          </div>
        ))}
      </div>

      {/* Paramètres */}
      <div style={{ background: "rgba(255,255,255,0.025)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 14, padding: "16px 20px" }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: "#9CA3AF", marginBottom: 14, display: "flex", alignItems: "center", gap: 7 }}>
          <Filter size={13} /> Paramètres de déploiement
        </div>
        <div style={{ display: "flex", gap: 16, flexWrap: "wrap", alignItems: "center" }}>
          {[
            { label: "Utilisateur SSH (Linux)", value: sshUser,   set: setSshUser },
            { label: "Clé SSH",                 value: sshKey,    set: setSshKey,  w: 200 },
            { label: "Utilisateur WinRM",        value: winUser,   set: setWinUser },
            { label: "Port agent",               value: agentPort, set: setAgentPort, w: 90 },
            { label: "IP G1Oeil (firewall)",     value: g1Ip,      set: setG1Ip, placeholder: "ex: 192.168.1.10" },
          ].map(({ label, value, set, w, placeholder }) => (
            <label key={label} style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              <span style={{ fontSize: 10, color: "#6B7280", textTransform: "uppercase", letterSpacing: "0.05em" }}>{label}</span>
              <input value={value} onChange={e => set(e.target.value)} placeholder={placeholder || ""} style={{ ...inp, width: w || 160 }} />
            </label>
          ))}
        </div>
        <p style={{ fontSize: 10, color: "#374151", marginTop: 12, lineHeight: 1.7 }}>
          <strong style={{ color: "#4B5563" }}>Prérequis Linux</strong> : accès SSH par clé depuis le poste qui exécute le script vers les cibles{hasBastion ? " via le bastion" : ""}.
          &nbsp;Copiez votre clé : <code style={{ color: "#34D399" }}>ssh-copy-id -i {sshKey}.pub {sshUser}@IP_CIBLE</code><br />
          {hasBastion && <><strong style={{ color: "#818CF8" }}>Bastion</strong> : le poste d'exécution doit pouvoir joindre <code style={{ color: "#818CF8" }}>{bastionUser}@{bastionHost}</code> par SSH. Les cibles n'ont pas besoin d'être joignables directement.<br /></>}
          <strong style={{ color: "#4B5563" }}>Prérequis Windows</strong> : WinRM activé —
          <code style={{ color: "#60A5FA" }}> winrm quickconfig</code> ou
          <code style={{ color: "#60A5FA" }}> Enable-PSRemoting -Force</code> sur chaque cible.
          {hasBastion && <> Pour WinRM via bastion : utilisez un tunnel SSH — <code style={{ color: "#60A5FA" }}>ssh -L 5985:IP_CIBLE:5985 {bastionUser}@{bastionHost}</code> puis pointez le script sur <code style={{ color: "#60A5FA" }}>localhost</code>.</>}
        </p>
      </div>

      {/* Onglets scripts */}
      <div style={{ background: "rgba(255,255,255,0.025)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 14, overflow: "hidden" }}>
        <div style={{ display: "flex", borderBottom: "1px solid rgba(255,255,255,0.07)", background: "rgba(255,255,255,0.01)" }}>
          {TABS.map(t => (
            <button key={t.id} onClick={() => !t.disabled && setTab(t.id)} disabled={t.disabled} style={{
              padding: "10px 18px", fontSize: 11, fontWeight: tab === t.id ? 700 : 400,
              color: t.disabled ? "#374151" : tab === t.id ? "#818CF8" : "#6B7280",
              background: "transparent", border: "none",
              borderBottom: tab === t.id ? "2px solid #818CF8" : "2px solid transparent",
              cursor: t.disabled ? "default" : "pointer",
            }}>{t.label}</button>
          ))}
        </div>

        <div style={{ padding: 16 }}>
          {tab === "bash" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <p style={{ fontSize: 11, color: "#6B7280", margin: 0 }}>
                Script à exécuter depuis votre poste G1Oeil. Copiez d'abord <code style={{ color: "#34D399" }}>vps-agent-linux.py</code> et <code style={{ color: "#34D399" }}>vps-agent.service</code> dans le même répertoire.
              </p>
              <CodeBlock code={bashScript} filename="deploy-linux.sh" />
            </div>
          )}
          {tab === "ps1" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <p style={{ fontSize: 11, color: "#6B7280", margin: 0 }}>
                Script à exécuter depuis un poste Windows avec WinRM. Copiez d'abord <code style={{ color: "#60A5FA" }}>vps-agent-windows.py</code> dans le même répertoire.
              </p>
              <CodeBlock code={psScript} filename="deploy-windows.ps1" />
            </div>
          )}
          {tab === "ansible" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <p style={{ fontSize: 11, color: "#6B7280", margin: 0 }}>
                Placez ces deux fichiers dans un répertoire avec <code style={{ color: "#818CF8" }}>vps-agent-linux.py</code>, <code style={{ color: "#818CF8" }}>vps-agent-windows.py</code> et <code style={{ color: "#818CF8" }}>vps-agent.service</code>. Lancez : <code style={{ color: "#818CF8" }}>ansible-playbook -i inventory.ini playbook.yml</code>
              </p>
              <CodeBlock code={ansibleInventory} filename="inventory.ini" />
              <CodeBlock code={ansiblePlaybook} filename="playbook.yml" />
            </div>
          )}
        </div>
      </div>

      {/* Note serveurs sans IP */}
      {servers.filter(s => !s.ip).length > 0 && (
        <div style={{ padding: "10px 16px", borderRadius: 10, background: "rgba(251,191,36,0.06)", border: "1px solid rgba(251,191,36,0.2)", fontSize: 11, color: "#FBBF24" }}>
          ⚠ {servers.filter(s => !s.ip).length} serveur(s) sans IP — non inclus dans les scripts. Complétez la colonne IP dans votre Excel et réimportez.
        </div>
      )}
    </div>
  );
}
