Write-OpsBoxLog 'DB 세션·프로세스 한도 점검 시작'
$product = [string]$opsboxConfig.server.products.DB
$detail = @{ product = $product; status = 'NotCollected'; message = '현재 Windows 기본 수집기는 MSSQL Windows 통합 인증을 지원합니다.' }
if ($product -eq 'MSSQL') {
  $sqlcmd = Get-Command sqlcmd.exe -ErrorAction SilentlyContinue
  if (-not $sqlcmd) { $sqlcmd = Get-Command sqlcmd -ErrorAction SilentlyContinue }
  if (-not $sqlcmd) { $detail.message = 'sqlcmd를 PATH에서 찾을 수 없습니다.' }
  else {
    $target = if ($env:OPSBOX_MSSQL_TARGET) { $env:OPSBOX_MSSQL_TARGET } else { "$($opsboxConfig.server.ip),1433" }
    $query = "SET NOCOUNT ON; SELECT COUNT(*) AS currentSessions, ISNULL(NULLIF((SELECT value_in_use FROM sys.configurations WHERE name = 'user connections'), 0), 32767) AS maxSessions FROM sys.dm_exec_sessions WHERE is_user_process = 1;"
    $output = @(& $sqlcmd.Source -S $target -d master -E -l 5 -t 10 -Q $query -h -1 -W -s '|' -b 2>&1)
    $exitCode = $LASTEXITCODE
    $row = @($output | ForEach-Object { ([string]$_).Trim() } | Where-Object { $_ -match '^\d+\|\d+$' } | Select-Object -Last 1)
    if ($exitCode -eq 0 -and $row.Count -gt 0) {
      $values = $row[0] -split '\|'; $current = [int]$values[0]; $limit = [int]$values[1]
      $usage = if ($limit -gt 0) { [math]::Round(($current / $limit) * 100, 1) } else { $null }
      $status = if ($usage -ge 90) { 'Critical' } elseif ($usage -ge 70) { 'Warning' } else { 'Healthy' }
      $detail = @{ product = $product; status = $status; currentSessions = $current; maxSessions = $limit; usagePercent = $usage }
    } else { $message = (($output | ForEach-Object { [string]$_ }) -join ' '); $detail = @{ product = $product; status = 'NotCollected'; message = $message.Substring(0, [math]::Min(1000, $message.Length)) } }
  }
}
$rolePolicyResults += @{ role = 'DB'; item = 'DB_PROCESS_LIMIT'; status = $detail.status; detail = $detail }
Write-OpsBoxLog "DB 세션·프로세스 한도 점검 완료: $($detail.status)"
