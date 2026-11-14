<#
    create-complete-package.ps1
    إنشاء حزمة التوزيع الكاملة لـ Amin-lab génie على Windows.

    أمثلة:
      .\create-complete-package.ps1
      .\create-complete-package.ps1 -OutputPath .\release\custom.zip
      .\create-complete-package.ps1 -IncludeTests
#>

param(
    [string]$OutputPath = ".\release\Amin-Lab-Genie-v1.0.0.zip",
    [switch]$IncludeTests,
    [switch]$IncludeDocs = $true
)

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $root

Write-Host "=== إنشاء حزمة Amin-lab génie ===" -ForegroundColor Cyan

$required = @("server", "client", "docs", "installer", "package.json")
foreach ($item in $required) {
    if (-not (Test-Path $item)) {
        Write-Host "✗ العنصر المطلوب غير موجود: $item" -ForegroundColor Red
        exit 1
    }
}

$stamp = Get-Date -Format "yyyyMMdd-HHmmss"
$temp = Join-Path $env:TEMP "amin-lab-genie-$stamp"
New-Item -ItemType Directory -Path $temp -Force | Out-Null
Write-Host "مجلد مؤقت: $temp" -ForegroundColor Yellow

$excludedDirs = @("node_modules", "dist", "data", ".git", "release")
$excludedFiles = @("*.log", "*.sqlite", "*.sqlite-wal", "*.sqlite-shm", "*.zip", ".DS_Store")

function Copy-Tree {
    param([string]$source, [string]$destination)

    Get-ChildItem -Path $source -Recurse -File | ForEach-Object {
        $relative = $_.FullName.Substring((Get-Location).Path.Length).TrimStart('\', '/')
        $segments = $relative -split '[\\/]'
        if ($segments | Where-Object { $excludedDirs -contains $_ }) { return }

        $skip = $false
        foreach ($pattern in $excludedFiles) {
            if ($_.Name -like $pattern) { $skip = $true; break }
        }
        if ($skip) { return }

        $target = Join-Path $destination $relative
        $folder = Split-Path -Parent $target
        if (-not (Test-Path $folder)) { New-Item -ItemType Directory -Path $folder -Force | Out-Null }
        Copy-Item -Path $_.FullName -Destination $target -Force
    }
}

Write-Host "نسخ server…" -ForegroundColor Green
Copy-Tree "server" $temp
Write-Host "نسخ client…" -ForegroundColor Green
Copy-Tree "client" $temp
Write-Host "نسخ installer…" -ForegroundColor Green
Copy-Tree "installer" $temp
if ($IncludeDocs) {
    Write-Host "نسخ docs…" -ForegroundColor Green
    Copy-Tree "docs" $temp
}
if ($IncludeTests) {
    Write-Host "نسخ tests…" -ForegroundColor Green
    Copy-Tree "tests" $temp
}

foreach ($file in @("package.json", "tsconfig.json", "README.md", "LICENSE.txt")) {
    if (Test-Path $file) { Copy-Item $file -Destination $temp -Force }
}

$zipDir = Split-Path -Parent $OutputPath
if ($zipDir -and -not (Test-Path $zipDir)) { New-Item -ItemType Directory -Path $zipDir -Force | Out-Null }
if (Test-Path $OutputPath) { Remove-Item $OutputPath -Force }

Write-Host "إنشاء الأرشيف: $OutputPath" -ForegroundColor Yellow
Compress-Archive -Path (Join-Path $temp '*') -DestinationPath $OutputPath -CompressionLevel Optimal

Remove-Item -Recurse -Force $temp

$size = [math]::Round((Get-Item $OutputPath).Length / 1MB, 2)
Write-Host ""
Write-Host "✅ تم إنشاء الحزمة بنجاح" -ForegroundColor Green
Write-Host "📁 $OutputPath"
Write-Host "📊 $size MB"
