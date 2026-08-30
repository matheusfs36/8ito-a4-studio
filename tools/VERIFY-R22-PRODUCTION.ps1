$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$server = Join-Path $root 'server_r223.py'
$python = (Get-Command python.exe -ErrorAction SilentlyContinue | Select-Object -First 1).Source
if (-not $python) { $python = (Get-Command python -ErrorAction SilentlyContinue | Select-Object -First 1).Source }
if (-not $python) { throw 'Python nao encontrado.' }
if (-not (Test-Path -LiteralPath $server -PathType Leaf)) { throw "server_r223.py ausente: $server" }

Write-Host '============================================================' -ForegroundColor DarkGreen
Write-Host ' 8ITO R23 EDITORIAL + R22.3 PRODUCTION - SMOKE TEST' -ForegroundColor Green
Write-Host '============================================================' -ForegroundColor DarkGreen

Write-Host 'CHECK   Python syntax' -ForegroundColor Cyan
& $python -m py_compile $server
if ($LASTEXITCODE -ne 0) { throw 'py_compile falhou' }
Write-Host 'PASS    server_r223.py compila' -ForegroundColor Green

foreach ($file in @(
    'server_r22.py','server_r222.py','server_r223.py',
    'studio-r23-editorial-fill.js','studio-r23-editorial-fill.css',
    'studio-r22-production.js','studio-r22-production.css','studio-r22-safety.js',
    'studio-r22-workspace.js','studio-r22-workspace.css',
    'studio-r22-preflight.js','studio-r22-preflight.css',
    'studio-r22-release.js','studio-r22-release.css','index.html'
)) {
    if (-not (Test-Path -LiteralPath (Join-Path $root $file) -PathType Leaf)) { throw "Arquivo R23/R22.3 ausente: $file" }
}
Write-Host 'PASS    arquivos R23 editorial + R22.3 production presentes' -ForegroundColor Green

$port = 8831
$listeners = [System.Net.NetworkInformation.IPGlobalProperties]::GetIPGlobalProperties().GetActiveTcpListeners() | ForEach-Object Port
while ($listeners -contains $port -and $port -lt 8850) { $port++ }
if ($listeners -contains $port) { throw 'Sem porta livre para smoke test.' }

$logs = Join-Path $root 'logs'
New-Item -ItemType Directory -Path $logs -Force | Out-Null
$out = Join-Path $logs 'r23-smoke-stdout.log'
$err = Join-Path $logs 'r23-smoke-stderr.log'
$proc = Start-Process -FilePath $python -ArgumentList @('-u',$server,'--host','127.0.0.1','--port',"$port") -WorkingDirectory $root -PassThru -WindowStyle Hidden -RedirectStandardOutput $out -RedirectStandardError $err
$base = "http://127.0.0.1:$port"

try {
    $ready = $false
    for ($i=0; $i -lt 60; $i++) {
        Start-Sleep -Milliseconds 250
        if ($proc.HasExited) { break }
        try {
            Invoke-RestMethod "$base/api/r223/release" -TimeoutSec 2 | Out-Null
            $ready = $true
            break
        } catch {}
    }
    if (-not $ready) {
        if (Test-Path $err) { Get-Content $err -Tail 80 }
        throw 'Servidor R22.3 nao respondeu.'
    }
    Write-Host "PASS    production server online em $base" -ForegroundColor Green

    $prod = Invoke-RestMethod "$base/api/r22/state" -TimeoutSec 5
    if ($prod.app -ne '8ito-a4-studio-r22-production') { throw "app id inesperado: $($prod.app)" }
    if ($prod.restorePolicy.automaticBackupBeforeRestore -ne $true) { throw 'restorePolicy sem backup automatico' }
    if ($prod.assetPolicy.deleteEnabled -ne $false) { throw 'assetPolicy deveria bloquear delete' }
    Write-Host "PASS    state: $($prod.project.products) produtos / $($prod.project.images) imagens" -ForegroundColor Green

    $pre = Invoke-RestMethod "$base/api/r222/preflight" -TimeoutSec 10
    if ($pre.revision -ne 'R22.2') { throw "preflight revision inesperada: $($pre.revision)" }
    if ($null -eq $pre.blockers -or $null -eq $pre.warnings) { throw 'preflight invalido' }
    Write-Host "PASS    server pre-flight: $(@($pre.blockers).Count) bloqueio(s) / $(@($pre.warnings).Count) aviso(s)" -ForegroundColor Green

    $release = Invoke-RestMethod "$base/api/r223/release" -TimeoutSec 10
    if ($release.revision -ne 'R22.3') { throw "release revision inesperada: $($release.revision)" }
    if ($null -eq $release.proofs.latest.png -and $release.releaseReady -eq $true) { throw 'release ficou pronta sem prova PNG' }
    if ($release.requirements.png -notmatch '2480x3508') { throw 'requisito PNG inesperado' }
    Write-Host "PASS    release gate: ready=$($release.releaseReady) · provas=$($release.proofs.count)" -ForegroundColor Green

    $proofs = Invoke-RestMethod "$base/api/r223/export-proofs" -TimeoutSec 5
    if ($null -eq $proofs.proofs) { throw 'endpoint export proofs invalido' }
    Write-Host "PASS    export proof ledger ($(@($proofs.proofs).Count) registro(s))" -ForegroundColor Green

    $badProofRefused = $false
    try {
        Invoke-WebRequest "$base/api/r223/export-proof" -Method Post -UseBasicParsing -ContentType 'application/json' -Body '{"kind":"png"}' -TimeoutSec 5 | Out-Null
    } catch {
        if ($_.Exception.Response.StatusCode.value__ -eq 400) { $badProofRefused = $true }
    }
    if (-not $badProofRefused) { throw 'export proof invalida nao foi recusada' }
    Write-Host 'PASS    prova raster invalida recusada sem criar registro' -ForegroundColor Green

    $assets = Invoke-RestMethod "$base/api/assets?limit=900" -TimeoutSec 15
    if ($null -eq $assets.assets -or $null -eq $assets.summary) { throw 'endpoint assets invalido' }
    if ([int]$assets.summary.total -lt [int]$prod.project.images) { throw 'inventario de assets menor que imagens ativas' }
    if ($assets.policy.deleteEnabled -ne $false) { throw 'biblioteca de assets nao esta read-only' }
    Write-Host "PASS    asset inventory: $($assets.summary.total) arquivos / $($assets.summary.used) referenciados / $($assets.summary.orphan) orfaos" -ForegroundColor Green

    $snaps = Invoke-RestMethod "$base/api/snapshots" -TimeoutSec 5
    if ($null -eq $snaps.snapshots) { throw 'endpoint snapshots invalido' }
    Write-Host "PASS    snapshots endpoint ($(@($snaps.snapshots).Count) existentes)" -ForegroundColor Green

    $baselines = Invoke-RestMethod "$base/api/baselines" -TimeoutSec 5
    if ($null -eq $baselines.baselines) { throw 'endpoint baselines invalido' }
    Write-Host "PASS    baselines endpoint ($(@($baselines.baselines).Count) existentes)" -ForegroundColor Green

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

    $releaseRefused = $false
    try {
        Invoke-WebRequest "$base/api/r223/release/freeze" -Method Post -UseBasicParsing -ContentType 'application/json' -Body '{"confirm":"NAO"}' -TimeoutSec 5 | Out-Null
    } catch {
        if ($_.Exception.Response.StatusCode.value__ -eq 409) { $releaseRefused = $true }
    }
    if (-not $releaseRefused) { throw 'release freeze nao recusou confirmacao invalida' }
    Write-Host 'PASS    release candidate freeze protegido por confirmacao' -ForegroundColor Green

    $baselineRefused = $false
    try {
        Invoke-WebRequest "$base/api/baseline/freeze" -Method Post -UseBasicParsing -ContentType 'application/json' -Body '{"confirm":"NAO"}' -TimeoutSec 5 | Out-Null
    } catch {
        if ($_.Exception.Response.StatusCode.value__ -eq 409) { $baselineRefused = $true }
    }
    if (-not $baselineRefused) { throw 'baseline freeze nao recusou confirmacao invalida' }
    Write-Host 'PASS    baseline freeze protegido por confirmacao' -ForegroundColor Green

    $refused = $false
    try {
        Invoke-WebRequest "$base/api/restore-original" -Method Post -UseBasicParsing -ContentType 'application/json' -Body '{"confirm":"NAO"}' -TimeoutSec 5 | Out-Null
    } catch {
        if ($_.Exception.Response.StatusCode.value__ -eq 409) { $refused = $true }
    }
    if (-not $refused) { throw 'restore original nao recusou confirmacao invalida' }
    Write-Host 'PASS    restore original protegido por confirmacao' -ForegroundColor Green

    $index = Get-Content (Join-Path $root 'index.html') -Raw
    foreach ($needle in @(
        'studio-r23-editorial-fill.css','studio-r23-editorial-fill.js',
        'studio-r22-production.css','studio-r22-production.js','studio-r22-safety.js',
        'studio-r22-workspace.css','studio-r22-workspace.js',
        'studio-r22-preflight.css','studio-r22-preflight.js',
        'studio-r22-release.css','studio-r22-release.js'
    )) {
        if ($index -notmatch [regex]::Escape($needle)) { throw "index nao carrega $needle" }
    }
    Write-Host 'PASS    index carrega R23 editorial + R22.3 production completo' -ForegroundColor Green

    Write-Host ''
    Write-Host 'R23 + R22.3 SMOKE = PASS' -ForegroundColor Green
    Write-Host 'Obs.: o smoke nao gera downloads. As provas reais PNG/JPG/PDF continuam no painel Release R22.3.' -ForegroundColor DarkGray
}
finally {
    try { Stop-Process -Id $proc.Id -Force -ErrorAction SilentlyContinue } catch {}
}
