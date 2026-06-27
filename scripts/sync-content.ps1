#Requires -Version 5.1
<#
.SYNOPSIS
    Pulls markdown content from the Obsidian vault into the website source.
.DESCRIPTION
    Run before `npm run build` or `npm run deploy` to pick up vault edits.
    PowerShell equivalent of sync-content.sh.
#>
$ErrorActionPreference = 'Stop'

$RepoRoot = Resolve-Path (Join-Path $PSScriptRoot '..')
Set-Location $RepoRoot

# Source: Obsidian vault content folder (VAULT_SUBPATH is relative to $HOME).
. "$PSScriptRoot\load-deploy-env.ps1"
$cfg = Import-DeployEnv (Join-Path $RepoRoot 'deploy.env')
$VaultSubpath = $cfg['VAULT_SUBPATH']
if (-not $VaultSubpath) { throw 'Set VAULT_SUBPATH in deploy.env (copy deploy.env.example).' }
$VaultDir = Join-Path $HOME ($VaultSubpath -replace '/', '\')
$env:VAULT_DIR = $VaultDir
if ($cfg['EXCALIDRAW_SUBPATH']) { $env:EXCALIDRAW_SUBPATH = $cfg['EXCALIDRAW_SUBPATH'] }

# Destinations
$ProjectsDir = Join-Path $RepoRoot 'src\content\projects'
$PagesDir    = Join-Path $RepoRoot 'src\content\pages'
$ImagesDir   = Join-Path $RepoRoot 'public\images'

# Ensure destination directories exist
New-Item -ItemType Directory -Path $ProjectsDir -Force | Out-Null
New-Item -ItemType Directory -Path $PagesDir    -Force | Out-Null
New-Item -ItemType Directory -Path $ImagesDir   -Force | Out-Null

function Invoke-MarkdownMirror {
    param(
        [Parameter(Mandatory = $true)]
        [string]$Source,

        [Parameter(Mandatory = $true)]
        [string]$Destination,

        [Parameter(Mandatory = $true)]
        [string]$Label
    )

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

# --- Sync images ---
$VaultImages = Join-Path $VaultDir 'images'
if (Test-Path $VaultImages) {
    & robocopy $VaultImages $ImagesDir /E /NJH /NJS /NP /NFL /NDL *> $null
    $exitCode = $LASTEXITCODE
    if ($exitCode -ge 8) {
        throw "Robocopy failed for images (exit code $exitCode)"
    }
    $count = (Get-ChildItem $ImagesDir -Recurse -File -Exclude '.embed-manifest.json' | Measure-Object).Count
    Write-Host "  OK Images     $count files" -ForegroundColor Green
} else {
    Write-Host "  !! Images     no vault folder found" -ForegroundColor Yellow
}

node .\scripts\sync-obsidian-assets.mjs
node .\scripts\strip-image-metadata.mjs

Write-Host ''
Write-Host '  Done' -ForegroundColor Green
Write-Host ''

# Reset LASTEXITCODE so callers don't see Robocopy's non-zero success codes.
$LASTEXITCODE = 0
