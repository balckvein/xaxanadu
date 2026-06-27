# Copies the web game into the Android app's assets so the APK bundles it offline.
# Run from anywhere: powershell -ExecutionPolicy Bypass -File tools\sync-www.ps1
$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
$dst  = Join-Path $root "android\app\src\main\assets\www"

if (Test-Path $dst) { Remove-Item -Recurse -Force $dst }
New-Item -ItemType Directory -Force -Path $dst | Out-Null

Copy-Item (Join-Path $root "index.html") $dst
Copy-Item (Join-Path $root "css")    $dst -Recurse
Copy-Item (Join-Path $root "js")     $dst -Recurse
Copy-Item (Join-Path $root "assets") $dst -Recurse

Write-Host "Synced web game -> $dst"
