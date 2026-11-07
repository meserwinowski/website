#Requires -Version 5.1
$ErrorActionPreference = 'Stop'
$RepoRoot = Resolve-Path (Join-Path $PSScriptRoot '..')
Set-Location $RepoRoot
. "$PSScriptRoot\load-deploy-env.ps1"
$cfg = Import-DeployEnv (Join-Path $RepoRoot 'deploy.env')

if ($cfg['VAULT_DIR']) {
    $env:VAULT_DIR = $cfg['VAULT_DIR']
} elseif ($cfg['VAULT_SUBPATH']) {
    $env:VAULT_DIR = Join-Path $HOME ($cfg['VAULT_SUBPATH'] -replace '/', '\')
} else {
    throw 'Set VAULT_DIR or VAULT_SUBPATH in deploy.env.'
}
foreach ($key in 'CONTENT_REPO_DIR', 'EXCALIDRAW_SUBPATH', 'EXCALIDRAW_DIR') {
    if ($cfg[$key]) { Set-Item "Env:$key" $cfg[$key] }
}
node .\scripts\content-pipeline.mjs sync
if ($LASTEXITCODE -ne 0) { throw "Private content preparation failed (exit $LASTEXITCODE)" }
