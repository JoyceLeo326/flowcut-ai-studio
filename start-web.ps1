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

$launcher = Join-Path $PSScriptRoot "scripts\windows\Start-VisionCutLocal.ps1"
if (-not (Test-Path -LiteralPath $launcher -PathType Leaf)) {
    throw "VisionCut Windows launcher is missing: $launcher"
}

& $launcher @PSBoundParameters
