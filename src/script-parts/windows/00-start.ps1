$ErrorActionPreference = 'Continue'
$configJson = [System.Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('@@CONFIG_BASE64@@'))
$opsboxConfig = ConvertFrom-Json -InputObject $configJson -ErrorAction Stop
$opsboxRunStamp = Get-Date -Format 'yyyy-MM-dd_HH-mm-ss-fff'
$opsboxResultDirectory = Join-Path (Join-Path (Join-Path $opsboxConfig.server.sharedPath 'results') (Get-Date -Format 'yyyy')) $opsboxConfig.server.id
$opsboxResultPath = Join-Path $opsboxResultDirectory "$opsboxRunStamp.json"
$opsboxResultDirectoryReady = $true
try { New-Item -ItemType Directory -Path $opsboxResultDirectory -Force -ErrorAction Stop | Out-Null } catch { $opsboxResultDirectoryReady = $false }
if ($opsboxResultDirectoryReady) { $opsboxLogPath = Join-Path $opsboxResultDirectory "$opsboxRunStamp.log" }
else { $opsboxLogPath = Join-Path $PSScriptRoot "$($opsboxConfig.server.id)_$opsboxRunStamp.log" }

function Write-OpsBoxLog {
  param([string]$Message)
  $logLine = "[$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')] $Message"
  Write-Host $logLine
  try { Add-Content -LiteralPath $opsboxLogPath -Value $logLine -Encoding UTF8 -ErrorAction Stop } catch {}
}

Write-OpsBoxLog '점검 스크립트 시작'
Write-OpsBoxLog "결과 폴더: $opsboxResultDirectory (접근 가능=$opsboxResultDirectoryReady)"
$hostname = $env:COMPUTERNAME
$checkDate = Get-Date -Format 'yyyy-MM-dd HH:mm:ss'
$uptimeMinutes = 0
$cpu = 0
$memory = 0
$disk = 0
$disks = @()
$processes = @()
$directories = @()
$fileChecks = @()
$portChecks = @()
$httpChecks = @()
$wasChecks = @()
$webtobCheck = $null
$databaseChecks = $null
