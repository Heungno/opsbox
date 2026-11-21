import { db } from '../db/database';
import type { CheckResult, CheckStatus } from '../types/result';

export type { CheckResult } from '../types/result';

/*
 * 점검 결과 원본 JSON 문자열을 화면에서 쓰는 형태로 정규화합니다.
 * (스키마 v2 → 기존 필드 이름으로 펼치기, 디스크 최대 사용률 계산)
 */
export function parseResultJson(content: string) {
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
  return result as CheckResult;
}

type ResultRow = { file_name: string; raw_json: string };

function toResult(row: ResultRow): CheckResult {
  return { fileName: row.file_name, ...parseResultJson(row.raw_json) };
}

const ORDER = 'ORDER BY check_date DESC, file_name DESC, id DESC';

export function getResultFiles(serverId: string): string[] {
  const rows = db.prepare(`SELECT file_name FROM check_results WHERE server_id = ? ${ORDER}`).all(serverId) as Array<{ file_name: string }>;
  return rows.map((row) => row.file_name);
}

export function getResults(serverId: string): CheckResult[] {
  const rows = db.prepare(`SELECT file_name, raw_json FROM check_results WHERE server_id = ? ${ORDER}`).all(serverId) as ResultRow[];
  return rows.map(toResult);
}

export function getLatestResult(serverId: string): CheckResult | null {
  const row = db.prepare(`SELECT file_name, raw_json FROM check_results WHERE server_id = ? ${ORDER} LIMIT 1`).get(serverId) as ResultRow | undefined;
  return row ? toResult(row) : null;
}

export function getResultByFile(serverId: string, fileName: string): CheckResult | null {
  const row = db.prepare(`SELECT file_name, raw_json FROM check_results WHERE server_id = ? AND file_name = ? ORDER BY id DESC LIMIT 1`).get(serverId, fileName) as ResultRow | undefined;
  return row ? parseResultJson(row.raw_json) : null;
}

const CHECK_STATUSES: readonly string[] = ['Healthy', 'Warning', 'Critical', 'NotCollected'];

export function getHealthStatus(result: CheckResult): CheckStatus {
  // 스키마 v2 결과에는 수집할 때의 정책으로 계산한 상태가 들어 있습니다.
  // 지난 보고서를 지금 정책 기준으로 다시 판정하지 않도록 그 값을 그대로 씁니다.
  const snapshot = result.summary?.status;
  if (snapshot && CHECK_STATUSES.includes(snapshot)) return snapshot as CheckStatus;

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
