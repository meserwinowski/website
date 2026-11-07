#Requires -Version 5.1
<#
.SYNOPSIS
    Build and deploy the website to the Synology NAS.
.DESCRIPTION
    Syncs vault content, builds and tests the Astro site, rsyncs dist/ to the NAS over SSH
    on the private Tailscale tailnet, pushes the nginx config, and reloads the
    container through the installed NAS dispatcher. The deploy target is mirrored
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
foreach ($key in 'NAS_USER', 'NAS_HOST', 'DEPLOY_TARGET', 'NGINX_DIR') {
    if (-not $cfg[$key]) { throw "Set $key in deploy.env." }
}

$NasUser      = $cfg['NAS_USER']
$NasHost      = $cfg['NAS_HOST']
$DeployTarget = $cfg['DEPLOY_TARGET']
$NginxDir     = $cfg['NGINX_DIR']
$SourceDir    = './dist/'

foreach ($path in $DeployTarget, $NginxDir) {
    if ($path -notmatch '^/[A-Za-z0-9_./-]+$' -or $path -match '^/+$' -or $path -match '(^|/)\.\.?(/|$)') {
        throw 'Invalid deploy path: use a non-root absolute path without spaces or dot segments.'
    }
}

$SshOpts = @('-o', 'BatchMode=yes', '-o', 'StrictHostKeyChecking=yes', '-o', 'ConnectTimeout=10', '-o', 'RemoteCommand=none', '-o', 'RequestTTY=no')
$RsyncSsh = "ssh $($SshOpts -join ' ')"
$Remote = "${NasUser}@${NasHost}"
$Dispatcher = '/volume1/docker_commands/nas-docker.sh'
$RemoteShell = "tr -d '\r' | sh -s"

# Check local tooling before starting the build work.
foreach ($tool in 'rsync', 'ssh', 'npm') {
    if (-not (Get-Command $tool -ErrorAction SilentlyContinue)) {
        throw "$tool is required but was not found on PATH."
    }
}

Write-Host 'Checking noninteractive NAS access...' -ForegroundColor Cyan
ssh @SshOpts $Remote "sudo -n rsync --version >/dev/null && sudo -n test -x '$Dispatcher'"
if ($LASTEXITCODE -ne 0) { throw "NAS preflight failed (exit $LASTEXITCODE)" }

# --- Sync content from Obsidian vault ---
# Phase 1: sync content before building, so dist/ includes the latest vault
# markdown and generated image assets.
Write-Host 'Syncing content from vault...' -ForegroundColor Cyan
& "$PSScriptRoot\sync-content.ps1"

# --- Build ---
# npm test builds dist/ first; either a build or test failure blocks publishing.
Write-Host 'Building and testing site...' -ForegroundColor Cyan
npm test
if ($LASTEXITCODE -ne 0) { throw "Build/test gate failed (exit $LASTEXITCODE)" }

# DSM rejects root rsync server sessions. Upload as copilot, then use sudo only
# for a local copy on the NAS, preserving the destination owner's UID/GID.
# Synology's inherited ACLs can override mktemp/umask permissions.
# Stdin preserves shell quotes; the remote shell strips Windows CRLF line endings.
$StageCommand = 'stage=$(umask 077; mktemp -d "$HOME/website-deploy.XXXXXXXX") && chmod 0700 "$stage" && test "$(stat -c %a "$stage")" = 700 && printf "%s\n" "$stage"'
$StageOutput = @($StageCommand | ssh @SshOpts $Remote $RemoteShell)
if ($LASTEXITCODE -ne 0) { throw "Staging directory creation failed (exit $LASTEXITCODE)" }
$StagingDir = ($StageOutput -join "`n").Trim()
if ($StagingDir -notmatch '^/[A-Za-z0-9_./-]+/website-deploy\.[A-Za-z0-9]{8}$' -or $StagingDir -match '(^|/)\.\.?(/|$)') {
    throw 'NAS returned an invalid staging directory; refusing transfer or cleanup.'
}

try {
    Write-Host "Deploying to ${NasHost}:${DeployTarget} ..." -ForegroundColor Cyan
    rsync -avz --exclude='.DS_Store' -e $RsyncSsh $SourceDir "${Remote}:${StagingDir}/dist/"
    if ($LASTEXITCODE -ne 0) { throw "rsync upload failed (exit $LASTEXITCODE)" }

    $PublishSite = 'owner=$(sudo -n stat -c ''%u:%g'' ''{0}'') && sudo -n rsync -a --delete --exclude=''.DS_Store'' --chown="$owner" -- ''{1}/dist/'' ''{0}/''' -f $DeployTarget, $StagingDir
    $PublishSite | ssh @SshOpts $Remote $RemoteShell
    if ($LASTEXITCODE -ne 0) { throw "rsync publish failed (exit $LASTEXITCODE)" }

    # Use the installed dispatcher, not the syncing local nasctl launcher.
    # Config updates remain best-effort after the site files have been deployed.
    Write-Host 'Syncing nginx config...' -ForegroundColor Cyan
    try {
        rsync -avz -e $RsyncSsh ./nginx/default.conf "${Remote}:${StagingDir}/default.conf"
        if ($LASTEXITCODE -ne 0) { throw "Config upload failed (exit $LASTEXITCODE)" }

        # Preserve the inode of the single-file nginx bind mount.
        $PublishConfig = 'sudo -n mkdir -p ''{0}'' && owner=$(sudo -n stat -c ''%u:%g'' ''{0}'') && sudo -n rsync -a --inplace --chown="$owner" -- ''{1}/default.conf'' ''{0}/default.conf''' -f $NginxDir, $StagingDir
        $PublishConfig | ssh @SshOpts $Remote $RemoteShell
        if ($LASTEXITCODE -ne 0) { throw "Config sync failed (exit $LASTEXITCODE)" }

        ssh @SshOpts $Remote "sudo -n $Dispatcher ctl webserver_nginx exec nginx -t"
        if ($LASTEXITCODE -ne 0) { throw "nginx validation failed (exit $LASTEXITCODE)" }

        ssh @SshOpts $Remote "sudo -n $Dispatcher ctl webserver_nginx exec nginx -s reload"
        if ($LASTEXITCODE -ne 0) { throw "nginx reload failed (exit $LASTEXITCODE)" }
        Write-Host 'nginx config reloaded.' -ForegroundColor Green
    } catch {
        Write-Warning "nginx config update/reload failed; site files were deployed. Check the config and DSM-managed mounts. $($_.Exception.Message)"
    }
} finally {
    ssh @SshOpts $Remote "rm -rf -- '$StagingDir'"
    if ($LASTEXITCODE -ne 0) { Write-Warning "Could not remove temporary staging directory $StagingDir." }
}

Write-Host 'Deploy complete.' -ForegroundColor Green
