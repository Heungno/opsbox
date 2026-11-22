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

export interface ResultSummary {
  serverId: string;
  fileName: string;
  checkDate: string;
  hostname: string | null;
  status: CheckStatus;
  cpu: number | null;
  memory: number | null;
  disk: number | null;
}

/*
 * 목록용 요약: 가져올 때 저장한 요약 열(check_date·status·cpu·memory·disk)만 읽고,
 * 원본 JSON은 호스트 이름만 SQLite에서 꺼냅니다(전체를 JS로 파싱하지 않음).
 * 점검 일시가 없는 결과는 뺍니다. 날짜 범위는 YYYY-MM-DD, 양 끝 포함.
 */
export function getResultSummaries(serverIds: string[], range: { startDate?: string; endDate?: string } = {}): ResultSummary[] {
  if (!serverIds.length) return [];
  const where = [`server_id IN (${serverIds.map(() => '?').join(', ')})`, 'check_date IS NOT NULL', "check_date <> ''"];
  const params: string[] = [...serverIds];
  if (range.startDate) { where.push('substr(check_date, 1, 10) >= ?'); params.push(range.startDate); }
  if (range.endDate) { where.push('substr(check_date, 1, 10) <= ?'); params.push(range.endDate); }
  return db.prepare(`
    SELECT server_id AS serverId, file_name AS fileName, check_date AS checkDate, status, cpu, memory, disk,
      CASE WHEN NOT json_valid(raw_json) THEN NULL
           WHEN json_extract(raw_json, '$.schemaVersion') >= 2 AND json_type(raw_json, '$.checks') IS NOT NULL
             THEN json_extract(raw_json, '$.host.hostname')
           ELSE json_extract(raw_json, '$.hostname') END AS hostname
    FROM check_results WHERE ${where.join(' AND ')} ${ORDER}
  `).all(...params) as unknown as ResultSummary[];
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
