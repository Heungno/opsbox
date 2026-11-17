import fs from 'fs';
import { Server } from '../types/server';

const FILE = 'data/servers.json';

function read(): Server[] {
  return JSON.parse(fs.readFileSync(FILE, 'utf8'));
}

function write(data: Server[]) {
  fs.writeFileSync(FILE, JSON.stringify(data, null, 2));
}

export function getAllServers() {
  return read();
}

export function getServer(id: string) {
  return read().find((server) => server.id === id);
}

export function createServer(server: Server) {
  const servers = read();

  servers.push(server);

  write(servers);

  return server;
}

export function updateServer(id: string, data: Partial<Server>) {
  const servers = read();

  const idx = servers.findIndex((s) => s.id === id);

  if (idx === -1) {
    return null;
  }

  servers[idx] = {
    ...servers[idx],
    ...data,
  };

  write(servers);

  return servers[idx];
}

export function deleteServer(id: string) {
  const servers = read();
  const exists = servers.some((server) => server.id === id);

  if (!exists) {
    throw new NotFoundError(`서버를 찾을 수 없습니다. (${id})`);
  }

  const filtered = servers.filter((server) => server.id !== id);
  write(filtered);
  return true;
}
