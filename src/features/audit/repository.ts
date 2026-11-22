import { db } from '../../db/connection';

/* 변경 이력(audit_logs) */

export interface AuditInsertRow {
  at: string; username: string; action: string; targetType: string; targetId: string | null;
  summary: string; changes: string | null; detail: string | null; ip: string | null; requestId: string | null;
}

export function insertAuditRow(row: AuditInsertRow) {
  db.prepare(`
    INSERT INTO audit_logs (at, username, action, target_type, target_id, summary, changes, detail, ip, request_id)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(row.at, row.username, row.action, row.targetType, row.targetId, row.summary, row.changes, row.detail, row.ip, row.requestId);
}

/** where: 서비스가 만든 조건절(값은 ? 자리표시자로 params에) */
export function countAuditRows(where: string, params: string[]): number {
  return (db.prepare(`SELECT COUNT(*) AS count FROM audit_logs ${where}`).get(...params) as { count: number }).count;
}

export function listAuditRows<T>(where: string, params: string[], limit: number, offset: number): T[] {
  return db.prepare(`SELECT * FROM audit_logs ${where} ORDER BY at DESC, id DESC LIMIT ? OFFSET ?`).all(...params, limit, offset) as unknown as T[];
}

export function deleteAuditRowsBefore(cutoff: string): number {
  return Number(db.prepare('DELETE FROM audit_logs WHERE at < ?').run(cutoff).changes);
}
