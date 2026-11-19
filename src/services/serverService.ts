import fs from 'fs';

import { Server, ServerRole, ServerProduct, DirectoryCheck, FileCheck, HttpCheck, PortCheck, ProcessCheck } from '../types/server';
import type { ScriptPart } from '../types/template';

import { validateProcesses, validateDirectories, validateFileChecks, validatePorts, validateHttpChecks } from './serverValidation';

import { ValidationError } from '../types/error';
import { getTemplate } from './templateService';
import { getCommonCodes } from './commonCodeService';

const FILE = 'data/servers.json';

const COMMON_CODES = getCommonCodes();
const ROLES: ServerRole[] = COMMON_CODES.serverRoles.map(({ value }) => value as ServerRole);
const PRODUCTS = COMMON_CODES.productsByRole as Record<Exclude<ServerRole, 'OTHER'>, ServerProduct[]>;

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
  const scriptParts = { ...(server.scriptParts ?? {}) } as Partial<Record<ScriptPart, string>> & { OS_DISK?: string; WEBTOB?: string };
  if (scriptParts.WEBTOB && !scriptParts.WEB) scriptParts.WEB = scriptParts.WEBTOB;
  delete scriptParts.WEBTOB;
  delete scriptParts.OS_DISK;
  const { scriptTemplateId: _legacyScriptTemplateId, ...withoutLegacyOverride } = server as Server & { scriptTemplateId?: string };
  return { ...withoutLegacyOverride, roles, products, type, product: products[type], scriptParts };
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
    queryTemplateId: server.queryTemplateId ?? '',
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
    queryTemplateId?: string;
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
  const validParts: ScriptPart[] = ['START', 'HOST_INFO', 'CPU', 'MEMORY', 'UPTIME', 'DISK', 'PROCESS', 'DIRECTORY', 'FILE_SIZE', 'PORT', 'HTTP', 'WAS', 'WEB', 'DATABASE', 'SAVE'];
  for (const [part, templateId] of Object.entries(config.scriptParts ?? {})) {
    if (!validParts.includes(part as ScriptPart)) {
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
    queryTemplateId: servers[index].queryTemplateId,
  };
}

async function loadPolicy() {
  const response = await fetch(`/api/servers/${serverId}/check-config`);

  const config = await response.json();

  config.processes.forEach((process) => addProcessRow(process));

  config.directories.forEach((directory) => addDirectoryRow(directory));
}
