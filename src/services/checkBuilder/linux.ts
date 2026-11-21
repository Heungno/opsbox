import { assertItemId, commentText, GENERATOR_VERSION, shLiteral } from './literal';
import { builderInputs, resolveSpec } from './spec';
import { LIMITS, type BuilderSpec } from './types';

/*
 * 점검 만들기: Linux(bash) 스크립트 조각 생성
 *
 * 조각 하나 = 공통 함수(생성기 버전이 이름에 들어감) + 항목 함수 1개 + 호출.
 * 폼 값은 shLiteral 로만 들어가고, 서버별 값은 opsbox_item_input 으로 실행 중에 읽습니다.
 * 결과는 opsbox_role_record <역할> <항목ID> <상태> <detail JSON> 으로 남깁니다.
 * detail: { status, message, rows: [{ target, value, threshold, status, message }], output?, samples? }
 * 쓰는 START 함수: opsbox_log, opsbox_json_string
 */

export type BuilderRole = 'BASIC' | 'WEB' | 'WAS' | 'DB';
export interface GenerateArgs { itemId: string; itemName: string; role: BuilderRole; spec: BuilderSpec }

const V = `opsbox_cb${GENERATOR_VERSION}`;

/** 공통 함수: 같은 버전이면 내용이 같아 여러 조각이 다시 정의해도 됩니다. */
const HELPERS = `
# 출력 자르기: 최대 바이트 수로 자르고 끝에서 잘린 UTF-8 글자를 버림
${V}_truncate() {
  local s=$1 max=$2 b
  if [ "\${#s}" -le "$max" ]; then printf '%s' "$s"; return; fi
  s=\${s:0:$max}
  while [ -n "$s" ]; do
    printf -v b '%d' "'\${s: -1}"; [ "$b" -lt 0 ] && b=$((b + 256))
    if [ "$b" -ge 192 ]; then s=\${s:0:\${#s}-1}; break
    elif [ "$b" -ge 128 ]; then s=\${s:0:\${#s}-1}
    else break; fi
  done
  printf '%s' "$s"
}
# 명령 실행: cb_out(출력, stdout+stderr), cb_rc(종료 코드). 시간 제한 OPSBOX_CB_TIMEOUT(기본 ${LIMITS.commandTimeoutSeconds}초)
${V}_run() {
  local t=\${OPSBOX_CB_TIMEOUT:-${LIMITS.commandTimeoutSeconds}}
  if command -v timeout >/dev/null 2>&1; then cb_out=$(timeout "$t" bash -c "$1" 2>&1 </dev/null); cb_rc=$?
  else cb_out=$(bash -c "$1" 2>&1 </dev/null); cb_rc=$?; fi
  cb_out=$(${V}_truncate "$cb_out" ${LIMITS.outputLength})
}
# 시간 초과(124)·실행 불가(126·127)면 cb_message를 채우고 참
${V}_failed() {
  case "$cb_rc" in
    124) cb_message="명령 실행 시간이 \${OPSBOX_CB_TIMEOUT:-${LIMITS.commandTimeoutSeconds}}초를 초과했습니다."; return 0 ;;
    126|127) cb_message="명령을 실행할 수 없습니다: $(printf '%s\\n' "$cb_out" | head -n 1)"; return 0 ;;
  esac
  return 1
}
# 결과 표 한 줄: 대상 값 기준 상태 메시지
${V}_row() {
  [ -n "$cb_rows" ] && cb_rows+=','
  cb_rows+="{\\"target\\":$(opsbox_json_string "$1"),\\"value\\":$(opsbox_json_string "$2"),\\"threshold\\":$(opsbox_json_string "$3"),\\"status\\":\\"$4\\",\\"message\\":$(opsbox_json_string "$5")}"
  cb_statuses+=" $4"
}
# 상태 종합: 위험 > 주의 > 정상, 모두 미수집(또는 없음)이면 미수집
${V}_worst() {
  case " $* " in *' Critical '*) echo Critical ;; *' Warning '*) echo Warning ;; *' Healthy '*) echo Healthy ;; *) echo NotCollected ;; esac
}
# 대소문자 무시 단순 포함
${V}_contains() { printf '%s\\n' "$1" | grep -qiF -- "$2"; }
# 숫자 판정: 값 방향 주의 위험
${V}_judge() {
  awk -v v="$1" -v d="$2" -v w="$3" -v c="$4" 'BEGIN {
    if (d == "LOWER_IS_WORSE") { s = (v + 0 <= c + 0) ? "Critical" : (v + 0 <= w + 0) ? "Warning" : "Healthy" }
    else { s = (v + 0 >= c + 0) ? "Critical" : (v + 0 >= w + 0) ? "Warning" : "Healthy" }
    print s }'
}
# 줄바꿈 목록에서 빈 줄 빼고 앞뒤 공백 정리
${V}_lines() { printf '%s\\n' "$1" | awk '{ sub(/^[ \\t\\r]+/, ""); sub(/[ \\t\\r]+$/, ""); if ($0 != "") print }'; }
# TCP 접속: 호스트 포트 제한초
${V}_connect() {
  if command -v timeout >/dev/null 2>&1; then timeout "$3" bash -c 'exec 3<>"/dev/tcp/$1/$2"' _ "$1" "$2" 2>/dev/null
  else bash -c 'exec 3<>"/dev/tcp/$1/$2"' _ "$1" "$2" 2>/dev/null; fi
}
# 결과 기록: 역할 항목 상태 메시지 추가JSON
${V}_finish() {
  local message=null
  [ -n "$4" ] && message=$(opsbox_json_string "$4")
  opsbox_role_record "$1" "$2" "$3" "{\\"status\\":\\"$3\\",\\"message\\":$message,\\"rows\\":[$cb_rows]$5}"
}`.trim();

const fmt = (value: number | undefined) => String(value ?? '');

function thresholdText(spec: BuilderSpec & { command?: string }): string {
  const unit = spec.unit ?? '';
  switch (spec.type) {
    case 'COMMAND_NUMBER': {
      const op = spec.direction === 'LOWER_IS_WORSE' ? '≤' : '≥';
      return `주의 ${op} ${fmt(spec.warning)}${unit} / 위험 ${op} ${fmt(spec.critical)}${unit}`;
    }
    case 'COMMAND_TEXT':
      return [`비정상 문구: ${(spec.badPhrases ?? []).join(', ')}`, ...(spec.goodPhrases?.length ? [`정상 문구: ${spec.goodPhrases.join(', ')}`] : [])].join(' / ');
    case 'SETTING_VALUE':
      return `${spec.comparator} ${spec.expected}`;
    case 'REMOTE_PORT':
      return `접속 제한 ${spec.timeoutSeconds}초`;
    case 'FILE_FRESHNESS':
      return `${spec.maxAgeHours}시간 이내 수정`;
    case 'LOG_PATTERN':
      return `주의 ≥ ${fmt(spec.warning)}건 / 위험 ≥ ${fmt(spec.critical)}건 (최근 ${spec.periodDays}일)`;
  }
}

const array = (values: string[] | undefined) => `(${(values ?? []).map(shLiteral).join(' ')})`;

/** 서버별 입력: 프리셋 입력은 OPSBOX_INPUT_<KEY> 로 내보내고, 필수 목록 입력은 비어 있으면 미수집 */
function inputLines(spec: BuilderSpec): string[] {
  return builderInputs(spec).map((input) => input.type === 'TARGET_LIST' || input.type === 'PATH_LIST'
    ? `  local cb_in_${input.key}; cb_in_${input.key}=$(${V}_lines "$(opsbox_item_input "$cb_item" ${shLiteral(input.key)})")`
    : `  local -x OPSBOX_INPUT_${input.key.toUpperCase()}; OPSBOX_INPUT_${input.key.toUpperCase()}=$(opsbox_item_input "$cb_item" ${shLiteral(input.key)})`);
}

function requireList(key: string, label: string, body: string[]): string[] {
  return [
    `  if [ -z "$cb_in_${key}" ]; then`,
    `    cb_message=${shLiteral(`서버 상세에서 '${label}'을 입력하세요.`)}`,
    '  else',
    ...body.map((line) => `  ${line}`),
    '  fi',
  ];
}

function body(spec: BuilderSpec & { command?: string }): string[] {
  const inputs = builderInputs(spec);
  const label = (key: string) => inputs.find((input) => input.key === key)?.label ?? key;
  switch (spec.type) {
    case 'COMMAND_NUMBER':
      return [
        `  local cb_command=${shLiteral(spec.command ?? '')} cb_direction=${shLiteral(spec.direction ?? 'HIGHER_IS_WORSE')} cb_warning=${shLiteral(fmt(spec.warning))} cb_critical=${shLiteral(fmt(spec.critical))} cb_value=''`,
        ...inputLines(spec),
        `  ${V}_run "$cb_command"`,
        `  if ! ${V}_failed; then`,
        `    cb_value=$(printf '%s\\n' "$cb_out" | grep -oE -- '-?[0-9]+(\\.[0-9]+)?' | head -n 1)`,
        `    if [ -z "$cb_value" ]; then cb_message='명령 출력에서 숫자를 찾지 못했습니다.'`,
        `    else cb_status=$(${V}_judge "$cb_value" "$cb_direction" "$cb_warning" "$cb_critical"); fi`,
        '  fi',
        `  ${V}_row '이 서버' "$cb_value" "$cb_threshold" "$cb_status" "$cb_message"`,
        `  cb_extra=",\\"output\\":$(opsbox_json_string "$cb_out")"`,
      ];
    case 'COMMAND_TEXT':
      return [
        `  local cb_command=${shLiteral(spec.command ?? '')} cb_level=${shLiteral(spec.level ?? 'Critical')} cb_found='' cb_good_hit=0 p`,
        `  local -a cb_bad=${array(spec.badPhrases)} cb_good=${array(spec.goodPhrases)}`,
        ...inputLines(spec),
        `  ${V}_run "$cb_command"`,
        `  if ! ${V}_failed; then`,
        `    for p in "\${cb_bad[@]}"; do ${V}_contains "$cb_out" "$p" && cb_found+="\${cb_found:+, }$p"; done`,
        `    for p in "\${cb_good[@]}"; do ${V}_contains "$cb_out" "$p" && cb_good_hit=1; done`,
        `    if [ -n "$cb_found" ]; then cb_status=$cb_level; cb_message="비정상 문구 발견: $cb_found"`,
        `    elif [ "\${#cb_good[@]}" -gt 0 ] && [ "$cb_good_hit" = 0 ]; then cb_status=Warning; cb_message='정상 문구가 출력에 없습니다.'`,
        '    else cb_status=Healthy; fi',
        '  fi',
        `  ${V}_row '이 서버' "\${cb_found:-없음}" "$cb_threshold" "$cb_status" "$cb_message"`,
        `  cb_extra=",\\"output\\":$(opsbox_json_string "$cb_out")"`,
      ];
    case 'SETTING_VALUE':
      return [
        `  local cb_setting=${shLiteral(spec.settingName ?? '')} cb_cmp=${shLiteral(spec.comparator ?? '=')} cb_expected=${shLiteral(spec.expected ?? '')} cb_level=${shLiteral(spec.level ?? 'Critical')} cb_actual='' cb_ok=''`,
        `  cb_out=$(sysctl -n "$cb_setting" 2>&1); cb_rc=$?`,
        '  if [ "$cb_rc" -ne 0 ]; then',
        `    cb_message="설정값을 읽을 수 없습니다: $(printf '%s\\n' "$cb_out" | head -n 1)"`,
        '  else',
        `    cb_actual=$(printf '%s' "$cb_out" | tr -s ' \\t\\n' '   ' | sed 's/^ //; s/ $//')`,
        `    cb_expected=$(printf '%s' "$cb_expected" | tr -s ' \\t\\n' '   ' | sed 's/^ //; s/ $//')`,
        '    case "$cb_cmp" in',
        `      '=') [ "$cb_actual" = "$cb_expected" ] && cb_ok=1 || cb_ok=0 ;;`,
        `      '!=') [ "$cb_actual" != "$cb_expected" ] && cb_ok=1 || cb_ok=0 ;;`,
        `      *) cb_ok=$(awk -v a="$cb_actual" -v e="$cb_expected" -v op="$cb_cmp" 'BEGIN { n = "^-?[0-9]+(\\\\.[0-9]+)?$"; if (a !~ n || e !~ n) print ""; else if (op == ">=") print (a + 0 >= e + 0) ? 1 : 0; else print (a + 0 <= e + 0) ? 1 : 0 }') ;;`,
        '    esac',
        `    if [ -z "$cb_ok" ]; then cb_message='숫자가 아니어서 크기를 비교할 수 없습니다.'`,
        `    elif [ "$cb_ok" = 1 ]; then cb_status=Healthy`,
        `    else cb_status=$cb_level; cb_message='기대값과 다릅니다.'; fi`,
        '  fi',
        `  ${V}_row "$cb_setting" "$cb_actual" "$cb_threshold" "$cb_status" "$cb_message"`,
      ];
    case 'REMOTE_PORT':
      return [
        `  local cb_timeout=${shLiteral(fmt(spec.timeoutSeconds))} cb_level=${shLiteral(spec.level ?? 'Critical')} line host port st msg value`,
        ...inputLines(spec),
        ...requireList('targets', label('targets'), [
          'while IFS= read -r line; do',
          '  host=${line%:*}; port=${line##*:}; host=${host#[}; host=${host%]}',
          `  if [ "$host" = "$line" ] || [ -z "$host" ] || ! [[ "$port" =~ ^[0-9]+$ ]] || [ "$port" -lt 1 ] || [ "$port" -gt 65535 ]; then st=NotCollected; value=''; msg='형식이 올바르지 않습니다. (호스트:포트)'`,
          `  elif ${V}_connect "$host" "$port" "$cb_timeout"; then st=Healthy; value='성공'; msg='접속 성공'`,
          `  else st=$cb_level; value='실패'; msg="접속 실패 (\${cb_timeout}초 안에 응답 없음)"; fi`,
          `  ${V}_row "$line" "$value" "$cb_threshold" "$st" "$msg"`,
          'done <<< "$cb_in_targets"',
          `cb_status=$(${V}_worst $cb_statuses)`,
        ]),
      ];
    case 'FILE_FRESHNESS':
      return [
        `  local cb_max=${shLiteral(fmt(spec.maxAgeHours))} cb_missing=${shLiteral(spec.missingLevel ?? 'Critical')} cb_now line m age hours modified over`,
        ...inputLines(spec),
        ...requireList('paths', label('paths'), [
          'cb_now=$(date +%s)',
          'while IFS= read -r line; do',
          '  if [ -e "$line" ]; then',
          '    m=$(stat -c %Y -- "$line" 2>/dev/null); age=$((cb_now - ${m:-0}))',
          `    hours=$(awk -v a="$age" 'BEGIN { printf "%.1f", a / 3600 }')`,
          `    modified=$(date -d "@\${m:-0}" '+%Y-%m-%d %H:%M:%S' 2>/dev/null || printf '%s' "$m")`,
          `    over=$(awk -v a="$age" -v h="$cb_max" 'BEGIN { print (a > h * 3600) ? 1 : 0 }')`,
          `    if [ "$over" = 1 ]; then ${V}_row "$line" "$modified" "$cb_threshold" Warning "\${hours}시간 전 수정"`,
          `    else ${V}_row "$line" "$modified" "$cb_threshold" Healthy "\${hours}시간 전 수정"; fi`,
          `  else ${V}_row "$line" '' "$cb_threshold" "$cb_missing" '파일이 없습니다.'; fi`,
          'done <<< "$cb_in_paths"',
          `cb_status=$(${V}_worst $cb_statuses)`,
        ]),
      ];
    case 'LOG_PATTERN':
      return [
        `  local cb_days=${shLiteral(fmt(spec.periodDays))} cb_warning=${shLiteral(fmt(spec.warning))} cb_critical=${shLiteral(fmt(spec.critical))} cb_total=0 cb_found_path=0 cb_samples='' cb_sample_count=0 line f c st text`,
        `  local -a cb_args=() cb_files=()`,
        `  for p in ${(spec.phrases ?? []).map(shLiteral).join(' ')}; do cb_args+=(-e "$p"); done`,
        ...inputLines(spec),
        ...requireList('paths', label('paths'), [
          'while IFS= read -r line; do',
          '  cb_files=()',
          `  if [ -d "$line" ]; then mapfile -t cb_files < <(find "$line" -type f -mtime "-$cb_days" 2>/dev/null | sort)`,
          `  elif [ -f "$line" ]; then mapfile -t cb_files < <(find "$line" -maxdepth 0 -mtime "-$cb_days" 2>/dev/null)`,
          `  else ${V}_row "$line" '' "$cb_threshold" NotCollected '경로가 없습니다.'; continue; fi`,
          '  cb_found_path=1; c=0',
          '  for f in "${cb_files[@]}"; do',
          '    c=$((c + $(grep -ciF "${cb_args[@]}" -- "$f" 2>/dev/null || true)))',
          `    if [ "$cb_sample_count" -lt ${LIMITS.sampleLines} ]; then`,
          '      while IFS= read -r text; do',
          `        [ -n "$cb_samples" ] && cb_samples+=','`,
          `        cb_samples+="{\\"path\\":$(opsbox_json_string "$f"),\\"timestamp\\":\\"\\",\\"text\\":$(opsbox_json_string "$(${V}_truncate "$text" 500)")}"`,
          '        cb_sample_count=$((cb_sample_count + 1))',
          `      done < <(grep -iF -m "$((${LIMITS.sampleLines} - cb_sample_count))" "\${cb_args[@]}" -- "$f" 2>/dev/null)`,
          '    fi',
          '  done',
          '  cb_total=$((cb_total + c))',
          `  st=$(${V}_judge "$c" HIGHER_IS_WORSE "$cb_warning" "$cb_critical")`,
          `  ${V}_row "$line" "$c" "$cb_threshold" "$st" "파일 \${#cb_files[@]}개 확인"`,
          'done <<< "$cb_in_paths"',
          `if [ "$cb_found_path" = 1 ]; then cb_status=$(${V}_judge "$cb_total" HIGHER_IS_WORSE "$cb_warning" "$cb_critical"); else cb_message='확인할 수 있는 로그 경로가 없습니다.'; fi`,
          `cb_extra=",\\"samples\\":[$cb_samples]"`,
        ]),
      ];
  }
}

export function generateLinuxPart({ itemId, itemName, role, spec }: GenerateArgs): string {
  assertItemId(itemId);
  const resolved = resolveSpec(spec);
  const fn = `${V}_item_${itemId}`;
  return [
    `# 점검 만들기 · ${commentText(itemName)} (자동 생성, 생성기 v${GENERATOR_VERSION}) — 직접 고치면 폼 변경이 반영되지 않습니다`,
    HELPERS,
    `${fn}() {`,
    `  local cb_item=${shLiteral(itemId)} cb_role=${shLiteral(role)} cb_name=${shLiteral(itemName)} cb_threshold=${shLiteral(thresholdText(resolved))}`,
    `  local cb_rows='' cb_statuses='' cb_out='' cb_rc=0 cb_status=NotCollected cb_message='' cb_extra=''`,
    '  opsbox_log "점검 만들기 시작: $cb_name"',
    ...body(resolved),
    `  ${V}_finish "$cb_role" "$cb_item" "$cb_status" "$cb_message" "$cb_extra"`,
    '  opsbox_log "점검 만들기 완료: $cb_name ($cb_status)"',
    '}',
    fn,
  ].join('\n');
}
