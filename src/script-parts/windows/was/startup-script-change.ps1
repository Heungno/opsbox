Write-OpsBoxLog 'WAS 기동 스크립트 변경 점검 시작'
$product = [string]$opsboxConfig.server.products.WAS
$javaProcesses = @(Get-CimInstance Win32_Process -Filter "Name = 'java.exe'" -ErrorAction SilentlyContinue | Select-Object ProcessId, ExecutablePath, CommandLine)
$detail = @{ product = $product; status = 'NotCollected'; message = '비교할 기준 파일 또는 체크섬이 정책에 등록되지 않아 변경 여부를 판정할 수 없습니다.'; processCount = $javaProcesses.Count; processes = @($javaProcesses | ForEach-Object { @{ processId = $_.ProcessId; executablePath = $_.ExecutablePath; commandLine = $_.CommandLine } }) }
$wasChecks += @{ processId = 0; processName = '기동 스크립트'; status = $detail.status; message = $detail.message }
$rolePolicyResults += @{ role = 'WAS'; item = 'WAS_STARTUP_SCRIPT'; status = $detail.status; detail = $detail }
Write-OpsBoxLog "WAS 기동 스크립트 변경 점검 완료: $($detail.status)"
