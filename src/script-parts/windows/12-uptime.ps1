Write-OpsBoxLog '가동시간 점검 시작'
try {
  $uptimeInfo = Get-CimInstance Win32_OperatingSystem -ErrorAction Stop
  $uptimeMinutes = [math]::Round((New-TimeSpan -Start $uptimeInfo.LastBootUpTime -End (Get-Date)).TotalMinutes, 0)
  $uptimeStatus = 'Healthy'
} catch {
  $uptimeMinutes = $null
  $uptimeStatus = 'NotCollected'
  Write-OpsBoxLog "가동시간 수집 오류: $($_.Exception.Message)"
}
Write-OpsBoxLog "가동시간 점검 완료: $uptimeStatus ($uptimeMinutes 분)"
