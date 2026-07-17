$ErrorActionPreference = "Stop"

. (Join-Path $PSScriptRoot "flowcut-env.ps1")
Set-Location (Join-Path $PSScriptRoot "apps\web")
bun run dev --hostname 0.0.0.0 --port 3200
