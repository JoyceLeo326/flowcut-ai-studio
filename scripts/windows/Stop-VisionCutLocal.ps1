[CmdletBinding()]
param(
    [string]$DataRoot = "D:\VisionCut-Data",

    [ValidateRange(1024, 65535)]
    [int]$Port = 3200
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

$repoRoot = Convert-Path (Join-Path $PSScriptRoot "..\..")
$modulePath = Join-Path $PSScriptRoot "VisionCut.Windows.psm1"
Import-Module $modulePath -Force

$requestedDataRoot = if ([System.IO.Path]::IsPathRooted($DataRoot)) {
    $DataRoot
} else {
    Join-Path $repoRoot $DataRoot
}
$resolvedDataRoot = Resolve-VisionCutDataRoot `
    -DataRoot $requestedDataRoot `
    -RepoRoot $repoRoot
$layout = Get-VisionCutStorageLayout `
    -DataRoot $resolvedDataRoot `
    -Browser "Chrome"

$portOwner = Get-VisionCutPortOwner -Port $Port
if ($null -eq $portOwner) {
    Write-Host "No process is listening on port $Port."
    return
}

if (-not (Test-VisionCutServiceOwner -PortOwner $portOwner -RepoRoot $repoRoot)) {
    throw (
        "Port $Port belongs to PID $($portOwner.ProcessId), but that process is not " +
        "a VisionCut service from this worktree. Nothing was stopped."
    )
}

$processIds = New-Object System.Collections.Generic.List[int]
$processIds.Add([int]$portOwner.ProcessId)

$currentProcess = Get-CimInstance `
    Win32_Process `
    -Filter "ProcessId=$($portOwner.ProcessId)" `
    -ErrorAction SilentlyContinue
while ($null -ne $currentProcess -and [int]$currentProcess.ParentProcessId -gt 0) {
    $parentProcess = Get-CimInstance `
        Win32_Process `
        -Filter "ProcessId=$([int]$currentProcess.ParentProcessId)" `
        -ErrorAction SilentlyContinue
    if ($null -eq $parentProcess) {
        break
    }

    $parentOwner = [pscustomobject]@{
        Port         = $Port
        ProcessId    = [int]$parentProcess.ProcessId
        LocalAddress = "parent"
        Name         = $parentProcess.Name
        CommandLine  = $parentProcess.CommandLine
    }
    if (-not (Test-VisionCutServiceOwner `
        -PortOwner $parentOwner `
        -RepoRoot $repoRoot)) {
        break
    }

    $processIds.Add([int]$parentProcess.ProcessId)
    $currentProcess = $parentProcess
}

$statePath = Join-Path $layout.Runtime "web-$Port.json"
if (Test-Path -LiteralPath $statePath -PathType Leaf) {
    $stateJson = [System.IO.File]::ReadAllText(
        $statePath,
        [System.Text.Encoding]::UTF8
    )
    try {
        $state = $stateJson | ConvertFrom-Json
    } catch {
        throw "Runtime state is invalid; no process was stopped: $statePath"
    }

    if (
        $state.repoRoot -eq $repoRoot -and
        $null -ne $state.launcherProcessId
    ) {
        $launcherProcess = Get-CimInstance `
            Win32_Process `
            -Filter "ProcessId=$([int]$state.launcherProcessId)" `
            -ErrorAction SilentlyContinue
        if ($null -ne $launcherProcess) {
            $launcherOwner = [pscustomobject]@{
                Port         = $Port
                ProcessId    = [int]$launcherProcess.ProcessId
                LocalAddress = "launcher"
                Name         = $launcherProcess.Name
                CommandLine  = $launcherProcess.CommandLine
            }
            if (Test-VisionCutServiceOwner `
                -PortOwner $launcherOwner `
                -RepoRoot $repoRoot) {
                $processIds.Add([int]$launcherProcess.ProcessId)
            }
        }
    }
}

$orderedProcessIds = @($processIds | Select-Object -Unique)
[array]::Reverse($orderedProcessIds)
foreach ($processId in $orderedProcessIds) {
    Stop-Process -Id $processId -Force -ErrorAction Stop
}

$deadline = [DateTime]::UtcNow.AddSeconds(10)
while (
    [DateTime]::UtcNow -lt $deadline -and
    $null -ne (Get-VisionCutPortOwner -Port $Port)
) {
    Start-Sleep -Milliseconds 250
}

if ($null -ne (Get-VisionCutPortOwner -Port $Port)) {
    throw "VisionCut processes were stopped, but port $Port is still occupied."
}

Write-Host "Stopped VisionCut service from this worktree on port $Port."
