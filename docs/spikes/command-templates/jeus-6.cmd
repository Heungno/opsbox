# JEUS 6 · WAS 엔진 상태 (시험판)
# @opsbox-product  JEUS 6
# @opsbox-tool     jeusadmin
# @opsbox-home     JEUS_HOME
#
# 로그인: 노드 이름·계정·비밀번호는 파일에 적지 않고 실행 계정의 환경 변수로 받습니다.
#   export JEUS_NODE=<노드 이름>  OPSBOX_JEUS_USER=administrator  OPSBOX_JEUS_PASSWORD=...
# @opsbox-require  JEUS_NODE OPSBOX_JEUS_USER OPSBOX_JEUS_PASSWORD
# @opsbox-args     ${JEUS_NODE} -U${OPSBOX_JEUS_USER} -P${OPSBOX_JEUS_PASSWORD}
# @opsbox-quit     exit
# @opsbox-timeout  30
#
# 판정 (현장 확인 필요: JEUS 6 출력에 실제로 나오는 상태 글자로 맞추면 됨)
# @opsbox-status   Critical ~ (SHUTDOWN|FAILED|NOT RUNNING|DOWN)
# @opsbox-status   Healthy  ~ RUNNING
#
# 넣을 명령 (현장 확인 필요)
#   allenginenames  노드의 엔진 컨테이너·엔진 목록과 상태
#   pidlist         엔진 컨테이너 프로세스 ID
allenginenames
pidlist
