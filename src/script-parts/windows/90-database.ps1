Write-OpsBoxLog "DB 점검 시작: $($opsboxConfig.server.products.DB)"
$databaseChecks = @{ product = $opsboxConfig.server.products.DB; status = 'NotCollected'; message = '현재 Windows 템플릿은 MSSQL 수집을 지원합니다.' }
if ($opsboxConfig.server.products.DB -eq 'MSSQL') {
  $sqlcmd = Get-Command sqlcmd.exe -ErrorAction SilentlyContinue
  if (-not $sqlcmd) { $sqlcmd = Get-Command sqlcmd -ErrorAction SilentlyContinue }
  if (-not $sqlcmd) { $databaseChecks.message = 'sqlcmd를 PATH에서 찾을 수 없습니다.' }
  else {
    $target = if ($env:OPSBOX_MSSQL_TARGET) { $env:OPSBOX_MSSQL_TARGET } else { "$($opsboxConfig.server.ip),1433" }
    $query = $opsboxConfig.database.query
    $args = @('-S', $target, '-d', 'master', '-E', '-l', '5', '-t', '10', '-Q', $query, '-h', '-1', '-W', '-s', '|', '-w', '65535', '-b')
    $output = @(& $sqlcmd.Source @args 2>&1)
    $exitCode = $LASTEXITCODE
    $serverInfo = $null; $databaseRows = @()
    foreach ($line in $output) {
      $text = ([string]$line).Trim()
      if ($text.StartsWith('SERVER|')) {
        $parts = $text -split '\|', 4
        if ($parts.Count -ge 4) { $serverInfo = @{ serverName = $parts[1]; version = $parts[2]; edition = $parts[3] } }
      } elseif ($text.StartsWith('DATABASE|')) {
        $parts = $text -split '\|', 5
        if ($parts.Count -ge 5) {
          $size = 0.0; [void][double]::TryParse($parts[4], [ref]$size)
          $state = $parts[2].ToUpperInvariant()
          $status = if ($state -in @('OFFLINE', 'SUSPECT', 'RECOVERY_PENDING', 'EMERGENCY')) { 'Critical' } elseif ($state -ne 'ONLINE') { 'Warning' } else { 'Healthy' }
          $databaseRows += @{ name = $parts[1]; state = $parts[2]; recoveryModel = $parts[3]; sizeMB = $size; status = $status }
        }
      }
    }
    if ($exitCode -eq 0 -and $serverInfo) {
      $offline = @($databaseRows | Where-Object { $_.status -eq 'Critical' }).Count
      $warning = @($databaseRows | Where-Object { $_.status -eq 'Warning' }).Count
      $status = if ($offline -gt 0) { 'Critical' } elseif ($warning -gt 0 -or $databaseRows.Count -eq 0) { 'Warning' } else { 'Healthy' }
      $databaseChecks = @{ product = 'MSSQL'; status = $status; serverName = $serverInfo.serverName; version = $serverInfo.version; edition = $serverInfo.edition; databaseCount = $databaseRows.Count; offlineCount = $offline; databases = $databaseRows }
    } else {
      $message = ($output | ForEach-Object { [string]$_ }) -join ' '
      $databaseChecks = @{ product = 'MSSQL'; status = 'Critical'; serverName = $target; message = $message.Substring(0, [math]::Min(1000, $message.Length)) }
    }
  }
}
Write-OpsBoxLog "DB 점검 완료: $($databaseChecks.status)"
