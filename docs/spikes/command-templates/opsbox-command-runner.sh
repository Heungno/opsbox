#!/bin/bash
# =========================================================
# OpsBox 명령 템플릿 실행기 (시험판 · Linux bash)
#
#   bash opsbox-command-runner.sh <템플릿 파일>
#
# 템플릿에는 "관리 도구에 넣을 명령"과 "판정 규칙"만 적습니다.
# 도구 찾기·로그인·시간 초과·판정·결과 JSON은 이 실행기가 맡습니다.
#
# 템플릿 머리 주석 (# @opsbox-…)
#   @opsbox-product  제품 이름 (결과에 그대로 남음)            예) WebtoB 4.1
#   @opsbox-tool     관리 도구 실행 파일 이름                  예) wsadmin
#   @opsbox-home     도구를 찾을 홈 디렉터리 환경 변수(…/bin)   예) WEBTOBDIR
#   @opsbox-args     도구 실행 인자. ${이름}은 환경 변수로 바뀜  예) ${JEUS_NODE} -U${OPSBOX_JEUS_USER} -P${OPSBOX_JEUS_PASSWORD}
#   @opsbox-require  비어 있으면 안 되는 환경 변수(여러 개는 공백) 예) OPSBOX_JEUS_USER OPSBOX_JEUS_PASSWORD
#   @opsbox-quit     명령을 다 넣은 뒤 보낼 종료 명령            예) quit
#   @opsbox-timeout  초 (기본 20)
#   @opsbox-status   <Critical|Warning|Healthy> ~ <정규식>      출력(대문자로 바꿔서)에서 찾음
#
# 판정: Critical 규칙이 맞으면 Critical, 아니면 Warning 규칙, 아니면 Healthy 규칙.
#       아무 규칙도 안 맞으면 NotCollected("상태 값을 확인할 수 없음").
# 주석이 아닌 줄은 모두 도구에 차례로 넣을 명령입니다. 빈 줄은 무시합니다.
# =========================================================

template=$1
if [ -z "$template" ] || [ ! -f "$template" ]; then
  echo "사용법: bash $0 <템플릿 파일>" >&2
  exit 2
fi

log() { printf '[%s] %s\n' "$(date '+%H:%M:%S')" "$*" >&2; }
json_string() {
  local s=$1
  s=${s//\\/\\\\}; s=${s//\"/\\\"}; s=${s//$'\t'/\\t}; s=${s//$'\r'/}; s=${s//$'\n'/\\n}
  printf '"%s"' "$s"
}
# 환경 변수 ${NAME}만 바꿉니다(명령 실행·다른 확장은 하지 않음).
expand_env() {
  local text=$1 out='' name
  while [[ $text =~ ^([^$]*)\$\{([A-Za-z_][A-Za-z0-9_]*)\}(.*)$ ]]; do
    out+=${BASH_REMATCH[1]}; name=${BASH_REMATCH[2]}; out+=${!name}; text=${BASH_REMATCH[3]}
  done
  printf '%s' "$out$text"
}

product='' tool='' home_var='' args='' require='' quit='' timeout_s=20
rules=() commands=()
while IFS= read -r line || [ -n "$line" ]; do
  line=${line%$'\r'}
  if [[ $line =~ ^#[[:space:]]*@opsbox-([a-z]+)[[:space:]]+(.*)$ ]]; then
    key=${BASH_REMATCH[1]}; value=${BASH_REMATCH[2]%"${BASH_REMATCH[2]##*[![:space:]]}"}
    case $key in
      product) product=$value ;;
      tool) tool=$value ;;
      home) home_var=$value ;;
      args) args=$value ;;
      require) require=$value ;;
      quit) quit=$value ;;
      timeout) timeout_s=$value ;;
      status) rules+=("$value") ;;
      *) log "모르는 머리 주석 무시: @opsbox-$key" ;;
    esac
  elif [[ $line =~ ^[[:space:]]*# ]] || [[ -z ${line//[[:space:]]/} ]]; then
    continue
  else
    commands+=("$line")
  fi
done < "$template"

finish() { # status message [output]
  local status=$1 message=$2 output=$3 cmds
  cmds=$(printf '%s, ' "${commands[@]}"); cmds=${cmds%, }
  printf '{"product":%s,"status":"%s","command":%s,"output":%s,"message":%s}\n' \
    "$(json_string "$product")" "$status" "$(json_string "$tool: $cmds")" \
    "$(json_string "${output:0:12000}")" "$( [ -n "$message" ] && json_string "$message" || printf 'null')"
  log "판정: $status${message:+ ($message)}"
  exit 0
}

log "점검 시작: $product ($template)"

# 1) 도구 찾기: PATH → $홈/bin
tool_path=$(command -v "$tool" 2>/dev/null)
if [ -z "$tool_path" ] && [ -n "$home_var" ] && [ -n "${!home_var}" ] && [ -x "${!home_var}/bin/$tool" ]; then tool_path="${!home_var}/bin/$tool"; fi
[ -z "$tool_path" ] && finish NotCollected "$tool을 PATH${home_var:+ 또는 \$$home_var/bin}에서 찾을 수 없습니다."
log "도구: $tool_path"

# 2) 필요한 환경 변수(로그인 정보 등)
for name in $require; do
  [ -z "${!name}" ] && finish NotCollected "환경 변수 $name 이(가) 비어 있습니다. 실행 계정에 설정하세요(파일에 적지 않음)."
done

# 3) 실행 (명령 + 종료 명령을 표준 입력으로)
read -r -a tool_args <<< "$(expand_env "$args")"
input=$(printf '%s\n' "${commands[@]}" ${quit:+"$quit"})
if command -v timeout >/dev/null 2>&1; then
  output=$(printf '%s\n' "$input" | timeout "$timeout_s" "$tool_path" "${tool_args[@]}" 2>&1); rc=$?
else
  output=$(printf '%s\n' "$input" | "$tool_path" "${tool_args[@]}" 2>&1); rc=$?
fi
# 비밀번호가 출력에 나오면 가림 (이름에 PASSWORD가 들어간 환경 변수)
for name in $require; do [[ $name == *PASSWORD* ]] && [ -n "${!name}" ] && output=${output//"${!name}"/****}; done
[ "$rc" = 124 ] && finish NotCollected "$tool 실행 시간이 ${timeout_s}초를 넘었습니다." "$output"

# 4) 판정
upper=$(printf '%s' "$output" | tr 'a-z' 'A-Z')
for level in Critical Warning Healthy; do
  for rule in "${rules[@]}"; do
    [[ $rule =~ ^$level[[:space:]]+~[[:space:]]+(.+)$ ]] || continue
    if printf '%s\n' "$upper" | grep -Eq "${BASH_REMATCH[1]}"; then
      finish "$level" '' "$output"
    fi
  done
done
finish NotCollected "$product 상태 값을 확인할 수 없습니다(맞는 판정 규칙 없음, 종료 코드 $rc)." "$output"
