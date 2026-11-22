import { ConflictError, NotFoundError, ValidationError } from '../../shared/errors';
import { getCommonCodes } from '../common-codes/service';
import { getPolicies } from '../policies/service';
import { getTemplate } from '../templates/service';
import type { ScriptPart } from '../templates/types';
import { LINUX_DB_PRODUCTS, resolveQueryTemplate } from '../scripts/db-query-defaults';
import { resultPathError } from '../settings/service';
import { resolveServer, toStoredCheckConfig } from './check-plan';
import { findServerRecord, listServerRecords, saveServerRecord, setServerEnabled } from './repository';
import type { CheckConfig, CheckConfigInput, RolePolicyType, Server, ServerProduct, ServerRecord, ServerRole } from './types';
import { validateDirectories, validateFileChecks, validateHttpChecks, validatePorts, validateProcesses } from './validation';

const COMMON_CODES = getCommonCodes();
const ROLES: ServerRole[] = COMMON_CODES.serverRoles.map(({ value }) => value as ServerRole);
const PRODUCTS = COMMON_CODES.productsByRole as Record<Exclude<ServerRole, 'OTHER'>, ServerProduct[]>;
const ROLE_POLICY_TYPES: RolePolicyType[] = ['WEB', 'WAS', 'DB'];
const DEFAULT_ROLE_CHECKS: Partial<Record<RolePolicyType, ScriptPart[]>> = {
  WEB: getTemplate('WINDOWS-PART-WEB_ENGINE_STATUS') ? ['WEB_ENGINE_STATUS'] : [],
  WAS: getTemplate('WINDOWS-PART-WAS_JVM_HEAP') ? ['WAS_JVM_HEAP'] : [],
  DB: getTemplate('WINDOWS-PART-DB_INSTANCE_STATUS') ? ['DB_INSTANCE_STATUS'] : [],
};

export function getServerRoles(server: Pick<Server, 'roles'>): ServerRole[] {
  const roles = Array.isArray(server.roles) ? server.roles.filter((role): role is ServerRole => ROLES.includes(role)) : [];
  return [...new Set(roles)];
}

export function getServerProduct(server: Pick<Server, 'products'>, role: ServerRole): ServerProduct | undefined {
  return server.products?.[role];
}

const resolve = (record: ServerRecord) => resolveServer(record, { policies: getPolicies(), roles: ROLES, defaultRoleChecks: DEFAULT_ROLE_CHECKS });

/** 입력(화면에서 보낸 서버) → 정책 계산을 얹은 서버. 저장 전 검증과 응답에 씁니다. */
function normalizeInput(input: Server): Server {
  const roles = Array.isArray(input.roles) ? input.roles : [];
  return resolve(toRecord({ ...input, roles }, input.enabled !== false));
}

function toRecord(server: Server, enabled: boolean): ServerRecord {
  const roles = [...new Set(server.roles ?? [])];
  return {
    id: server.id,
    name: server.name,
    os: server.os,
    ip: server.ip,
    // 문자열이 아니면 여기서는 비워 두고, validateServer가 400으로 알립니다.
    resultPath: typeof server.resultPath === 'string' ? server.resultPath.trim() || null : null,
    enabled,
    roles,
    products: Object.fromEntries(roles.filter((role) => server.products?.[role]).map((role) => [role, server.products![role]])),
    policyIds: Object.fromEntries(Object.entries(server.policyIds ?? {}).filter(([, id]) => id)),
    checkConfig: toStoredCheckConfig(server, COMMON_CODES, getPolicies()),
  };
}

function persist(server: Server) {
  saveServerRecord(toRecord(server, server.enabled !== false));
}

export const SERVER_ID_PATTERN = /^[\p{L}\p{N}][\p{L}\p{N}._-]{0,63}$/u;

/** 호스트:포트 (IPv6는 [주소]:포트) */
function isHostPort(text: string): boolean {
  const index = text.lastIndexOf(':');
  if (index <= 0) return false;
  const host = text.slice(0, index).replace(/^\[(.*)\]$/, '$1');
  const port = Number(text.slice(index + 1));
  return host.length > 0 && host.length <= 253 && !/\s/.test(host) && Number.isInteger(port) && port >= 1 && port <= 65535;
}

function validateServer(server: Partial<Server>, servers: Server[], currentId?: string) {
  const errors = [];
  const roles = Array.isArray(server.roles) ? [...new Set(server.roles)] : [];
  if (!roles.length || roles.some((role) => !ROLES.includes(role))) errors.push({ field: 'roles', message: '서버 역할을 하나 이상 선택해야 합니다.' });

  if (!server.id || server.id.trim() === '') {
    errors.push({
      field: 'id',
      message: '서버 ID는 필수입니다.',
    });
  }

  if (!server.name || server.name.trim() === '') {
    errors.push({
      field: 'name',
      message: '서버명은 필수입니다.',
    });
  }

  // 서버 ID는 스크립트 파일 이름·실행 명령·백업 경로에 들어가므로 글자·숫자·._- 만 허용합니다.
  // (이미 등록된 서버는 ID를 바꿀 수 없어, 새로 만들 때만 검사)
  if (currentId === undefined && server.id?.trim() && !SERVER_ID_PATTERN.test(server.id)) {
    errors.push({
      field: 'id',
      message: '서버 ID는 글자·숫자로 시작하고 글자·숫자·마침표(.)·밑줄(_)·하이픈(-)만 쓸 수 있습니다. (최대 64자)',
    });
  }

  if (server.id && servers.some((s) => s.id === server.id && s.id !== currentId)) {
    errors.push({
      field: 'id',
      message: `이미 존재하는 서버 ID 입니다. (${server.id})`,
    });
  }

  if (server.resultPath !== undefined && typeof server.resultPath !== 'string') errors.push({ field: 'resultPath', message: '결과 저장 경로는 문자열이어야 합니다.' });
  const resultPathMessage = resultPathError(server.os ?? '', typeof server.resultPath === 'string' ? server.resultPath.trim() : '');
  if (resultPathMessage) errors.push({ field: 'resultPath', message: resultPathMessage });

  const processValidation = validateProcesses(server.processes ?? []);

  const directoryValidation = validateDirectories(server.directories ?? []);
  const fileCheckValidation = validateFileChecks(server.fileChecks ?? []);
  const portValidation = validatePorts(server.ports ?? []);
  const httpValidation = validateHttpChecks(server.httpChecks ?? []);

  errors.push(...processValidation.errors);

  errors.push(...directoryValidation.errors);
  errors.push(...fileCheckValidation.errors);
  errors.push(...portValidation.errors);
  errors.push(...httpValidation.errors);
  for (const role of roles) {
    // 알 수 없는 역할은 위에서 roles 오류로 알리므로 제품 검사는 건너뜁니다.
    if (role === 'OTHER' || !role || !PRODUCTS[role as Exclude<ServerRole, 'OTHER'>]) continue;
    const product = server.products?.[role];
    if (!product || !PRODUCTS[role].includes(product)) errors.push({ field: `products.${role}`, message: `${role} 제품을 선택해야 합니다.` });
  }
  if (!roles.some((role) => role === 'WEB' || role === 'WAS') && (server.httpChecks?.length ?? 0) > 0) errors.push({ field: 'httpChecks', message: 'HTTP 점검은 WEB/WAS 역할이 있는 서버에만 설정할 수 있습니다.' });

  if (errors.length > 0) {
    throw new ValidationError(errors);
  }
}

export function getAllServers(options: { includeInactive?: boolean } = {}): Server[] {
  return listServerRecords().filter((record) => options.includeInactive || record.enabled).map(resolve);
}

export function getServer(id: string): Server | undefined {
  const record = findServerRecord(id);
  return record ? resolve(record) : undefined;
}

export function createServer(input: Server) {
  const existing = findServerRecord(input.id);
  if (existing && !existing.enabled) throw new ConflictError(`미사용 서버 ${input.id}가 있습니다. 서버 목록에서 [다시 사용]을 누르세요.`);
  const normalized = normalizeInput({ ...input, enabled: true });
  validateServer({ ...normalized, resultPath: input.resultPath }, getAllServers({ includeInactive: true }));
  persist(normalized);
  return getServer(normalized.id)!;
}

export function updateServer(id: string, data: Partial<Server>) {
  const current = getServer(id);
  if (!current) throw new NotFoundError(`서버를 찾을 수 없습니다: ${id}`);
  // 서버 ID는 점검 결과·스크립트 경로와 연결되어 있어 수정으로 바꿀 수 없습니다. 사용 여부는 미사용·다시 사용으로만 바꿉니다.
  const { id: _ignoredId, enabled: _ignoredEnabled, ...changes } = data;
  const updated = normalizeInput({ ...current, ...changes, id: current.id, enabled: current.enabled });
  validateServer({ ...updated, resultPath: 'resultPath' in changes ? changes.resultPath : updated.resultPath }, getAllServers({ includeInactive: true }), id);
  persist(updated);
  return getServer(id)!;
}

/** 미사용: 지우지 않고 대시보드·스크립트·결과 가져오기에서 뺍니다(점검 결과와 보고서는 남음). */
export function deactivateServer(id: string): Server {
  if (!setServerEnabled(id, false)) throw new NotFoundError(`서버를 찾을 수 없습니다: ${id}`);
  return getServer(id)!;
}

export function activateServer(id: string): Server {
  if (!setServerEnabled(id, true)) throw new NotFoundError(`서버를 찾을 수 없습니다: ${id}`);
  return getServer(id)!;
}

export function getCheckConfig(id: string): CheckConfig {
  const server = getServer(id);

  if (!server) {
    throw new NotFoundError(`서버를 찾을 수 없습니다: ${id}`);
  }

  return {
    processes: server.processes ?? [],

    directories: server.directories ?? [],
    fileChecks: server.fileChecks ?? [],
    ports: server.ports ?? [],
    httpChecks: server.httpChecks ?? [],
    scriptParts: server.scriptParts ?? {},
    roleChecks: server.roleChecks ?? {},
    rolePolicySettings: server.rolePolicySettings ?? {},
    queryTemplateId: server.queryTemplateId ?? '',
    customQueryTemplateIds: server.customQueryTemplateIds ?? [],
    policyIds: server.policyIds ?? {},
  };
}

export function updateCheckConfig(id: string, config: CheckConfigInput) {
  const current = getServer(id);

  if (!current) {
    throw new NotFoundError(`서버를 찾을 수 없습니다: ${id}`);
  }

  const policyIds = config.policyIds ?? current.policyIds ?? {};
  const selectedPolicies = getPolicies().filter((policy) => Object.values(policyIds).includes(policy.id) && policy.os === current.os);
  const policyByCategory = new Map(selectedPolicies.map((policy) => [policy.category, policy]));
  const policyItemById = new Map(selectedPolicies.flatMap((policy) => policy.items.map((item) => [item.id, item] as const)));

  const processValidation = validateProcesses(config.processes ?? []);

  const directoryValidation = validateDirectories(config.directories ?? []);
  const fileCheckValidation = validateFileChecks(config.fileChecks ?? []);
  const portValidation = validatePorts(config.ports ?? []);
  const httpValidation = validateHttpChecks(config.httpChecks ?? []);

  const errors = [...processValidation.errors, ...directoryValidation.errors, ...fileCheckValidation.errors, ...portValidation.errors, ...httpValidation.errors];
  const validParts = new Set<string>(['START', 'SAVE', ...COMMON_CODES.scriptItems.map(({ value }) => value), ...policyItemById.keys()]);
  const roleChecks = config.roleChecks ?? current.roleChecks ?? {};
  const rolePolicySettings = { ...(current.rolePolicySettings ?? {}), ...(config.rolePolicySettings ?? {}) };
  const logPolicies = [
    { role: 'WEB' as const, item: 'WEB_LOG' as const, label: 'WEB' },
    { role: 'WAS' as const, item: 'WAS_LOG' as const, label: 'WAS' },
  ];
  for (const logPolicy of logPolicies) {
    const { item, role, label } = logPolicy;
    const setting = rolePolicySettings[item] ?? {};
    const rawDirectories: unknown = setting.logDirectories;
    const directories: unknown = typeof rawDirectories === 'string'
      ? rawDirectories.split(/\r?\n/).map((directory) => directory.trim()).filter(Boolean)
      : rawDirectories;
    if (directories !== undefined) {
      if (!Array.isArray(directories) || directories.some((path: unknown) => typeof path !== 'string' || !path.trim() || path.length > 1024)) {
        errors.push({ field: `rolePolicySettings.${item}.logDirectories`, message: `${label} 로그 폴더는 비어 있지 않은 경로 목록이어야 합니다.` });
      } else {
        setting.logDirectories = [...new Set((directories as string[]).map((path) => path.trim()))];
      }
    }
    const enabled = (roleChecks[role] ?? []).includes(item);
    if (enabled && (!Array.isArray(setting.logDirectories) || setting.logDirectories.length === 0)) {
      errors.push({ field: `rolePolicySettings.${item}.logDirectories`, message: `${label} 로그 점검을 위해 로그 폴더를 하나 이상 지정하세요.` });
    }
    if (setting.periodDays !== undefined && (!Number.isInteger(setting.periodDays) || setting.periodDays < 1 || setting.periodDays > 90)) {
      errors.push({ field: `rolePolicySettings.${item}.periodDays`, message: `${label} 로그 조회 기간은 1~90일 사이의 정수로 입력하세요.` });
    }
    if (enabled) rolePolicySettings[item] = { ...setting, logDirectories: setting.logDirectories ?? [], periodDays: setting.periodDays ?? 7 };
    if (!enabled && (setting.logDirectories?.length ?? 0) > 0) {
      errors.push({ field: `rolePolicySettings.${item}.logDirectories`, message: `${label} 로그 점검 항목을 추가한 뒤 로그 폴더를 지정하세요.` });
    }
  }
  for (const item of roleChecks.DB ?? []) {
    // 점검 만들기 항목은 쿼리가 아니므로 접속 대상이 필요 없습니다(서버별 입력은 아래에서 검증).
    if (policyItemById.get(item)?.executor.type === 'CHECK_BUILDER') continue;
    const dbms = getServerProduct(current, 'DB');
    const isWindowsMssql = current.os === 'Windows' && dbms === 'MSSQL';
    const isLinuxDb = current.os === 'Linux' && LINUX_DB_PRODUCTS.includes(dbms ?? '');
    if (!isWindowsMssql && !isLinuxDb) continue;
    const itemLabel = COMMON_CODES.scriptItems.find(({ value }) => value === item)?.label ?? item;
    const setting = rolePolicySettings[item] ?? {};
    const rawTargets: unknown = setting.instanceTargets ?? (isLinuxDb ? [] : undefined);
    const targets: unknown = typeof rawTargets === 'string'
      ? rawTargets.split(/\r?\n/).map((target) => target.trim()).filter(Boolean)
      : rawTargets;
    if (!Array.isArray(targets) || targets.some((target: unknown) => typeof target !== 'string' || !target.trim() || target.length > 512)) {
      errors.push({ field: `rolePolicySettings.${item}.instanceTargets`, message: `${itemLabel} ${dbms} 접속 대상을 올바르게 입력하세요.` });
    } else if (isLinuxDb) {
      // Linux는 대상을 비우면 이 서버의 기본 접속(로컬)으로 실행합니다. CUBRID만 대상 DB 이름이 필요합니다.
      if (dbms === 'CUBRID' && targets.length === 0 && !(rolePolicySettings.DB_INSTANCE_STATUS?.instanceTargets?.length)) {
        errors.push({ field: `rolePolicySettings.${item}.instanceTargets`, message: `${itemLabel} 쿼리를 실행할 CUBRID 대상(DB이름@호스트)을 지정하세요.` });
      } else {
        setting.instanceTargets = [...new Set((targets as string[]).map((target) => target.trim()))];
        rolePolicySettings[item] = setting;
      }
    } else if (targets.length === 0) {
      errors.push({ field: `rolePolicySettings.${item}.instanceTargets`, message: `${itemLabel} 쿼리를 실행할 MSSQL 인스턴스를 하나 이상 지정하세요.` });
    } else {
      setting.instanceTargets = [...new Set((targets as string[]).map((target) => target.trim()))];
      rolePolicySettings[item] = setting;
    }
  }
  const requestedCustomQueryIds = config.customQueryTemplateIds ?? current.customQueryTemplateIds ?? [];
  const customQueryTemplateIds = Array.isArray(requestedCustomQueryIds) ? requestedCustomQueryIds.filter((id): id is string => typeof id === 'string') : [];
  if (!Array.isArray(requestedCustomQueryIds)) errors.push({ field: 'customQueryTemplateIds', message: 'DB 쿼리 템플릿 목록 형식이 올바르지 않습니다.' });
  for (const role of ROLE_POLICY_TYPES) {
    const items = roleChecks[role] ?? [];
    if (!getServerRoles(current).includes(role) && items.length) errors.push({ field: `roleChecks.${role}`, message: `${role} 역할이 있는 서버에서만 항목을 설정할 수 있습니다.` });
    if (new Set(items).size !== items.length) errors.push({ field: `roleChecks.${role}`, message: `${role} 점검 항목을 중복 등록할 수 없습니다.` });
    items.forEach((item) => {
      const policyItem = policyItemById.get(item);
      const isBuiltInItem = COMMON_CODES.rolePolicies[role]?.includes(item) === true;
      const isAssignedCustomItem = policyItem && policyByCategory.get(role)?.items.some((entry) => entry.id === item);
      if (!isBuiltInItem && !isAssignedCustomItem) errors.push({ field: `roleChecks.${role}`, message: `${role} 점검 항목이 선택된 정책에 없습니다.` });
      const selectedId = config.scriptParts?.[item] ?? current.scriptParts?.[item];
      const defaultTemplate = getTemplate(`WINDOWS-PART-${item}`);
      const sqlQuery = role === 'DB' && item !== 'DB_CUSTOM_QUERY' && (policyItem?.executor.type === 'SQL_QUERY' || isBuiltInItem);
      if (sqlQuery) {
        const queryId = rolePolicySettings[item]?.queryTemplateId || policyItem?.executor.templateId || `WINDOWS-QUERY-${item}`;
        const query = getTemplate(queryId);
        const serverDbms = getServerProduct(current, 'DB');
        const requiredDbms = policyItem?.executor.dbms || serverDbms;
        if (current.os === 'Linux') {
          // Linux DB 정책은 제품과 관계없이 공유하므로, 서버 DB 제품용 쿼리로 맞춥니다. 쿼리가 없으면 결과에 미수집으로 남습니다.
          const resolved = resolveQueryTemplate(getTemplate, serverDbms, item, rolePolicySettings[item]?.queryTemplateId);
          if (resolved) rolePolicySettings[item] = { ...(rolePolicySettings[item] ?? {}), queryTemplateId: resolved.id };
        } else if (!query?.enabled || query.kind !== 'QUERY' || (query.dbms ?? 'MSSQL') !== requiredDbms || requiredDbms !== serverDbms) {
          errors.push({ field: `rolePolicySettings.${item}.queryTemplateId`, message: `${policyItem?.name || item} 항목에 서버 DBMS와 맞는 쿼리 템플릿을 선택하세요.` });
        } else rolePolicySettings[item] = { ...(rolePolicySettings[item] ?? {}), queryTemplateId: query.id };
      } else if (role !== 'DB' && current.os === 'Windows' && !selectedId && !defaultTemplate && policyItem?.executor.type !== 'CHECK_BUILDER') {
        errors.push({ field: `roleChecks.${role}`, message: `${item} 항목 스크립트를 먼저 스크립트 관리에서 만들고 선택하세요.` });
      }
    });
  }
  selectedPolicies.forEach((policy) => {
    policy.items.filter((item) => item.enabled && (policy.category === 'BASIC' || (roleChecks[policy.category]?.includes(item.id) ?? false))).forEach((item) => {
      const inputValues = rolePolicySettings[item.id as ScriptPart]?.inputs ?? {};
      item.inputs.filter((input) => input.scope === 'SERVER').forEach((input) => {
        const value = inputValues[input.key];
        if (input.required && (value === undefined || value === null || String(value).trim() === '')) {
          errors.push({ field: `rolePolicySettings.${item.id}.inputs.${input.key}`, message: `${item.name} 항목의 '${input.label}' 값을 입력하세요.` });
        } else if (value !== undefined && input.type === 'NUMBER' && (typeof value !== 'number' || !Number.isFinite(value))) {
          errors.push({ field: `rolePolicySettings.${item.id}.inputs.${input.key}`, message: `${item.name} 항목의 '${input.label}'은 숫자로 입력하세요.` });
        } else if (value !== undefined && input.type === 'PORT' && (typeof value !== 'number' || !Number.isInteger(value) || value < 1 || value > 65535)) {
          errors.push({ field: `rolePolicySettings.${item.id}.inputs.${input.key}`, message: `${item.name} 항목의 '${input.label}'은 1~65535 사이의 포트 번호로 입력하세요.` });
        } else if (value !== undefined && input.type === 'TARGET_LIST') {
          const invalid = String(value).split(/[;\r\n]+/).map((line) => line.trim()).filter(Boolean).filter((line) => !isHostPort(line));
          if (invalid.length) errors.push({ field: `rolePolicySettings.${item.id}.inputs.${input.key}`, message: `${item.name} 항목의 '${input.label}'은 한 줄에 하나씩 호스트:포트(1~65535) 형식으로 입력하세요: ${invalid.slice(0, 3).join(', ')}` });
        }
      });
    });
  });
  const assignedBasicPolicy = policyByCategory.get('BASIC');
  for (const item of assignedBasicPolicy?.items.filter((entry) => entry.enabled) ?? []) {
    if (COMMON_CODES.scriptItems.some((entry) => entry.value === item.id)) continue;
    if (item.executor.type === 'SQL_QUERY') {
      errors.push({ field: 'policyIds.BASIC', message: 'DB 쿼리 실행 항목은 DB 정책에 추가하세요.' });
      continue;
    }
    if (current.os !== 'Windows') continue;
    const templateId = config.scriptParts?.[item.id as ScriptPart] ?? current.scriptParts?.[item.id as ScriptPart] ?? item.executor.templateId;
    const template = templateId ? getTemplate(templateId) : undefined;
    if (!template?.enabled || template.kind !== 'SCRIPT_PART' || template.os !== 'Windows') {
      errors.push({ field: `policyIds.BASIC.${item.id}`, message: `${item.name} 항목의 Windows 스크립트 템플릿을 연결하세요.` });
    }
  }
  const dbCustomQueryEnabled = (roleChecks.DB ?? []).includes('DB_CUSTOM_QUERY');
  if (new Set(customQueryTemplateIds).size !== customQueryTemplateIds.length) errors.push({ field: 'customQueryTemplateIds', message: '기타 쿼리 템플릿을 중복 등록할 수 없습니다.' });
  if (dbCustomQueryEnabled) {
    const dbms = getServerProduct(current, 'DB');
    const supported = current.os === 'Windows' ? dbms === 'MSSQL' : LINUX_DB_PRODUCTS.includes(dbms ?? '');
    if (!supported) errors.push({ field: 'customQueryTemplateIds', message: '기타 쿼리 실행은 Windows MSSQL과 Linux(PostgreSQL·MariaDB·MSSQL·CUBRID) 서버에서 지원합니다.' });
    if (customQueryTemplateIds.length === 0) errors.push({ field: 'customQueryTemplateIds', message: '기타 쿼리 항목에 실행할 쿼리를 하나 이상 선택하세요.' });
  } else if (customQueryTemplateIds.length > 0) {
    errors.push({ field: 'customQueryTemplateIds', message: 'DB 기타 쿼리 점검 항목을 추가한 후 쿼리를 선택하세요.' });
  }
  customQueryTemplateIds.forEach((templateId) => {
    const template = getTemplate(templateId);
    if (!template || !template.enabled || template.kind !== 'QUERY' || (template.dbms ?? 'MSSQL') !== getServerProduct(current, 'DB')) errors.push({ field: 'customQueryTemplateIds', message: '사용할 수 없는 DBMS용 쿼리 템플릿이 포함되어 있습니다.' });
  });
  const requestedScriptParts = Object.fromEntries(Object.entries(config.scriptParts ?? current.scriptParts ?? {}).filter(([part]) => !COMMON_CODES.rolePolicies.DB.includes(part as ScriptPart) && policyItemById.get(part)?.executor.type !== 'SQL_QUERY'));
  for (const [part, templateId] of Object.entries(requestedScriptParts)) {
    if (!validParts.has(part)) {
      errors.push({ field: `scriptParts.${part}`, message: '스크립트 점검 항목이 올바르지 않습니다.' });
      continue;
    }
    if (!templateId) continue;
    const template = getTemplate(templateId);
    if (!template || !template.enabled || template.kind !== 'SCRIPT_PART' || template.os !== current.os) {
      errors.push({ field: `scriptParts.${part}`, message: `${part} 점검에 사용할 ${current.os} 템플릿을 선택하세요.` });
    }
  }
  if (config.queryTemplateId) {
    const template = getTemplate(config.queryTemplateId);
    if (!template || !template.enabled || template.kind !== 'QUERY' || (template.dbms ?? 'MSSQL') !== getServerProduct(current, 'DB')) errors.push({ field: 'queryTemplateId', message: '사용 중인 DBMS용 쿼리 템플릿을 선택하세요.' });
    else if (current.os !== 'Windows' || !getServerRoles(current).includes('DB') || getServerProduct(current, 'DB') !== 'MSSQL') errors.push({ field: 'queryTemplateId', message: 'DB 쿼리 템플릿은 Windows MSSQL 점검에만 지정할 수 있습니다.' });
  }
  if (!getServerRoles(current).some((role) => role === 'WEB' || role === 'WAS') && (config.httpChecks?.length ?? 0) > 0) errors.push({ field: 'httpChecks', message: 'HTTP 점검은 WEB/WAS 역할이 있는 서버에만 설정할 수 있습니다.' });

  if (errors.length > 0) {
    throw new ValidationError(errors);
  }

  current.processes = config.processes ?? [];

  current.directories = config.directories ?? [];
  current.fileChecks = config.fileChecks ?? [];
  current.ports = config.ports ?? [];
  current.httpChecks = config.httpChecks ?? [];
  current.scriptParts = requestedScriptParts;
  current.roleChecks = roleChecks;
  current.rolePolicySettings = rolePolicySettings;
  current.customQueryTemplateIds = customQueryTemplateIds;
    current.policyIds = policyIds;
  current.queryTemplateId = config.queryTemplateId ?? '';

  persist(current);

  return {
    success: true,

    processes: current.processes,

    directories: current.directories,
    fileChecks: current.fileChecks,
    ports: current.ports,
    httpChecks: current.httpChecks,
    scriptParts: current.scriptParts,
    roleChecks: current.roleChecks,
    rolePolicySettings: current.rolePolicySettings,
    queryTemplateId: current.queryTemplateId,
    customQueryTemplateIds: current.customQueryTemplateIds,
    policyIds: current.policyIds,
  };
}
