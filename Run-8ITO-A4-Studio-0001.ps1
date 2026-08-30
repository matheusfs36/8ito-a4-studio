$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$serverR223 = Join-Path $root 'server_r223.py'
$serverR222 = Join-Path $root 'server_r222.py'
$serverR22 = Join-Path $root 'server_r22.py'
$serverR4 = Join-Path $root 'server_r4.py'
$serverR3 = Join-Path $root 'server_r3.py'
$serverBase = Join-Path $root 'server.py'
$server = if (Test-Path -LiteralPath $serverR223 -PathType Leaf) { $serverR223 } elseif (Test-Path -LiteralPath $serverR222 -PathType Leaf) { $serverR222 } elseif (Test-Path -LiteralPath $serverR22 -PathType Leaf) { $serverR22 } elseif (Test-Path -LiteralPath $serverR4 -PathType Leaf) { $serverR4 } elseif (Test-Path -LiteralPath $serverR3 -PathType Leaf) { $serverR3 } else { $serverBase }
$logs = Join-Path $root 'logs'
New-Item -ItemType Directory -Path $logs -Force | Out-Null

Write-Host '============================================================' -ForegroundColor DarkGreen
Write-Host ' 8ITO A4 STUDIO 0001 R24' -ForegroundColor Green
Write-Host ' Atelier editorial + R22.3 production hardening' -ForegroundColor DarkGray
Write-Host '============================================================' -ForegroundColor DarkGreen

if (-not (Test-Path -LiteralPath $server -PathType Leaf)) {
    throw "Servidor nao encontrado: $server"
}

function Resolve-Python {
    param([string[]]$Candidates)
    foreach ($candidate in $Candidates) {
        if (-not $candidate) { continue }
        if (Test-Path -LiteralPath $candidate -PathType Leaf) { return $candidate }
        $cmd = Get-Command $candidate -ErrorAction SilentlyContinue | Select-Object -First 1
        if ($cmd) { return $cmd.Source }
    }
    return $null
}

function Test-Comfy {
    try {
        Invoke-RestMethod -Uri 'http://127.0.0.1:8188/object_info/KSampler' -TimeoutSec 2 -ErrorAction Stop | Out-Null
        return $true
    } catch { return $false }
}

$python = Resolve-Python @('python.exe','python','py.exe','py')
if (-not $python) { throw 'Python nao encontrado no PATH.' }

if (-not (Test-Comfy)) {
    $comfyRoot = Join-Path $env:USERPROFILE 'Documents\ComfyUI'
    $comfyMain = Join-Path $comfyRoot 'main.py'
    $comfyPython = Resolve-Python @(
        (Join-Path $comfyRoot 'venv\Scripts\python.exe'),
        (Join-Path $comfyRoot '.venv\Scripts\python.exe')
    )
    if ((Test-Path -LiteralPath $comfyMain -PathType Leaf) -and $comfyPython) {
        Write-Host 'START   ComfyUI local --lowvram' -ForegroundColor Cyan
        $cout = Join-Path $logs 'comfyui-r223-stdout.log'
        $cerr = Join-Path $logs 'comfyui-r223-stderr.log'
        Start-Process -FilePath $comfyPython -ArgumentList @('-u',$comfyMain,'--listen','127.0.0.1','--port','8188','--lowvram') -WorkingDirectory $comfyRoot -WindowStyle Hidden -RedirectStandardOutput $cout -RedirectStandardError $cerr | Out-Null
        for ($i=0; $i -lt 120; $i++) {
            if (Test-Comfy) { break }
            Start-Sleep -Seconds 1
        }
    }
}

$listeners = [System.Net.NetworkInformation.IPGlobalProperties]::GetIPGlobalProperties().GetActiveTcpListeners() |
    ForEach-Object { $_.Port }
$port = 8794
while ($listeners -contains $port -and $port -lt 8840) { $port++ }
if ($listeners -contains $port) { throw 'Nao encontrei porta livre entre 8794 e 8840.' }

$url = "http://127.0.0.1:$port/"
$args = @('-u', $server, '--host', '127.0.0.1', '--port', "$port")
$ollamaDisplay = if ($env:OLLAMA_HOST) { $env:OLLAMA_HOST } else { 'http://127.0.0.1:11434' }
$comfyDisplay = if ($env:COMFYUI_HOST) { $env:COMFYUI_HOST } else { 'http://127.0.0.1:8188' }

Write-Host "ROOT    = $root" -ForegroundColor DarkGray
Write-Host "SERVER  = $server" -ForegroundColor DarkGray
Write-Host "PYTHON  = $python" -ForegroundColor DarkGray
Write-Host "URL     = $url" -ForegroundColor Cyan
Write-Host "OLLAMA  = $ollamaDisplay" -ForegroundColor DarkGray
Write-Host "COMFYUI = $comfyDisplay" -ForegroundColor DarkGray

$appOut = Join-Path $logs '8ito-r223-stdout.log'
$appErr = Join-Path $logs '8ito-r223-stderr.log'
$proc = Start-Process -FilePath $python -ArgumentList $args -WorkingDirectory $root -PassThru -WindowStyle Hidden -RedirectStandardOutput $appOut -RedirectStandardError $appErr

$ready = $false
$health = $null
for ($i = 0; $i -lt 80; $i++) {
    Start-Sleep -Milliseconds 250
    if ($proc.HasExited) { break }
    try {
        $health = Invoke-RestMethod -Uri ($url + 'api/health') -TimeoutSec 2
        if ($health.app -match '^8ito-a4-studio') { $ready = $true; break }
    } catch {}
}

if (-not $ready) {
    Write-Host '--- STDERR ---' -ForegroundColor Red
    if (Test-Path $appErr) { Get-Content $appErr -Tail 80 }
    try { Stop-Process -Id $proc.Id -Force -ErrorAction SilentlyContinue } catch {}
    throw 'Servidor local nao respondeu ao health check.'
}

Write-Host ''
Write-Host 'SERVER  = PASS' -ForegroundColor Green
Write-Host "PID     = $($proc.Id)" -ForegroundColor DarkGray
Write-Host "EDITOR  = $url" -ForegroundColor Green
if ($health) {
    Write-Host "AI      = $($health.ollama.model)" -ForegroundColor Green
    if ($health.comfyui.has2DCheckpoint) {
        Write-Host "IMAGE   = $($health.comfyui.checkpoint)" -ForegroundColor Green
    } else {
        Write-Host 'IMAGE   = sem checkpoint 2D adequado' -ForegroundColor Yellow
    }
}
Write-Host ''
Start-Process $url
