Write-OpsBoxLog "WEB 점검 시작: $($opsboxConfig.server.products.WEB)"
if ($opsboxConfig.server.products.WEB -ne 'WebtoB') {
  $webCheck = @{ product = $opsboxConfig.server.products.WEB; status = 'NotCollected'; message = '선택한 WEB 제품의 전용 수집기가 아직 등록되지 않았습니다.' }
} else {
Write-OpsBoxLog 'WebtoB wsadmin 점검 시작'
$wsadmin = Get-Command wsadmin -ErrorAction SilentlyContinue
if (-not $wsadmin) { $wsadmin = Get-Command wsadmin.exe -ErrorAction SilentlyContinue }
if (-not $wsadmin) {
  $webCheck = @{ product = 'WebtoB'; status = 'NotCollected'; command = 'wsadmin: wi, ci -s, st -v, st -s'; message = 'wsadmin을 PATH에서 찾을 수 없습니다.' }
} else {
  try {
    $wsadminPath = $wsadmin.Source
    if (-not $env:WEBTOBDIR -and $wsadminPath) {
      $candidateHome = Split-Path (Split-Path $wsadminPath -Parent) -Parent
      if (Test-Path -LiteralPath (Join-Path $candidateHome 'config') -PathType Container) { $env:WEBTOBDIR = $candidateHome }
    }
    Write-OpsBoxLog "wsadmin 실행 경로: $wsadminPath (WEBTOBDIR=$env:WEBTOBDIR)"
    $startInfo = New-Object System.Diagnostics.ProcessStartInfo
    $startInfo.FileName = $wsadminPath
    if ($wsadminPath -match '\.(bat|cmd)$') {
      $startInfo.FileName = $env:ComSpec
      $startInfo.Arguments = "/d /s /c call `"$wsadminPath`""
    }
    $startInfo.UseShellExecute = $false
    $startInfo.CreateNoWindow = $true
    $startInfo.RedirectStandardInput = $true
    $startInfo.RedirectStandardOutput = $true
    $startInfo.RedirectStandardError = $true
    $wsadminProcess = New-Object System.Diagnostics.Process
    $wsadminProcess.StartInfo = $startInfo
    [void]$wsadminProcess.Start()
    $stdoutTask = $wsadminProcess.StandardOutput.ReadToEndAsync()
    $stderrTask = $wsadminProcess.StandardError.ReadToEndAsync()
    foreach ($command in @('wi', 'ci -s', 'st -v', 'st -s', 'quit')) { $wsadminProcess.StandardInput.WriteLine($command) }
    $wsadminProcess.StandardInput.Close()
    if (-not $wsadminProcess.WaitForExit(20000)) {
      $wsadminProcess.Kill()
      $webCheck = @{ product = 'WebtoB'; status = 'NotCollected'; command = 'wsadmin: wi, ci -s, st -v, st -s'; message = 'wsadmin 실행 시간이 20초를 초과했습니다.' }
    } else {
      $output = ($stdoutTask.Result + "`n" + $stderrTask.Result).Trim()
      $hasReady = $output -match '(?i)\bRDY\b'
      $hasBad = $output -match '(?i)\b(NRDY|BLK|DOWN|STOPPED)\b'
      $status = if ($hasBad) { 'Critical' } elseif ($hasReady) { 'Healthy' } else { 'NotCollected' }
      $webCheck = @{ product = 'WebtoB'; status = $status; command = 'wsadmin: wi, ci -s, st -v, st -s'; output = $output.Substring(0, [math]::Min(12000, $output.Length)); message = if ($status -eq 'NotCollected') { 'WebtoB 상태 값을 확인할 수 없습니다.' } else { $null } }
    }
  } catch { $webCheck = @{ product = 'WebtoB'; status = 'NotCollected'; command = 'wsadmin: wi, ci -s, st -v, st -s'; message = $_.Exception.Message } }
}
}
Write-OpsBoxLog "WEB 점검 완료: $($webCheck.status)"
$rolePolicyResults += @{ role = 'WEB'; item = 'WEB_ENGINE_STATUS'; status = $webCheck.status; detail = $webCheck }
