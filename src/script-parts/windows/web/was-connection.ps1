Write-OpsBoxLog 'WEB-WAS 연동 점검 시작'
$detail = @{ product = $opsboxConfig.server.products.WEB; status = 'NotCollected'; message = 'WEB-WAS 대상 주소와 포트가 정책에 설정되지 않아 연결 검사를 수행할 수 없습니다.' }
$rolePolicyResults += @{ role = 'WEB'; item = 'WEB_WAS_CONNECTION'; status = $detail.status; detail = $detail }
Write-OpsBoxLog "WEB-WAS 연동 점검 완료: $($detail.status)"
