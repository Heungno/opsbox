Write-OpsBoxLog "디렉터리 점검 시작: $($opsboxConfig.checks.directories.Count)개 대상"
foreach ($item in $opsboxConfig.checks.directories) {
  $path = $item.path
  if (Test-Path -LiteralPath $path -PathType Container) {
    $size = (Get-ChildItem -LiteralPath $path -Recurse -Force -File -ErrorAction SilentlyContinue | Measure-Object Length -Sum).Sum
    $driveName = (Split-Path -LiteralPath $path -Qualifier).TrimEnd(':')
    $drive = Get-PSDrive -Name $driveName -ErrorAction SilentlyContinue
    $total = if ($drive) { $drive.Used + $drive.Free } else { 0 }
    $usedGB = if ($drive) { [math]::Round($drive.Used / 1GB, 2) } else { 0 }
    $freeGB = if ($drive) { [math]::Round($drive.Free / 1GB, 2) } else { 0 }
    $totalGB = if ($total -gt 0) { [math]::Round($total / 1GB, 2) } else { 0 }
    $usage = if ($total -gt 0) { [math]::Round(($drive.Used / $total) * 100, 0) } else { 0 }
    $directories += @{ path = $path; exists = $true; sizeGB = [math]::Round(($size / 1GB), 2); usedGB = $usedGB; freeGB = $freeGB; totalGB = $totalGB; usagePercent = $usage }
  } else { $directories += @{ path = $path; exists = $false; sizeGB = 0; usedGB = 0; freeGB = 0; totalGB = 0; usagePercent = 0 } }
  Write-OpsBoxLog "디렉터리 확인: $path (존재=$($directories[-1].exists))"
}
