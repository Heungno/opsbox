Write-OpsBoxLog 'DB 로그 백업 설정 점검 시작'
$product = [string]$opsboxConfig.server.products.DB
$rows = @(); $message = '현재 Windows 기본 수집기는 MSSQL 데이터베이스 복구 모델과 로그 백업 이력을 확인합니다.'
if ($product -eq 'MSSQL') {
  $sqlcmd = Get-Command sqlcmd.exe -ErrorAction SilentlyContinue
  if (-not $sqlcmd) { $sqlcmd = Get-Command sqlcmd -ErrorAction SilentlyContinue }
  if (-not $sqlcmd) { $message = 'sqlcmd를 PATH에서 찾을 수 없습니다.' }
  else {
    $target = if ($env:OPSBOX_MSSQL_TARGET) { $env:OPSBOX_MSSQL_TARGET } else { "$($opsboxConfig.server.ip),1433" }
    $query = "SET NOCOUNT ON; SELECT d.name, d.recovery_model_desc, ISNULL(DATEDIFF(hour, MAX(b.backup_finish_date), GETDATE()), -1) FROM sys.databases d LEFT JOIN msdb.dbo.backupset b ON b.database_name = d.name AND b.type = 'L' WHERE d.state_desc = 'ONLINE' GROUP BY d.name, d.recovery_model_desc ORDER BY d.name;"
    $output = @(& $sqlcmd.Source -S $target -d master -E -l 5 -t 10 -Q $query -h -1 -W -s '|' -b 2>&1)
    if ($LASTEXITCODE -eq 0) {
      foreach ($line in $output) {
        $parts = ([string]$line).Trim() -split '\|', 3
        if ($parts.Count -lt 3 -or $parts[0] -eq '') { continue }
        $ageHours = -1; [void][int]::TryParse($parts[2], [ref]$ageHours)
        $state = if ($parts[1] -eq 'SIMPLE') { 'Warning' } elseif ($parts[1] -in @('FULL', 'BULK_LOGGED') -and $ageHours -ge 0 -and $ageHours -lt 24) { 'Healthy' } else { 'Warning' }
        $rows += @{ database = $parts[0]; recoveryModel = $parts[1]; lastLogBackupAgeHours = $ageHours; status = $state }
      }
    } else { $message = (($output | ForEach-Object { [string]$_ }) -join ' ') }
  }
}
$status = if ($rows.Count -eq 0) { 'NotCollected' } elseif (@($rows | Where-Object { $_.status -eq 'Critical' }).Count -gt 0) { 'Critical' } elseif (@($rows | Where-Object { $_.status -eq 'Warning' }).Count -gt 0) { 'Warning' } else { 'Healthy' }
$detail = @{ product = $product; status = $status; message = if ($rows.Count -eq 0) { $message } else { $null }; databases = @($rows); note = 'MSSQL의 복구 모델과 최근 로그 백업을 확인합니다. SIMPLE 복구 모델은 트랜잭션 로그 백업 대상이 아닙니다.' }
$rolePolicyResults += @{ role = 'DB'; item = 'DB_ARCHIVE_MODE'; status = $status; detail = $detail }
Write-OpsBoxLog "DB 로그 백업 설정 점검 완료: $status, DB=$($rows.Count)"
