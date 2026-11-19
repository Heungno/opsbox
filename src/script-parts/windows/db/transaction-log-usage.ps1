Write-OpsBoxLog 'DB 트랜잭션 로그 사용률 점검 시작'
$product = [string]$opsboxConfig.server.products.DB
$rows = @(); $message = '현재 Windows 기본 수집기는 MSSQL DBCC SQLPERF(LOGSPACE)를 사용합니다.'
if ($product -eq 'MSSQL') {
  $sqlcmd = Get-Command sqlcmd.exe -ErrorAction SilentlyContinue
  if (-not $sqlcmd) { $sqlcmd = Get-Command sqlcmd -ErrorAction SilentlyContinue }
  if (-not $sqlcmd) { $message = 'sqlcmd를 PATH에서 찾을 수 없습니다.' }
  else {
    $target = if ($env:OPSBOX_MSSQL_TARGET) { $env:OPSBOX_MSSQL_TARGET } else { "$($opsboxConfig.server.ip),1433" }
    $output = @(& $sqlcmd.Source -S $target -d master -E -l 5 -t 10 -Q 'SET NOCOUNT ON; DBCC SQLPERF(LOGSPACE);' -h -1 -W -s '|' -b 2>&1)
    if ($LASTEXITCODE -eq 0) {
      foreach ($line in $output) {
        $parts = ([string]$line).Trim() -split '\|'
        if ($parts.Count -lt 3) { continue }
        $size = 0.0; $usage = 0.0
        if (-not [double]::TryParse($parts[1], [ref]$size) -or -not [double]::TryParse($parts[2], [ref]$usage)) { continue }
        $state = if ($usage -ge 90) { 'Critical' } elseif ($usage -ge 70) { 'Warning' } else { 'Healthy' }
        $rows += @{ database = $parts[0]; logSizeMB = [math]::Round($size, 2); usagePercent = [math]::Round($usage, 1); status = $state }
      }
    } else { $message = (($output | ForEach-Object { [string]$_ }) -join ' ') }
  }
}
$status = if ($rows.Count -eq 0) { 'NotCollected' } elseif (@($rows | Where-Object { $_.status -eq 'Critical' }).Count -gt 0) { 'Critical' } elseif (@($rows | Where-Object { $_.status -eq 'Warning' }).Count -gt 0) { 'Warning' } else { 'Healthy' }
$detail = @{ product = $product; status = $status; message = if ($rows.Count -eq 0) { $message } else { $null }; databases = @($rows) }
$rolePolicyResults += @{ role = 'DB'; item = 'DB_TRANSACTION_LOG'; status = $status; detail = $detail }
Write-OpsBoxLog "DB 트랜잭션 로그 사용률 점검 완료: $status, DB=$($rows.Count)"
