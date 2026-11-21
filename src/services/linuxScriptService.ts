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
const ROLE_NOT_SUPPORTED_MESSAGE = 'Linux용 역할별 점검 스크립트가 아직 없어 수집하지 않았습니다.';
const BASIC_NOT_COLLECTED_MESSAGE = '연결된 점검 스크립트가 결과를 기록하지 않았습니다.';

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

function renderBashConfig(config: ScriptConfig): string {
  const { server, checks } = config;
  const products = server.products as Partial<Record<string, string>>;

  // 역할별 점검은 Linux 2단계 작업 전까지 미수집으로 기록합니다.
  const rolePolicies: Record<string, unknown> = {};
  const roleStatuses: string[] = [];
  for (const [role, items] of Object.entries(checks.rolePolicies)) {
    if (!items.length) continue;
    rolePolicies[role] = {
      status: 'NotCollected',
      items: items.map((item) => ({ role, ...item, status: 'NotCollected', message: ROLE_NOT_SUPPORTED_MESSAGE })),
    };
    roleStatuses.push('NotCollected');
  }
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
    scalar('OPSBOX_ROLE_POLICIES_JSON', JSON.stringify(rolePolicies)),
    scalar('OPSBOX_ROLE_POLICY_STATUSES', roleStatuses.join(' ')),
    scalar('OPSBOX_BASIC_POLICY_ITEMS_JSON', JSON.stringify(basicPolicyItems)),
    '# ---- OpsBox 설정 끝 ----',
  ].join('\n');
}

export function assembleLinuxScript(server: Server, templates: ManagedTemplate[]): string {
  const config = buildScriptConfig(server);
  const block = renderBashConfig(config);
  return `${selectScriptParts(server, templates, 'Linux', CONFIG_TOKEN)
    .map((part) => part.replace(/\r\n/g, '\n').replace(CONFIG_TOKEN, () => block).trim())
    .join('\n\n')}\n`;
}
