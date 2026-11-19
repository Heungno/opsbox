Write-OpsBoxLog "DB 점검 시작: $($opsboxConfig.server.products.DB)"
$databaseChecks = @{ product = $opsboxConfig.server.products.DB; status = 'NotCollected'; message = '현재 Windows 템플릿은 MSSQL 수집을 지원합니다.' }
if ($opsboxConfig.server.products.DB -eq 'MSSQL') {
  $sqlcmd = Get-Command sqlcmd.exe -ErrorAction SilentlyContinue
  if (-not $sqlcmd) { $sqlcmd = Get-Command sqlcmd -ErrorAction SilentlyContinue }
  if (-not $sqlcmd) { $databaseChecks.message = 'sqlcmd를 PATH에서 찾을 수 없습니다.' }
  else {
    $targets = @($opsboxConfig.checks.rolePolicySettings.DB_INSTANCE_STATUS.instanceTargets | Where-Object { $_ })
    if (-not $targets.Count -and $env:OPSBOX_MSSQL_TARGET) { $targets = @($env:OPSBOX_MSSQL_TARGET) }
    if (-not $targets.Count) { $targets = @("$($opsboxConfig.server.ip),1433") }
    $instanceResults = @()
    $allDatabaseRows = @()
    foreach ($target in $targets) {
      Write-OpsBoxLog "MSSQL 인스턴스 접속 점검: $target"
      $query = $opsboxConfig.database.query
      $args = @('-S', [string]$target, '-d', 'master', '-E', '-l', '5', '-t', '10', '-Q', $query, '-h', '-1', '-W', '-s', '|', '-w', '65535', '-b')
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
            $databaseRows += @{ instanceTarget = [string]$target; name = $parts[1]; state = $parts[2]; recoveryModel = $parts[3]; sizeMB = $size; status = $status }
          }
        }
      }
      if ($exitCode -eq 0 -and $serverInfo) {
        $offline = @($databaseRows | Where-Object { $_.status -eq 'Critical' }).Count
        $warning = @($databaseRows | Where-Object { $_.status -eq 'Warning' }).Count
        $status = if ($offline -gt 0) { 'Critical' } elseif ($warning -gt 0 -or $databaseRows.Count -eq 0) { 'Warning' } else { 'Healthy' }
        $instanceResults += @{ target = [string]$target; status = $status; serverName = $serverInfo.serverName; version = $serverInfo.version; edition = $serverInfo.edition; databaseCount = $databaseRows.Count; offlineCount = $offline; databases = $databaseRows }
        $allDatabaseRows += $databaseRows
      } else {
        $message = ($output | ForEach-Object { [string]$_ }) -join ' '
        $instanceResults += @{ target = [string]$target; status = 'Critical'; message = $message.Substring(0, [math]::Min(1000, $message.Length)); databases = @() }
      }
    }
    $overallStatus = if (@($instanceResults | Where-Object { $_.status -eq 'Critical' }).Count -gt 0) { 'Critical' } elseif (@($instanceResults | Where-Object { $_.status -eq 'Warning' }).Count -gt 0) { 'Warning' } else { 'Healthy' }
    $firstInstance = $instanceResults | Select-Object -First 1
    $databaseChecks = @{ product = 'MSSQL'; status = $overallStatus; serverName = $firstInstance.serverName; version = $firstInstance.version; edition = $firstInstance.edition; targetCount = $targets.Count; instances = @($instanceResults); databaseCount = $allDatabaseRows.Count; offlineCount = @($allDatabaseRows | Where-Object { $_.status -eq 'Critical' }).Count; databases = @($allDatabaseRows) }
  }
}
Write-OpsBoxLog "DB 점검 완료: $($databaseChecks.status)"
$rolePolicyResults += @{ role = 'DB'; item = 'DB_INSTANCE_STATUS'; status = $databaseChecks.status; detail = $databaseChecks }
