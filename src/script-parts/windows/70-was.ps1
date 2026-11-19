Write-OpsBoxLog "WAS 점검 시작: $($opsboxConfig.server.products.WAS)"
if ($opsboxConfig.server.products.WAS -eq 'Node.js') {
  $wasChecks += @{ processId = 0; processName = 'node'; status = 'NotCollected'; message = 'Node.js 상세 런타임 수집기는 별도 설정이 필요합니다.' }
} else {
  $javaProcesses = @(Get-CimInstance Win32_Process -Filter "Name = 'java.exe'" -ErrorAction SilentlyContinue)
  $pathJstat = Get-Command jstat.exe -ErrorAction SilentlyContinue
  foreach ($javaProcess in $javaProcesses) {
    $jstatPath = $null
    if ($javaProcess.ExecutablePath) { $candidate = Join-Path (Split-Path $javaProcess.ExecutablePath -Parent) 'jstat.exe'; if (Test-Path -LiteralPath $candidate) { $jstatPath = $candidate } }
    if (-not $jstatPath -and $pathJstat) { $jstatPath = $pathJstat.Source }
    if (-not $jstatPath) { $wasChecks += @{ processId = $javaProcess.ProcessId; processName = 'java'; status = 'NotCollected'; message = 'jstat.exe를 찾을 수 없습니다.' }; continue }
    $jstatOutput = @(& $jstatPath -gc $javaProcess.ProcessId 2>$null)
    if ($jstatOutput.Count -lt 2) { $wasChecks += @{ processId = $javaProcess.ProcessId; processName = 'java'; status = 'NotCollected'; message = 'JVM attach 또는 jstat 결과 수집에 실패했습니다.' }; continue }
    $headers = @($jstatOutput[0].Trim() -split '\s+')
    $values = @($jstatOutput[-1].Trim() -split '\s+')
    $heapCapacityKB = 0.0; $heapUsedKB = 0.0
    for ($i = 0; $i -lt $headers.Count -and $i -lt $values.Count; $i++) {
      $number = 0.0
      if ([double]::TryParse($values[$i], [ref]$number)) {
        if ($headers[$i] -in @('S0C', 'S1C', 'EC', 'OC', 'PC')) { $heapCapacityKB += $number }
        if ($headers[$i] -in @('S0U', 'S1U', 'EU', 'OU', 'PU')) { $heapUsedKB += $number }
      }
    }
    if ($heapCapacityKB -le 0) { $wasChecks += @{ processId = $javaProcess.ProcessId; processName = 'java'; status = 'NotCollected'; message = 'JVM Heap 컬럼을 찾을 수 없습니다.' }; continue }
    $heapPercent = [math]::Round(($heapUsedKB / $heapCapacityKB) * 100, 1)
    $status = if ($heapPercent -ge 90) { 'Critical' } elseif ($heapPercent -ge 70) { 'Warning' } else { 'Healthy' }
    $wasChecks += @{ processId = $javaProcess.ProcessId; processName = 'java'; heapUsedMB = [math]::Round($heapUsedKB / 1024, 1); heapCapacityMB = [math]::Round($heapCapacityKB / 1024, 1); heapUsagePercent = $heapPercent; status = $status }
  }
  if ($javaProcesses.Count -eq 0) { $wasChecks += @{ processId = 0; processName = 'java'; status = 'NotCollected'; message = 'Java 프로세스를 찾을 수 없습니다.' } }
}
Write-OpsBoxLog "WAS 점검 완료: $($wasChecks.Count)개 결과"
$wasPolicyStatus = if (@($wasChecks | Where-Object { $_.status -eq 'Critical' }).Count -gt 0) { 'Critical' } elseif (@($wasChecks | Where-Object { $_.status -eq 'Warning' }).Count -gt 0) { 'Warning' } elseif ($wasChecks.Count -gt 0 -and @($wasChecks | Where-Object { $_.status -ne 'NotCollected' }).Count -eq 0) { 'NotCollected' } else { 'Healthy' }
$rolePolicyResults += @{ role = 'WAS'; item = 'WAS_JVM_HEAP'; status = $wasPolicyStatus; detail = @($wasChecks) }
