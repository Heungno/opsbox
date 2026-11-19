Write-OpsBoxLog 'WAS DB Connection Pool 점검 시작'
$detail = @{ product = $opsboxConfig.server.products.WAS; status = 'NotCollected'; message = 'DB Connection Pool 수집에는 JEUS/JMX 관리 주소와 인증 설정이 필요합니다.' }
$wasChecks += @{ processId = 0; processName = 'DB Connection Pool'; status = $detail.status; message = $detail.message }
$rolePolicyResults += @{ role = 'WAS'; item = 'WAS_DB_CONNECTION_POOL'; status = $detail.status; detail = $detail }
Write-OpsBoxLog "WAS DB Connection Pool 점검 완료: $($detail.status)"
