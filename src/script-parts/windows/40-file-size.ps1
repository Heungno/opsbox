Write-OpsBoxLog "파일 크기 점검 시작: $($opsboxConfig.checks.fileChecks.Count)개 대상"
foreach ($item in $opsboxConfig.checks.fileChecks) {
  if (Test-Path -LiteralPath $item.path -PathType Leaf) {
    $file = Get-Item -LiteralPath $item.path
    $status = if ($file.Length -ge ($item.criticalSizeMB * 1MB)) { 'Critical' } elseif ($file.Length -ge ($item.warningSizeMB * 1MB)) { 'Warning' } else { 'Healthy' }
    $fileChecks += @{ path = $item.path; exists = $true; sizeBytes = $file.Length; sizeMB = [math]::Round($file.Length / 1MB, 2); status = $status }
  } else { $fileChecks += @{ path = $item.path; exists = $false; sizeBytes = 0; sizeMB = 0; status = 'Critical' } }
  Write-OpsBoxLog "파일 확인: $($item.path) (상태=$($fileChecks[-1].status))"
}
