Write-OpsBoxLog '결과 JSON 생성'
$result = @{
  server = $opsboxConfig.server.id
  serverType = $opsboxConfig.server.type
  serverTypes = $opsboxConfig.server.roles
  hostname = $hostname
  checkDate = $checkDate
  uptimeMinutes = $uptimeMinutes
  cpu = $cpu
  memory = $memory
  disk = $disk
  network = 'NotChecked'
  disks = $disks
  processes = $processes
  directories = $directories
  fileChecks = $fileChecks
  ports = $portChecks
  httpChecks = $httpChecks
  wasChecks = $wasChecks
  webtobCheck = $webtobCheck
  databaseChecks = $databaseChecks
  products = $opsboxConfig.server.products
  product = $opsboxConfig.server.product
}
$jsonText = $result | ConvertTo-Json -Depth 12
$savePath = $opsboxResultPath
if (-not $opsboxResultDirectoryReady) { $savePath = Join-Path $PSScriptRoot "$($opsboxConfig.server.id)_$opsboxRunStamp.json" }
try {
  Set-Content -LiteralPath $savePath -Value $jsonText -Encoding UTF8 -ErrorAction Stop
  Write-OpsBoxLog "결과 저장 완료: $savePath"
} catch {
  Write-OpsBoxLog "결과 저장 실패: $($_.Exception.Message)"
  throw
}
Write-OpsBoxLog '점검 스크립트 정상 종료'
Write-Host "Result JSON: $savePath"
