#Requires -Version 5.1
<#
.SYNOPSIS
    Build and deploy the website to the Synology NAS.
.DESCRIPTION
    Syncs vault content, builds the Astro site, rsyncs dist/ to the NAS over SSH
    on the private Tailscale tailnet, pushes the nginx config, and reloads the
    container through the external nasctl toolkit. The deploy target is mirrored
    with rsync --delete, so files removed from dist/ are also removed remotely.
    PowerShell equivalent of deploy.sh.
#>

# Turn non-terminating PowerShell errors into exceptions. External commands are
# still checked with $LASTEXITCODE where PowerShell cannot throw for us.
$ErrorActionPreference = 'Stop'

# Run from the repository root so relative paths below behave the same whether
# launched directly or through npm's run-local-script dispatcher.
$RepoRoot = Resolve-Path (Join-Path $PSScriptRoot '..')
Set-Location $RepoRoot

# Load local deployment configuration (git-ignored; see deploy.env.example).
# Dot-sourcing imports Import-DeployEnv from the helper file into this scope.
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

# Keep SSH options as an array for splatting (`ssh @SshOpts ...`) so each item
# becomes its own argument. RemoteCommand=none and RequestTTY=no keep these SSH
# calls non-interactive: run the remote command, do not open a shell session.
$SshOpts      = @('-o', 'RemoteCommand=none', '-o', 'RequestTTY=no')

# Container lifecycle is owned by a separate NAS toolkit (nasctl) kept outside
# this repo. We only need it here to reload nginx after pushing a new config.
$Nasctl = Get-Command nasctl -ErrorAction SilentlyContinue | Select-Object -ExpandProperty Source
if (-not $Nasctl -and $cfg['NASCTL_PATH']) {
    if (Test-Path $cfg['NASCTL_PATH']) { $Nasctl = $cfg['NASCTL_PATH'] }
}

# Require rsync + ssh on PATH (typically from Git for Windows or WSL) before the
# build work starts, so missing tooling fails quickly.
foreach ($tool in 'rsync', 'ssh') {
    if (-not (Get-Command $tool -ErrorAction SilentlyContinue)) {
        throw "$tool is required but was not found on PATH. Install Git for Windows or add it manually."
    }
}

# --- Sync content from Obsidian vault ---
# Phase 1: sync content before building, so dist/ includes the latest vault
# markdown and generated image assets.
Write-Host 'Syncing content from vault...' -ForegroundColor Cyan
& "$PSScriptRoot\sync-content.ps1"

# --- Build ---
# Phase 2: build Astro into dist/. The explicit $LASTEXITCODE check makes a bad
# build stop before the destructive rsync mirror below; test gates work the same
# way when they run before deploy.
Write-Host 'Building site...' -ForegroundColor Cyan
npm run build
if ($LASTEXITCODE -ne 0) { throw "Build failed (exit $LASTEXITCODE)" }

# --- Deploy dist/ via rsync over SSH (Tailscale) ---
# Phase 3: rsync dist/ to the NAS over the Tailscale tailnet. The mainecoon host
# name resolves inside that private network, so the NAS does not need public SSH.
Write-Host "Deploying to ${NasHost}:${DeployTarget} ..." -ForegroundColor Cyan

# rsync flags:
#   -a preserves the built directory tree ("archive" mode).
#   -v prints changed files, useful during a manual deploy.
#   -z compresses data in transit.
#   --delete removes remote files no longer present in dist/.
#   --exclude skips macOS Finder metadata that should never be served.
# The -e value is one string because rsync expects the remote shell command that
# way, even though PowerShell arrays are safer for direct ssh calls.
rsync -avz --delete `
    --exclude='.DS_Store' `
    -e "ssh -o RemoteCommand=none -o RequestTTY=no" `
    $SourceDir "${NasUser}@${NasHost}:${DeployTarget}/"

if ($LASTEXITCODE -ne 0) { throw "rsync deploy failed (exit $LASTEXITCODE)" }

# --- Sync nginx config + reload ---
# Best-effort config update: the site files are already deployed, so nginx
# config/reload failures should warn without turning the deploy into a failure.
Write-Host 'Syncing nginx config...' -ForegroundColor Cyan
$nginxOk = $true
try {
    # Splatting expands $SshOpts into separate ssh arguments. The quoted command
    # after the host runs on the NAS, not on the local machine.
    ssh @SshOpts "${NasUser}@${NasHost}" "mkdir -p $NginxDir"
    rsync -avz -e "ssh $($SshOpts -join ' ')" `
        ./nginx/default.conf "${NasUser}@${NasHost}:${NginxDir}/default.conf"

    if ($Nasctl) {
        # Validate nginx config before reload; a bad config should leave the
        # currently running nginx process untouched.
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
