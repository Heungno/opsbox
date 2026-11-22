#!/bin/bash
# OpsBox 점검 스크립트 (Linux)
# 사용법: bash <서버ID>.sh [결과 폴더]
#   결과 폴더를 주면 그곳에 저장합니다. 없으면 OpsBox에서 정한 결과 저장 경로,
#   그것도 없거나 쓸 수 없으면 이 스크립트가 있는 폴더에 저장합니다.
#   OpsBox 수신함이 아닌 곳에 저장됐으면 파일을 수신함에 넣거나, 서버 상세 화면의 [결과 파일 올리기]로 올리면 됩니다.
# 필요 환경: bash 4.2 이상, coreutils, procps, awk (jq·python 불필요)

# sh 등 다른 셸로 실행해도 bash로 다시 실행합니다.
if [ -z "${BASH_VERSION:-}" ]; then exec bash "$0" "$@"; fi
if [ "${BASH_VERSINFO[0]}" -lt 4 ] || { [ "${BASH_VERSINFO[0]}" -eq 4 ] && [ "${BASH_VERSINFO[1]}" -lt 2 ]; }; then
  echo "bash 4.2 이상이 필요합니다. 현재: $BASH_VERSION" >&2
  exit 1
fi

export LC_ALL=C
umask 022

# ---- OpsBox 설정 (스크립트 생성 시 자동으로 채워짐) ----
OPSBOX_SERVER_ID='BATCH-01'
OPSBOX_RESULT_DIR='/batch/opsbox/results'
OPSBOX_PRODUCT_WEB=''
OPSBOX_PRODUCT_WAS=''
OPSBOX_PRODUCT_DB=''
OPSBOX_CPU_WARNING='70'
OPSBOX_CPU_CRITICAL='90'
OPSBOX_MEMORY_WARNING='70'
OPSBOX_MEMORY_CRITICAL='90'
OPSBOX_DISK_WARNING='70'
OPSBOX_DISK_CRITICAL='90'
OPSBOX_PROCESS_NAMES=('crond')
OPSBOX_DIRECTORY_PATHS=('/batch/out')
OPSBOX_DIRECTORY_WARNING=('80')
OPSBOX_DIRECTORY_CRITICAL=('90')
OPSBOX_FILE_PATHS=('/batch/out/daily_extract.csv')
OPSBOX_FILE_WARNING_MB=('500')
OPSBOX_FILE_CRITICAL_MB=('1000')
OPSBOX_PORT_NUMBERS=()
OPSBOX_PORT_PROTOCOLS=()
OPSBOX_PORT_DESCRIPTIONS=()
OPSBOX_HTTP_NAMES=()
OPSBOX_HTTP_URLS=()
OPSBOX_HTTP_EXPECTED=()
OPSBOX_SERVER_JSON='{"id":"BATCH-01","name":"야간 배치 서버","ip":"10.10.5.52","roles":["OTHER"],"products":{}}'
OPSBOX_POLICY_DEFINITIONS_JSON='{"HOST_INFO":{"id":"HOST_INFO","name":"서버 기본정보","enabled":true,"executor":{"type":"SCRIPT","options":{}},"inputs":[],"result":{"components":[{"type":"SUMMARY"},{"type":"TABLE","columns":[{"key":"hostname","label":"호스트명"},{"key":"osName","label":"운영체제"},{"key":"osVersion","label":"OS 버전"},{"key":"status","label":"상태"}]}],"statusField":"status","statusRules":{"healthy":"Healthy","warning":"Warning","critical":"Critical","notCollected":"NotCollected"}}},"CPU":{"id":"CPU","name":"CPU 사용률","enabled":true,"executor":{"type":"SCRIPT","options":{"warningPercent":70,"criticalPercent":90}},"inputs":[],"result":{"components":[{"type":"SUMMARY"},{"type":"METRIC"}],"statusField":"status","statusRules":{"healthy":"Healthy","warning":"Warning","critical":"Critical","notCollected":"NotCollected","warningPercent":70,"criticalPercent":90}}},"MEMORY":{"id":"MEMORY","name":"메모리 사용률","enabled":true,"executor":{"type":"SCRIPT","options":{"warningPercent":70,"criticalPercent":90}},"inputs":[],"result":{"components":[{"type":"SUMMARY"},{"type":"METRIC"}],"statusField":"status","statusRules":{"healthy":"Healthy","warning":"Warning","critical":"Critical","notCollected":"NotCollected","warningPercent":70,"criticalPercent":90}}},"UPTIME":{"id":"UPTIME","name":"가동시간","enabled":true,"executor":{"type":"SCRIPT","options":{}},"inputs":[],"result":{"components":[{"type":"SUMMARY"},{"type":"METRIC"}],"statusField":"status","statusRules":{"healthy":"Healthy","warning":"Warning","critical":"Critical","notCollected":"NotCollected"}}},"DISK":{"id":"DISK","name":"디스크 사용량","enabled":true,"executor":{"type":"FILESYSTEM_CHECK","options":{"warningPercent":70,"criticalPercent":90}},"inputs":[],"result":{"components":[{"type":"SUMMARY"},{"type":"METRIC"},{"type":"TABLE","columns":[{"key":"device","label":"드라이브"},{"key":"volumeName","label":"볼륨명"},{"key":"totalGB","label":"전체(GB)"},{"key":"usedGB","label":"사용(GB)"},{"key":"freeGB","label":"여유(GB)"},{"key":"usagePercent","label":"사용률(%)"},{"key":"status","label":"상태"}]}],"statusField":"status","statusRules":{"healthy":"Healthy","warning":"Warning","critical":"Critical","notCollected":"NotCollected","warningPercent":70,"criticalPercent":90}}},"PROCESS":{"id":"PROCESS","name":"프로세스","enabled":true,"executor":{"type":"FILESYSTEM_CHECK","options":{}},"inputs":[],"result":{"components":[{"type":"SUMMARY"},{"type":"TABLE","columns":[{"key":"name","label":"프로세스"},{"key":"processId","label":"PID"},{"key":"running","label":"실행 중"},{"key":"cpuSeconds","label":"CPU(초)"},{"key":"memoryMB","label":"메모리(MB)"},{"key":"uptimeMinutes","label":"가동(분)"},{"key":"status","label":"상태"}]}],"statusField":"status","statusRules":{"healthy":"Healthy","warning":"Warning","critical":"Critical","notCollected":"NotCollected"}}},"DIRECTORY":{"id":"DIRECTORY","name":"디렉터리 사용량","enabled":true,"executor":{"type":"FILESYSTEM_CHECK","options":{}},"inputs":[],"result":{"components":[{"type":"SUMMARY"},{"type":"TABLE","columns":[{"key":"path","label":"경로"},{"key":"exists","label":"존재"},{"key":"sizeGB","label":"크기(GB)"},{"key":"usedGB","label":"사용(GB)"},{"key":"freeGB","label":"여유(GB)"},{"key":"totalGB","label":"전체(GB)"},{"key":"usagePercent","label":"사용률(%)"},{"key":"status","label":"상태"},{"key":"message","label":"메시지"}]}],"statusField":"status","statusRules":{"healthy":"Healthy","warning":"Warning","critical":"Critical","notCollected":"NotCollected"}}},"FILE_SIZE":{"id":"FILE_SIZE","name":"파일 크기","enabled":true,"executor":{"type":"FILESYSTEM_CHECK","options":{}},"inputs":[],"result":{"components":[{"type":"SUMMARY"},{"type":"TABLE","columns":[{"key":"path","label":"파일 경로"},{"key":"exists","label":"존재"},{"key":"sizeMB","label":"크기(MB)"},{"key":"status","label":"상태"},{"key":"message","label":"메시지"}]}],"statusField":"status","statusRules":{"healthy":"Healthy","warning":"Warning","critical":"Critical","notCollected":"NotCollected"}}},"PORT":{"id":"PORT","name":"포트 리스닝","enabled":true,"executor":{"type":"TCP_CHECK","options":{}},"inputs":[],"result":{"components":[{"type":"SUMMARY"},{"type":"TABLE","columns":[{"key":"port","label":"포트"},{"key":"protocol","label":"프로토콜"},{"key":"description","label":"설명"},{"key":"listening","label":"수신 중"},{"key":"processName","label":"프로세스"}]}],"statusField":"status","statusRules":{"healthy":"Healthy","warning":"Warning","critical":"Critical","notCollected":"NotCollected"}}},"HTTP":{"id":"HTTP","name":"HTTP 응답","enabled":true,"executor":{"type":"HTTP_CHECK","options":{}},"inputs":[],"result":{"components":[{"type":"SUMMARY"},{"type":"TABLE","columns":[{"key":"name","label":"점검명"},{"key":"url","label":"URL"},{"key":"expectedStatus","label":"기대 코드"},{"key":"statusCode","label":"응답 코드"},{"key":"responseTimeMs","label":"응답 시간(ms)"},{"key":"success","label":"성공"},{"key":"error","label":"오류"}]}],"statusField":"status","statusRules":{"healthy":"Healthy","warning":"Warning","critical":"Critical","notCollected":"NotCollected"}}},"CUSTOM_DEMO_SWAP":{"id":"CUSTOM_DEMO_SWAP","name":"Swap 사용률","enabled":true,"executor":{"type":"CHECK_BUILDER","options":{"builder":{"version":1,"type":"COMMAND_NUMBER","presetId":"linux.swap"}},"templateId":"GEN-CUSTOM_DEMO_SWAP-LINUX"},"inputs":[],"result":{"components":[{"type":"SUMMARY"},{"type":"TABLE","columns":[{"key":"target","label":"대상"},{"key":"value","label":"값"},{"key":"threshold","label":"기준"},{"key":"status","label":"상태"},{"key":"message","label":"메시지"}]},{"type":"CONSOLE"}],"statusField":"status"}}}'
OPSBOX_WAS_HEAP_WARNING='70'
OPSBOX_WAS_HEAP_CRITICAL='90'
OPSBOX_WEB_LOG_DIRS=()
OPSBOX_WEB_LOG_DAYS='7'
OPSBOX_WAS_LOG_DIRS=()
OPSBOX_WAS_LOG_DAYS='7'
OPSBOX_ROLE_ITEM_ROLES=()
OPSBOX_ROLE_ITEM_IDS=()
OPSBOX_ROLE_ITEM_META=()
OPSBOX_ROLE_ITEM_MESSAGES=()
OPSBOX_DB_QUERY_ITEMS=()
OPSBOX_DB_QUERY_NAMES=()
OPSBOX_DB_QUERY_SQL=()
OPSBOX_DB_QUERY_TARGETS=()
OPSBOX_DB_CUSTOM_NAMES=()
OPSBOX_DB_CUSTOM_SQL=()
OPSBOX_DB_CUSTOM_TARGETS=''
OPSBOX_ROLE_POLICIES_JSON='{}'
OPSBOX_ROLE_POLICY_STATUSES=''
OPSBOX_BASIC_POLICY_ITEMS_JSON='[{"role":"BASIC","item":"CUSTOM_DEMO_SWAP","name":"Swap 사용률","result":{"components":[{"type":"SUMMARY"},{"type":"TABLE","columns":[{"key":"target","label":"대상"},{"key":"value","label":"값"},{"key":"threshold","label":"기준"},{"key":"status","label":"상태"},{"key":"message","label":"메시지"}]},{"type":"CONSOLE"}],"statusField":"status"},"executorType":"CHECK_BUILDER","status":"NotCollected","message":"연결된 점검 스크립트가 결과를 기록하지 않았습니다."}]'
OPSBOX_BASIC_ITEM_IDS=('CUSTOM_DEMO_SWAP')
OPSBOX_BASIC_ITEM_META=('"name":"Swap 사용률","result":{"components":[{"type":"SUMMARY"},{"type":"TABLE","columns":[{"key":"target","label":"대상"},{"key":"value","label":"값"},{"key":"threshold","label":"기준"},{"key":"status","label":"상태"},{"key":"message","label":"메시지"}]},{"type":"CONSOLE"}],"statusField":"status"},"executorType":"CHECK_BUILDER"')
OPSBOX_BASIC_NOT_COLLECTED_MESSAGE='연결된 점검 스크립트가 결과를 기록하지 않았습니다.'
declare -A OPSBOX_ITEM_INPUT=()
# ---- OpsBox 설정 끝 ----
# ---- 역할별 점검 결과 기록 (OpsBox가 자동으로 넣음) ----
declare -A OPSBOX_ROLE_STATUS=() OPSBOX_ROLE_DETAIL=()
opsbox_role_record() { OPSBOX_ROLE_STATUS["$1:$2"]=$3; OPSBOX_ROLE_DETAIL["$1:$2"]=${4:-null}; }
# 정책 항목의 서버별 입력 값 (없으면 빈 문자열, 목록은 줄바꿈 구분): opsbox_item_input 항목ID 키
opsbox_item_input() { printf '%s' "${OPSBOX_ITEM_INPUT["$1:$2"]-}"; }
web_status=NotCollected; web_check_json=null; was_items_json=''; was_statuses=''; database_status=NotCollected; database_check_json=null
opsbox_was_item() { [ -n "$was_items_json" ] && was_items_json+=','; was_items_json+=$1; was_statuses+=" $2"; }
# 이름이 정확히 같은 프로세스의 PID 목록 (pgrep이 없거나 못 찾으면 /proc/*/comm 에서 찾음)
opsbox_pids_by_name() {
  local found f c pid
  found=$(pgrep -x -- "$1" 2>/dev/null)
  if [ -n "$found" ]; then printf '%s\n' "$found"; return; fi
  for f in /proc/[0-9]*/comm; do
    read -r c < "$f" 2>/dev/null || continue
    [ "$c" = "$1" ] || continue
    pid=${f#/proc/}; printf '%s\n' "${pid%/comm}"
  done
}

opsbox_log() { printf '[%s] %s\n' "$(date '+%Y-%m-%d %H:%M:%S')" "$*"; }

# JSON 문자열 ("..." 포함) 출력: 역슬래시·따옴표·제어문자 처리
opsbox_json_string() {
  local s
  s=$(printf '%s' "$1" | tr -d '\000-\010\013\014\016-\037')
  s=${s//\\/\\\\}
  s=${s//\"/\\\"}
  s=${s//$'\n'/\\n}
  s=${s//$'\r'/\\r}
  s=${s//$'\t'/\\t}
  printf '"%s"' "$s"
}

# 숫자면 그대로, 아니면 null
opsbox_json_number() {
  case "$1" in
    ''|*[!0-9.-]*|*.*.*|-|.) printf 'null' ;;
    *) printf '%s' "$1" ;;
  esac
}

opsbox_json_bool() { if [ "$1" = "true" ]; then printf 'true'; else printf 'false'; fi; }

# 사용률 → 상태 (값 경고기준 위험기준)
opsbox_status_by_percent() {
  awk -v v="$1" -v w="$2" -v c="$3" 'BEGIN { if (v == "") { print "NotCollected" } else if (v + 0 >= c + 0) { print "Critical" } else if (v + 0 >= w + 0) { print "Warning" } else { print "Healthy" } }'
}

# 바이트/킬로바이트 → GB (소수 2자리)
opsbox_kb_to_gb() { awk -v n="$1" 'BEGIN { printf "%.2f", n / 1048576 }'; }
opsbox_bytes_to_gb() { awk -v n="$1" 'BEGIN { printf "%.2f", n / 1073741824 }'; }
opsbox_bytes_to_mb() { awk -v n="$1" 'BEGIN { printf "%.2f", n / 1048576 }'; }

# 결과 폴더 결정: 인자 → OpsBox에서 정한 결과 저장 경로(OPSBOX_RESULT_DIR) → 스크립트 폴더
opsbox_run_stamp=$(date '+%Y%m%d_%H%M%S')
opsbox_script_dir=$(cd "$(dirname "$0")" 2>/dev/null && pwd)
[ -n "$opsbox_script_dir" ] || opsbox_script_dir=$(pwd)
if [ -n "${1:-}" ]; then
  opsbox_result_dir=$1
elif [ -n "$OPSBOX_RESULT_DIR" ]; then
  opsbox_result_dir="$OPSBOX_RESULT_DIR"
else
  opsbox_result_dir=$opsbox_script_dir
fi
opsbox_result_dir_ready=false
if mkdir -p "$opsbox_result_dir" 2>/dev/null && [ -w "$opsbox_result_dir" ]; then opsbox_result_dir_ready=true; fi
opsbox_result_name="${OPSBOX_SERVER_ID}_${opsbox_run_stamp}.json"

opsbox_log '점검 스크립트 시작'
opsbox_log "결과 폴더: $opsbox_result_dir (쓰기 가능=$opsbox_result_dir_ready)"

host_name=$(hostname 2>/dev/null || uname -n)
os_name=''
os_version=''
check_date=$(date '+%Y-%m-%d %H:%M:%S')
host_info_status=NotCollected
uptime_minutes=''
uptime_parts_json=null
uptime_status=NotCollected
cpu=''
cpu_status=NotCollected
memory=''
memory_status=NotCollected
disk=''
disk_status=NotCollected
disks_json=''
processes_json=''
process_statuses=''
directories_json=''
directory_statuses=''
files_json=''
file_statuses=''
ports_json=''
port_statuses=''
http_json=''
http_statuses=''

opsbox_log '서버 기본정보 점검 시작'
if [ -r /etc/os-release ]; then
  os_name=$(. /etc/os-release 2>/dev/null; printf '%s' "${PRETTY_NAME:-${NAME:-Linux} ${VERSION:-}}")
  os_version=$(. /etc/os-release 2>/dev/null; printf '%s' "${VERSION_ID:-}")
elif [ -r /etc/redhat-release ]; then
  os_name=$(head -n 1 /etc/redhat-release)
  os_version=$(sed -n 's/.*release \([0-9.]*\).*/\1/p' /etc/redhat-release | head -n 1)
else
  os_name=$(uname -s)
fi
kernel_version=$(uname -r 2>/dev/null)
if [ -n "$kernel_version" ]; then os_version="${os_version:+$os_version, }kernel $kernel_version"; fi
if [ -n "$os_name" ]; then host_info_status=Healthy; fi
opsbox_log "서버 기본정보 점검 완료: $host_info_status ($os_name / $os_version)"

opsbox_log 'CPU 점검 시작'
opsbox_cpu_sample() { awk '/^cpu / { idle = $5 + $6; total = 0; for (i = 2; i <= NF; i++) total += $i; print total, idle }' /proc/stat 2>/dev/null; }
cpu_before=$(opsbox_cpu_sample)
sleep 1
cpu_after=$(opsbox_cpu_sample)
if [ -n "$cpu_before" ] && [ -n "$cpu_after" ]; then
  cpu=$(awk -v b="$cpu_before" -v a="$cpu_after" 'BEGIN { split(b, x, " "); split(a, y, " "); t = y[1] - x[1]; i = y[2] - x[2]; if (t > 0) printf "%d", ((t - i) / t) * 100 + 0.5; }')
fi
if [ -n "$cpu" ]; then
  cpu_status=$(opsbox_status_by_percent "$cpu" "$OPSBOX_CPU_WARNING" "$OPSBOX_CPU_CRITICAL")
else
  cpu_status=NotCollected
  opsbox_log 'CPU 수집 오류: /proc/stat을 읽을 수 없습니다.'
fi
opsbox_log "CPU 점검 완료: $cpu_status ($cpu%)"

opsbox_log '메모리 점검 시작'
memory=$(awk '/^MemTotal:/ { t = $2 } /^MemAvailable:/ { a = $2; has = 1 } /^MemFree:/ { f = $2 } /^Buffers:/ { b = $2 } /^Cached:/ { c = $2 }
  END { if (!has) a = f + b + c; if (t > 0) printf "%d", ((t - a) / t) * 100 + 0.5 }' /proc/meminfo 2>/dev/null)
if [ -n "$memory" ]; then
  memory_status=$(opsbox_status_by_percent "$memory" "$OPSBOX_MEMORY_WARNING" "$OPSBOX_MEMORY_CRITICAL")
else
  memory_status=NotCollected
  opsbox_log '메모리 수집 오류: /proc/meminfo를 읽을 수 없습니다.'
fi
opsbox_log "메모리 점검 완료: $memory_status ($memory%)"

opsbox_log '가동시간 점검 시작'
uptime_seconds=$(awk '{ printf "%d", $1 }' /proc/uptime 2>/dev/null)
if [ -n "$uptime_seconds" ]; then
  uptime_minutes=$((uptime_seconds / 60))
  now_epoch=$(date '+%s')
  # 달력 기준으로 년·월·일·시·분 계산 (부팅 시각 → 현재)
  read -r by bm bd bh bmin <<< "$(date -d "@$((now_epoch - uptime_seconds))" '+%Y %m %d %H %M')"
  read -r ny nm nd nh nmin <<< "$(date -d "@$now_epoch" '+%Y %m %d %H %M')"
  by=$((10#$by)); bm=$((10#$bm)); bd=$((10#$bd)); bh=$((10#$bh)); bmin=$((10#$bmin))
  ny=$((10#$ny)); nm=$((10#$nm)); nd=$((10#$nd)); nh=$((10#$nh)); nmin=$((10#$nmin))
  um=$((nmin - bmin)); if [ $um -lt 0 ]; then um=$((um + 60)); nh=$((nh - 1)); fi
  uh=$((nh - bh)); if [ $uh -lt 0 ]; then uh=$((uh + 24)); nd=$((nd - 1)); fi
  ud=$((nd - bd))
  if [ $ud -lt 0 ]; then
    days_in_prev_month=$(date -d "$(printf '%04d-%02d-01' "$ny" "$nm") -1 day" '+%d')
    ud=$((ud + 10#$days_in_prev_month)); nm=$((nm - 1))
  fi
  umo=$((nm - bm)); if [ $umo -lt 0 ]; then umo=$((umo + 12)); ny=$((ny - 1)); fi
  uy=$((ny - by))
  uptime_parts_json="{\"years\":$uy,\"months\":$umo,\"days\":$ud,\"hours\":$uh,\"minutes\":$um}"
  uptime_status=Healthy
  opsbox_log "가동시간 점검 완료: $uptime_status (${uy}년 ${umo}개월 ${ud}일 ${uh}시간 ${um}분)"
else
  uptime_status=NotCollected
  opsbox_log '가동시간 수집 오류: /proc/uptime을 읽을 수 없습니다.'
fi

opsbox_log '디스크 점검 시작'
disk_index=0
disk_has_warning=false
disk_has_critical=false
while IFS='|' read -r d_device d_total d_used d_avail d_usage d_mount; do
  case "$d_usage" in ''|*[!0-9]*) continue ;; esac
  d_status=$(opsbox_status_by_percent "$d_usage" "$OPSBOX_DISK_WARNING" "$OPSBOX_DISK_CRITICAL")
  [ "$d_status" = Critical ] && disk_has_critical=true
  [ "$d_status" = Warning ] && disk_has_warning=true
  [ $disk_index -gt 0 ] && disks_json+=','
  disks_json+="{\"device\":$(opsbox_json_string "$d_device"),\"mountPoint\":$(opsbox_json_string "$d_mount"),\"volumeName\":$(opsbox_json_string "$d_mount"),\"totalGB\":$(opsbox_kb_to_gb "$d_total"),\"usedGB\":$(opsbox_kb_to_gb "$d_used"),\"freeGB\":$(opsbox_kb_to_gb "$d_avail"),\"usagePercent\":$d_usage,\"status\":\"$d_status\"}"
  if [ -z "$disk" ] || [ "$d_usage" -gt "$disk" ]; then disk=$d_usage; fi
  disk_index=$((disk_index + 1))
done < <(df -P -k -l -x tmpfs -x devtmpfs -x squashfs -x overlay -x iso9660 2>/dev/null | awk 'NR > 1 { mount = $6; for (i = 7; i <= NF; i++) mount = mount " " $i; sub(/%$/, "", $5); print $1 "|" $2 "|" $3 "|" $4 "|" $5 "|" mount }')
if [ $disk_index -eq 0 ]; then disk_status=NotCollected
elif [ "$disk_has_critical" = true ]; then disk_status=Critical
elif [ "$disk_has_warning" = true ]; then disk_status=Warning
else disk_status=Healthy; fi
opsbox_log "디스크 점검 완료: ${disk_index}개, 최대 사용률 ${disk}%, 상태=$disk_status"

opsbox_log "프로세스 점검 시작: ${#OPSBOX_PROCESS_NAMES[@]}개 대상"
for p_index in "${!OPSBOX_PROCESS_NAMES[@]}"; do
  p_name=${OPSBOX_PROCESS_NAMES[$p_index]}
  # 프로세스 이름(comm)은 커널에서 15자까지만 보관되므로 앞 15자로도 찾아봅니다.
  p_pid=$(pgrep -o -x -- "$p_name" 2>/dev/null || pgrep -o -x -- "${p_name:0:15}" 2>/dev/null)
  [ -n "$processes_json" ] && processes_json+=','
  if [ -n "$p_pid" ]; then
    read -r p_rss p_etimes p_time <<< "$(ps -o rss=,etimes=,time= -p "$p_pid" 2>/dev/null)"
    p_cpu_seconds=$(awk -v t="$p_time" 'BEGIN { n = split(t, d, "-"); hms = d[n]; days = (n > 1) ? d[1] : 0; m = split(hms, x, ":"); s = 0; for (i = 1; i <= m; i++) s = s * 60 + x[i]; print days * 86400 + s }')
    processes_json+="{\"name\":$(opsbox_json_string "$p_name"),\"processId\":$p_pid,\"running\":true,\"cpuSeconds\":$(opsbox_json_number "$p_cpu_seconds"),\"memoryMB\":$(opsbox_json_number "$(awk -v n="$p_rss" 'BEGIN { printf "%.2f", n / 1024 }')"),\"uptimeMinutes\":$(opsbox_json_number "$(( ${p_etimes:-0} / 60 ))"),\"status\":\"Healthy\"}"
    process_statuses+=' Healthy'
  else
    processes_json+="{\"name\":$(opsbox_json_string "$p_name"),\"running\":false,\"cpuSeconds\":0,\"memoryMB\":0,\"uptimeMinutes\":0,\"status\":\"Critical\"}"
    process_statuses+=' Critical'
  fi
  opsbox_log "프로세스 확인: $p_name (PID=${p_pid:-없음})"
done
opsbox_log '프로세스 점검 완료'

opsbox_log "디렉터리 점검 시작: ${#OPSBOX_DIRECTORY_PATHS[@]}개 대상"
for d_index in "${!OPSBOX_DIRECTORY_PATHS[@]}"; do
  d_path=${OPSBOX_DIRECTORY_PATHS[$d_index]}
  d_warning=${OPSBOX_DIRECTORY_WARNING[$d_index]:-80}
  d_critical=${OPSBOX_DIRECTORY_CRITICAL[$d_index]:-90}
  [ -n "$directories_json" ] && directories_json+=','
  if [ -d "$d_path" ]; then
    d_size=$(du -sb -- "$d_path" 2>/dev/null | awk '{ print $1 + 0 }')
    read -r d_total d_used d_free <<< "$(df -P -k -- "$d_path" 2>/dev/null | awk 'NR == 2 { print $2, $3, $4 }')"
    d_usage=$(awk -v u="${d_used:-0}" -v f="${d_free:-0}" 'BEGIN { if (u + f > 0) printf "%.1f", u / (u + f) * 100 }')
    d_status=$(opsbox_status_by_percent "$d_usage" "$d_warning" "$d_critical")
    directories_json+="{\"path\":$(opsbox_json_string "$d_path"),\"exists\":true,\"sizeBytes\":$(opsbox_json_number "$d_size"),\"sizeGB\":$(opsbox_bytes_to_gb "${d_size:-0}"),\"usedGB\":$(opsbox_kb_to_gb "${d_used:-0}"),\"freeGB\":$(opsbox_kb_to_gb "${d_free:-0}"),\"totalGB\":$(opsbox_kb_to_gb "${d_total:-0}"),\"usagePercent\":$(opsbox_json_number "$d_usage"),\"status\":\"$d_status\"}"
    directory_statuses+=" $d_status"
    opsbox_log "디렉터리 확인: $d_path (존재=true, 사용률=${d_usage}%)"
  else
    directories_json+="{\"path\":$(opsbox_json_string "$d_path"),\"exists\":false,\"sizeBytes\":null,\"sizeGB\":null,\"usagePercent\":null,\"status\":\"NotCollected\",\"message\":\"디렉터리가 없습니다.\"}"
    directory_statuses+=' Missing'
    opsbox_log "디렉터리 확인: $d_path (존재=false)"
  fi
done

opsbox_log "파일 크기 점검 시작: ${#OPSBOX_FILE_PATHS[@]}개 대상"
for f_index in "${!OPSBOX_FILE_PATHS[@]}"; do
  f_path=${OPSBOX_FILE_PATHS[$f_index]}
  f_warning=${OPSBOX_FILE_WARNING_MB[$f_index]}
  f_critical=${OPSBOX_FILE_CRITICAL_MB[$f_index]}
  [ -n "$files_json" ] && files_json+=','
  if [ -f "$f_path" ]; then
    f_bytes=$(stat -c %s -- "$f_path" 2>/dev/null || wc -c < "$f_path")
    f_status=$(awk -v n="$f_bytes" -v w="$f_warning" -v c="$f_critical" 'BEGIN { if (n >= c * 1048576) print "Critical"; else if (n >= w * 1048576) print "Warning"; else print "Healthy" }')
    files_json+="{\"path\":$(opsbox_json_string "$f_path"),\"exists\":true,\"sizeBytes\":$(opsbox_json_number "$f_bytes"),\"sizeMB\":$(opsbox_bytes_to_mb "$f_bytes"),\"status\":\"$f_status\"}"
  else
    f_status=Critical
    files_json+="{\"path\":$(opsbox_json_string "$f_path"),\"exists\":false,\"sizeBytes\":null,\"sizeMB\":null,\"status\":\"Critical\",\"message\":\"파일이 없습니다.\"}"
  fi
  file_statuses+=" $f_status"
  opsbox_log "파일 확인: $f_path (상태=$f_status)"
done

opsbox_log "포트 점검 시작: ${#OPSBOX_PORT_NUMBERS[@]}개 대상"
# /proc/net 에서 LISTEN(TCP) 또는 바인딩(UDP) 상태를 확인합니다. (ss·netstat 없이도 동작)
opsbox_port_listening() {
  local hex_port files file
  printf -v hex_port '%04X' "$1"
  if [ "$2" = UDP ]; then files='/proc/net/udp /proc/net/udp6'; else files='/proc/net/tcp /proc/net/tcp6'; fi
  for file in $files; do
    [ -r "$file" ] || continue
    if awk -v p="$hex_port" -v proto="$2" 'NR > 1 { n = split($2, a, ":"); if (toupper(a[n]) == p && (proto == "UDP" || $4 == "0A")) found = 1 } END { exit !found }' "$file"; then return 0; fi
  done
  return 1
}
for port_index in "${!OPSBOX_PORT_NUMBERS[@]}"; do
  port_number=${OPSBOX_PORT_NUMBERS[$port_index]}
  port_protocol=${OPSBOX_PORT_PROTOCOLS[$port_index]:-TCP}
  port_description=${OPSBOX_PORT_DESCRIPTIONS[$port_index]}
  port_process=''
  if opsbox_port_listening "$port_number" "$port_protocol"; then
    port_listening=true
    port_statuses+=' Healthy'
    # 프로세스 이름은 ss가 있고 권한이 있을 때만 확인됩니다.
    if command -v ss >/dev/null 2>&1; then
      if [ "$port_protocol" = UDP ]; then ss_flags=-lnup; else ss_flags=-lntp; fi
      port_process=$(ss $ss_flags 2>/dev/null | awk -v p=":$port_number" '$0 ~ p"[ \t]" && match($0, /users:\(\("[^"]+"/) { s = substr($0, RSTART + 9, RLENGTH - 10); print s; exit }')
    fi
  else
    port_listening=false
    port_statuses+=' Critical'
  fi
  [ -n "$ports_json" ] && ports_json+=','
  if [ -n "$port_process" ]; then port_process_json=$(opsbox_json_string "$port_process"); else port_process_json=null; fi
  ports_json+="{\"port\":$port_number,\"protocol\":\"$port_protocol\",\"description\":$(opsbox_json_string "$port_description"),\"listening\":$port_listening,\"processName\":$port_process_json}"
  opsbox_log "포트 확인: $port_protocol/$port_number (수신=$port_listening)"
done

opsbox_log "HTTP 점검 시작: ${#OPSBOX_HTTP_URLS[@]}개 대상"
for h_index in "${!OPSBOX_HTTP_URLS[@]}"; do
  h_name=${OPSBOX_HTTP_NAMES[$h_index]}
  h_url=${OPSBOX_HTTP_URLS[$h_index]}
  h_expected=${OPSBOX_HTTP_EXPECTED[$h_index]:-200}
  h_code=''
  h_ms=''
  h_error=''
  if command -v curl >/dev/null 2>&1; then
    h_output=$(curl -s -o /dev/null --max-time 10 -w '%{http_code} %{time_total}' -- "$h_url" 2>&1)
    h_exit=$?
    read -r h_code h_time <<< "$h_output"
    h_ms=$(awk -v t="$h_time" 'BEGIN { printf "%d", t * 1000 }')
    if [ "$h_code" = 000 ]; then h_code=''; h_error="연결 실패 (curl 종료 코드 $h_exit)"; fi
  else
    h_error='curl 명령이 없어 HTTP 점검을 할 수 없습니다.'
  fi
  if [ -n "$h_code" ] && [ "$h_code" = "$h_expected" ]; then h_success=true; http_statuses+=' Healthy'; else h_success=false; http_statuses+=' Critical'; fi
  [ -n "$http_json" ] && http_json+=','
  if [ -n "$h_error" ]; then h_error_json=$(opsbox_json_string "$h_error"); else h_error_json=null; fi
  http_json+="{\"name\":$(opsbox_json_string "$h_name"),\"url\":$(opsbox_json_string "$h_url"),\"expectedStatus\":$(opsbox_json_number "$h_expected"),\"statusCode\":$(opsbox_json_number "$h_code"),\"responseTimeMs\":$(opsbox_json_number "$h_ms"),\"success\":$h_success,\"error\":$h_error_json}"
  opsbox_log "HTTP 확인: $h_name (성공=$h_success, 상태=${h_code:-없음})"
done

# 점검 만들기 · Swap 사용률 (자동 생성, 생성기 v1) — 직접 고치면 폼 변경이 반영되지 않습니다
# 출력 자르기: 최대 바이트 수로 자르고 끝에서 잘린 UTF-8 글자를 버림
opsbox_cb1_truncate() {
  local s=$1 max=$2 b
  if [ "${#s}" -le "$max" ]; then printf '%s' "$s"; return; fi
  s=${s:0:$max}
  while [ -n "$s" ]; do
    printf -v b '%d' "'${s: -1}"; [ "$b" -lt 0 ] && b=$((b + 256))
    if [ "$b" -ge 192 ]; then s=${s:0:${#s}-1}; break
    elif [ "$b" -ge 128 ]; then s=${s:0:${#s}-1}
    else break; fi
  done
  printf '%s' "$s"
}
# 명령 실행: cb_full(판정용 전체 출력, 최대 1048576바이트), cb_out(보관용 2000바이트), cb_rc(종료 코드)
# 시간 제한 OPSBOX_CB_TIMEOUT(기본 30초). 출력이 상한을 넘어 끊긴 경우(141)는 정상 종료로 봅니다.
opsbox_cb1_run() {
  local t=${OPSBOX_CB_TIMEOUT:-30}
  if command -v timeout >/dev/null 2>&1; then cb_full=$(timeout "$t" bash -c "$1" 2>&1 </dev/null | head -c 1048576; exit "${PIPESTATUS[0]}"); cb_rc=$?
  else cb_full=$(bash -c "$1" 2>&1 </dev/null | head -c 1048576; exit "${PIPESTATUS[0]}"); cb_rc=$?; fi
  [ "$cb_rc" = 141 ] && cb_rc=0
  cb_out=$(opsbox_cb1_truncate "$cb_full" 2000)
}
# 실패(시간 초과 124, 실행 불가 126·127, 그 밖의 0이 아닌 종료 코드)면 cb_message를 채우고 참
opsbox_cb1_failed() {
  case "$cb_rc" in
    124) cb_message="명령 실행 시간이 ${OPSBOX_CB_TIMEOUT:-30}초를 초과했습니다."; return 0 ;;
    126|127) cb_message="명령을 실행할 수 없습니다: $(printf '%s\n' "$cb_out" | head -n 1)"; return 0 ;;
    0) return 1 ;;
  esac
  # 그 밖의 실패는 출력이 정상처럼 보여도 판정하지 않습니다(예: 서비스가 멈춰 명령이 실패).
  cb_message="명령이 종료 코드 $cb_rc(으)로 끝나 판정하지 않았습니다: $(printf '%s\n' "$cb_out" | head -n 1)"
  return 0
}
# 결과 표 한 줄: 대상 값 기준 상태 메시지
opsbox_cb1_row() {
  [ -n "$cb_rows" ] && cb_rows+=','
  cb_rows+="{\"target\":$(opsbox_json_string "$1"),\"value\":$(opsbox_json_string "$2"),\"threshold\":$(opsbox_json_string "$3"),\"status\":\"$4\",\"message\":$(opsbox_json_string "$5")}"
  cb_statuses+=" $4"
}
# 상태 종합: 위험 > 주의 > 정상, 모두 미수집(또는 없음)이면 미수집
opsbox_cb1_worst() {
  case " $* " in *' Critical '*) echo Critical ;; *' Warning '*) echo Warning ;; *' Healthy '*) echo Healthy ;; *) echo NotCollected ;; esac
}
# 대소문자 무시 단순 포함
opsbox_cb1_contains() { printf '%s\n' "$1" | grep -qiF -- "$2"; }
# 숫자 판정: 값 방향 주의 위험
opsbox_cb1_judge() {
  awk -v v="$1" -v d="$2" -v w="$3" -v c="$4" 'BEGIN {
    if (d == "LOWER_IS_WORSE") { s = (v + 0 <= c + 0) ? "Critical" : (v + 0 <= w + 0) ? "Warning" : "Healthy" }
    else { s = (v + 0 >= c + 0) ? "Critical" : (v + 0 >= w + 0) ? "Warning" : "Healthy" }
    print s }'
}
# 줄바꿈 목록에서 빈 줄 빼고 앞뒤 공백 정리
opsbox_cb1_lines() { printf '%s\n' "$1" | awk '{ sub(/^[ \t\r]+/, ""); sub(/[ \t\r]+$/, ""); if ($0 != "") print }'; }
# TCP 접속: 호스트 포트 제한초
opsbox_cb1_connect() {
  if command -v timeout >/dev/null 2>&1; then timeout "$3" bash -c 'exec 3<>"/dev/tcp/$1/$2"' _ "$1" "$2" 2>/dev/null
  else bash -c 'exec 3<>"/dev/tcp/$1/$2"' _ "$1" "$2" 2>/dev/null; fi
}
# 결과 기록: 역할 항목 상태 메시지 추가JSON
opsbox_cb1_finish() {
  local message=null
  [ -n "$4" ] && message=$(opsbox_json_string "$4")
  opsbox_role_record "$1" "$2" "$3" "{\"status\":\"$3\",\"message\":$message,\"rows\":[$cb_rows]$5}"
}
opsbox_cb1_item_CUSTOM_DEMO_SWAP() {
  local cb_item='CUSTOM_DEMO_SWAP' cb_role='BASIC' cb_name='Swap 사용률' cb_threshold='주의 ≥ 50% / 위험 ≥ 80%'
  local cb_rows='' cb_statuses='' cb_out='' cb_full='' cb_rc=0 cb_status=NotCollected cb_message='' cb_extra=''
  opsbox_log "점검 만들기 시작: $cb_name"
  local cb_command='free | awk '\''/^Swap:/ { if ($2 > 0) printf "%.1f\n", $3 * 100 / $2; else print 0 }'\''' cb_direction='HIGHER_IS_WORSE' cb_warning='50' cb_critical='80' cb_value=''
  opsbox_cb1_run "$cb_command"
  if ! opsbox_cb1_failed; then
    cb_value=$(printf '%s\n' "$cb_full" | grep -oE -- '-?[0-9]+(\.[0-9]+)?' | head -n 1)
    if [ -z "$cb_value" ]; then cb_message='명령 출력에서 숫자를 찾지 못했습니다.'
    else cb_status=$(opsbox_cb1_judge "$cb_value" "$cb_direction" "$cb_warning" "$cb_critical"); fi
  fi
  opsbox_cb1_row '이 서버' "$cb_value" "$cb_threshold" "$cb_status" "$cb_message"
  cb_extra=",\"output\":$(opsbox_json_string "$cb_out")"
  opsbox_cb1_finish "$cb_role" "$cb_item" "$cb_status" "$cb_message" "$cb_extra"
  opsbox_log "점검 만들기 완료: $cb_name ($cb_status)"
}
opsbox_cb1_item_CUSTOM_DEMO_SWAP

# ---- 역할별 점검 결과 정리 (OpsBox가 자동으로 넣음) ----
opsbox_finalize_role_policies() {
  local i role item key status entry s roles_seen='' out=''
  declare -A role_items=() role_statuses=()
  for i in "${!OPSBOX_ROLE_ITEM_IDS[@]}"; do
    role=${OPSBOX_ROLE_ITEM_ROLES[$i]}; item=${OPSBOX_ROLE_ITEM_IDS[$i]}; key="$role:$item"
    if [ -n "${OPSBOX_ROLE_STATUS[$key]+x}" ]; then
      status=${OPSBOX_ROLE_STATUS[$key]}
      entry="{\"role\":\"$role\",\"item\":$(opsbox_json_string "$item"),${OPSBOX_ROLE_ITEM_META[$i]},\"status\":\"$status\",\"detail\":${OPSBOX_ROLE_DETAIL[$key]}}"
    else
      status=NotCollected
      entry="{\"role\":\"$role\",\"item\":$(opsbox_json_string "$item"),${OPSBOX_ROLE_ITEM_META[$i]},\"status\":\"NotCollected\",\"message\":$(opsbox_json_string "${OPSBOX_ROLE_ITEM_MESSAGES[$i]}")}"
    fi
    [ -n "${role_items[$role]:-}" ] && role_items[$role]+=','
    role_items[$role]+=$entry
    role_statuses[$role]+=" $status"
    case " $roles_seen " in *" $role "*) ;; *) roles_seen+=" $role" ;; esac
  done
  OPSBOX_ROLE_POLICY_STATUSES=''
  for role in $roles_seen; do
    case "${role_statuses[$role]} " in
      *' Critical '*) s=Critical ;;
      *' Warning '*) s=Warning ;;
      *' Healthy '*) s=Healthy ;;
      *) s=NotCollected ;;
    esac
    [ -n "$out" ] && out+=','
    out+="\"$role\":{\"status\":\"$s\",\"items\":[${role_items[$role]}]}"
    OPSBOX_ROLE_POLICY_STATUSES+=" $s"
  done
  OPSBOX_ROLE_POLICIES_JSON="{$out}"
  # 기본(BASIC) 사용자 항목: 조각이 opsbox_role_record BASIC … 으로 남긴 결과를 모으고 종합 상태에 넣음
  local basic_out=''
  for i in "${!OPSBOX_BASIC_ITEM_IDS[@]}"; do
    item=${OPSBOX_BASIC_ITEM_IDS[$i]}; key="BASIC:$item"
    if [ -n "${OPSBOX_ROLE_STATUS[$key]+x}" ]; then
      status=${OPSBOX_ROLE_STATUS[$key]}
      entry="{\"role\":\"BASIC\",\"item\":$(opsbox_json_string "$item"),${OPSBOX_BASIC_ITEM_META[$i]},\"status\":\"$status\",\"detail\":${OPSBOX_ROLE_DETAIL[$key]}}"
    else
      status=NotCollected
      entry="{\"role\":\"BASIC\",\"item\":$(opsbox_json_string "$item"),${OPSBOX_BASIC_ITEM_META[$i]},\"status\":\"NotCollected\",\"message\":$(opsbox_json_string "$OPSBOX_BASIC_NOT_COLLECTED_MESSAGE")}"
    fi
    [ -n "$basic_out" ] && basic_out+=','
    basic_out+=$entry
    OPSBOX_ROLE_POLICY_STATUSES+=" $status"
  done
  OPSBOX_BASIC_POLICY_ITEMS_JSON="[$basic_out]"
}
opsbox_finalize_role_policies
case " $was_statuses " in
  '  ') was_status=NotCollected ;;
  *' Critical '*) was_status=Critical ;;
  *' Warning '*) was_status=Warning ;;
  *' NotCollected '*) was_status=NotCollected ;;
  *) was_status=Healthy ;;
esac

# 항목별 상태 종합 (Windows 스크립트와 같은 규칙)
opsbox_collection_status() {
  local statuses=" $1 " kind=$2
  if [ -z "${1// /}" ]; then printf 'NotCollected'; return; fi
  case "$statuses" in *' Critical '*|*' Missing '*) printf 'Critical'; return ;; esac
  case "$statuses" in *' Warning '*) printf 'Warning'; return ;; esac
  case "$statuses" in *' NotCollected '*) printf 'NotCollected'; return ;; esac
  printf 'Healthy'
}
process_status=$(opsbox_collection_status "$process_statuses" process)
directory_status=$(opsbox_collection_status "$directory_statuses" directory)
file_status=$(opsbox_collection_status "$file_statuses" file)
port_status=$(opsbox_collection_status "$port_statuses" port)
http_status=$(opsbox_collection_status "$http_statuses" http)

all_statuses="$host_info_status $cpu_status $memory_status $uptime_status $disk_status $process_status $directory_status $file_status $port_status $http_status $OPSBOX_ROLE_POLICY_STATUSES"
critical_count=0; warning_count=0; not_collected_count=0; healthy_count=0; status_total=0
for s in $all_statuses; do
  status_total=$((status_total + 1))
  case "$s" in
    Critical) critical_count=$((critical_count + 1)) ;;
    Warning) warning_count=$((warning_count + 1)) ;;
    NotCollected) not_collected_count=$((not_collected_count + 1)) ;;
    Healthy) healthy_count=$((healthy_count + 1)) ;;
  esac
done
if [ $critical_count -gt 0 ]; then overall_status=Critical
elif [ $warning_count -gt 0 ]; then overall_status=Warning
elif [ $not_collected_count -eq $status_total ]; then overall_status=NotCollected
else overall_status=Healthy; fi

opsbox_product_json() { local p=$1; if [ -n "$p" ]; then opsbox_json_string "$p"; else printf 'null'; fi; }

# 결과 JSON 출력 (here-document를 $( ) 안에 넣지 않아 오래된 bash에서도 안전)
opsbox_write_result() {
cat <<OPSBOX_JSON
{
  "schemaVersion": 2,
  "server": $OPSBOX_SERVER_JSON,
  "collectedAt": $(opsbox_json_string "$check_date"),
  "host": {"hostname": $(opsbox_json_string "$host_name"), "osName": $(opsbox_json_string "$os_name"), "osVersion": $(opsbox_json_string "$os_version"), "uptimeMinutes": $(opsbox_json_number "$uptime_minutes"), "uptime": $uptime_parts_json, "status": "$host_info_status"},
  "resources": {
    "cpu": {"usagePercent": $(opsbox_json_number "$cpu"), "status": "$cpu_status"},
    "memory": {"usagePercent": $(opsbox_json_number "$memory"), "status": "$memory_status"},
    "uptime": {"minutes": $(opsbox_json_number "$uptime_minutes"), "parts": $uptime_parts_json, "status": "$uptime_status"},
    "disk": {"maxUsagePercent": $(opsbox_json_number "$disk"), "status": "$disk_status", "volumes": [$disks_json]}
  },
  "checks": {
    "policyDefinitions": $OPSBOX_POLICY_DEFINITIONS_JSON,
    "processes": {"status": "$process_status", "items": [$processes_json]},
    "directories": {"status": "$directory_status", "items": [$directories_json]},
    "files": {"status": "$file_status", "items": [$files_json]},
    "ports": {"status": "$port_status", "items": [$ports_json]},
    "http": {"status": "$http_status", "items": [$http_json]},
    "web": {"status": "${web_status:-NotCollected}", "product": $(opsbox_product_json "$OPSBOX_PRODUCT_WEB"), "detail": ${web_check_json:-null}},
    "was": {"status": "${was_status:-NotCollected}", "product": $(opsbox_product_json "$OPSBOX_PRODUCT_WAS"), "items": [${was_items_json:-}]},
    "database": {"status": "${database_status:-NotCollected}", "product": $(opsbox_product_json "$OPSBOX_PRODUCT_DB"), "detail": ${database_check_json:-null}},
    "rolePolicies": $OPSBOX_ROLE_POLICIES_JSON,
    "policyItems": $OPSBOX_BASIC_POLICY_ITEMS_JSON
  },
  "summary": {"status": "$overall_status", "counts": {"healthy": $healthy_count, "warning": $warning_count, "critical": $critical_count, "notCollected": $not_collected_count}}
}
OPSBOX_JSON
}

# 결과 저장: 임시 파일에 쓴 뒤 이름을 바꿔, 가져오기가 쓰는 중인 파일을 읽지 않게 합니다.
opsbox_save_result() {
  local dir=$1 target tmp
  target="$dir/$opsbox_result_name"
  tmp="$dir/.$opsbox_result_name.tmp"
  opsbox_write_result > "$tmp" 2>/dev/null && mv -f "$tmp" "$target" 2>/dev/null && { printf '%s' "$target"; return 0; }
  rm -f "$tmp" 2>/dev/null
  return 1
}
saved_path=''
if [ "$opsbox_result_dir_ready" = true ]; then saved_path=$(opsbox_save_result "$opsbox_result_dir"); fi
if [ -z "$saved_path" ] && [ "$opsbox_result_dir" != "$opsbox_script_dir" ]; then
  opsbox_log "결과 폴더에 쓸 수 없어 스크립트 폴더에 저장합니다: $opsbox_script_dir"
  saved_path=$(opsbox_save_result "$opsbox_script_dir")
fi
if [ -z "$saved_path" ]; then
  opsbox_log '결과 저장 실패: 쓸 수 있는 폴더가 없습니다. 결과 폴더를 인자로 지정하세요. 예) bash 스크립트.sh /tmp'
  exit 1
fi
opsbox_log "결과 저장 완료: $saved_path"
opsbox_log "점검 스크립트 정상 종료: $overall_status"
# 정해진 결과 저장 경로에 저장했으면 OpsBox가 가져갑니다. 그 밖의 곳이면 직접 옮기도록 안내합니다.
if [ -z "$OPSBOX_RESULT_DIR" ] || [ "${saved_path#"${OPSBOX_RESULT_DIR%/}"/}" = "$saved_path" ]; then
  opsbox_log '이 파일을 OpsBox 수신함 폴더에 넣거나, OpsBox 서버 상세 화면의 [결과 파일 올리기]로 올리세요.'
fi
echo "Result JSON: $saved_path"
