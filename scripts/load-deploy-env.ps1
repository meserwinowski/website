<#
load-deploy-env.ps1 — Read deploy.env for the PowerShell scripts.

The shell scripts can `source` deploy.env directly, but PowerShell needs a tiny
parser. This helper intentionally supports the simple format used by
deploy.env.example: KEY=VALUE lines, with blank lines and # comments ignored.
It does not try to be a full dotenv parser with quoting or variable expansion.
#>

# Shared helper: parse a deploy.env (KEY=VALUE) file into a hashtable.
function Import-DeployEnv {
    # A param block declares inputs for the function. Marking Path as mandatory
    # means callers get a clear PowerShell error if they forget to pass a file.
    param([Parameter(Mandatory = $true)][string]$Path)

    $config = @{}
    if (-not (Test-Path $Path)) { return $config }

    foreach ($line in Get-Content -LiteralPath $Path) {
        $trimmed = $line.Trim()
        if ($trimmed -eq '' -or $trimmed.StartsWith('#')) { continue }

        # Split only on the first '=', so values may contain additional equals
        # signs (for example, inside a token) without being truncated.
        $pair = $trimmed -split '=', 2
        if ($pair.Count -eq 2) { $config[$pair[0].Trim()] = $pair[1].Trim() }
    }
    return $config
}
