# G1Oeil Agent Windows - Script d'installation
# Lancer en tant qu'Administrateur : powershell -ExecutionPolicy Bypass -File install-agent-windows.ps1

param(
    [int]$Port = 9099,
    [string]$InstallDir = "C:\G1Oeil"
)

$AgentScript = "$InstallDir\vps-agent-windows.py"
$TaskName    = "G1OeilAgent"

# Détection Python compatible PowerShell 5.x (pas de ?. ni ??)
$Python = $null
foreach ($cmd in @("python3","python","py")) {
    $found = Get-Command $cmd -ErrorAction SilentlyContinue
    if ($found) { $Python = $found.Source; break }
}
# Fallback : chemins courants Python
if (-not $Python) {
    $candidates = @(
        "$env:LOCALAPPDATA\Programs\Python\Python3*\python.exe",
        "$env:LOCALAPPDATA\Microsoft\WindowsApps\python*.exe",
        "C:\Python3*\python.exe",
        "C:\Program Files\Python3*\python.exe"
    )
    foreach ($pattern in $candidates) {
        $hit = Get-Item $pattern -ErrorAction SilentlyContinue | Select-Object -First 1
        if ($hit) { $Python = $hit.FullName; break }
    }
}

if (-not $Python) {
    Write-Host "[ERREUR] Python introuvable. Installez Python depuis https://python.org" -ForegroundColor Red
    exit 1
}
Write-Host "[OK] Python: $Python" -ForegroundColor Green

# Créer le dossier d'installation
if (-not (Test-Path $InstallDir)) {
    New-Item -ItemType Directory -Path $InstallDir | Out-Null
    Write-Host "[OK] Dossier créé : $InstallDir" -ForegroundColor Green
}

# Copier le script agent
$Source = Join-Path $PSScriptRoot "vps-agent-windows.py"
if (Test-Path $Source) {
    Copy-Item $Source $AgentScript -Force
    Write-Host "[OK] Agent copié : $AgentScript" -ForegroundColor Green
} else {
    Write-Host "[ERREUR] Fichier source introuvable : $Source" -ForegroundColor Red
    exit 1
}

# Supprimer l'ancienne tâche si elle existe
Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false -ErrorAction SilentlyContinue

# Créer la tâche planifiée (démarrage automatique au boot, compte SYSTEM)
$Action  = New-ScheduledTaskAction -Execute $Python -Argument "$AgentScript $Port"
$Trigger = New-ScheduledTaskTrigger -AtStartup
$Settings = New-ScheduledTaskSettingsSet -RestartCount 5 -RestartInterval (New-TimeSpan -Minutes 1) `
    -ExecutionTimeLimit ([TimeSpan]::Zero) -MultipleInstances IgnoreNew
$Principal = New-ScheduledTaskPrincipal -UserId "SYSTEM" -LogonType ServiceAccount -RunLevel Highest

Register-ScheduledTask -TaskName $TaskName -Action $Action -Trigger $Trigger `
    -Settings $Settings -Principal $Principal -Description "G1Oeil VPS Metrics Agent" | Out-Null

Write-Host "[OK] Tache planifiee creee : $TaskName" -ForegroundColor Green

# Règle pare-feu (entrante pour l'IP G1Oeil uniquement — personnaliser si besoin)
$RuleName = "G1OeilAgent_Port$Port"
Remove-NetFirewallRule -DisplayName $RuleName -ErrorAction SilentlyContinue
New-NetFirewallRule -DisplayName $RuleName -Direction Inbound -Protocol TCP `
    -LocalPort $Port -Action Allow -Profile Any | Out-Null
Write-Host "[OK] Regle pare-feu creee : port $Port (TCP entrant)" -ForegroundColor Green

# Démarrer l'agent immédiatement
Start-ScheduledTask -TaskName $TaskName
Write-Host "[OK] Agent demarré sur http://localhost:$Port/metrics" -ForegroundColor Cyan

Write-Host ""
Write-Host "Installation terminee. Verifier : Invoke-WebRequest http://localhost:$Port/metrics" -ForegroundColor Yellow
