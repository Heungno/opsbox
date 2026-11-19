Write-OpsBoxLog 'DB 공통 쿼리 실행기 시작'
$product = [string]$opsboxConfig.server.products.DB
$databaseChecks = @{ product = $product; status = 'NotCollected'; message = '지원되는 DB 쿼리 설정이 없습니다.'; instances = @(); databases = @() }
if ($product -eq 'MSSQL') {
  $sqlcmd = Get-Command sqlcmd.exe -ErrorAction SilentlyContinue
  if (-not $sqlcmd) { $sqlcmd = Get-Command sqlcmd -ErrorAction SilentlyContinue }
  $queries = @($opsboxConfig.database.policyQueries)
  foreach ($item in @($opsboxConfig.checks.rolePolicies.DB)) {
    if ($item.item -eq 'DB_CUSTOM_QUERY') { continue }
    if (-not @($queries | Where-Object { $_.item -eq $item.item }).Count) {
      $rolePolicyResults += @{ role = 'DB'; item = $item.item; status = 'NotCollected'; detail = @{ message = '정책에서 실행할 DB 쿼리 템플릿을 선택하세요.' } }
    }
  }
  foreach ($query in $queries) {
    $setting = $opsboxConfig.checks.rolePolicySettings.($query.item)
    $targets = @($setting.instanceTargets | Where-Object { $_ })
    if (-not $targets.Count) { $targets = @($opsboxConfig.checks.rolePolicySettings.DB_INSTANCE_STATUS.instanceTargets | Where-Object { $_ }) }
    if (-not $targets.Count -and $env:OPSBOX_MSSQL_TARGET) { $targets = @($env:OPSBOX_MSSQL_TARGET) }
    if (-not $targets.Count) { $targets = @("$($opsboxConfig.server.ip),1433") }
    $results = @()
    foreach ($target in $targets) {
      if (-not $sqlcmd) {
        $results += @{ target = [string]$target; status = 'NotCollected'; message = 'sqlcmd를 PATH에서 찾을 수 없습니다.'; columns = @(); rows = @() }
        continue
      }
      Write-OpsBoxLog "DB 쿼리 실행: $($query.name) / $target"
      $output = @(& $sqlcmd.Source -S ([string]$target) -d master -E -l 5 -t 10 -Q ([string]$query.content) -W -s '|' -w 65535 -b 2>&1)
      $exitCode = $LASTEXITCODE
      $lines = @($output | ForEach-Object { ([string]$_).Trim() } | Where-Object { $_ -and $_ -notmatch '^(-+\s*\|?\s*)+$' })
      $columns = @(); $rows = @()
      if ($lines.Count -gt 0 -and $exitCode -eq 0) {
        $columns = @($lines[0] -split '\|' | ForEach-Object { $_.Trim() })
        foreach ($line in @($lines | Select-Object -Skip 1)) {
          $cells = @($line -split '\|' | ForEach-Object { $_.Trim() })
          if ($cells.Count -eq $columns.Count) { $rows += ,$cells }
        }
      }
      $states = @($rows | ForEach-Object { if ($columns.Count -gt 0 -and $columns[0] -eq '__OPSBOX_STATUS') { $_[0] } } | Where-Object { $_ -in @('Healthy', 'Warning', 'Critical') })
      $status = if ($exitCode -ne 0) { 'Critical' } elseif ($rows.Count -eq 0) { 'NotCollected' } elseif ($states -contains 'Critical') { 'Critical' } elseif ($states -contains 'Warning') { 'Warning' } else { 'Healthy' }
      $message = if ($exitCode -ne 0) { (($output | ForEach-Object { [string]$_ }) -join ' ').Substring(0, [math]::Min(1200, (($output | ForEach-Object { [string]$_ }) -join ' ').Length)) } else { $null }
      $results += @{ target = [string]$target; status = $status; message = $message; columns = $columns; rows = @($rows); rowCount = $rows.Count }
    }
    $status = if (@($results | Where-Object { $_.status -eq 'Critical' }).Count) { 'Critical' } elseif (@($results | Where-Object { $_.status -eq 'Warning' }).Count) { 'Warning' } elseif (@($results | Where-Object { $_.status -eq 'Healthy' }).Count) { 'Healthy' } else { 'NotCollected' }
    $rolePolicyResults += @{ role = 'DB'; item = $query.item; status = $status; detail = @{ queryName = $query.name; queries = @($results) } }
    if ($query.item -eq 'DB_INSTANCE_STATUS') {
      $databaseRows = @(); $instances = @()
      $serverName = $null; $version = $null; $edition = $null
      foreach ($instanceResult in $results) {
        $instances += @{ target = $instanceResult.target; status = $instanceResult.status; databaseCount = $instanceResult.rowCount; message = $instanceResult.message }
        if ($instanceResult.rows.Count -gt 0) {
          foreach ($field in @('serverName', 'version', 'edition')) {
            $fieldIndex = [array]::IndexOf([string[]]$instanceResult.columns, $field)
            if ($fieldIndex -ge 0) { Set-Variable -Name $field -Value ([string]$instanceResult.rows[0][$fieldIndex]) }
          }
        }
        $databaseNameIndex = [array]::IndexOf([string[]]$instanceResult.columns, 'databaseName')
        $stateIndex = [array]::IndexOf([string[]]$instanceResult.columns, 'state')
        $recoveryIndex = [array]::IndexOf([string[]]$instanceResult.columns, 'recoveryModel')
        $sizeIndex = [array]::IndexOf([string[]]$instanceResult.columns, 'dataSizeMB')
        foreach ($row in $instanceResult.rows) {
          if ($databaseNameIndex -lt 0) { continue }
          $state = if ($stateIndex -ge 0) { [string]$row[$stateIndex] } else { '' }
          $rowStatus = if ($instanceResult.columns[0] -eq '__OPSBOX_STATUS') { [string]$row[0] } else { 'Healthy' }
          $size = 0.0; if ($sizeIndex -ge 0) { [void][double]::TryParse([string]$row[$sizeIndex], [ref]$size) }
          $databaseRows += @{ instanceTarget = $instanceResult.target; name = [string]$row[$databaseNameIndex]; state = $state; recoveryModel = if ($recoveryIndex -ge 0) { [string]$row[$recoveryIndex] } else { '' }; sizeMB = $size; status = $rowStatus }
        }
      }
      $databaseChecks = @{ product = $product; status = $status; serverName = $serverName; version = $version; edition = $edition; targetCount = $results.Count; databaseCount = $databaseRows.Count; offlineCount = @($databaseRows | Where-Object { $_.status -eq 'Critical' }).Count; instances = @($instances); databases = @($databaseRows) }
    }
    Write-OpsBoxLog "DB 쿼리 완료: $($query.name) / $status"
  }
  foreach ($query in @($opsboxConfig.database.customQueries)) {
    $results = @()
    $targets = @($opsboxConfig.checks.rolePolicySettings.DB_CUSTOM_QUERY.instanceTargets | Where-Object { $_ })
    if (-not $targets.Count) { $targets = @($opsboxConfig.checks.rolePolicySettings.DB_INSTANCE_STATUS.instanceTargets | Where-Object { $_ }) }
    if (-not $targets.Count -and $env:OPSBOX_MSSQL_TARGET) { $targets = @($env:OPSBOX_MSSQL_TARGET) }
    if (-not $targets.Count) { $targets = @("$($opsboxConfig.server.ip),1433") }
    foreach ($target in $targets) {
      if (-not $sqlcmd) { $results += @{ target = [string]$target; status = 'NotCollected'; message = 'sqlcmd를 PATH에서 찾을 수 없습니다.'; columns = @(); rows = @() }; continue }
      $output = @(& $sqlcmd.Source -S ([string]$target) -d master -E -l 5 -t 10 -Q ([string]$query.content) -W -s '|' -w 65535 -b 2>&1)
      $exitCode = $LASTEXITCODE
      $lines = @($output | ForEach-Object { ([string]$_).Trim() } | Where-Object { $_ -and $_ -notmatch '^(-+\s*\|?\s*)+$' })
      $columns = @(); $rows = @()
      if ($lines.Count -gt 0 -and $exitCode -eq 0) { $columns = @($lines[0] -split '\|' | ForEach-Object { $_.Trim() }); foreach ($line in @($lines | Select-Object -Skip 1)) { $cells = @($line -split '\|' | ForEach-Object { $_.Trim() }); if ($cells.Count -eq $columns.Count) { $rows += ,$cells } } }
      $results += @{ target = [string]$target; status = if ($exitCode -eq 0) { 'Healthy' } else { 'Critical' }; message = if ($exitCode -eq 0) { $null } else { (($output | ForEach-Object { [string]$_ }) -join ' ') }; columns = $columns; rows = @($rows); rowCount = $rows.Count }
    }
    $status = if (@($results | Where-Object { $_.status -eq 'Critical' }).Count) { 'Critical' } elseif (@($results | Where-Object { $_.status -eq 'Healthy' }).Count) { 'Healthy' } else { 'NotCollected' }
    $rolePolicyResults += @{ role = 'DB'; item = 'DB_CUSTOM_QUERY'; status = $status; detail = @{ queries = @($results | ForEach-Object { @{ name = $query.name; target = $_.target; status = $_.status; message = $_.message; columns = $_.columns; rows = $_.rows; rowCount = $_.rowCount } }) } }
  }
}
Write-OpsBoxLog "DB 공통 쿼리 실행기 종료: $product"
