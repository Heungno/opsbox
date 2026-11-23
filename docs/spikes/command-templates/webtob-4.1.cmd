# WebtoB 4.1 · WEB 엔진 상태 (시험판)
# @opsbox-product  WebtoB 4.1
# @opsbox-tool     wsadmin
# @opsbox-home     WEBTOBDIR
# @opsbox-quit     quit
# @opsbox-timeout  20
#
# 판정: 서버(HTH·SVR) 상태 중 NRDY·BLK·DOWN이 하나라도 있으면 위험, RDY만 있으면 정상
# @opsbox-status   Critical ~ (^|[^A-Z0-9_])(NRDY|BLK|DOWN)([^A-Z0-9_]|$)
# @opsbox-status   Healthy  ~ (^|[^A-Z0-9_])RDY([^A-Z0-9_]|$)
#
# 넣을 명령 (현장 확인 필요: 4.1에서 쓰는 명령으로 바꾸면 됨)
#   si  서버 프로세스별 상태(RDY/NRDY)
#   ci  클라이언트(접속) 정보
si
ci
