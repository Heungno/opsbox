Write-OpsBoxLog 'DB 데이터 파일 사용량 점검 시작'
$product = [string]$opsboxConfig.server.products.DB
$rows = @(); $message = '현재 Windows 기본 수집기는 MSSQL Windows 통합 인증을 지원합니다.'
if ($product -eq 'MSSQL') {
  $sqlcmd = Get-Command sqlcmd.exe -ErrorAction SilentlyContinue
  if (-not $sqlcmd) { $sqlcmd = Get-Command sqlcmd -ErrorAction SilentlyContinue }
  if (-not $sqlcmd) { $message = 'sqlcmd를 PATH에서 찾을 수 없습니다.' }
  else {
    $target = if ($env:OPSBOX_MSSQL_TARGET) { $env:OPSBOX_MSSQL_TARGET } else { "$($opsboxConfig.server.ip),1433" }
    $dbOutput = @(& $sqlcmd.Source -S $target -d master -E -l 5 -t 10 -Q "SET NOCOUNT ON; SELECT name FROM sys.databases WHERE state_desc = 'ONLINE' AND database_id > 4;" -h -1 -W -b 2>&1)
    if ($LASTEXITCODE -eq 0) {
      foreach ($databaseName in @($dbOutput | ForEach-Object { ([string]$_).Trim() } | Where-Object { $_ })) {
        $query = "SET NOCOUNT ON; SELECT DB_NAME(), CAST(SUM(size) * 8.0 / 1024 AS decimal(18,2)) AS allocatedMB, CAST(SUM(FILEPROPERTY(name, 'SpaceUsed')) * 8.0 / 1024 AS decimal(18,2)) AS usedMB FROM sys.database_files WHERE type = 0;"
        $output = @(& $sqlcmd.Source -S $target -d $databaseName -E -l 5 -t 10 -Q $query -h -1 -W -s '|' -b 2>&1)
        if ($LASTEXITCODE -ne 0) { continue }
        $line = @($output | ForEach-Object { ([string]$_).Trim() } | Where-Object { $_ -match '\|\d+(\.\d+)?\|\d+(\.\d+)?$' } | Select-Object -Last 1)
        if ($line.Count -eq 0) { continue }
        $parts = $line[0] -split '\|'; $allocated = [double]$parts[1]; $used = [double]$parts[2]
        $usage = if ($allocated -gt 0) { [math]::Round(($used / $allocated) * 100, 1) } else { 0 }
        $state = if ($usage -ge 90) { 'Critical' } elseif ($usage -ge 80) { 'Warning' } else { 'Healthy' }
        $rows += @{ database = $parts[0]; allocatedMB = $allocated; usedMB = $used; freeAllocatedMB = [math]::Max(0, $allocated - $used); allocatedUsagePercent = $usage; status = $state }
      }
    } else { $message = (($dbOutput | ForEach-Object { [string]$_ }) -join ' ') }
  }
}
$status = if ($rows.Count -eq 0) { 'NotCollected' } elseif (@($rows | Where-Object { $_.status -eq 'Critical' }).Count -gt 0) { 'Critical' } elseif (@($rows | Where-Object { $_.status -eq 'Warning' }).Count -gt 0) { 'Warning' } else { 'Healthy' }
$detail = @{ product = $product; status = $status; message = if ($rows.Count -eq 0) { $message } else { $null }; databases = @($rows); note = '사용률은 데이터 파일에 현재 할당된 공간 중 실제 사용 공간의 비율입니다.' }
$rolePolicyResults += @{ role = 'DB'; item = 'DB_TABLESPACE'; status = $status; detail = $detail }
Write-OpsBoxLog "DB 데이터 파일 사용량 점검 완료: $status, DB=$($rows.Count)"
