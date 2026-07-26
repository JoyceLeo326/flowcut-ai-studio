[CmdletBinding()]
param(
    [ValidateSet("Auto", "Chrome", "Edge")]
    [string]$Browser = "Auto",

    [string]$DataRoot = "D:\VisionCut-Data",

    [ValidateRange(1024, 65535)]
    [int]$Port = 3200,

    [switch]$ExactPort,

    [switch]$NoBrowser,

    [switch]$ValidateOnly
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

$browserInfo = $null
$browserName = "Chrome"
if (-not $NoBrowser) {
    $browserInfo = Resolve-VisionCutBrowser -Browser $Browser
    $browserName = $browserInfo.Browser
} elseif ($Browser -ne "Auto") {
    $browserName = $Browser
}

$layout = Get-VisionCutStorageLayout `
    -DataRoot $resolvedDataRoot `
    -Browser $browserName

$existingServices = @(Get-VisionCutRepoServices -RepoRoot $repoRoot)
$service = $null
$matchingService = @($existingServices | Where-Object { $_.Port -eq $Port })

if ($matchingService.Count -gt 0) {
    $service = $matchingService[0]
} elseif (-not $ExactPort -and $existingServices.Count -eq 1) {
    $service = $existingServices[0]
} elseif (-not $ExactPort -and $existingServices.Count -gt 1) {
    $ports = ($existingServices | ForEach-Object { $_.Port } | Sort-Object) -join ", "
    throw (
        "Multiple VisionCut services are already running on ports $ports. " +
        "Choose one with -ExactPort -Port <port>."
    )
}

if ($null -eq $service) {
    $portOwner = Get-VisionCutPortOwner -Port $Port
    if ($null -ne $portOwner) {
        throw (
            "Port $Port is occupied by PID $($portOwner.ProcessId) " +
            "($($portOwner.Name)). VisionCut will not stop or reuse an unrelated process. " +
            "Choose another port with -Port."
        )
    }
}

if ($ValidateOnly) {
    $servicePlan = if ($null -ne $service) {
        "reuse port $($service.Port), PID $($service.ProcessId)"
    } else {
        "start on 127.0.0.1:$Port"
    }
    $browserPlan = if ($NoBrowser) {
        "disabled"
    } else {
        "$($browserInfo.Browser): $($browserInfo.Path)"
    }

    [pscustomobject]@{
        Validation   = "passed"
        RepoRoot     = $repoRoot
        DataRoot     = $layout.DataRoot
        UserDataDir  = $layout.UserDataDir
        Downloads    = $layout.Downloads
        Temp         = $layout.Temp
        ServicePlan  = $servicePlan
        BrowserPlan  = $browserPlan
    } | Format-List
    return
}

Initialize-VisionCutStorageLayout -Layout $layout

$env:TEMP = $layout.Temp
$env:TMP = $layout.Temp
$env:BUN_INSTALL = Join-Path $layout.Cache "bun-home"
$env:BUN_CACHE_DIR = Join-Path $layout.Cache "bun"
$env:BUN_INSTALL_CACHE_DIR = Join-Path $layout.Cache "bun-install"
$env:npm_config_cache = Join-Path $layout.Cache "npm"
$env:XDG_CACHE_HOME = $layout.Cache
$env:NEXT_TELEMETRY_DISABLED = "1"

if ($null -ne $service) {
    $url = "http://127.0.0.1:$($service.Port)/"
    Wait-VisionCutWebReady -Url $url
    $environmentManaged = Test-VisionCutManagedServiceState `
        -Layout $layout `
        -RepoRoot $repoRoot `
        -Service $service
    $serviceResult = [pscustomobject]@{
        Status             = "reused"
        Url                = $url
        Port               = $service.Port
        ProcessId          = $service.ProcessId
        LocalAddress       = $service.LocalAddress
        EnvironmentManaged = $environmentManaged
        Stdout             = $null
        Stderr             = $null
    }
} else {
    $serviceResult = Start-VisionCutWebService `
        -RepoRoot $repoRoot `
        -Port $Port `
        -Layout $layout
}

$downloadPreference = $null
$browserResult = $null
if (-not $NoBrowser) {
    $downloadPreference = Set-VisionCutDownloadPreferences `
        -Layout $layout `
        -Browser $browserInfo.Browser
    $browserResult = Start-VisionCutDedicatedBrowser `
        -BrowserInfo $browserInfo `
        -Layout $layout `
        -Url $serviceResult.Url
}

Write-VisionCutUtf8Json `
    -Value ([ordered]@{
        schemaVersion = 1
        generatedAt = [DateTime]::UtcNow.ToString("o")
        repoRoot = $repoRoot
        dataRoot = $layout.DataRoot
        browser = if ($null -ne $browserInfo) { $browserInfo.Browser } else { $null }
        userDataDir = $layout.UserDataDir
        downloads = $layout.Downloads
        temp = $layout.Temp
        browserCache = $layout.BrowserCache
        mediaCache = $layout.MediaCache
        localUrl = $serviceResult.Url
        serviceEnvironmentManaged = $serviceResult.EnvironmentManaged
        boundary = (
            "Only the dedicated browser profile is redirected. A web page cannot " +
            "move storage used by an arbitrary or default browser profile."
        )
    }) `
    -Path $layout.LayoutManifest `
    -AllowedRoot $layout.DataRoot

Write-Host ""
Write-Host "VisionCut local workspace is ready."
Write-Host "  URL:             $($serviceResult.Url)"
Write-Host "  Service:         $($serviceResult.Status) (PID $($serviceResult.ProcessId))"
Write-Host "  Data root:       $($layout.DataRoot)"
Write-Host "  Browser profile: $($layout.UserDataDir)"
Write-Host "  Downloads:       $($layout.Downloads)"
Write-Host "  Launcher temp:   $($layout.Temp)"
if ($null -ne $downloadPreference) {
    if ($downloadPreference.Updated) {
        Write-Host "  Download rule:   seeded in the dedicated profile"
    } else {
        Write-Host "  Download rule:   retained because the dedicated profile is already open"
    }
}
if ($serviceResult.LocalAddress -notin @("127.0.0.1", "::1")) {
    Write-Warning (
        "The reused service listens on $($serviceResult.LocalAddress). " +
        "This script only starts new services on 127.0.0.1."
    )
}
if (-not $serviceResult.EnvironmentManaged) {
    Write-Warning (
        "The existing service was reused. Its inherited TEMP/cache environment " +
        "cannot be changed retroactively or verified by this launcher. The dedicated " +
        "browser profile and browser-managed media still use D:."
    )
}
Write-Host ""
Write-Host (
    "Important: use the browser window opened by this script. Opening the URL in " +
    "your normal browser may place IndexedDB/OPFS data in that browser's default profile."
)
