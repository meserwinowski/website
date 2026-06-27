#Requires -Version 5.1
<#
.SYNOPSIS
    Build and deploy the website to the Synology NAS.
.DESCRIPTION
    Syncs vault content, builds the Astro site, rsyncs dist/ to the NAS over SSH
    (Tailscale), pushes the nginx config, and reloads the container.
    PowerShell equivalent of deploy.sh.
#>
$ErrorActionPreference = 'Stop'

$RepoRoot = Resolve-Path (Join-Path $PSScriptRoot '..')
Set-Location $RepoRoot

# Load local deployment configuration (git-ignored; see deploy.env.example).
. "$PSScriptRoot\load-deploy-env.ps1"
$cfg = Import-DeployEnv (Join-Path $RepoRoot 'deploy.env')
if (-not $cfg['NAS_HOST']) {
    throw 'Missing deploy.env. Copy deploy.env.example to deploy.env and fill in your values.'
}

$NasUser      = $cfg['NAS_USER']
$NasHost      = $cfg['NAS_HOST']
$DeployTarget = $cfg['DEPLOY_TARGET']
$NginxDir     = $cfg['NGINX_DIR']
$SourceDir    = './dist/'
$SshOpts      = @('-o', 'RemoteCommand=none', '-o', 'RequestTTY=no')

# Container lifecycle is owned by a separate NAS toolkit (nasctl) kept outside
# this repo. We only need it here to reload nginx after pushing a new config.
$Nasctl = Get-Command nasctl -ErrorAction SilentlyContinue | Select-Object -ExpandProperty Source
if (-not $Nasctl -and $cfg['NASCTL_PATH']) {
    if (Test-Path $cfg['NASCTL_PATH']) { $Nasctl = $cfg['NASCTL_PATH'] }
}

# Require rsync + ssh on PATH (typically from Git for Windows or WSL)
foreach ($tool in 'rsync', 'ssh') {
    if (-not (Get-Command $tool -ErrorAction SilentlyContinue)) {
        throw "$tool is required but was not found on PATH. Install Git for Windows or add it manually."
    }
}

# --- Sync content from Obsidian vault ---
Write-Host 'Syncing content from vault...' -ForegroundColor Cyan
& "$PSScriptRoot\sync-content.ps1"

# --- Build ---
Write-Host 'Building site...' -ForegroundColor Cyan
npm run build
if ($LASTEXITCODE -ne 0) { throw "Build failed (exit $LASTEXITCODE)" }

# --- Deploy dist/ via rsync over SSH (Tailscale) ---
Write-Host "Deploying to ${NasHost}:${DeployTarget} ..." -ForegroundColor Cyan

rsync -avz --delete `
    --exclude='.DS_Store' `
    -e "ssh -o RemoteCommand=none -o RequestTTY=no" `
    $SourceDir "${NasUser}@${NasHost}:${DeployTarget}/"

if ($LASTEXITCODE -ne 0) { throw "rsync deploy failed (exit $LASTEXITCODE)" }

# --- Sync nginx config + reload ---
Write-Host 'Syncing nginx config...' -ForegroundColor Cyan
$nginxOk = $true
try {
    ssh @SshOpts "${NasUser}@${NasHost}" "mkdir -p $NginxDir"
    rsync -avz -e "ssh $($SshOpts -join ' ')" `
        ./nginx/default.conf "${NasUser}@${NasHost}:${NginxDir}/default.conf"

    if ($Nasctl) {
        & $Nasctl ctl webserver_nginx exec nginx -t
        if ($LASTEXITCODE -eq 0) {
            & $Nasctl ctl webserver_nginx exec nginx -s reload
            if ($LASTEXITCODE -eq 0) {
                Write-Host 'nginx config reloaded.' -ForegroundColor Green
            } else {
                $nginxOk = $false
            }
        } else {
            $nginxOk = $false
        }

        if (-not $nginxOk) {
            Write-Host 'nginx reload failed. First-time activation of the mounted config? Run:' -ForegroundColor Yellow
            Write-Host '       nasctl stack webserver recreate' -ForegroundColor Yellow
        }
    } else {
        Write-Host 'nginx config pushed, but nasctl was not found. Reload it with:' -ForegroundColor DarkCyan
        Write-Host '       nasctl ctl webserver_nginx exec nginx -s reload'
        Write-Host '     (first-time activation of the mounted config: nasctl stack webserver recreate)'
    }
} catch {
    Write-Host 'nginx config sync failed; site deploy still succeeded.' -ForegroundColor Yellow
}

Write-Host 'Deploy complete.' -ForegroundColor Green
