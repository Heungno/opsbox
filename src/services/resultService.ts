import fs from 'fs';
import path from 'path';

import { getServer } from './serverService';

export interface CheckResult {
  fileName?: string;

  server: string;
  serverType: string;
  hostname: string;
  checkDate: string;

  cpu: number;
  memory: number;
  disk: number;

  network: string;
  logError: boolean;
  fileChecks?: Array<{ status?: string; exists?: boolean }>;
  disks?: Array<{ status?: string; usagePercent?: number }>;
  ports?: Array<{ listening?: boolean }>;
  httpChecks?: Array<{ success?: boolean }>;
  wasChecks?: Array<{ status?: string }>;
  webtobCheck?: { status?: string };
  databaseChecks?: { status?: string };
  rolePolicies?: Partial<Record<'WEB' | 'WAS' | 'DB', { status?: string; items?: Array<{ item?: string; name?: string; status?: string; message?: string; detail?: unknown }> }>>;
  summary?: { status?: string };
}

function readJsonFile(filePath: string) {
  const content = fs.readFileSync(filePath, 'utf8');

  const json = content.replace(/^\uFEFF/, '');

  const result = JSON.parse(json);
  if (result.schemaVersion >= 2 && result.checks) {
    const roles = result.server?.roles ?? [];
    const products = result.server?.products ?? {};
    const checks = result.checks;
    result.serverTypes = roles;
    result.serverType = roles[0] ?? 'OTHER';
    result.product = products[result.serverType];
    result.server = result.server?.id ?? result.server?.name ?? '';
    result.hostname = result.host?.hostname ?? '';
    result.checkDate = result.collectedAt ?? '';
    result.cpu = result.resources?.cpu?.usagePercent;
    result.memory = result.resources?.memory?.usagePercent;
    result.disk = result.resources?.disk?.maxUsagePercent;
    result.uptimeParts = result.host?.uptime ?? result.resources?.uptime?.parts ?? result.uptimeParts;
    result.disks = checks.resources?.disks ?? result.resources?.disk?.volumes ?? [];
    result.processes = checks.processes?.items ?? [];
    result.directories = checks.directories?.items ?? [];
    result.fileChecks = checks.files?.items ?? [];
    result.ports = checks.ports?.items ?? [];
    result.httpChecks = checks.http?.items ?? [];
    result.wasChecks = checks.was?.items ?? [];
    result.webtobCheck = products.WEB === 'WebtoB' ? checks.web?.detail : undefined;
    result.databaseChecks = checks.database?.detail;
    result.rolePolicies = checks.rolePolicies ?? {};
    result.logError = false;
  }
  if (Array.isArray(result.disks) && result.disks.length > 0) {
    const usages = result.disks
      .map((disk: { usagePercent?: number | string }) => Number(disk.usagePercent))
      .filter((usage: number) => Number.isFinite(usage));
    if (usages.length > 0) result.disk = Math.max(...usages);
  }
  return result;
}

function getResultsDirectory(serverId: string, year: string): string {
  const server = getServer(serverId);

  if (!server) {
    throw new Error(`Server not found: ${serverId}`);
  }

  return path.join(server.sharedPath, 'results', year, serverId);
}

function getYearFolders(serverId: string): string[] {
  const server = getServer(serverId);

  if (!server) {
    return [];
  }

  const resultsRoot = path.join(server.sharedPath, 'results');

  if (!fs.existsSync(resultsRoot)) {
    return [];
  }

  return fs
    .readdirSync(resultsRoot, {
      withFileTypes: true,
    })
    .filter((item) => item.isDirectory())
    .map((item) => item.name)
    .sort()
    .reverse();
}

export function getResultFiles(serverId: string): string[] {
  const years = getYearFolders(serverId);

  const files: string[] = [];

  years.forEach((year) => {
    const folder = getResultsDirectory(serverId, year);

    if (!fs.existsSync(folder)) {
      return;
    }

    const resultFiles = fs
      .readdirSync(folder)
      .filter((file) => file.endsWith('.json'))
      .map((file) => `${year}/${file}`);

    files.push(...resultFiles);
  });

  return files.sort().reverse();
}

export function getResults(serverId: string): CheckResult[] {
  const files = getResultFiles(serverId);

  return files.map((file) => {
    const [year, fileName] = file.split('/');

    const fullPath = path.join(getResultsDirectory(serverId, year), fileName);

    return {
      fileName,
      ...readJsonFile(fullPath),
    };
  });
}

export function getLatestResult(serverId: string): CheckResult | null {
  const files = getResultFiles(serverId);

  if (files.length === 0) {
    return null;
  }

  const [year, fileName] = files[0].split('/');

  const fullPath = path.join(getResultsDirectory(serverId, year), fileName);

  return {
    fileName,
    ...readJsonFile(fullPath),
  };
}

export function getResultByFile(serverId: string, fileName: string): CheckResult | null {
  const years = getYearFolders(serverId);

  for (const year of years) {
    const fullPath = path.join(getResultsDirectory(serverId, year), fileName);

    if (fs.existsSync(fullPath)) {
      return readJsonFile(fullPath) as CheckResult;
    }
  }

  return null;
}

export function getHealthStatus(result: CheckResult): string {
  // Version 2 results store the status calculated with the policy used during
  // collection. Keep historical reports tied to that snapshot instead of
  // re-evaluating them against today's policy thresholds.
  if (result.summary?.status) return result.summary.status;

  if (result.fileChecks?.some((file) => file.status === 'Critical' || file.exists === false)) return 'Critical';
  if (result.disks?.some((disk) => disk.status === 'Critical')) return 'Critical';
  if (result.ports?.some((port) => port.listening === false)) return 'Critical';
  if (result.httpChecks?.some((check) => check.success === false)) return 'Critical';
  if (result.wasChecks?.some((check) => check.status === 'Critical')) return 'Critical';
  if (result.webtobCheck?.status === 'Critical') return 'Critical';
  if (result.databaseChecks?.status === 'Critical') return 'Critical';
  const rolePolicyStatuses = Object.values(result.rolePolicies ?? {}).flatMap((role) => [role.status, ...(role.items ?? []).map((item) => item.status)]);
  if (rolePolicyStatuses.includes('Critical')) return 'Critical';
  const max = Math.max(result.cpu, result.memory, result.disk);

  if (max >= 90) {
    return 'Critical';
  }

  if (max >= 70) {
    return 'Warning';
  }

  if (result.fileChecks?.some((file) => file.status === 'Warning')) return 'Warning';
  if (result.disks?.some((disk) => disk.status === 'Warning')) return 'Warning';
  if (result.wasChecks?.some((check) => check.status === 'Warning')) return 'Warning';
  if (result.webtobCheck?.status === 'Warning') return 'Warning';
  if (result.databaseChecks?.status === 'Warning') return 'Warning';
  if (rolePolicyStatuses.includes('Warning')) return 'Warning';

  return 'Healthy';
}
