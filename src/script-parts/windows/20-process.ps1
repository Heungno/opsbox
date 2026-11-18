Write-OpsBoxLog "프로세스 점검 시작: $($opsboxConfig.checks.processes.Count)개 대상"
foreach ($item in $opsboxConfig.checks.processes) {
  Write-OpsBoxLog "프로세스 확인: $($item.name)"
  $proc = Get-Process -Name $item.name -ErrorAction SilentlyContinue | Select-Object -First 1
  if ($proc) {
    $procUptime = 0
    try { $procUptime = [math]::Round((New-TimeSpan -Start $proc.StartTime -End (Get-Date)).TotalMinutes, 0) } catch {}
    $processes += @{ name = $item.name; running = $true; cpu = $proc.CPU; memoryMB = [math]::Round($proc.WorkingSet64 / 1MB, 2); uptimeMinutes = $procUptime }
  } else { $processes += @{ name = $item.name; running = $false; cpu = 0; memoryMB = 0; uptimeMinutes = 0 } }
}
Write-OpsBoxLog '프로세스 점검 완료'
