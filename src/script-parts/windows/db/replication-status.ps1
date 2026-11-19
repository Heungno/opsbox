Write-OpsBoxLog 'DB 복제·이중화 상태 점검 시작'
$product = [string]$opsboxConfig.server.products.DB
$rows = @(); $message = '현재 Windows 기본 수집기는 MSSQL Always On 가용성 그룹 상태를 확인합니다.'
if ($product -eq 'MSSQL') {
  $sqlcmd = Get-Command sqlcmd.exe -ErrorAction SilentlyContinue
  if (-not $sqlcmd) { $sqlcmd = Get-Command sqlcmd -ErrorAction SilentlyContinue }
  if (-not $sqlcmd) { $message = 'sqlcmd를 PATH에서 찾을 수 없습니다.' }
  else {
    $target = if ($env:OPSBOX_MSSQL_TARGET) { $env:OPSBOX_MSSQL_TARGET } else { "$($opsboxConfig.server.ip),1433" }
    $query = "SET NOCOUNT ON; SELECT DB_NAME(drs.database_id), ars.role_desc, ars.connected_state_desc, drs.synchronization_state_desc, drs.synchronization_health_desc, ISNULL(drs.log_send_queue_size, 0) FROM sys.dm_hadr_database_replica_states drs JOIN sys.dm_hadr_availability_replica_states ars ON ars.replica_id = drs.replica_id AND ars.is_local = 1;"
    $output = @(& $sqlcmd.Source -S $target -d master -E -l 5 -t 10 -Q $query -h -1 -W -s '|' -b 2>&1)
    if ($LASTEXITCODE -eq 0) {
      foreach ($line in $output) {
        $parts = ([string]$line).Trim() -split '\|', 6
        if ($parts.Count -lt 6 -or $parts[0] -eq '') { continue }
        $queue = 0; [void][int]::TryParse($parts[5], [ref]$queue)
        $state = if ($parts[4] -eq 'NOT_HEALTHY') { 'Critical' } elseif ($parts[2] -ne 'CONNECTED' -or $parts[3] -ne 'SYNCHRONIZED' -or $queue -gt 102400) { 'Warning' } else { 'Healthy' }
        $rows += @{ database = $parts[0]; role = $parts[1]; connection = $parts[2]; synchronization = $parts[3]; health = $parts[4]; sendQueueKB = $queue; status = $state }
      }
    } else { $message = (($output | ForEach-Object { [string]$_ }) -join ' ') }
  }
}
$status = if ($rows.Count -eq 0) { 'NotCollected' } elseif (@($rows | Where-Object { $_.status -eq 'Critical' }).Count -gt 0) { 'Critical' } elseif (@($rows | Where-Object { $_.status -eq 'Warning' }).Count -gt 0) { 'Warning' } else { 'Healthy' }
$detail = @{ product = $product; status = $status; message = if ($rows.Count -eq 0) { $message } else { $null }; databases = @($rows); note = 'Always On 권한 또는 복제 상태가 없으면 결과가 미수집으로 표시됩니다. 트랜잭션 복제 구성은 별도 수집기가 필요합니다.' }
$rolePolicyResults += @{ role = 'DB'; item = 'DB_REPLICATION'; status = $status; detail = $detail }
Write-OpsBoxLog "DB 복제·이중화 상태 점검 완료: $status, DB=$($rows.Count)"
