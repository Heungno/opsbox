import fs from 'fs';

import { Server, DirectoryCheck, FileCheck, HttpCheck, PortCheck, ProcessCheck } from '../types/server';

import { validateProcesses, validateDirectories, validateFileChecks, validatePorts, validateHttpChecks } from './serverValidation';

import { ValidationError } from '../types/error';

const FILE = 'data/servers.json';

function read(): Server[] {
  return JSON.parse(fs.readFileSync(FILE, 'utf8'));
}

function write(data: Server[]) {
  fs.writeFileSync(FILE, JSON.stringify(data, null, 2));
}

function validateServer(server: Partial<Server>, servers: Server[], currentId?: string) {
  const errors = [];

  if (!['WEB', 'WAS', 'DB', 'OTHER'].includes(server.type ?? '')) {
    errors.push({ field: 'type', message: '서버 유형은 WEB, WAS, DB, 기타 중 하나여야 합니다.' });
  }

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
  const webProducts = ['WebtoB', 'Apache HTTP Server', 'IIS', 'Nginx'];
  const wasProducts = ['JEUS', 'Apache Tomcat', 'JBoss', 'Node.js'];
  const dbProducts = ['MSSQL', 'MariaDB', 'CUBRID', 'PostgreSQL'];
  if (server.type === 'DB' && !server.product) errors.push({ field: 'product', message: 'DB 제품(MSSQL, MariaDB, CUBRID, PostgreSQL)을 선택해야 합니다.' });
  if (server.product && (server.type === 'WEB' ? !webProducts.includes(server.product) : server.type === 'WAS' ? !wasProducts.includes(server.product) : server.type === 'DB' ? !dbProducts.includes(server.product) : true)) errors.push({ field: 'product', message: '서버 유형에 맞는 제품을 선택해야 합니다.' });
  if (server.type === 'DB' && (server.httpChecks?.length ?? 0) > 0) errors.push({ field: 'httpChecks', message: 'HTTP 점검은 WEB/WAS 서버에만 설정할 수 있습니다.' });
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

  validateServer(server, servers);

  console.error(server);
  servers.push(server);

  write(servers);

  return server;
}

export function updateServer(id: string, data: Partial<Server>) {
  const servers = read();

  const index = servers.findIndex((server) => server.id === id);

  if (index === -1) {
    throw new Error(`Server not found: ${id}`);
  }

  const updatedServer = {
    ...servers[index],
    ...data,
  };

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
  if (servers[index].type === 'DB' && (config.httpChecks?.length ?? 0) > 0) errors.push({ field: 'httpChecks', message: 'HTTP 점검은 WEB/WAS 서버에만 설정할 수 있습니다.' });
  if (servers[index].os === 'Linux' && (config.httpChecks?.length ?? 0) > 0) errors.push({ field: 'httpChecks', message: 'Linux HTTP 점검은 후속 단계에서 지원할 예정입니다.' });

  if (errors.length > 0) {
    throw new ValidationError(errors);
  }

  servers[index].processes = config.processes ?? [];

  servers[index].directories = config.directories ?? [];
  servers[index].fileChecks = config.fileChecks ?? [];
  servers[index].ports = config.ports ?? [];
  servers[index].httpChecks = config.httpChecks ?? [];

  write(servers);

  return {
    success: true,

    processes: servers[index].processes,

    directories: servers[index].directories,
    fileChecks: servers[index].fileChecks,
    ports: servers[index].ports,
    httpChecks: servers[index].httpChecks,
  };
}

async function loadPolicy() {
  const response = await fetch(`/api/servers/${serverId}/check-config`);

  const config = await response.json();

  config.processes.forEach((process) => addProcessRow(process));

  config.directories.forEach((directory) => addDirectoryRow(directory));
}
