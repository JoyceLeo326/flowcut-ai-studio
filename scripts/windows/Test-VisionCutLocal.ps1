[CmdletBinding()]
param()

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

$repoRoot = Convert-Path (Join-Path $PSScriptRoot "..\..")
$modulePath = Join-Path $PSScriptRoot "VisionCut.Windows.psm1"
Import-Module $modulePath -Force

$script:assertionCount = 0

function Assert-True {
    param(
        [Parameter(Mandatory)]
        [bool]$Condition,

        [Parameter(Mandatory)]
        [string]$Message
    )

    $script:assertionCount += 1
    if (-not $Condition) {
        throw "Assertion failed: $Message"
    }
}

function Assert-Throws {
    param(
        [Parameter(Mandatory)]
        [scriptblock]$Action,

        [Parameter(Mandatory)]
        [string]$Message
    )

    $threw = $false
    try {
        & $Action
    } catch {
        $threw = $true
    }

    Assert-True -Condition $threw -Message $Message
}

$testRoot = Join-Path $repoRoot (".tmp\visioncut-windows-script-test-" + $PID)
$safeTestRoot = Resolve-VisionCutDataRoot -DataRoot $testRoot -RepoRoot $repoRoot

try {
    Assert-True `
        -Condition ($safeTestRoot.StartsWith("D:\", [System.StringComparison]::OrdinalIgnoreCase)) `
        -Message "test data root must be on D:"
    Assert-True `
        -Condition (Test-VisionCutPathWithin -Candidate $safeTestRoot -Root $repoRoot) `
        -Message "repository-local data root must be accepted"

    Assert-Throws `
        -Action {
            Resolve-VisionCutDataRoot `
                -DataRoot "C:\VisionCut-Data" `
                -RepoRoot $repoRoot | Out-Null
        } `
        -Message "C: data root must be rejected"
    Assert-Throws `
        -Action {
            Resolve-VisionCutDataRoot -DataRoot "D:\" -RepoRoot $repoRoot | Out-Null
        } `
        -Message "drive root must be rejected"
    Assert-Throws `
        -Action {
            Resolve-VisionCutDataRoot `
                -DataRoot "D:\Unapproved-VisionCut-Data" `
                -RepoRoot $repoRoot | Out-Null
        } `
        -Message "unapproved D: root must be rejected"

    $layout = Get-VisionCutStorageLayout -DataRoot $safeTestRoot -Browser "Chrome"
    Initialize-VisionCutStorageLayout -Layout $layout

    foreach ($path in @(
        $layout.UserDataDir,
        $layout.BrowserCache,
        $layout.MediaCache,
        $layout.Downloads,
        $layout.Temp,
        $layout.Cache,
        $layout.Logs,
        $layout.Runtime
    )) {
        Assert-True `
            -Condition (Test-VisionCutPathWithin `
                -Candidate $path `
                -Root $safeTestRoot) `
            -Message "generated path must remain below DataRoot: $path"
    }

    $preferenceResult = Set-VisionCutDownloadPreferences `
        -Layout $layout `
        -Browser "Chrome"
    Assert-True `
        -Condition $preferenceResult.Updated `
        -Message "fresh dedicated profile preferences must be written"
    Assert-True `
        -Condition (Test-Path -LiteralPath $preferenceResult.Path -PathType Leaf) `
        -Message "Preferences file must exist"

    $preferencesJson = [System.IO.File]::ReadAllText(
        $preferenceResult.Path,
        [System.Text.Encoding]::UTF8
    )
    $preferences = $preferencesJson | ConvertFrom-Json
    Assert-True `
        -Condition ($preferences.download.default_directory -eq $layout.Downloads) `
        -Message "download directory must point to D: DataRoot"
    Assert-True `
        -Condition ($preferences.savefile.default_directory -eq $layout.Downloads) `
        -Message "save-file directory must point to D: DataRoot"
    Assert-True `
        -Condition (-not $preferences.download.prompt_for_download) `
        -Message "dedicated profile should use its seeded download directory"

    $scripts = @(
        (Join-Path $repoRoot "start-web.ps1"),
        (Join-Path $PSScriptRoot "Start-VisionCutLocal.ps1"),
        (Join-Path $PSScriptRoot "Stop-VisionCutLocal.ps1"),
        (Join-Path $PSScriptRoot "Test-VisionCutLocal.ps1"),
        $modulePath
    )
    foreach ($scriptPath in $scripts) {
        $tokens = $null
        $parseErrors = $null
        [System.Management.Automation.Language.Parser]::ParseFile(
            $scriptPath,
            [ref]$tokens,
            [ref]$parseErrors
        ) | Out-Null
        Assert-True `
            -Condition ($parseErrors.Count -eq 0) `
            -Message "PowerShell syntax must be valid: $scriptPath"
    }

    $bunPath = Resolve-VisionCutBun -RepoRoot $repoRoot
    Assert-True `
        -Condition (Test-Path -LiteralPath $bunPath -PathType Leaf) `
        -Message "Bun runtime must resolve for a fresh service start"
    Assert-True `
        -Condition ($bunPath.StartsWith("D:\", [System.StringComparison]::OrdinalIgnoreCase)) `
        -Message "the resolved repository Bun runtime should be on D:"

    $repoServices = @(Get-VisionCutRepoServices -RepoRoot $repoRoot)
    foreach ($service in $repoServices) {
        Assert-True `
            -Condition ($service.Port -ge 1 -and $service.Port -le 65535) `
            -Message "detected repository service port must be valid"
        Assert-True `
            -Condition (Test-VisionCutServiceOwner `
                -PortOwner $service `
                -RepoRoot $repoRoot) `
            -Message "detected service must belong to this worktree"
    }

    Write-Host "PASS: $script:assertionCount assertions"
} finally {
    if (Test-Path -LiteralPath $safeTestRoot) {
        $isSafeCleanup = (
            (Test-VisionCutPathWithin -Candidate $safeTestRoot -Root $repoRoot) -and
            ([System.IO.Path]::GetFileName($safeTestRoot) -like "visioncut-windows-script-test-*")
        )
        if (-not $isSafeCleanup) {
            throw "Refusing unsafe test cleanup: $safeTestRoot"
        }
        Remove-Item -LiteralPath $safeTestRoot -Recurse -Force
    }
}
