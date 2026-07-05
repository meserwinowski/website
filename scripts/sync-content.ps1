#Requires -Version 5.1
<#
.SYNOPSIS
    Pulls markdown content from the Obsidian vault into the website source.
.DESCRIPTION
    The Obsidian vault is the source of truth. This Windows path mirrors project
    and page markdown into src/content/ with Robocopy, then runs the same image
    asset pipeline used by the shell script. Mirror mode deletes destination
    files that no longer exist in the vault, so generated content is not a safe
    place for hand-edits.

    Run before `npm run build` or `npm run deploy` to pick up vault edits.
    PowerShell equivalent of sync-content.sh; keep the phases aligned.
#>

# Turn non-terminating PowerShell errors into exceptions. That gives this script
# the same "stop on first failure" behavior expected from the shell variant.
$ErrorActionPreference = 'Stop'

# Run from the repository root so relative paths below mean the same thing
# whether the script was launched directly or via npm.
$RepoRoot = Resolve-Path (Join-Path $PSScriptRoot '..')
Set-Location $RepoRoot

# Dot-sourcing loads the helper function into this script's scope. The helper
# returns deploy.env as a hashtable, so values are read by key.
. "$PSScriptRoot\load-deploy-env.ps1"
$cfg = Import-DeployEnv (Join-Path $RepoRoot 'deploy.env')

# Source: Obsidian vault content folder. VAULT_SUBPATH is relative to $HOME,
# and forward slashes are converted for normal Windows paths.
$VaultSubpath = $cfg['VAULT_SUBPATH']
if (-not $VaultSubpath) { throw 'Set VAULT_SUBPATH in deploy.env (copy deploy.env.example).' }
$VaultDir = Join-Path $HOME ($VaultSubpath -replace '/', '\')

# The Node asset scripts are child processes, so they read configuration from
# environment variables rather than from PowerShell-local variables.
$env:VAULT_DIR = $VaultDir
if ($cfg['EXCALIDRAW_SUBPATH']) { $env:EXCALIDRAW_SUBPATH = $cfg['EXCALIDRAW_SUBPATH'] }

# Generated destinations inside the website. Robocopy mirror mode below can
# delete files here if the vault no longer has them.
$ProjectsDir = Join-Path $RepoRoot 'src\content\projects'
$PagesDir    = Join-Path $RepoRoot 'src\content\pages'
$ImagesDir   = Join-Path $RepoRoot 'public\images'

# Create destinations before mirroring; -Force makes this idempotent.
New-Item -ItemType Directory -Path $ProjectsDir -Force | Out-Null
New-Item -ItemType Directory -Path $PagesDir    -Force | Out-Null
New-Item -ItemType Directory -Path $ImagesDir   -Force | Out-Null

# Mirror one markdown folder. The param block declares the required inputs and
# their types, so mistakes fail close to the call site with useful messages.
function Invoke-MarkdownMirror {
    param(
        [Parameter(Mandatory = $true)]
        [string]$Source,

        [Parameter(Mandatory = $true)]
        [string]$Destination,

        [Parameter(Mandatory = $true)]
        [string]$Label
    )

    # Robocopy's /MIR is mirror mode: copy new/changed files and delete anything
    # in the destination that is not in the source, like rsync --delete. The
    # quiet flags keep routine output focused on the summary lines below.
    & robocopy $Source $Destination '*.md' /MIR /NJH /NJS /NP /NFL /NDL *> $null
    $exitCode = $LASTEXITCODE

    # Robocopy uses 0-7 for success states, including copied or extra files.
    if ($exitCode -ge 8) {
        throw "Robocopy failed for $Label (exit code $exitCode)"
    }
}

Write-Host ''
Write-Host "  >  Syncing content from Obsidian vault" -ForegroundColor Blue
Write-Host "     $VaultDir" -ForegroundColor DarkGray
Write-Host ''

# --- Sync projects ---
$VaultProjects = Join-Path $VaultDir 'projects'
if (Test-Path $VaultProjects) {
    Invoke-MarkdownMirror -Source $VaultProjects -Destination $ProjectsDir -Label 'projects'
    $count = (Get-ChildItem $ProjectsDir -Filter '*.md' -File | Measure-Object).Count
    Write-Host "  OK Projects   $count files" -ForegroundColor Green
} else {
    Write-Host "  !! Projects   no vault folder found" -ForegroundColor Yellow
}

# --- Sync pages ---
$VaultPages = Join-Path $VaultDir 'pages'
if (Test-Path $VaultPages) {
    Invoke-MarkdownMirror -Source $VaultPages -Destination $PagesDir -Label 'pages'
    $count = (Get-ChildItem $PagesDir -Filter '*.md' -File | Measure-Object).Count
    Write-Host "  OK Pages      $count files" -ForegroundColor Green
} else {
    Write-Host "  !! Pages      no vault folder found" -ForegroundColor Yellow
}

# --- Embedded images ---
# Embedded images and Excalidraw exports are published per-project by
# sync-obsidian-assets.mjs (only assets referenced via ![[...]] embeds are
# copied, grouped under public/images/<project>/). HEIC/HEIF embeds are then
# converted to WebP by strip-image-metadata.mjs. We intentionally don't mirror
# the whole vault images/ folder, so unreferenced assets stay out of public/.
# These Node scripts inherit VAULT_DIR/EXCALIDRAW_SUBPATH from $env: above.
node .\scripts\sync-obsidian-assets.mjs
node .\scripts\strip-image-metadata.mjs

Write-Host ''
Write-Host '  Done' -ForegroundColor Green
Write-Host ''

# Reset LASTEXITCODE so callers don't see Robocopy's non-zero success codes.
$LASTEXITCODE = 0
