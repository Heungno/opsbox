Write-OpsBoxLog 'WAS 장기 수행 Thread 점검 시작'
$detail = @{ product = $opsboxConfig.server.products.WAS; status = 'NotCollected'; message = '장기 수행 Thread 판별에는 JEUS/JMX의 Thread Dump 수집과 기준 시간이 필요합니다.' }
$wasChecks += @{ processId = 0; processName = '장기 수행 Thread'; status = $detail.status; message = $detail.message }
$rolePolicyResults += @{ role = 'WAS'; item = 'WAS_LONG_RUNNING_THREAD'; status = $detail.status; detail = $detail }
Write-OpsBoxLog "WAS 장기 수행 Thread 점검 완료: $($detail.status)"
