Write-OpsBoxLog 'OS·디스크 점검 시작'
try {
  $os = Get-CimInstance Win32_OperatingSystem -ErrorAction Stop
  $hostname = $os.CSName
  $uptimeMinutes = [math]::Round((New-TimeSpan -Start $os.LastBootUpTime -End (Get-Date)).TotalMinutes, 0)
  if ($os.TotalVisibleMemorySize -gt 0) { $memory = [math]::Round((($os.TotalVisibleMemorySize - $os.FreePhysicalMemory) / $os.TotalVisibleMemorySize) * 100, 0) }
} catch { Write-OpsBoxLog "OS 정보 수집 오류: $($_.Exception.Message)" }
try { $cpu = [math]::Round((Get-Counter '\Processor(_Total)\% Processor Time' -ErrorAction Stop).CounterSamples[0].CookedValue, 0) }
catch { Write-OpsBoxLog "CPU 수집 오류: $($_.Exception.Message)" }
try {
  $disks = @(Get-CimInstance Win32_LogicalDisk -Filter 'DriveType=3' -ErrorAction Stop | ForEach-Object {
    $usage = if ($_.Size -gt 0) { [math]::Round((($_.Size - $_.FreeSpace) / $_.Size) * 100, 0) } else { 0 }
    $status = if ($usage -ge 90) { 'Critical' } elseif ($usage -ge 70) { 'Warning' } else { 'Healthy' }
    [ordered]@{ device = $_.DeviceID; mountPoint = $_.DeviceID; volumeName = $_.VolumeName; totalGB = [math]::Round($_.Size / 1GB, 2); usedGB = [math]::Round(($_.Size - $_.FreeSpace) / 1GB, 2); freeGB = [math]::Round($_.FreeSpace / 1GB, 2); usagePercent = $usage; status = $status }
  })
  foreach ($diskInfo in $disks) { if ([double]$diskInfo.usagePercent -gt $disk) { $disk = [double]$diskInfo.usagePercent } }
} catch { Write-OpsBoxLog "디스크 수집 오류: $($_.Exception.Message)" }
Write-OpsBoxLog "OS·디스크 점검 완료: $($disks.Count)개 디스크, 최대 사용률 $disk%"
