Write-OpsBoxLog 'WAS Thread Pool 점검 시작'
$detail = @{ product = $opsboxConfig.server.products.WAS; status = 'NotCollected'; message = 'Thread Pool 사용량은 JEUS/JMX 관리 주소와 인증 설정이 필요합니다. 서버별 관리 접속 정보를 등록한 뒤 수집할 수 있습니다.' }
$wasChecks += @{ processId = 0; processName = 'WAS Thread Pool'; status = $detail.status; message = $detail.message }
$rolePolicyResults += @{ role = 'WAS'; item = 'WAS_THREAD_POOL'; status = $detail.status; detail = $detail }
Write-OpsBoxLog "WAS Thread Pool 점검 완료: $($detail.status)"
