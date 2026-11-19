Write-OpsBoxLog 'WEB 요청 처리량 점검 시작'
$detail = @{ product = $opsboxConfig.server.products.WEB; status = 'NotCollected'; message = 'WEB 관리 주소 또는 요청량 수집 명령 설정이 없어 자동 수집하지 않았습니다.' }
$rolePolicyResults += @{ role = 'WEB'; item = 'WEB_REQUEST_VOLUME'; status = $detail.status; detail = $detail }
Write-OpsBoxLog "WEB 요청 처리량 점검 완료: $($detail.status)"
