$ErrorActionPreference = "Stop"

$FlowCutRoot = $PSScriptRoot
$FlowCutTools = Join-Path $FlowCutRoot ".tools"
$FlowCutBun = Join-Path $FlowCutTools "bun\1.3.11\bun-windows-x64"
$FlowCutCache = Join-Path $FlowCutTools "cache"
$FlowCutTemp = Join-Path $FlowCutTools "tmp"

New-Item -ItemType Directory -Force -Path $FlowCutCache, $FlowCutTemp | Out-Null

$env:BUN_INSTALL = Join-Path $FlowCutTools "bun-home"
$env:BUN_CACHE_DIR = Join-Path $FlowCutCache "bun"
$env:BUN_INSTALL_CACHE_DIR = Join-Path $FlowCutCache "bun-install"
$env:npm_config_cache = Join-Path $FlowCutCache "npm"
$env:XDG_CACHE_HOME = $FlowCutCache
$env:TEMP = $FlowCutTemp
$env:TMP = $FlowCutTemp
$env:NEXT_TELEMETRY_DISABLED = "1"
$env:PATH = "$FlowCutBun;$env:PATH"

# The local editor only needs its public origin. Optional cloud services stay
# disabled unless their real credentials are provided by the operator.
if (-not $env:NEXT_PUBLIC_SITE_URL) { $env:NEXT_PUBLIC_SITE_URL = "http://localhost:3200" }
