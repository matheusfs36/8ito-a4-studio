$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$server = Join-Path $root 'server_r22.py'
$python = (Get-Command python.exe -ErrorAction SilentlyContinue | Select-Object -First 1).Source
if (-not $python) { $python = (Get-Command python -ErrorAction SilentlyContinue | Select-Object -First 1).Source }
if (-not $python) { throw 'Python nao encontrado.' }
if (-not (Test-Path -LiteralPath $server -PathType Leaf)) { throw "server_r22.py ausente: $server" }

Write-Host '============================================================' -ForegroundColor DarkGreen
Write-Host ' 8ITO R22.1 PRODUCTION - SMOKE TEST' -ForegroundColor Green
Write-Host '============================================================' -ForegroundColor DarkGreen

Write-Host 'CHECK   Python syntax' -ForegroundColor Cyan
& $python -m py_compile $server
if ($LASTEXITCODE -ne 0) { throw 'py_compile falhou' }
Write-Host 'PASS    server_r22.py compila' -ForegroundColor Green

foreach ($file in @('studio-r22-production.js','studio-r22-production.css','studio-r22-safety.js','studio-r22-workspace.js','studio-r22-workspace.css','index.html')) {
    if (-not (Test-Path -LiteralPath (Join-Path $root $file) -PathType Leaf)) { throw "Arquivo R22 ausente: $file" }
}
Write-Host 'PASS    arquivos R22.1 presentes' -ForegroundColor Green

$port = 8831
$listeners = [System.Net.NetworkInformation.IPGlobalProperties]::GetIPGlobalProperties().GetActiveTcpListeners() | ForEach-Object Port
while ($listeners -contains $port -and $port -lt 8850) { $port++ }
if ($listeners -contains $port) { throw 'Sem porta livre para smoke test.' }

$logs = Join-Path $root 'logs'
New-Item -ItemType Directory -Path $logs -Force | Out-Null
$out = Join-Path $logs 'r22-smoke-stdout.log'
$err = Join-Path $logs 'r22-smoke-stderr.log'
$proc = Start-Process -FilePath $python -ArgumentList @('-u',$server,'--host','127.0.0.1','--port',"$port") -WorkingDirectory $root -PassThru -WindowStyle Hidden -RedirectStandardOutput $out -RedirectStandardError $err
$base = "http://127.0.0.1:$port"

try {
    $ready = $false
    for ($i=0; $i -lt 60; $i++) {
        Start-Sleep -Milliseconds 250
        if ($proc.HasExited) { break }
        try {
            Invoke-RestMethod "$base/api/r22/state" -TimeoutSec 2 | Out-Null
            $ready = $true
            break
        } catch {}
    }
    if (-not $ready) {
        if (Test-Path $err) { Get-Content $err -Tail 80 }
        throw 'Servidor R22 nao respondeu.'
    }
    Write-Host "PASS    R22.1 online em $base" -ForegroundColor Green

    $prod = Invoke-RestMethod "$base/api/r22/state" -TimeoutSec 5
    if ($prod.app -ne '8ito-a4-studio-r22-production') { throw "app id inesperado: $($prod.app)" }
    if ($prod.revision -ne 'R22.1') { throw "revision inesperada: $($prod.revision)" }
    if ($prod.restorePolicy.automaticBackupBeforeRestore -ne $true) { throw 'restorePolicy sem backup automatico' }
    if ($prod.assetPolicy.deleteEnabled -ne $false) { throw 'assetPolicy deveria bloquear delete' }
    Write-Host "PASS    state: $($prod.project.products) produtos / $($prod.project.images) imagens" -ForegroundColor Green

    $assets = Invoke-RestMethod "$base/api/assets?limit=900" -TimeoutSec 15
    if ($null -eq $assets.assets -or $null -eq $assets.summary) { throw 'endpoint assets invalido' }
    if ([int]$assets.summary.total -lt [int]$prod.project.images) { throw 'inventario de assets menor que imagens ativas' }
    if ($assets.policy.deleteEnabled -ne $false) { throw 'biblioteca de assets nao esta read-only' }
    Write-Host "PASS    asset inventory: $($assets.summary.total) arquivos / $($assets.summary.used) referenciados / $($assets.summary.orphan) orfaos" -ForegroundColor Green

    $snaps = Invoke-RestMethod "$base/api/snapshots" -TimeoutSec 5
    if ($null -eq $snaps.snapshots) { throw 'endpoint snapshots invalido' }
    Write-Host "PASS    snapshots endpoint ($(@($snaps.snapshots).Count) existentes)" -ForegroundColor Green

    $project = Invoke-RestMethod "$base/api/project" -TimeoutSec 5
    if ($null -eq $project.products) { throw 'projeto vivo invalido' }
    $body = @{ project = $project } | ConvertTo-Json -Depth 100
    $saved = Invoke-RestMethod "$base/api/project" -Method Post -ContentType 'application/json; charset=utf-8' -Body $body -TimeoutSec 15
    if (-not $saved.ok) { throw 'roundtrip save falhou' }
    $project2 = Invoke-RestMethod "$base/api/project" -TimeoutSec 5
    if (@($project2.products).Count -ne @($project.products).Count) { throw 'roundtrip alterou quantidade de produtos' }
    Write-Host 'PASS    save -> reload roundtrip sem perda de produtos' -ForegroundColor Green

    if (@($snaps.snapshots).Count -gt 0) {
        $snapshotId = @($snaps.snapshots)[0].id
        $compareBody = @{ id = $snapshotId; project = $project } | ConvertTo-Json -Depth 100
        $comparison = Invoke-RestMethod "$base/api/snapshot/compare" -Method Post -ContentType 'application/json; charset=utf-8' -Body $compareBody -TimeoutSec 15
        if (-not $comparison.ok -or $null -eq $comparison.diff.summary) { throw 'snapshot compare invalido' }
        Write-Host "PASS    snapshot compare API ($snapshotId)" -ForegroundColor Green
    } else {
        Write-Host 'PASS    snapshot compare API pronta (sem criar snapshot de teste)' -ForegroundColor Green
    }

    $refused = $false
    try {
        Invoke-WebRequest "$base/api/restore-original" -Method Post -UseBasicParsing -ContentType 'application/json' -Body '{"confirm":"NAO"}' -TimeoutSec 5 | Out-Null
    } catch {
        if ($_.Exception.Response.StatusCode.value__ -eq 409) { $refused = $true }
    }
    if (-not $refused) { throw 'restore original nao recusou confirmacao invalida' }
    Write-Host 'PASS    restore original protegido por confirmacao' -ForegroundColor Green

    $index = Get-Content (Join-Path $root 'index.html') -Raw
    foreach ($needle in @('studio-r22-production.css','studio-r22-production.js','studio-r22-safety.js','studio-r22-workspace.css','studio-r22-workspace.js')) {
        if ($index -notmatch [regex]::Escape($needle)) { throw "index nao carrega $needle" }
    }
    Write-Host 'PASS    index carrega R22.1 completo' -ForegroundColor Green

    Write-Host ''
    Write-Host 'R22.1 SMOKE = PASS' -ForegroundColor Green
    Write-Host 'Obs.: geracao ComfyUI nao foi executada neste smoke test para nao gastar GPU.' -ForegroundColor DarkGray
}
finally {
    try { Stop-Process -Id $proc.Id -Force -ErrorAction SilentlyContinue } catch {}
}
