# Shared helper: parse a deploy.env (KEY=VALUE) file into a hashtable.
# Lines that are blank or start with '#' are ignored.
function Import-DeployEnv {
    param([Parameter(Mandatory = $true)][string]$Path)

    $config = @{}
    if (-not (Test-Path $Path)) { return $config }

    foreach ($line in Get-Content -LiteralPath $Path) {
        $trimmed = $line.Trim()
        if ($trimmed -eq '' -or $trimmed.StartsWith('#')) { continue }
        $pair = $trimmed -split '=', 2
        if ($pair.Count -eq 2) { $config[$pair[0].Trim()] = $pair[1].Trim() }
    }
    return $config
}
