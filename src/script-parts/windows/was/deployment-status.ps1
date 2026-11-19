Write-OpsBoxLog "WAS 배포·기동 점검 시작: $($opsboxConfig.server.products.WAS)"
$product = [string]$opsboxConfig.server.products.WAS
$processNames = switch -Regex ($product) {
  'Node\.js' { @('node'); break }
  default { @('java') }
}
$running = @(Get-Process -Name $processNames -ErrorAction SilentlyContinue | Select-Object ProcessName, Id, StartTime)
$status = if ($running.Count -gt 0) { 'Healthy' } else { 'Critical' }
$detail = @{ product = $product; status = $status; processCount = $running.Count; processes = @($running | ForEach-Object { @{ processName = $_.ProcessName; processId = $_.Id; startedAt = $_.StartTime } }); message = if ($running.Count -eq 0) { '제품 실행 프로세스를 찾지 못했습니다.' } else { '프로세스 기동 상태를 확인했습니다. 애플리케이션 배포 상태는 관리 콘솔에서 별도 확인해야 합니다.' } }
$wasChecks += @($running | ForEach-Object { @{ processId = $_.Id; processName = $_.ProcessName; status = $status } })
if ($running.Count -eq 0) { $wasChecks += @{ processId = 0; processName = $product; status = $status; message = $detail.message } }
$rolePolicyResults += @{ role = 'WAS'; item = 'WAS_DEPLOYMENT'; status = $status; detail = $detail }
Write-OpsBoxLog "WAS 배포·기동 점검 완료: $status, 프로세스=$($running.Count)"
