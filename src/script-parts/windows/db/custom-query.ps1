Write-OpsBoxLog "DB 사용자 쿼리 시작: $($opsboxConfig.database.customQueries.Count)개"
$customQueryResults = @()
$customQueryStatus = 'NotCollected'
$customQueries = @($opsboxConfig.database.customQueries)

if ($customQueries.Count -gt 0 -and $opsboxConfig.server.products.DB -eq 'MSSQL') {
  $targets = @($opsboxConfig.checks.rolePolicySettings.DB_CUSTOM_QUERY.instanceTargets | Where-Object { $_ })
  if (-not $targets.Count -and $env:OPSBOX_MSSQL_TARGET) { $targets = @($env:OPSBOX_MSSQL_TARGET) }
  if (-not $targets.Count) { $targets = @("$($opsboxConfig.server.ip),1433") }
  $sqlcmd = Get-Command sqlcmd.exe -ErrorAction SilentlyContinue
  if (-not $sqlcmd) { $sqlcmd = Get-Command sqlcmd -ErrorAction SilentlyContinue }
  if (-not $sqlcmd) {
    foreach ($query in $customQueries) {
      foreach ($target in $targets) {
        $customQueryResults += @{ id = $query.id; name = $query.name; target = [string]$target; status = 'NotCollected'; message = 'sqlcmd를 PATH에서 찾을 수 없습니다.' }
      }
    }
  } else {
    foreach ($query in $customQueries) {
      foreach ($target in $targets) {
        Write-OpsBoxLog "DB 사용자 쿼리 실행: $($query.name) / $target"
        $queryOutput = @(& $sqlcmd.Source -S ([string]$target) -d master -E -l 5 -t 10 -Q ([string]$query.content) -h -1 -W -s '|' -w 65535 -b 2>&1)
        $queryExitCode = $LASTEXITCODE
        $lines = @($queryOutput | Select-Object -First 200 | ForEach-Object { ([string]$_).TrimEnd() } | Where-Object { $_ })
        $outputText = ($lines -join [Environment]::NewLine)
        if ($outputText.Length -gt 12000) { $outputText = $outputText.Substring(0, 12000) + [Environment]::NewLine + '... 결과 일부 생략' }
        $status = if ($queryExitCode -eq 0) { 'Healthy' } else { 'Critical' }
        $customQueryResults += @{ id = $query.id; name = $query.name; target = [string]$target; status = $status; rowCount = $lines.Count; output = $outputText }
        Write-OpsBoxLog "DB 사용자 쿼리 완료: $($query.name) / $target ($status)"
      }
    }
  }
  $customQueryStatus = if (@($customQueryResults | Where-Object { $_.status -eq 'Critical' }).Count -gt 0) { 'Critical' } elseif (@($customQueryResults | Where-Object { $_.status -eq 'Healthy' }).Count -gt 0) { 'Healthy' } else { 'NotCollected' }
}

$rolePolicyResults += @{ role = 'DB'; item = 'DB_CUSTOM_QUERY'; status = $customQueryStatus; detail = @{ queries = @($customQueryResults) } }
Write-OpsBoxLog "DB 사용자 쿼리 종료: $customQueryStatus"
