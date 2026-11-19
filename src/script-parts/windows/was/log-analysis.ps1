Write-OpsBoxLog 'WAS 로그 점검 시작'
$setting = $opsboxConfig.checks.rolePolicySettings.WAS_LOG
$logRoots = @($setting.logDirectories | ForEach-Object { ([string]$_).Trim() } | Where-Object { $_ })
$periodDays = 7
if ($setting.periodDays -and [int]::TryParse([string]$setting.periodDays, [ref]$periodDays)) { $periodDays = [math]::Max(1, [math]::Min(90, $periodDays)) }
$cutoff = (Get-Date).AddDays(-$periodDays)
$logFiles = @(); $missingRoots = @()
foreach ($root in $logRoots) {
  if (-not (Test-Path -LiteralPath $root -PathType Container)) { $missingRoots += $root; continue }
  $logFiles += @(Get-ChildItem -LiteralPath $root -File -Recurse -ErrorAction SilentlyContinue |
    Where-Object { $_.LastWriteTime -ge $cutoff -and ($_.Extension -in @('.log', '.txt', '.out', '.err') -or -not $_.Extension) } |
    Sort-Object LastWriteTime -Descending | Select-Object -First 500)
}

if ($logRoots.Count -eq 0) {
  $detail = @{ status = 'NotCollected'; message = '서버 정책에서 WAS 로그 폴더를 지정하세요.'; categories = @{}; periodDays = $periodDays }
} elseif ($logFiles.Count -eq 0) {
  $message = if ($missingRoots.Count -gt 0) { '지정된 로그 폴더 중 존재하지 않는 경로가 있습니다.' } else { "최근 $periodDays 일 내 수정된 로그 파일이 없습니다." }
  $detail = @{ status = 'NotCollected'; message = $message; checkedPaths = $logRoots; missingPaths = $missingRoots; categories = @{}; periodDays = $periodDays }
} else {
  $counts = [ordered]@{ fatal = 0; errorException = 0; warning = 0; http5xx = 0; http4xx = 0 }
  $samples = @(); $matchedLines = 0; $readErrors = @(); $scannedLines = 0
  foreach ($file in $logFiles) {
    $reader = $null
    try {
      $reader = [System.IO.StreamReader]::new($file.FullName, $true)
      while (($line = $reader.ReadLine()) -ne $null) {
        $scannedLines++
        $lineTime = $null
        $iso = [regex]::Match($line, '(?<!\d)(\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2})(?:\.\d+)?(?:Z|[+-]\d{2}:?\d{2})?')
        if ($iso.Success) {
          $parsed = [datetime]::MinValue
          if ([datetime]::TryParse($iso.Groups[1].Value, [System.Globalization.CultureInfo]::InvariantCulture, [System.Globalization.DateTimeStyles]::AssumeLocal, [ref]$parsed)) { $lineTime = $parsed }
        } else {
          $apache = [regex]::Match($line, '\[(\d{2}/[A-Za-z]{3}/\d{4}:\d{2}:\d{2}:\d{2})(?: ([+-]\d{4}))?\]')
          if ($apache.Success) {
            $dateText = $apache.Groups[1].Value
            if ($apache.Groups[2].Success) { $dateText += ' ' + $apache.Groups[2].Value.Insert(3, ':') }
            $formats = if ($apache.Groups[2].Success) { @('dd/MMM/yyyy:HH:mm:ss zzz') } else { @('dd/MMM/yyyy:HH:mm:ss') }
            $parsed = [datetime]::MinValue
            if ([datetime]::TryParseExact($dateText, $formats, [System.Globalization.CultureInfo]::InvariantCulture, [System.Globalization.DateTimeStyles]::AssumeLocal, [ref]$parsed)) { $lineTime = $parsed }
          }
        }
        if ($lineTime -and $lineTime -lt $cutoff) { continue }
        $lineMatch = $false
        if ($line -match '(?i)\b(FATAL|CRITICAL|EMERGENCY)\b') { $counts.fatal++; $lineMatch = $true }
        if ($line -match '(?i)\b(ERROR|ERR|EXCEPTION|SEVERE)\b') { $counts.errorException++; $lineMatch = $true }
        if ($line -match '(?i)\b(WARN|WARNING)\b') { $counts.warning++; $lineMatch = $true }
        if ($line -match '(?<!\d)5\d\d(?!\d)') { $counts.http5xx++; $lineMatch = $true }
        if ($line -match '(?<!\d)4\d\d(?!\d)') { $counts.http4xx++; $lineMatch = $true }
        if ($lineMatch) {
          $matchedLines++
          if ($samples.Count -lt 30) { $samples += @{ path = $file.FullName; timestamp = if ($lineTime) { $lineTime.ToString('yyyy-MM-dd HH:mm:ss') } else { $null }; text = $line.Trim() } }
        }
      }
    } catch { $readErrors += @{ path = $file.FullName; message = $_.Exception.Message } }
    finally { if ($reader) { $reader.Dispose() } }
  }
  $status = if ($counts.fatal -gt 0 -or $counts.errorException -gt 0 -or $counts.http5xx -gt 0) { 'Critical' } elseif ($counts.warning -gt 0 -or $counts.http4xx -gt 0) { 'Warning' } elseif ($scannedLines -eq 0 -and $readErrors.Count -gt 0) { 'NotCollected' } else { 'Healthy' }
  $detail = @{ status = $status; periodDays = $periodDays; since = $cutoff.ToString('yyyy-MM-dd HH:mm:ss'); checkedPaths = $logRoots; missingPaths = $missingRoots; checkedFileCount = $logFiles.Count; scannedLineCount = $scannedLines; matchedLineCount = $matchedLines; categories = $counts; readErrorCount = $readErrors.Count; readErrors = @($readErrors | Select-Object -First 10); samples = $samples }
}
$rolePolicyResults += @{ role = 'WAS'; item = 'WAS_LOG'; status = $detail.status; detail = $detail }
Write-OpsBoxLog "WAS 로그 점검 완료: $($detail.status), 폴더=$($logRoots.Count), 파일=$($logFiles.Count), 기간=$periodDays 일"
