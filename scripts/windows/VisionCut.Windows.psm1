Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

function ConvertTo-VisionCutFullPath {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory)]
        [string]$Path
    )

    if (-not [System.IO.Path]::IsPathRooted($Path)) {
        throw "Path must be absolute: $Path"
    }

    $fullPath = [System.IO.Path]::GetFullPath($Path)
    $pathRoot = [System.IO.Path]::GetPathRoot($fullPath)
    if (-not $fullPath.Equals($pathRoot, [System.StringComparison]::OrdinalIgnoreCase)) {
        $fullPath = $fullPath.TrimEnd(
            [System.IO.Path]::DirectorySeparatorChar,
            [System.IO.Path]::AltDirectorySeparatorChar
        )
    }

    return $fullPath
}

function Test-VisionCutPathWithin {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory)]
        [string]$Candidate,

        [Parameter(Mandatory)]
        [string]$Root,

        [switch]$AllowRoot
    )

    $candidatePath = ConvertTo-VisionCutFullPath -Path $Candidate
    $rootPath = ConvertTo-VisionCutFullPath -Path $Root

    if ($candidatePath.Equals($rootPath, [System.StringComparison]::OrdinalIgnoreCase)) {
        return [bool]$AllowRoot
    }

    $rootPrefix = $rootPath + [System.IO.Path]::DirectorySeparatorChar
    return $candidatePath.StartsWith(
        $rootPrefix,
        [System.StringComparison]::OrdinalIgnoreCase
    )
}

function Assert-VisionCutNoReparsePoint {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory)]
        [string]$Path
    )

    $current = ConvertTo-VisionCutFullPath -Path $Path
    $pathRoot = [System.IO.Path]::GetPathRoot($current)

    while ($current -and -not $current.Equals(
        $pathRoot,
        [System.StringComparison]::OrdinalIgnoreCase
    )) {
        if (Test-Path -LiteralPath $current) {
            $item = Get-Item -LiteralPath $current -Force
            if (($item.Attributes -band [System.IO.FileAttributes]::ReparsePoint) -ne 0) {
                throw "VisionCut data paths cannot pass through a junction or symlink: $current"
            }
        }

        $parent = [System.IO.Path]::GetDirectoryName($current)
        if ([string]::IsNullOrWhiteSpace($parent) -or $parent -eq $current) {
            break
        }
        $current = $parent
    }
}

function Resolve-VisionCutDataRoot {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory)]
        [string]$DataRoot,

        [Parameter(Mandatory)]
        [string]$RepoRoot
    )

    $repoPath = ConvertTo-VisionCutFullPath -Path $RepoRoot
    $dataPath = ConvertTo-VisionCutFullPath -Path $DataRoot
    $approvedExternalRoot = ConvertTo-VisionCutFullPath -Path "D:\VisionCut-Data"

    $dataDrive = [System.IO.Path]::GetPathRoot($dataPath)
    if (-not $dataDrive.Equals("D:\", [System.StringComparison]::OrdinalIgnoreCase)) {
        throw "VisionCut local media data must stay on drive D:. Rejected: $dataPath"
    }

    $insideRepo = Test-VisionCutPathWithin -Candidate $dataPath -Root $repoPath
    $insideApprovedRoot = Test-VisionCutPathWithin `
        -Candidate $dataPath `
        -Root $approvedExternalRoot `
        -AllowRoot

    if (-not $insideRepo -and -not $insideApprovedRoot) {
        throw (
            "DataRoot must be a child of the current repository or " +
            "D:\VisionCut-Data. Rejected: $dataPath"
        )
    }

    Assert-VisionCutNoReparsePoint -Path $dataPath
    return $dataPath
}

function Get-VisionCutStorageLayout {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory)]
        [string]$DataRoot,

        [Parameter(Mandatory)]
        [ValidateSet("Chrome", "Edge")]
        [string]$Browser
    )

    $root = ConvertTo-VisionCutFullPath -Path $DataRoot
    $browserRoot = Join-Path $root ("Browser\" + $Browser)

    return [pscustomobject]@{
        DataRoot       = $root
        BrowserRoot    = $browserRoot
        UserDataDir    = Join-Path $browserRoot "User Data"
        BrowserCache   = Join-Path $browserRoot "Cache"
        MediaCache     = Join-Path $browserRoot "Media Cache"
        Downloads      = Join-Path $root "Downloads"
        Temp           = Join-Path $root "Temp"
        Cache          = Join-Path $root "Caches"
        Logs           = Join-Path $root "Logs"
        Runtime        = Join-Path $root "Runtime"
        LayoutManifest = Join-Path $root "visioncut-storage-layout.json"
    }
}

function Initialize-VisionCutStorageLayout {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory)]
        [pscustomobject]$Layout
    )

    $paths = @(
        $Layout.DataRoot,
        $Layout.BrowserRoot,
        $Layout.UserDataDir,
        $Layout.BrowserCache,
        $Layout.MediaCache,
        $Layout.Downloads,
        $Layout.Temp,
        $Layout.Cache,
        $Layout.Logs,
        $Layout.Runtime
    )

    foreach ($path in $paths) {
        if (-not (Test-VisionCutPathWithin `
            -Candidate $path `
            -Root $Layout.DataRoot `
            -AllowRoot)) {
            throw "Generated storage path escaped DataRoot: $path"
        }
    }

    New-Item -ItemType Directory -Force -Path $paths | Out-Null
}

function Write-VisionCutUtf8Json {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory)]
        [object]$Value,

        [Parameter(Mandatory)]
        [string]$Path,

        [Parameter(Mandatory)]
        [string]$AllowedRoot
    )

    if (-not (Test-VisionCutPathWithin `
        -Candidate $Path `
        -Root $AllowedRoot)) {
        throw "Refusing to write outside the approved data root: $Path"
    }

    $parent = [System.IO.Path]::GetDirectoryName($Path)
    New-Item -ItemType Directory -Force -Path $parent | Out-Null

    $json = $Value | ConvertTo-Json -Depth 100
    $encoding = New-Object System.Text.UTF8Encoding($false)
    [System.IO.File]::WriteAllText($Path, $json, $encoding)
}

function Set-VisionCutObjectProperty {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory)]
        [object]$InputObject,

        [Parameter(Mandatory)]
        [string]$Name,

        [AllowNull()]
        [object]$Value
    )

    $property = $InputObject.PSObject.Properties[$Name]
    if ($null -eq $property) {
        Add-Member -InputObject $InputObject -MemberType NoteProperty -Name $Name -Value $Value
        return
    }

    $property.Value = $Value
}

function Get-VisionCutObjectSection {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory)]
        [object]$InputObject,

        [Parameter(Mandatory)]
        [string]$Name
    )

    $property = $InputObject.PSObject.Properties[$Name]
    if (
        $null -eq $property -or
        $null -eq $property.Value -or
        $property.Value -is [string] -or
        $property.Value.GetType().IsPrimitive
    ) {
        $section = [pscustomobject]@{}
        Set-VisionCutObjectProperty -InputObject $InputObject -Name $Name -Value $section
        return $section
    }

    return $property.Value
}

function Test-VisionCutBrowserProfileInUse {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory)]
        [ValidateSet("Chrome", "Edge")]
        [string]$Browser,

        [Parameter(Mandatory)]
        [string]$UserDataDir
    )

    $processName = if ($Browser -eq "Chrome") { "chrome.exe" } else { "msedge.exe" }
    $profilePath = ConvertTo-VisionCutFullPath -Path $UserDataDir

    try {
        $processes = Get-CimInstance Win32_Process -Filter "Name='$processName'"
    } catch {
        throw "Could not verify whether the dedicated $Browser profile is active: $($_.Exception.Message)"
    }

    foreach ($process in $processes) {
        if (
            $process.CommandLine -and
            $process.CommandLine.IndexOf(
                $profilePath,
                [System.StringComparison]::OrdinalIgnoreCase
            ) -ge 0
        ) {
            return $true
        }
    }

    return $false
}

function Set-VisionCutDownloadPreferences {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory)]
        [pscustomobject]$Layout,

        [Parameter(Mandatory)]
        [ValidateSet("Chrome", "Edge")]
        [string]$Browser
    )

    if (Test-VisionCutBrowserProfileInUse `
        -Browser $Browser `
        -UserDataDir $Layout.UserDataDir) {
        return [pscustomobject]@{
            Updated = $false
            Reason  = "profile-in-use"
            Path    = Join-Path $Layout.UserDataDir "Default\Preferences"
        }
    }

    $defaultProfile = Join-Path $Layout.UserDataDir "Default"
    New-Item -ItemType Directory -Force -Path $defaultProfile | Out-Null
    $preferencesPath = Join-Path $defaultProfile "Preferences"

    if (Test-Path -LiteralPath $preferencesPath -PathType Leaf) {
        $rawPreferences = [System.IO.File]::ReadAllText(
            $preferencesPath,
            [System.Text.Encoding]::UTF8
        )
        try {
            $preferences = $rawPreferences | ConvertFrom-Json
        } catch {
            throw (
                "The dedicated browser Preferences file is invalid. " +
                "It was not overwritten: $preferencesPath"
            )
        }
    } else {
        $preferences = [pscustomobject]@{}
    }

    $download = Get-VisionCutObjectSection -InputObject $preferences -Name "download"
    Set-VisionCutObjectProperty `
        -InputObject $download `
        -Name "default_directory" `
        -Value $Layout.Downloads
    Set-VisionCutObjectProperty `
        -InputObject $download `
        -Name "directory_upgrade" `
        -Value $true
    Set-VisionCutObjectProperty `
        -InputObject $download `
        -Name "prompt_for_download" `
        -Value $false

    $saveFile = Get-VisionCutObjectSection -InputObject $preferences -Name "savefile"
    Set-VisionCutObjectProperty `
        -InputObject $saveFile `
        -Name "default_directory" `
        -Value $Layout.Downloads

    if (Test-Path -LiteralPath $preferencesPath -PathType Leaf) {
        $backupPath = $preferencesPath + ".visioncut-backup"
        if (-not (Test-VisionCutPathWithin `
            -Candidate $backupPath `
            -Root $Layout.UserDataDir)) {
            throw "Unsafe Preferences backup path: $backupPath"
        }
        Copy-Item -LiteralPath $preferencesPath -Destination $backupPath -Force
    }

    Write-VisionCutUtf8Json `
        -Value $preferences `
        -Path $preferencesPath `
        -AllowedRoot $Layout.UserDataDir

    return [pscustomobject]@{
        Updated = $true
        Reason  = "dedicated-profile-preference"
        Path    = $preferencesPath
    }
}

function Resolve-VisionCutBrowser {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory)]
        [ValidateSet("Auto", "Chrome", "Edge")]
        [string]$Browser
    )

    $candidates = @(
        [pscustomobject]@{
            Browser = "Chrome"
            Path = Join-Path $env:ProgramFiles "Google\Chrome\Application\chrome.exe"
        },
        [pscustomobject]@{
            Browser = "Chrome"
            Path = Join-Path ${env:ProgramFiles(x86)} "Google\Chrome\Application\chrome.exe"
        },
        [pscustomobject]@{
            Browser = "Chrome"
            Path = Join-Path $env:LOCALAPPDATA "Google\Chrome\Application\chrome.exe"
        },
        [pscustomobject]@{
            Browser = "Edge"
            Path = Join-Path $env:ProgramFiles "Microsoft\Edge\Application\msedge.exe"
        },
        [pscustomobject]@{
            Browser = "Edge"
            Path = Join-Path ${env:ProgramFiles(x86)} "Microsoft\Edge\Application\msedge.exe"
        }
    )

    foreach ($candidate in $candidates) {
        if (
            ($Browser -eq "Auto" -or $candidate.Browser -eq $Browser) -and
            (Test-Path -LiteralPath $candidate.Path -PathType Leaf)
        ) {
            return $candidate
        }
    }

    throw "No supported $Browser browser executable was found. Install Chrome or Edge."
}

function Resolve-VisionCutBun {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory)]
        [string]$RepoRoot
    )

    $candidates = New-Object System.Collections.Generic.List[string]
    $candidates.Add((Join-Path $RepoRoot ".tools\bun\1.3.11\bun-windows-x64\bun.exe"))

    try {
        $commonGitDirectory = (& git -C $RepoRoot rev-parse --git-common-dir 2>$null)
        if ($LASTEXITCODE -eq 0 -and $commonGitDirectory) {
            $commonGitDirectory = ConvertTo-VisionCutFullPath -Path $commonGitDirectory.Trim()
            $mainWorktree = [System.IO.Path]::GetDirectoryName($commonGitDirectory)
            $candidates.Add(
                (Join-Path $mainWorktree ".tools\bun\1.3.11\bun-windows-x64\bun.exe")
            )
        }
    } catch {
        # Fall through to PATH discovery.
    }

    $bunCommand = Get-Command bun.exe -ErrorAction SilentlyContinue
    if ($null -ne $bunCommand) {
        $candidates.Add($bunCommand.Source)
    }

    foreach ($candidate in $candidates) {
        if (Test-Path -LiteralPath $candidate -PathType Leaf) {
            return ConvertTo-VisionCutFullPath -Path $candidate
        }
    }

    throw (
        "Bun was not found. Keep the repository Bun runtime on D: under " +
        ".tools\bun\1.3.11\bun-windows-x64 or install Bun on PATH."
    )
}

function Get-VisionCutPortOwner {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory)]
        [ValidateRange(1, 65535)]
        [int]$Port
    )

    $listeners = @(
        Get-NetTCPConnection -State Listen -LocalPort $Port -ErrorAction SilentlyContinue
    )
    if ($listeners.Count -eq 0) {
        return $null
    }

    $listener = $listeners | Select-Object -First 1
    $process = Get-CimInstance `
        Win32_Process `
        -Filter "ProcessId=$($listener.OwningProcess)" `
        -ErrorAction SilentlyContinue

    return [pscustomobject]@{
        Port        = $Port
        ProcessId   = [int]$listener.OwningProcess
        LocalAddress = $listener.LocalAddress
        Name        = $process.Name
        CommandLine = $process.CommandLine
    }
}

function Test-VisionCutServiceOwner {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory)]
        [object]$PortOwner,

        [Parameter(Mandatory)]
        [string]$RepoRoot
    )

    if ($null -eq $PortOwner -or [string]::IsNullOrWhiteSpace($PortOwner.CommandLine)) {
        return $false
    }

    $repoPath = ConvertTo-VisionCutFullPath -Path $RepoRoot
    $isCurrentRepo = $PortOwner.CommandLine.IndexOf(
        $repoPath,
        [System.StringComparison]::OrdinalIgnoreCase
    ) -ge 0
    $isWebRuntime = (
        $PortOwner.CommandLine.IndexOf(
            "next",
            [System.StringComparison]::OrdinalIgnoreCase
        ) -ge 0 -or
        $PortOwner.CommandLine.IndexOf(
            "bun",
            [System.StringComparison]::OrdinalIgnoreCase
        ) -ge 0
    )

    return $isCurrentRepo -and $isWebRuntime
}

function Test-VisionCutWebEndpoint {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory)]
        [ValidateRange(1, 65535)]
        [int]$Port
    )

    try {
        $response = Invoke-WebRequest `
            -Uri "http://127.0.0.1:$Port/" `
            -UseBasicParsing `
            -TimeoutSec 2
        $isNext = $response.Headers["X-Powered-By"] -eq "Next.js"
        $isVisionCut = (
            $response.Content.IndexOf(
                "VisionCut",
                [System.StringComparison]::OrdinalIgnoreCase
            ) -ge 0 -or
            $response.Content.IndexOf(
                "OpenCut",
                [System.StringComparison]::OrdinalIgnoreCase
            ) -ge 0
        )
        return $response.StatusCode -ge 200 -and $isNext -and $isVisionCut
    } catch {
        return $false
    }
}

function Get-VisionCutRepoServices {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory)]
        [string]$RepoRoot
    )

    $rows = New-Object System.Collections.Generic.List[object]
    $seen = @{}
    $listeners = @(Get-NetTCPConnection -State Listen -ErrorAction SilentlyContinue)
    $processById = @{}
    foreach ($process in @(Get-CimInstance Win32_Process -ErrorAction SilentlyContinue)) {
        $processById[[int]$process.ProcessId] = $process
    }

    foreach ($listener in $listeners) {
        $key = "$($listener.OwningProcess):$($listener.LocalPort)"
        if ($seen.ContainsKey($key)) {
            continue
        }
        $seen[$key] = $true

        $process = $processById[[int]$listener.OwningProcess]
        $owner = [pscustomobject]@{
            Port         = [int]$listener.LocalPort
            ProcessId    = [int]$listener.OwningProcess
            LocalAddress = $listener.LocalAddress
            Name         = if ($null -ne $process) { $process.Name } else { $null }
            CommandLine  = if ($null -ne $process) { $process.CommandLine } else { $null }
        }
        if (
            $null -ne $owner -and
            (Test-VisionCutServiceOwner -PortOwner $owner -RepoRoot $RepoRoot) -and
            (Test-VisionCutWebEndpoint -Port $owner.Port)
        ) {
            $rows.Add($owner)
        }
    }

    return $rows.ToArray()
}

function Test-VisionCutManagedServiceState {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory)]
        [pscustomobject]$Layout,

        [Parameter(Mandatory)]
        [string]$RepoRoot,

        [Parameter(Mandatory)]
        [object]$Service
    )

    $statePath = Join-Path $Layout.Runtime "web-$($Service.Port).json"
    if (-not (Test-Path -LiteralPath $statePath -PathType Leaf)) {
        return $false
    }

    try {
        $stateJson = [System.IO.File]::ReadAllText(
            $statePath,
            [System.Text.Encoding]::UTF8
        )
        $state = $stateJson | ConvertFrom-Json
        if (
            $state.schemaVersion -ne 1 -or
            $state.repoRoot -ne $RepoRoot -or
            [int]$state.port -ne [int]$Service.Port -or
            -not (Test-VisionCutPathWithin `
                -Candidate $state.stdout `
                -Root $Layout.Logs) -or
            -not (Test-VisionCutPathWithin `
                -Candidate $state.stderr `
                -Root $Layout.Logs)
        ) {
            return $false
        }

        $dataRootProperty = $state.PSObject.Properties["dataRoot"]
        if (
            $null -ne $dataRootProperty -and
            $null -ne $dataRootProperty.Value -and
            (ConvertTo-VisionCutFullPath -Path $dataRootProperty.Value) -ne $Layout.DataRoot
        ) {
            return $false
        }

        $launcherProcess = Get-CimInstance `
            Win32_Process `
            -Filter "ProcessId=$([int]$state.launcherProcessId)" `
            -ErrorAction SilentlyContinue
        if (
            $null -eq $launcherProcess -or
            $launcherProcess.Name -ne "bun.exe" -or
            [string]::IsNullOrWhiteSpace($launcherProcess.CommandLine)
        ) {
            return $false
        }

        $portArgument = "--port $($Service.Port)"
        return (
            $launcherProcess.CommandLine.IndexOf(
                "run dev",
                [System.StringComparison]::OrdinalIgnoreCase
            ) -ge 0 -and
            $launcherProcess.CommandLine.IndexOf(
                $portArgument,
                [System.StringComparison]::OrdinalIgnoreCase
            ) -ge 0
        )
    } catch {
        return $false
    }
}

function Wait-VisionCutWebReady {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory)]
        [string]$Url,

        [ValidateRange(1, 300)]
        [int]$TimeoutSeconds = 90,

        [System.Diagnostics.Process]$LauncherProcess
    )

    $deadline = [DateTime]::UtcNow.AddSeconds($TimeoutSeconds)
    while ([DateTime]::UtcNow -lt $deadline) {
        if ($null -ne $LauncherProcess -and $LauncherProcess.HasExited) {
            throw "VisionCut web service exited before it became ready."
        }

        try {
            $response = Invoke-WebRequest `
                -Uri $Url `
                -UseBasicParsing `
                -TimeoutSec 3 `
                -Method Head
            if ($response.StatusCode -ge 200 -and $response.StatusCode -lt 500) {
                return
            }
        } catch {
            Start-Sleep -Milliseconds 500
        }
    }

    throw "VisionCut web service did not become ready within $TimeoutSeconds seconds: $Url"
}

function Start-VisionCutWebService {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory)]
        [string]$RepoRoot,

        [Parameter(Mandatory)]
        [ValidateRange(1024, 65535)]
        [int]$Port,

        [Parameter(Mandatory)]
        [pscustomobject]$Layout
    )

    $bunPath = Resolve-VisionCutBun -RepoRoot $RepoRoot
    $webRoot = Join-Path $RepoRoot "apps\web"
    if (-not (Test-Path -LiteralPath $webRoot -PathType Container)) {
        throw "VisionCut web workspace is missing: $webRoot"
    }

    $timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
    $stdoutPath = Join-Path $Layout.Logs "web-$Port-$timestamp.stdout.log"
    $stderrPath = Join-Path $Layout.Logs "web-$Port-$timestamp.stderr.log"
    $arguments = @(
        "run",
        "dev",
        "--hostname",
        "127.0.0.1",
        "--port",
        [string]$Port
    )

    $process = Start-Process `
        -FilePath $bunPath `
        -ArgumentList $arguments `
        -WorkingDirectory $webRoot `
        -RedirectStandardOutput $stdoutPath `
        -RedirectStandardError $stderrPath `
        -WindowStyle Hidden `
        -PassThru

    $url = "http://127.0.0.1:$Port/"
    try {
        Wait-VisionCutWebReady -Url $url -LauncherProcess $process
    } catch {
        if (-not $process.HasExited) {
            Stop-Process -Id $process.Id -Force -ErrorAction SilentlyContinue
        }
        throw
    }

    $statePath = Join-Path $Layout.Runtime "web-$Port.json"
    Write-VisionCutUtf8Json `
        -Value ([ordered]@{
            schemaVersion = 1
            repoRoot = $RepoRoot
            dataRoot = $Layout.DataRoot
            temp = $Layout.Temp
            cache = $Layout.Cache
            url = $url
            port = $Port
            launcherProcessId = $process.Id
            startedAt = [DateTime]::UtcNow.ToString("o")
            stdout = $stdoutPath
            stderr = $stderrPath
        }) `
        -Path $statePath `
        -AllowedRoot $Layout.DataRoot

    return [pscustomobject]@{
        Status             = "started"
        Url                = $url
        Port               = $Port
        ProcessId          = $process.Id
        LocalAddress       = "127.0.0.1"
        EnvironmentManaged = $true
        Stdout             = $stdoutPath
        Stderr             = $stderrPath
    }
}

function Start-VisionCutDedicatedBrowser {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory)]
        [pscustomobject]$BrowserInfo,

        [Parameter(Mandatory)]
        [pscustomobject]$Layout,

        [Parameter(Mandatory)]
        [string]$Url
    )

    $profileWasActive = Test-VisionCutBrowserProfileInUse `
        -Browser $BrowserInfo.Browser `
        -UserDataDir $Layout.UserDataDir

    $arguments = @(
        ('--user-data-dir="{0}"' -f $Layout.UserDataDir),
        "--profile-directory=Default",
        ('--disk-cache-dir="{0}"' -f $Layout.BrowserCache),
        ('--media-cache-dir="{0}"' -f $Layout.MediaCache),
        "--no-first-run",
        "--no-default-browser-check",
        $(if ($profileWasActive) { "--new-tab" } else { "--new-window" }),
        $Url
    )

    $process = Start-Process `
        -FilePath $BrowserInfo.Path `
        -ArgumentList $arguments `
        -WorkingDirectory $Layout.DataRoot `
        -PassThru

    return [pscustomobject]@{
        Browser          = $BrowserInfo.Browser
        Executable       = $BrowserInfo.Path
        ProcessId        = $process.Id
        ProfileWasActive = $profileWasActive
        UserDataDir      = $Layout.UserDataDir
    }
}

Export-ModuleMember -Function @(
    "ConvertTo-VisionCutFullPath",
    "Test-VisionCutPathWithin",
    "Resolve-VisionCutDataRoot",
    "Get-VisionCutStorageLayout",
    "Initialize-VisionCutStorageLayout",
    "Write-VisionCutUtf8Json",
    "Test-VisionCutBrowserProfileInUse",
    "Set-VisionCutDownloadPreferences",
    "Resolve-VisionCutBrowser",
    "Resolve-VisionCutBun",
    "Get-VisionCutPortOwner",
    "Test-VisionCutServiceOwner",
    "Get-VisionCutRepoServices",
    "Test-VisionCutManagedServiceState",
    "Wait-VisionCutWebReady",
    "Start-VisionCutWebService",
    "Start-VisionCutDedicatedBrowser"
)
