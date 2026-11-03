[CmdletBinding()]
param(
  [string]$ImageName = "gbs-linux-appimage-builder:latest"
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$dockerfilePath = Join-Path $repoRoot "build/linux-appimage/Dockerfile"
$dockerContextPath = Join-Path $repoRoot "build/linux-appimage"
$distPath = Join-Path $repoRoot "dist"

if (-not (Test-Path $dockerfilePath)) {
  throw "Dockerfile introuvable: $dockerfilePath"
}

if (-not (Test-Path $distPath)) {
  New-Item -ItemType Directory -Path $distPath | Out-Null
}

Write-Host "[1/2] Build image Podman: $ImageName"
podman build --tag $ImageName --file $dockerfilePath $dockerContextPath
if ($LASTEXITCODE -ne 0) {
  throw "Echec podman build (code $LASTEXITCODE)."
}

$containerScript = @"
set -euo pipefail
rm -rf /work/src
mkdir -p /work/src /out
rsync -a --delete --exclude node_modules --exclude dist /src/ /work/src/
cd /work/src
npm ci
npm run dist:linux
cp -f dist/*.AppImage /out/
echo "AppImage generee dans /out:"
ls -lah /out/*.AppImage
"@
$containerScript = $containerScript -replace "`r", ""

Write-Host "[2/2] Build AppImage Linux dans le conteneur"
podman run --rm `
  -v "${repoRoot}:/src:ro" `
  -v "${distPath}:/out" `
  $ImageName `
  /bin/bash -lc $containerScript
if ($LASTEXITCODE -ne 0) {
  throw "Echec podman run (code $LASTEXITCODE)."
}

Write-Host "Build termine. Verifie le dossier dist/."