Write-OpsBoxLog 'DB 백업 이력 점검 시작'
$product = [string]$opsboxConfig.server.products.DB
$rows = @(); $message = '현재 Windows 기본 수집기는 MSSQL msdb 백업 이력을 사용합니다.'
if ($product -eq 'MSSQL') {
  $sqlcmd = Get-Command sqlcmd.exe -ErrorAction SilentlyContinue
  if (-not $sqlcmd) { $sqlcmd = Get-Command sqlcmd -ErrorAction SilentlyContinue }
  if (-not $sqlcmd) { $message = 'sqlcmd를 PATH에서 찾을 수 없습니다.' }
  else {
    $target = if ($env:OPSBOX_MSSQL_TARGET) { $env:OPSBOX_MSSQL_TARGET } else { "$($opsboxConfig.server.ip),1433" }
    $query = "SET NOCOUNT ON; SELECT d.name, ISNULL(CONVERT(varchar(19), MAX(b.backup_finish_date), 120), 'NONE'), ISNULL(DATEDIFF(hour, MAX(b.backup_finish_date), GETDATE()), -1) FROM sys.databases d LEFT JOIN msdb.dbo.backupset b ON b.database_name = d.name AND b.type = 'D' WHERE d.state_desc = 'ONLINE' GROUP BY d.name ORDER BY d.name;"
    $output = @(& $sqlcmd.Source -S $target -d master -E -l 5 -t 10 -Q $query -h -1 -W -s '|' -b 2>&1)
    if ($LASTEXITCODE -eq 0) {
      foreach ($line in $output) {
        $parts = ([string]$line).Trim() -split '\|', 3
        if ($parts.Count -lt 3 -or $parts[0] -eq '') { continue }
        $ageHours = -1; [void][int]::TryParse($parts[2], [ref]$ageHours)
        $state = if ($ageHours -lt 0 -or $ageHours -ge 336) { 'Critical' } elseif ($ageHours -ge 168) { 'Warning' } else { 'Healthy' }
        $rows += @{ database = $parts[0]; lastFullBackup = $parts[1]; ageHours = $ageHours; status = $state }
      }
    } else { $message = (($output | ForEach-Object { [string]$_ }) -join ' ') }
  }
}
$status = if ($rows.Count -eq 0) { 'NotCollected' } elseif (@($rows | Where-Object { $_.status -eq 'Critical' }).Count -gt 0) { 'Critical' } elseif (@($rows | Where-Object { $_.status -eq 'Warning' }).Count -gt 0) { 'Warning' } else { 'Healthy' }
$detail = @{ product = $product; status = $status; message = if ($rows.Count -eq 0) { $message } else { $null }; databases = @($rows); thresholds = @{ warningHours = 168; criticalHours = 336 } }
$rolePolicyResults += @{ role = 'DB'; item = 'DB_BACKUP'; status = $status; detail = $detail }
Write-OpsBoxLog "DB 백업 이력 점검 완료: $status, DB=$($rows.Count)"
