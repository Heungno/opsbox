Write-OpsBoxLog "HTTP 점검 시작: $($opsboxConfig.checks.httpChecks.Count)개 대상"
foreach ($item in $opsboxConfig.checks.httpChecks) {
  $timer = [System.Diagnostics.Stopwatch]::StartNew()
  $statusCode = $null
  $success = $false
  $errorMessage = $null
  try {
    $response = Invoke-WebRequest -Uri $item.url -Method Get -UseBasicParsing -TimeoutSec 10 -ErrorAction Stop
    $statusCode = [int]$response.StatusCode
    $success = ($statusCode -eq $item.expectedStatus)
  } catch {
    $errorMessage = $_.Exception.Message
    if ($_.Exception.Response) { try { $statusCode = [int]$_.Exception.Response.StatusCode } catch {} }
  }
  $timer.Stop()
  $httpChecks += @{ name = $item.name; url = $item.url; expectedStatus = $item.expectedStatus; statusCode = $statusCode; responseTimeMs = $timer.ElapsedMilliseconds; success = $success; error = $errorMessage }
  Write-OpsBoxLog "HTTP 확인: $($item.name) (성공=$success, 상태=$statusCode)"
}
