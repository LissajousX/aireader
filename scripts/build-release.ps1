# Aireader Release Build Script (Strategy A: Minimal Package)
# Usage: .\scripts\build-release.ps1
# Output: src-tauri/target/release/bundle/nsis/Aireader_<version>_x64-setup.exe

param(
    [switch]$SkipFrontendInstall
)

$ErrorActionPreference = "Stop"
$ProjectRoot = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
Set-Location $ProjectRoot

Write-Host "`n========================================" -ForegroundColor Cyan
Write-Host "  Aireader Release Build" -ForegroundColor Cyan
Write-Host "========================================`n" -ForegroundColor Cyan

# 1. Read version from package.json
$PackageJson = Get-Content "package.json" | ConvertFrom-Json
$Version = $PackageJson.version
Write-Host "[1/6] Version: $Version" -ForegroundColor Green

# 2. Verify required files
Write-Host "[2/6] Checking required files..." -ForegroundColor Green

$RequiredFiles = @(
    "src-tauri/resources/dictionaries",
    "src-tauri/resources/samples",
    "src-tauri/resources/llm/runtime",
    "src-tauri/icons/icon.ico",
    "src-tauri/icons/icon.png",
    "LICENSE"
)

foreach ($f in $RequiredFiles) {
    if (-not (Test-Path $f)) {
        Write-Host "  MISSING: $f" -ForegroundColor Red
        exit 1
    }
    Write-Host "  OK: $f" -ForegroundColor DarkGray
}

# Check CPU runtime zip exists
$CpuZip = Get-ChildItem "src-tauri/resources/llm/runtime/*cpu*.zip" -ErrorAction SilentlyContinue
if (-not $CpuZip) {
    Write-Host "  MISSING: CPU runtime zip in resources/llm/runtime/" -ForegroundColor Red
    Write-Host "  Strategy A requires at least the CPU runtime zip." -ForegroundColor Yellow
    exit 1
}
Write-Host "  OK: CPU runtime zip ($($CpuZip.Name), $([math]::Round($CpuZip.Length / 1MB, 1)) MB)" -ForegroundColor DarkGray

# Warn if GPU runtime zips are present (Strategy A = minimal)
$GpuZips = Get-ChildItem "src-tauri/resources/llm/runtime/*" -Exclude "*cpu*" -Filter "*.zip" -ErrorAction SilentlyContinue
if ($GpuZips) {
    Write-Host "  WARNING: GPU runtime zips found. Strategy A bundles only CPU." -ForegroundColor Yellow
    Write-Host "  These will be included and increase package size:" -ForegroundColor Yellow
    foreach ($gz in $GpuZips) {
        Write-Host "    - $($gz.Name) ($([math]::Round($gz.Length / 1MB, 1)) MB)" -ForegroundColor Yellow
    }
}

# 3. Install frontend dependencies
if (-not $SkipFrontendInstall) {
    Write-Host "[3/6] Installing frontend dependencies..." -ForegroundColor Green
    npm install --production=false
    if ($LASTEXITCODE -ne 0) { Write-Host "npm install failed" -ForegroundColor Red; exit 1 }
} else {
    Write-Host "[3/6] Skipping npm install (flag set)" -ForegroundColor DarkGray
}

# 4. TypeScript check
Write-Host "[4/6] TypeScript type check..." -ForegroundColor Green
npx tsc --noEmit --skipLibCheck
if ($LASTEXITCODE -ne 0) { Write-Host "TypeScript check failed" -ForegroundColor Red; exit 1 }

# 5. Rust check
Write-Host "[5/6] Rust check..." -ForegroundColor Green
Set-Location "src-tauri"
cargo check
if ($LASTEXITCODE -ne 0) { Write-Host "Cargo check failed" -ForegroundColor Red; exit 1 }
Set-Location $ProjectRoot

# 6. Build
Write-Host "[6/6] Building release..." -ForegroundColor Green
npm run tauri build
if ($LASTEXITCODE -ne 0) { Write-Host "Build failed" -ForegroundColor Red; exit 1 }

# Done
$Installer = Get-ChildItem "src-tauri/target/release/bundle/nsis/*setup*" -ErrorAction SilentlyContinue | Select-Object -First 1
Write-Host "`n========================================" -ForegroundColor Cyan
Write-Host "  Build Complete!" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
if ($Installer) {
    $SizeMB = [math]::Round($Installer.Length / 1MB, 1)
    Write-Host "  Installer: $($Installer.FullName)" -ForegroundColor Green
    Write-Host "  Size: $SizeMB MB" -ForegroundColor Green
} else {
    Write-Host "  Output: src-tauri/target/release/bundle/nsis/" -ForegroundColor Green
}
Write-Host ""
