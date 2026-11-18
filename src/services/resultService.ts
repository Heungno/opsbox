import fs from 'fs';
import path from 'path';

import { getServer } from './serverService';
import { CheckResult } from '../types/result';

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
}

function readJsonFile(filePath: string) {
  const content = fs.readFileSync(filePath, 'utf8');

  const json = content.replace(/^\uFEFF/, '');

  return JSON.parse(json);
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
  if (result.fileChecks?.some((file) => file.status === 'Critical' || file.exists === false)) return 'Critical';
  const max = Math.max(result.cpu, result.memory, result.disk);

  if (max >= 90) {
    return 'Critical';
  }

  if (max >= 70) {
    return 'Warning';
  }

  if (result.fileChecks?.some((file) => file.status === 'Warning')) return 'Warning';

  return 'Healthy';
}
