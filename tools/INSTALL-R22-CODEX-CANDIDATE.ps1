param(
    [string]$LabRoot = 'C:\tdz-os\content-labs\8ITO-A4-STUDIO-0001'
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$Repo = 'matheusfs36/8ito-a4-studio'
$Ref = 'codex/r22-production-hardening'
$Stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$Backup = "C:\tdz-os\backups\8ito-r23-codex-pre-$Stamp"

function Step([string]$Text) {
    Write-Host ''
    Write-Host '============================================================' -ForegroundColor DarkGray
    Write-Host " $Text" -ForegroundColor Cyan
    Write-Host '============================================================' -ForegroundColor DarkGray
}

function Fetch-RepoFile([string]$RepoPath, [string]$Destination) {
    $r = gh api "repos/$Repo/contents/$RepoPath`?ref=$Ref" | ConvertFrom-Json
    if (-not $r.content) { throw "GitHub nao retornou conteudo para $RepoPath" }
    $bytes = [Convert]::FromBase64String(($r.content -replace '\s',''))
    $parent = Split-Path -Parent $Destination
    if ($parent) { New-Item -ItemType Directory -Path $parent -Force | Out-Null }
    [IO.File]::WriteAllBytes($Destination, $bytes)
}

Step '1. VALIDAR AMBIENTE'
if (-not (Test-Path -LiteralPath $LabRoot -PathType Container)) { throw "Lab nao encontrado: $LabRoot" }
if (-not (Get-Command gh.exe -ErrorAction SilentlyContinue)) { throw 'gh.exe nao encontrado no PATH' }
Write-Host "PASS  LAB = $LabRoot" -ForegroundColor Green
Write-Host "PASS  REF = $Repo@$Ref" -ForegroundColor Green

$files = @(
    'index.html',
    'Run-8ITO-A4-Studio-0001.ps1',
    'server_r22.py',
    'server_r222.py',
    'server_r223.py',
    'studio-r23-editorial-fill.css',
    'studio-r23-editorial-fill.js',
    'studio-r22-production.css',
    'studio-r22-production.js',
    'studio-r22-safety.js',
    'studio-r22-workspace.css',
    'studio-r22-workspace.js',
    'studio-r22-preflight.css',
    'studio-r22-preflight.js',
    'studio-r22-release.css',
    'studio-r22-release.js',
    'tools/VERIFY-R22-PRODUCTION.ps1'
)

Step '2. BACKUP CIRURGICO DO ESTADO VIVO'
New-Item -ItemType Directory -Path $Backup -Force | Out-Null
foreach ($rel in $files) {
    $src = Join-Path $LabRoot ($rel -replace '/', '\')
    if (Test-Path -LiteralPath $src -PathType Leaf) {
        $dst = Join-Path $Backup ($rel -replace '/', '\')
        New-Item -ItemType Directory -Path (Split-Path -Parent $dst) -Force | Out-Null
        Copy-Item -LiteralPath $src -Destination $dst -Force
    }
}
Write-Host "PASS  BACKUP = $Backup" -ForegroundColor Green

Step '3. APLICAR R23 EDITORIAL + HARDENING R22.3'
foreach ($rel in $files) {
    $dst = Join-Path $LabRoot ($rel -replace '/', '\')
    Write-Host "FETCH $rel" -ForegroundColor DarkGray
    Fetch-RepoFile $rel $dst
}
Write-Host 'PASS  nenhum asset, produto, preco ou JSON vivo foi substituido' -ForegroundColor Green

Step '4. SMOKE TEST LOCAL'
$verify = Join-Path $LabRoot 'tools\VERIFY-R22-PRODUCTION.ps1'
powershell.exe -NoProfile -ExecutionPolicy Bypass -File $verify
if ($LASTEXITCODE -ne 0) {
    Write-Host ''
    Write-Host 'SMOKE FALHOU. R23 NAO SERA ABERTO AUTOMATICAMENTE.' -ForegroundColor Red
    Write-Host "Backup para rollback: $Backup" -ForegroundColor Yellow
    exit $LASTEXITCODE
}

Step '5. TROCAR SERVIDOR LOCAL'
$labNeedle = $LabRoot.ToLowerInvariant()
$old = Get-CimInstance Win32_Process -Filter "Name='python.exe' OR Name='pythonw.exe'" -ErrorAction SilentlyContinue |
    Where-Object {
        $cmd = [string]$_.CommandLine
        $low = $cmd.ToLowerInvariant()
        ($low.Contains('server_r22.py') -or $low.Contains('server_r222.py') -or $low.Contains('server_r223.py')) -and $low.Contains($labNeedle)
    }
foreach ($proc in @($old)) {
    Write-Host "STOP   PID $($proc.ProcessId) · servidor anterior" -ForegroundColor DarkGray
    Stop-Process -Id $proc.ProcessId -Force -ErrorAction SilentlyContinue
}
if (@($old).Count -eq 0) { Write-Host 'PASS   nenhum servidor anterior precisava ser encerrado' -ForegroundColor Green }
else { Write-Host "PASS   $(@($old).Count) servidor(es) anterior(es) encerrado(s)" -ForegroundColor Green }
Start-Sleep -Milliseconds 350

Step '6. ABRIR R23 EDITORIAL CANDIDATE'
$launcher = Join-Path $LabRoot 'Run-8ITO-A4-Studio-0001.ps1'
powershell.exe -NoProfile -ExecutionPolicy Bypass -File $launcher
if ($LASTEXITCODE -ne 0) { throw "Launcher R23 terminou com EXIT CODE $LASTEXITCODE" }

Write-Host ''
Write-Host '============================================================' -ForegroundColor DarkGreen
Write-Host ' R23 EDITORIAL CANDIDATE INSTALADO + SMOKE PASS' -ForegroundColor Green
Write-Host '============================================================' -ForegroundColor DarkGreen
Write-Host "Backup: $Backup" -ForegroundColor DarkGray
Write-Host 'Main do GitHub nao foi alterada; o trabalho continua no PR draft #1.' -ForegroundColor Cyan
