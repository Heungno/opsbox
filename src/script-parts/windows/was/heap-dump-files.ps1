Write-OpsBoxLog 'WAS Heap Dump 파일 점검 시작'
$javaProcesses = @(Get-CimInstance Win32_Process -Filter "Name = 'java.exe'" -ErrorAction SilentlyContinue)
$configuredPaths = @()
foreach ($process in $javaProcesses) {
  if ($process.CommandLine -match '(?i)-XX:HeapDumpPath=("?)([^\s"]+)') { $configuredPaths += $Matches[2] }
}
$existing = @($configuredPaths | ForEach-Object { Get-Item -LiteralPath $_ -ErrorAction SilentlyContinue })
$detail = if ($configuredPaths.Count -eq 0) {
  @{ status = 'NotCollected'; message = 'JVM 실행 옵션에서 HeapDumpPath를 찾지 못했습니다.'; javaProcessCount = $javaProcesses.Count }
} else {
  $status = if ($existing.Count -gt 0) { 'Warning' } else { 'Healthy' }
  @{ status = $status; configuredPaths = $configuredPaths; existingFileCount = $existing.Count; files = @($existing | ForEach-Object { @{ path = $_.FullName; sizeMB = [math]::Round($_.Length / 1MB, 2); modifiedAt = $_.LastWriteTime } }) }
}
$wasChecks += @{ processId = 0; processName = 'Heap Dump'; status = $detail.status; message = $detail.message }
$rolePolicyResults += @{ role = 'WAS'; item = 'WAS_HEAP_DUMP'; status = $detail.status; detail = $detail }
Write-OpsBoxLog "WAS Heap Dump 점검 완료: $($detail.status), 설정경로=$($configuredPaths.Count)"
