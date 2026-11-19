import fs from 'fs';

import { Server, ServerRole, ServerProduct, RolePolicyType, DirectoryCheck, FileCheck, HttpCheck, PortCheck, ProcessCheck } from '../types/server';
import type { ScriptPart } from '../types/template';

import { validateProcesses, validateDirectories, validateFileChecks, validatePorts, validateHttpChecks } from './serverValidation';

import { NotFoundError, ValidationError } from '../types/error';
import { getTemplate } from './templateService';
import { getCommonCodes } from './commonCodeService';

const FILE = 'data/servers.json';

const COMMON_CODES = getCommonCodes();
const ROLES: ServerRole[] = COMMON_CODES.serverRoles.map(({ value }) => value as ServerRole);
const PRODUCTS = COMMON_CODES.productsByRole as Record<Exclude<ServerRole, 'OTHER'>, ServerProduct[]>;
const ROLE_POLICY_TYPES: RolePolicyType[] = ['WEB', 'WAS', 'DB'];
const DEFAULT_ROLE_CHECKS: Partial<Record<RolePolicyType, ScriptPart[]>> = {
  WEB: getTemplate('WINDOWS-PART-WEB_ENGINE_STATUS') ? ['WEB_ENGINE_STATUS'] : [],
  WAS: getTemplate('WINDOWS-PART-WAS_JVM_HEAP') ? ['WAS_JVM_HEAP'] : [],
  DB: getTemplate('WINDOWS-PART-DB_INSTANCE_STATUS') ? ['DB_INSTANCE_STATUS'] : [],
};

export function getServerRoles(server: Pick<Server, 'type' | 'roles'>): ServerRole[] {
  const roles = Array.isArray(server.roles) ? server.roles.filter((role): role is ServerRole => ROLES.includes(role)) : [];
  return [...new Set(roles.length ? roles : [server.type])];
}

export function getServerProduct(server: Pick<Server, 'type' | 'product' | 'products'>, role: ServerRole): ServerProduct | undefined {
  return server.products?.[role] ?? (server.type === role ? server.product : undefined);
}

function normalizeServer(server: Server): Server {
  const roles = getServerRoles(server);
  const products = { ...(server.products ?? {}) };
  if (server.product && !products[server.type]) products[server.type] = server.product;
  const type = roles.includes(server.type) ? server.type : roles[0];
  const roleChecks = { ...(server.roleChecks ?? {}) } as Partial<Record<RolePolicyType, ScriptPart[]>>;
  ROLE_POLICY_TYPES.forEach((role) => {
    if (!roles.includes(role)) { delete roleChecks[role]; return; }
    if (!Array.isArray(roleChecks[role])) roleChecks[role] = server.os === 'Windows' ? (DEFAULT_ROLE_CHECKS[role] ?? []) : [];
    roleChecks[role] = [...new Set(roleChecks[role])];
  });
  const customQueryTemplateIds = Array.isArray(server.customQueryTemplateIds) ? [...new Set(server.customQueryTemplateIds)] : [];
  const scriptParts = { ...(server.scriptParts ?? {}) } as Partial<Record<ScriptPart, string>> & { OS_DISK?: string; WEBTOB?: string };
  if (scriptParts.WEBTOB && !scriptParts.WEB) scriptParts.WEB = scriptParts.WEBTOB === 'WINDOWS-PART-WEBTOB' ? 'WINDOWS-PART-WEB_ENGINE_STATUS' : scriptParts.WEBTOB;
  delete scriptParts.WEBTOB;
  delete scriptParts.OS_DISK;
  const legacyRoleParts: Array<[keyof typeof scriptParts, ScriptPart]> = [
    ['WEB', 'WEB_ENGINE_STATUS'], ['WAS', 'WAS_JVM_HEAP'], ['DATABASE', 'DB_INSTANCE_STATUS'],
  ];
  legacyRoleParts.forEach(([legacy, current]) => {
    if (scriptParts[legacy] && !scriptParts[current]) {
      const legacyId = scriptParts[legacy];
      scriptParts[current] = legacyId === `WINDOWS-PART-${legacy}` ? `WINDOWS-PART-${current}` : legacyId;
    }
    delete scriptParts[legacy];
  });
  const { scriptTemplateId: _legacyScriptTemplateId, ...withoutLegacyOverride } = server as Server & { scriptTemplateId?: string };
  return { ...withoutLegacyOverride, roles, products, type, product: products[type], scriptParts, roleChecks, customQueryTemplateIds };
}

function read(): Server[] {
  return (JSON.parse(fs.readFileSync(FILE, 'utf8')) as Server[]).map(normalizeServer);
}

function write(data: Server[]) {
  fs.writeFileSync(FILE, JSON.stringify(data, null, 2));
}

function validateServer(server: Partial<Server>, servers: Server[], currentId?: string) {
  const errors = [];
  const roles = Array.isArray(server.roles) && server.roles.length ? [...new Set(server.roles)] : server.type ? [server.type] : [];
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

  if (server.id && servers.some((s) => s.id === server.id && s.id !== currentId)) {
    errors.push({
      field: 'id',
      message: `이미 존재하는 서버 ID 입니다. (${server.id})`,
    });
  }

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
    if (role === 'OTHER') continue;
    const product = server.products?.[role] ?? (server.type === role ? server.product : undefined);
    if (!product || !PRODUCTS[role].includes(product)) errors.push({ field: `products.${role}`, message: `${role} 제품을 선택해야 합니다.` });
  }
  if (!roles.some((role) => role === 'WEB' || role === 'WAS') && (server.httpChecks?.length ?? 0) > 0) errors.push({ field: 'httpChecks', message: 'HTTP 점검은 WEB/WAS 역할이 있는 서버에만 설정할 수 있습니다.' });
  if (server.os === 'Linux' && (server.httpChecks?.length ?? 0) > 0) errors.push({ field: 'httpChecks', message: 'Linux HTTP 점검은 후속 단계에서 지원할 예정입니다.' });

  if (errors.length > 0) {
    throw new ValidationError(errors);
  }
}

export function getAllServers() {
  return read();
}

export function getServer(id: string) {
  return read().find((server) => server.id === id);
}

export function createServer(server: Server) {
  const servers = read();

  const normalized = normalizeServer(server);
  validateServer(normalized, servers);

  servers.push(normalized);

  write(servers);

  return normalized;
}

export function updateServer(id: string, data: Partial<Server>) {
  const servers = read();

  const index = servers.findIndex((server) => server.id === id);

  if (index === -1) {
    throw new Error(`Server not found: ${id}`);
  }

  const updatedServer = normalizeServer({
    ...servers[index],
    ...data,
  });

  validateServer(updatedServer, servers, id);

  servers[index] = updatedServer;

  write(servers);

  return servers[index];
}

export function deleteServer(id: string) {
  const servers = read();

  const exists = servers.some((server) => server.id === id);

  if (!exists) {
    throw new Error(`Server not found: ${id}`);
  }

  const filtered = servers.filter((server) => server.id !== id);

  write(filtered);

  return true;
}

export function getCheckConfig(id: string) {
  const server = getServer(id);

  if (!server) {
    throw new NotFoundError(`Server not found: ${id}`);
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
  };
}

export function updateCheckConfig(
  id: string,

  config: {
    processes?: ProcessCheck[];

    directories?: DirectoryCheck[];
    fileChecks?: FileCheck[];
    ports?: PortCheck[];
    httpChecks?: HttpCheck[];
    scriptParts?: Partial<Record<ScriptPart, string>>;
    roleChecks?: Partial<Record<RolePolicyType, ScriptPart[]>>;
    rolePolicySettings?: Server['rolePolicySettings'];
    queryTemplateId?: string;
    customQueryTemplateIds?: string[];
  },
) {
  const servers = read();

  const index = servers.findIndex((server) => server.id === id);

  if (index === -1) {
    throw new NotFoundError(`Server not found: ${id}`);
  }

  const processValidation = validateProcesses(config.processes ?? []);

  const directoryValidation = validateDirectories(config.directories ?? []);
  const fileCheckValidation = validateFileChecks(config.fileChecks ?? []);
  const portValidation = validatePorts(config.ports ?? []);
  const httpValidation = validateHttpChecks(config.httpChecks ?? []);

  const errors = [...processValidation.errors, ...directoryValidation.errors, ...fileCheckValidation.errors, ...portValidation.errors, ...httpValidation.errors];
  const validParts = new Set<ScriptPart>(['START', 'SAVE', ...COMMON_CODES.scriptItems.map(({ value }) => value as ScriptPart)]);
  const roleChecks = config.roleChecks ?? servers[index].roleChecks ?? {};
  const rolePolicySettings = { ...(servers[index].rolePolicySettings ?? {}), ...(config.rolePolicySettings ?? {}) };
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
  for (const item of ['DB_INSTANCE_STATUS', 'DB_CUSTOM_QUERY'] as const) {
    if (!(roleChecks.DB ?? []).includes(item)) continue;
    if (servers[index].os !== 'Windows' || getServerProduct(servers[index], 'DB') !== 'MSSQL') continue;
    const selectedId = config.scriptParts?.[item] ?? servers[index].scriptParts?.[item] ?? `WINDOWS-PART-${item}`;
    const script = getTemplate(selectedId);
    if (script?.usesQueryTemplate !== true) continue;
    const setting = rolePolicySettings[item] ?? {};
    const rawTargets: unknown = setting.instanceTargets;
    const targets: unknown = typeof rawTargets === 'string'
      ? rawTargets.split(/\r?\n/).map((target) => target.trim()).filter(Boolean)
      : rawTargets;
    if (!Array.isArray(targets) || targets.length === 0 || targets.some((target: unknown) => typeof target !== 'string' || !target.trim() || target.length > 512)) {
      errors.push({ field: `rolePolicySettings.${item}.instanceTargets`, message: '쿼리 점검에 사용할 MSSQL 인스턴스 대상을 하나 이상 입력하세요.' });
    } else {
      setting.instanceTargets = [...new Set((targets as string[]).map((target) => target.trim()))];
      rolePolicySettings[item] = setting;
    }
  }
  const requestedCustomQueryIds = config.customQueryTemplateIds ?? servers[index].customQueryTemplateIds ?? [];
  const customQueryTemplateIds = Array.isArray(requestedCustomQueryIds) ? requestedCustomQueryIds.filter((id): id is string => typeof id === 'string') : [];
  if (!Array.isArray(requestedCustomQueryIds)) errors.push({ field: 'customQueryTemplateIds', message: 'DB 쿼리 템플릿 목록 형식이 올바르지 않습니다.' });
  for (const role of ROLE_POLICY_TYPES) {
    const items = roleChecks[role] ?? [];
    if (!getServerRoles(servers[index]).includes(role) && items.length) errors.push({ field: `roleChecks.${role}`, message: `${role} 역할이 있는 서버에서만 항목을 설정할 수 있습니다.` });
    if (new Set(items).size !== items.length) errors.push({ field: `roleChecks.${role}`, message: `${role} 점검 항목을 중복 등록할 수 없습니다.` });
    items.forEach((item) => {
      if (!COMMON_CODES.rolePolicies[role]?.includes(item)) errors.push({ field: `roleChecks.${role}`, message: `${role} 점검 항목이 올바르지 않습니다.` });
      const selectedId = config.scriptParts?.[item] ?? servers[index].scriptParts?.[item];
      const defaultTemplate = getTemplate(`WINDOWS-PART-${item}`);
      if (!selectedId && !defaultTemplate) errors.push({ field: `roleChecks.${role}`, message: `${item} 항목 스크립트를 먼저 스크립트 관리에서 만들고 선택하세요.` });
    });
  }
  const dbCustomQueryEnabled = (roleChecks.DB ?? []).includes('DB_CUSTOM_QUERY');
  const customQueryScriptId = config.scriptParts?.DB_CUSTOM_QUERY ?? servers[index].scriptParts?.DB_CUSTOM_QUERY;
  const customQueryScript = getTemplate(customQueryScriptId ?? 'WINDOWS-PART-DB_CUSTOM_QUERY');
  if (new Set(customQueryTemplateIds).size !== customQueryTemplateIds.length) errors.push({ field: 'customQueryTemplateIds', message: '기타 쿼리 템플릿을 중복 등록할 수 없습니다.' });
  if (dbCustomQueryEnabled) {
    if (servers[index].os !== 'Windows' || getServerProduct(servers[index], 'DB') !== 'MSSQL') errors.push({ field: 'customQueryTemplateIds', message: '기타 쿼리 실행은 현재 Windows MSSQL 서버에서만 지원합니다.' });
    if (customQueryScript?.usesQueryTemplate !== true) errors.push({ field: 'scriptParts.DB_CUSTOM_QUERY', message: '기타 쿼리 스크립트에서 실행 쿼리 템플릿 사용을 켜세요.' });
    if (customQueryTemplateIds.length === 0) errors.push({ field: 'customQueryTemplateIds', message: '기타 쿼리 항목에 실행할 쿼리를 하나 이상 선택하세요.' });
  } else if (customQueryTemplateIds.length > 0) {
    errors.push({ field: 'customQueryTemplateIds', message: 'DB 기타 쿼리 점검 항목을 추가한 후 쿼리를 선택하세요.' });
  }
  customQueryTemplateIds.forEach((templateId) => {
    const template = getTemplate(templateId);
    if (!template || !template.enabled || template.kind !== 'QUERY') errors.push({ field: 'customQueryTemplateIds', message: '사용할 수 없는 DB 쿼리 템플릿이 포함되어 있습니다.' });
  });
  for (const [part, templateId] of Object.entries(config.scriptParts ?? {})) {
    if (!validParts.has(part as ScriptPart)) {
      errors.push({ field: `scriptParts.${part}`, message: '스크립트 점검 항목이 올바르지 않습니다.' });
      continue;
    }
    if (!templateId) continue;
    const template = getTemplate(templateId);
    if (!template || !template.enabled || template.kind !== 'SCRIPT_PART' || template.os !== 'Windows' || template.item !== part) {
      errors.push({ field: `scriptParts.${part}`, message: `${part} 점검에 사용할 Windows 템플릿을 선택하세요.` });
    }
  }
  if (config.queryTemplateId) {
    const template = getTemplate(config.queryTemplateId);
    if (!template || !template.enabled || template.kind !== 'QUERY') errors.push({ field: 'queryTemplateId', message: '사용 중인 DB 쿼리 템플릿을 선택하세요.' });
    else if (servers[index].os !== 'Windows' || !getServerRoles(servers[index]).includes('DB') || getServerProduct(servers[index], 'DB') !== 'MSSQL') errors.push({ field: 'queryTemplateId', message: 'DB 쿼리 템플릿은 Windows MSSQL 점검에만 지정할 수 있습니다.' });
    else {
      const statusScriptId = config.scriptParts?.DB_INSTANCE_STATUS ?? servers[index].scriptParts?.DB_INSTANCE_STATUS;
      const statusScript = getTemplate(statusScriptId ?? 'WINDOWS-PART-DB_INSTANCE_STATUS');
      if (statusScript?.usesQueryTemplate !== true) errors.push({ field: 'scriptParts.DB_INSTANCE_STATUS', message: '선택한 DB 인스턴스 스크립트에서 실행 쿼리 템플릿 사용을 켜세요.' });
    }
  }
  if (!getServerRoles(servers[index]).some((role) => role === 'WEB' || role === 'WAS') && (config.httpChecks?.length ?? 0) > 0) errors.push({ field: 'httpChecks', message: 'HTTP 점검은 WEB/WAS 역할이 있는 서버에만 설정할 수 있습니다.' });
  if (servers[index].os === 'Linux' && (config.httpChecks?.length ?? 0) > 0) errors.push({ field: 'httpChecks', message: 'Linux HTTP 점검은 후속 단계에서 지원할 예정입니다.' });

  if (errors.length > 0) {
    throw new ValidationError(errors);
  }

  servers[index].processes = config.processes ?? [];

  servers[index].directories = config.directories ?? [];
  servers[index].fileChecks = config.fileChecks ?? [];
  servers[index].ports = config.ports ?? [];
  servers[index].httpChecks = config.httpChecks ?? [];
  servers[index].scriptParts = config.scriptParts ?? servers[index].scriptParts ?? {};
  servers[index].roleChecks = roleChecks;
  servers[index].rolePolicySettings = rolePolicySettings;
  servers[index].customQueryTemplateIds = customQueryTemplateIds;
  servers[index].queryTemplateId = config.queryTemplateId ?? '';

  write(servers);

  return {
    success: true,

    processes: servers[index].processes,

    directories: servers[index].directories,
    fileChecks: servers[index].fileChecks,
    ports: servers[index].ports,
    httpChecks: servers[index].httpChecks,
    scriptParts: servers[index].scriptParts,
    roleChecks: servers[index].roleChecks,
    rolePolicySettings: servers[index].rolePolicySettings,
    queryTemplateId: servers[index].queryTemplateId,
    customQueryTemplateIds: servers[index].customQueryTemplateIds,
  };
}
