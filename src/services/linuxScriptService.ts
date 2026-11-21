import { Server } from '../types/server';
import { ManagedTemplate } from '../types/template';
import { buildScriptConfig, ScriptConfig, selectScriptParts } from './scriptAssembly';

/*
 * Linux 점검 스크립트 조립
 *
 * Windows는 설정을 Base64 JSON으로 넣고 PowerShell이 읽지만, bash에는 JSON 해석기가 없어
 * (jq·python이 없는 서버가 많음) 설정을 bash 변수·배열로 바꿔 START 조각의 @@CONFIG_BASH@@ 자리에 넣습니다.
 * 결과에 그대로 들어갈 부분(서버 정보, 정책 정의 등)은 JSON 문자열로 미리 만들어 둡니다.
 */

const CONFIG_TOKEN = '@@CONFIG_BASH@@';
const ROLE_NOT_SUPPORTED_MESSAGE = 'Linux용 점검 스크립트가 아직 없어 수집하지 않았습니다.';
const BASIC_NOT_COLLECTED_MESSAGE = '연결된 점검 스크립트가 결과를 기록하지 않았습니다.';
const dbQueryMissingMessage = (dbms: string) => (dbms
  ? `${dbms}용 쿼리 템플릿이 없어 수집하지 않았습니다. 스크립트 관리에서 쿼리를 만들고 서버 정책에서 선택하세요.`
  : '서버 기본 정보에서 DB 제품을 지정하세요.');

/*
 * 역할별(WEB·WAS) 점검 조각이 결과를 남기는 방법
 * - opsbox_role_record 역할 항목 상태 상세JSON : 정책 항목 결과 (보고서의 역할별 항목)
 * - opsbox_was_item JSON 상태                 : WAS 점검 목록 (보고서의 WAS 표)
 * - web_check_json / web_status              : WEB 엔진 상태 상세
 * 이 함수와 변수는 설정 블록에 넣어, 예전 버전의 START 조각을 쓰는 DB에서도 동작하게 합니다.
 */
const ROLE_RUNTIME = [
  '# ---- 역할별 점검 결과 기록 (OpsBox가 자동으로 넣음) ----',
  'declare -A OPSBOX_ROLE_STATUS=() OPSBOX_ROLE_DETAIL=()',
  'opsbox_role_record() { OPSBOX_ROLE_STATUS["$1:$2"]=$3; OPSBOX_ROLE_DETAIL["$1:$2"]=${4:-null}; }',
  "web_status=NotCollected; web_check_json=null; was_items_json=''; was_statuses=''; database_status=NotCollected; database_check_json=null",
  'opsbox_was_item() { [ -n "$was_items_json" ] && was_items_json+=\',\'; was_items_json+=$1; was_statuses+=" $2"; }',
  '# 이름이 정확히 같은 프로세스의 PID 목록 (pgrep이 없거나 못 찾으면 /proc/*/comm 에서 찾음)',
  'opsbox_pids_by_name() {',
  '  local found f c pid',
  '  found=$(pgrep -x -- "$1" 2>/dev/null)',
  '  if [ -n "$found" ]; then printf \'%s\\n\' "$found"; return; fi',
  '  for f in /proc/[0-9]*/comm; do',
  '    read -r c < "$f" 2>/dev/null || continue',
  '    [ "$c" = "$1" ] || continue',
  '    pid=${f#/proc/}; printf \'%s\\n\' "${pid%/comm}"',
  '  done',
  '}',
].join('\n');

/*
 * SAVE 조각 바로 앞에 넣는 정리 단계: 정책에 있는 역할별 항목마다 조각이 남긴 결과를 모아
 * OPSBOX_ROLE_POLICIES_JSON / OPSBOX_ROLE_POLICY_STATUSES / was_status 를 만듭니다.
 * (기록하지 않은 항목은 미수집으로 남김. 상태 종합은 Windows 스크립트와 같은 규칙)
 */
const ROLE_FINALIZE = `# ---- 역할별 점검 결과 정리 (OpsBox가 자동으로 넣음) ----
opsbox_finalize_role_policies() {
  local i role item key status entry s roles_seen='' out=''
  declare -A role_items=() role_statuses=()
  for i in "\${!OPSBOX_ROLE_ITEM_IDS[@]}"; do
    role=\${OPSBOX_ROLE_ITEM_ROLES[$i]}; item=\${OPSBOX_ROLE_ITEM_IDS[$i]}; key="$role:$item"
    if [ -n "\${OPSBOX_ROLE_STATUS[$key]+x}" ]; then
      status=\${OPSBOX_ROLE_STATUS[$key]}
      entry="{\\"role\\":\\"$role\\",\\"item\\":$(opsbox_json_string "$item"),\${OPSBOX_ROLE_ITEM_META[$i]},\\"status\\":\\"$status\\",\\"detail\\":\${OPSBOX_ROLE_DETAIL[$key]}}"
    else
      status=NotCollected
      entry="{\\"role\\":\\"$role\\",\\"item\\":$(opsbox_json_string "$item"),\${OPSBOX_ROLE_ITEM_META[$i]},\\"status\\":\\"NotCollected\\",\\"message\\":$(opsbox_json_string "\${OPSBOX_ROLE_ITEM_MESSAGES[$i]}")}"
    fi
    [ -n "\${role_items[$role]:-}" ] && role_items[$role]+=','
    role_items[$role]+=$entry
    role_statuses[$role]+=" $status"
    case " $roles_seen " in *" $role "*) ;; *) roles_seen+=" $role" ;; esac
  done
  OPSBOX_ROLE_POLICY_STATUSES=''
  for role in $roles_seen; do
    case "\${role_statuses[$role]} " in
      *' Critical '*) s=Critical ;;
      *' Warning '*) s=Warning ;;
      *' Healthy '*) s=Healthy ;;
      *) s=NotCollected ;;
    esac
    [ -n "$out" ] && out+=','
    out+="\\"$role\\":{\\"status\\":\\"$s\\",\\"items\\":[\${role_items[$role]}]}"
    OPSBOX_ROLE_POLICY_STATUSES+=" $s"
  done
  OPSBOX_ROLE_POLICIES_JSON="{$out}"
}
opsbox_finalize_role_policies
case " $was_statuses " in
  '  ') was_status=NotCollected ;;
  *' Critical '*) was_status=Critical ;;
  *' Warning '*) was_status=Warning ;;
  *' NotCollected '*) was_status=NotCollected ;;
  *) was_status=Healthy ;;
esac`;

/** bash 작은따옴표 문자열 (작은따옴표는 '\'' 로 처리) */
function quote(value: unknown): string {
  return `'${String(value ?? '').replace(/'/g, `'\\''`)}'`;
}

function scalar(name: string, value: unknown): string {
  return `${name}=${quote(value)}`;
}

function array(name: string, values: unknown[]): string {
  return `${name}=(${values.map(quote).join(' ')})`;
}

function threshold(config: ScriptConfig, item: string, key: 'warningPercent' | 'criticalPercent', fallback: number): number {
  const value = Number((config.checks.policyItems as Record<string, any>)[item]?.executor?.options?.[key]);
  return Number.isFinite(value) ? value : fallback;
}

/** JSON 객체의 { } 안쪽 (역할별 항목 결과에 이어 붙일 name·result·executorType) */
function jsonFields(value: Record<string, unknown>): string {
  return JSON.stringify(value).slice(1, -1);
}

function renderBashConfig(config: ScriptConfig, templates: ManagedTemplate[]): string {
  const { server, checks, database } = config;
  const products = server.products as Partial<Record<string, string>>;
  const settings = checks.rolePolicySettings as Partial<Record<string, { logDirectories?: string[]; periodDays?: number; instanceTargets?: string[] }>>;
  const dbms = products.DB ?? '';

  // DB 쿼리 대상: 항목에 지정한 대상 → 인스턴스 상태 항목의 대상 → 비움(이 서버의 기본 접속)
  const dbTargets = (item: string) => (settings[item]?.instanceTargets?.length ? settings[item]!.instanceTargets! : settings.DB_INSTANCE_STATUS?.instanceTargets ?? []).join('\n');
  const queryItems = new Set(database.policyQueries.map((query) => query.item));

  // 정책에 있는 역할별 항목 목록. 결과는 각 조각이 실행 중에 기록하고, SAVE 앞의 정리 단계가 모읍니다.
  const hasLinuxPart = (item: string) => templates.some((template) => template.enabled && template.kind === 'SCRIPT_PART' && template.os === 'Linux' && template.item === item);
  const roleItems = Object.entries(checks.rolePolicies).flatMap(([role, items]) => items.map((item) => ({ role, ...item })));
  const notCollectedMessage = ({ role, item }: { role: string; item: string }) => {
    if (role === 'DB' && item === 'DB_CUSTOM_QUERY') return database.customQueries.length ? BASIC_NOT_COLLECTED_MESSAGE : '실행할 사용자 쿼리를 서버 정책에서 선택하세요.';
    if (role === 'DB') return queryItems.has(item) ? BASIC_NOT_COLLECTED_MESSAGE : dbQueryMissingMessage(dbms);
    return hasLinuxPart(item) ? BASIC_NOT_COLLECTED_MESSAGE : ROLE_NOT_SUPPORTED_MESSAGE;
  };
  const basicPolicyItems = checks.basicPolicyItems.map(({ item, name, result, executorType }) => ({
    role: 'BASIC', item, name, result, executorType, status: 'NotCollected', message: BASIC_NOT_COLLECTED_MESSAGE,
  }));

  // 공유 폴더는 Linux에서 쓸 수 있는 경로(/로 시작)일 때만 기본 결과 폴더로 씁니다.
  // (\\NAS\share 같은 Windows 경로는 Linux 서버에서 바로 쓸 수 없음)
  const sharedPath = server.sharedPath?.startsWith('/') ? server.sharedPath : '';

  return [
    '# ---- OpsBox 설정 (스크립트 생성 시 자동으로 채워짐) ----',
    scalar('OPSBOX_SERVER_ID', server.id),
    scalar('OPSBOX_SHARED_PATH', sharedPath),
    scalar('OPSBOX_PRODUCT_WEB', products.WEB ?? ''),
    scalar('OPSBOX_PRODUCT_WAS', products.WAS ?? ''),
    scalar('OPSBOX_PRODUCT_DB', products.DB ?? ''),
    scalar('OPSBOX_CPU_WARNING', threshold(config, 'CPU', 'warningPercent', 70)),
    scalar('OPSBOX_CPU_CRITICAL', threshold(config, 'CPU', 'criticalPercent', 90)),
    scalar('OPSBOX_MEMORY_WARNING', threshold(config, 'MEMORY', 'warningPercent', 70)),
    scalar('OPSBOX_MEMORY_CRITICAL', threshold(config, 'MEMORY', 'criticalPercent', 90)),
    scalar('OPSBOX_DISK_WARNING', threshold(config, 'DISK', 'warningPercent', 70)),
    scalar('OPSBOX_DISK_CRITICAL', threshold(config, 'DISK', 'criticalPercent', 90)),
    array('OPSBOX_PROCESS_NAMES', checks.processes.map((item) => item.name)),
    array('OPSBOX_DIRECTORY_PATHS', checks.directories.map((item) => item.path)),
    array('OPSBOX_DIRECTORY_WARNING', checks.directories.map((item: any) => item.warningPercent ?? 80)),
    array('OPSBOX_DIRECTORY_CRITICAL', checks.directories.map((item: any) => item.criticalPercent ?? 90)),
    array('OPSBOX_FILE_PATHS', checks.fileChecks.map((item) => item.path)),
    array('OPSBOX_FILE_WARNING_MB', checks.fileChecks.map((item) => item.warningSizeMB)),
    array('OPSBOX_FILE_CRITICAL_MB', checks.fileChecks.map((item) => item.criticalSizeMB)),
    array('OPSBOX_PORT_NUMBERS', checks.ports.map((item) => item.port)),
    array('OPSBOX_PORT_PROTOCOLS', checks.ports.map((item) => (item.protocol ?? 'TCP').toUpperCase())),
    array('OPSBOX_PORT_DESCRIPTIONS', checks.ports.map((item) => item.description ?? '')),
    array('OPSBOX_HTTP_NAMES', checks.httpChecks.map((item) => item.name)),
    array('OPSBOX_HTTP_URLS', checks.httpChecks.map((item) => item.url)),
    array('OPSBOX_HTTP_EXPECTED', checks.httpChecks.map((item) => item.expectedStatus)),
    scalar('OPSBOX_SERVER_JSON', JSON.stringify({ id: server.id, name: server.name, ip: server.ip, roles: server.roles, products })),
    scalar('OPSBOX_POLICY_DEFINITIONS_JSON', JSON.stringify(checks.policyItems)),
    scalar('OPSBOX_WAS_HEAP_WARNING', threshold(config, 'WAS_JVM_HEAP', 'warningPercent', 70)),
    scalar('OPSBOX_WAS_HEAP_CRITICAL', threshold(config, 'WAS_JVM_HEAP', 'criticalPercent', 90)),
    array('OPSBOX_WEB_LOG_DIRS', settings.WEB_LOG?.logDirectories ?? []),
    scalar('OPSBOX_WEB_LOG_DAYS', settings.WEB_LOG?.periodDays ?? 7),
    array('OPSBOX_WAS_LOG_DIRS', settings.WAS_LOG?.logDirectories ?? []),
    scalar('OPSBOX_WAS_LOG_DAYS', settings.WAS_LOG?.periodDays ?? 7),
    array('OPSBOX_ROLE_ITEM_ROLES', roleItems.map((item) => item.role)),
    array('OPSBOX_ROLE_ITEM_IDS', roleItems.map((item) => item.item)),
    array('OPSBOX_ROLE_ITEM_META', roleItems.map(({ name, result, executorType }) => jsonFields({ name, result, executorType }))),
    array('OPSBOX_ROLE_ITEM_MESSAGES', roleItems.map(notCollectedMessage)),
    // DB 쿼리 (항목·이름·SQL·대상 목록은 같은 순서, 대상은 줄바꿈으로 구분하며 빈 값은 기본 접속)
    array('OPSBOX_DB_QUERY_ITEMS', database.policyQueries.map((query) => query.item)),
    array('OPSBOX_DB_QUERY_NAMES', database.policyQueries.map((query) => query.name)),
    array('OPSBOX_DB_QUERY_SQL', database.policyQueries.map((query) => query.content.replace(/\r\n/g, '\n'))),
    array('OPSBOX_DB_QUERY_TARGETS', database.policyQueries.map((query) => dbTargets(query.item))),
    array('OPSBOX_DB_CUSTOM_NAMES', database.customQueries.map((query) => query.name)),
    array('OPSBOX_DB_CUSTOM_SQL', database.customQueries.map((query) => query.content.replace(/\r\n/g, '\n'))),
    scalar('OPSBOX_DB_CUSTOM_TARGETS', dbTargets('DB_CUSTOM_QUERY')),
    // 예전 SAVE 조각이 읽는 변수 (정리 단계에서 실제 결과로 채움)
    scalar('OPSBOX_ROLE_POLICIES_JSON', '{}'),
    scalar('OPSBOX_ROLE_POLICY_STATUSES', ''),
    scalar('OPSBOX_BASIC_POLICY_ITEMS_JSON', JSON.stringify(basicPolicyItems)),
    '# ---- OpsBox 설정 끝 ----',
    ROLE_RUNTIME,
  ].join('\n');
}

export function assembleLinuxScript(server: Server, templates: ManagedTemplate[], policyQueryTemplates: ManagedTemplate[] = [], customQueryTemplates: ManagedTemplate[] = []): string {
  const config = buildScriptConfig(server, policyQueryTemplates, customQueryTemplates);
  const block = renderBashConfig(config, templates);
  const parts = selectScriptParts(server, templates, 'Linux', CONFIG_TOKEN)
    .map((part) => part.replace(/\r\n/g, '\n').replace(CONFIG_TOKEN, () => block).trim());
  // 마지막 조각은 항상 SAVE입니다. 그 앞에 역할별 결과 정리 단계를 넣습니다.
  parts.splice(parts.length - 1, 0, ROLE_FINALIZE);
  return `${parts.join('\n\n')}\n`;
}
