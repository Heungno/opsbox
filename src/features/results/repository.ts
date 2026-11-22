import { db } from '../../db/connection';
import type { CheckStatus, ImportStatus } from './types';

/* 점검 결과(check_results)와 가져오기 오류(result_import_errors) 테이블 */

export type ResultRow = { file_name: string; raw_json: string };

/** 최신 점검부터 */
const ORDER = 'ORDER BY check_date DESC, file_name DESC, id DESC';

export interface NewResultRow {
  serverId: string;
  fileName: string;
  checkDate: string;
  hostname: string | null;
  status: CheckStatus;
  cpu: number | null;
  memory: number | null;
  disk: number | null;
  fileHash: string;
  rawJson: string;
  backupPath: string;
}

export function insertResult(row: NewResultRow) {
  db.prepare(`
    INSERT INTO check_results (server_id, file_name, check_date, hostname, status, cpu, memory, disk, file_hash, raw_json, backup_path, imported_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(row.serverId, row.fileName, row.checkDate, row.hostname, row.status, row.cpu, row.memory, row.disk, row.fileHash, row.rawJson, row.backupPath, new Date().toISOString());
}

export function findBackupPathByHash(hash: string): { backup_path: string | null } | undefined {
  return db.prepare('SELECT backup_path FROM check_results WHERE file_hash = ?').get(hash) as { backup_path: string | null } | undefined;
}

export function updateBackupPath(hash: string, backupPath: string) {
  db.prepare('UPDATE check_results SET backup_path = ? WHERE file_hash = ?').run(backupPath, hash);
}

export function countResults(): number {
  return (db.prepare('SELECT COUNT(*) AS count FROM check_results').get() as { count: number }).count;
}

export function listResultFileNames(serverId: string): string[] {
  return (db.prepare(`SELECT file_name FROM check_results WHERE server_id = ? ${ORDER}`).all(serverId) as Array<{ file_name: string }>).map((row) => row.file_name);
}

export function listResultRows(serverId: string): ResultRow[] {
  return db.prepare(`SELECT file_name, raw_json FROM check_results WHERE server_id = ? ${ORDER}`).all(serverId) as ResultRow[];
}

export function findLatestResultRow(serverId: string): ResultRow | undefined {
  return db.prepare(`SELECT file_name, raw_json FROM check_results WHERE server_id = ? ${ORDER} LIMIT 1`).get(serverId) as ResultRow | undefined;
}

/** 같은 서버에 같은 파일 이름이 여럿이면 나중에 가져온 것 */
export function findResultRowByFile(serverId: string, fileName: string): ResultRow | undefined {
  return db.prepare('SELECT file_name, raw_json FROM check_results WHERE server_id = ? AND file_name = ? ORDER BY id DESC LIMIT 1').get(serverId, fileName) as ResultRow | undefined;
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

/** 목록용 요약(원본 JSON은 읽지 않음). 날짜 범위는 YYYY-MM-DD, 양 끝 포함. */
export function listResultSummaries(serverIds: string[], range: { startDate?: string; endDate?: string } = {}): ResultSummary[] {
  if (!serverIds.length) return [];
  const where = [`server_id IN (${serverIds.map(() => '?').join(', ')})`];
  const params: string[] = [...serverIds];
  if (range.startDate) { where.push('substr(check_date, 1, 10) >= ?'); params.push(range.startDate); }
  if (range.endDate) { where.push('substr(check_date, 1, 10) <= ?'); params.push(range.endDate); }
  return db.prepare(`
    SELECT server_id AS serverId, file_name AS fileName, check_date AS checkDate, hostname, status, cpu, memory, disk
    FROM check_results WHERE ${where.join(' AND ')} ${ORDER}
  `).all(...params) as unknown as ResultSummary[];
}

export function recordImportError(sourcePath: string, serverId: string | null, message: string) {
  const now = new Date().toISOString();
  db.prepare(`
    INSERT INTO result_import_errors (source_path, server_id, message, first_seen, last_seen) VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(source_path) DO UPDATE SET message = excluded.message, last_seen = excluded.last_seen
  `).run(sourcePath, serverId, message, now, now);
}

export function clearImportError(sourcePath: string) {
  db.prepare('DELETE FROM result_import_errors WHERE source_path = ?').run(sourcePath);
}

export function hasSameImportError(sourcePath: string, message: string): boolean {
  return Boolean(db.prepare('SELECT 1 FROM result_import_errors WHERE source_path = ? AND message = ?').get(sourcePath, message));
}

export function listImportErrors(): ImportStatus['pendingErrors'] {
  return db.prepare('SELECT source_path AS file, server_id AS serverId, message, first_seen AS firstSeen, last_seen AS lastSeen FROM result_import_errors ORDER BY last_seen DESC').all() as unknown as ImportStatus['pendingErrors'];
}
