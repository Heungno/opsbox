import type { FastifyRequest } from 'fastify';

import '../../db'; // 스키마 준비
import { countAuditRows, deleteAuditRowsBefore, insertAuditRow, listAuditRows } from './repository';
import { logger } from '../../shared/logger';
import type { AuditAction, AuditActionOption, AuditChange, AuditLogEntry, AuditLogPage, AuditLogQuery, AuditTargetType } from './types';

/*
 * 감사 로그(변경 이력)
 *
 * 누가 / 언제 / 무엇을 / 어떻게 바꿨는지 audit_logs 테이블에 남깁니다.
 * 기록에 실패해도 원래 작업은 막지 않습니다 (애플리케이션 로그에만 오류를 남김).
 */

export const AUDIT_ACTIONS: AuditActionOption[] = [
  { value: 'LOGIN_SUCCESS', label: '로그인', targetType: 'AUTH' },
  { value: 'LOGIN_FAILURE', label: '로그인 실패', targetType: 'AUTH' },
  { value: 'LOGOUT', label: '로그아웃', targetType: 'AUTH' },
  { value: 'USER_PROFILE_UPDATE', label: '내 정보 수정', targetType: 'AUTH' },
  { value: 'USER_PASSWORD_CHANGE', label: '비밀번호 변경', targetType: 'AUTH' },
  { value: 'SERVER_CREATE', label: '서버 등록', targetType: 'SERVER' },
  { value: 'SERVER_UPDATE', label: '서버 정보 수정', targetType: 'SERVER' },
  { value: 'SERVER_DEACTIVATE', label: '서버 미사용', targetType: 'SERVER' },
  { value: 'SERVER_ACTIVATE', label: '서버 다시 사용', targetType: 'SERVER' },
  { value: 'SERVER_CHECK_CONFIG_UPDATE', label: '서버 점검 정책 저장', targetType: 'SERVER' },
  { value: 'SETTINGS_UPDATE', label: '설정 변경', targetType: 'SETTINGS' },
  { value: 'POLICY_CREATE', label: '점검 정책 추가', targetType: 'POLICY' },
  { value: 'POLICY_UPDATE', label: '점검 정책 수정', targetType: 'POLICY' },
  { value: 'POLICY_DELETE', label: '점검 정책 삭제', targetType: 'POLICY' },
  { value: 'TEMPLATE_CREATE', label: '템플릿 추가', targetType: 'TEMPLATE' },
  { value: 'TEMPLATE_UPDATE', label: '템플릿 수정', targetType: 'TEMPLATE' },
  { value: 'TEMPLATE_DELETE', label: '템플릿 삭제', targetType: 'TEMPLATE' },
  { value: 'TEMPLATE_RESTORE', label: '템플릿 버전 복원', targetType: 'TEMPLATE' },
  { value: 'COMMON_CODE_UPDATE', label: '공통코드 변경', targetType: 'COMMON_CODE' },
  { value: 'RESULT_IMPORT', label: '점검 결과 가져오기', targetType: 'RESULT' },
  { value: 'RESULT_UPLOAD', label: '점검 결과 올리기', targetType: 'RESULT' },
  { value: 'SCRIPT_DOWNLOAD', label: '점검 스크립트 다운로드', targetType: 'SCRIPT' },
];

const MAX_VALUE_LENGTH = 300;
/** 비교에서 뺄 항목 (자동으로 바뀌는 값, 비밀값) */
const IGNORED_FIELDS = new Set(['updatedAt', 'passwordHash', 'passwordSalt', 'password']);

/** 변경 내용에 넣을 값. 길면 요약해서 DB가 커지지 않게 합니다. */
function compactValue(value: unknown): unknown {
  if (value === undefined) return undefined;
  if (typeof value === 'string') {
    if (value.length <= MAX_VALUE_LENGTH) return value;
    const lines = value.split('\n').length;
    return `(긴 텍스트 ${value.length.toLocaleString()}자, ${lines.toLocaleString()}줄)`;
  }
  if (value === null || typeof value !== 'object') return value;
  const json = JSON.stringify(value);
  if (json.length <= MAX_VALUE_LENGTH) return value;
  if (Array.isArray(value)) return `(목록 ${value.length.toLocaleString()}건)`;
  return `(항목 ${Object.keys(value).length.toLocaleString()}개)`;
}

/** 두 객체의 1단계 항목을 비교해 바뀐 것만 돌려줍니다. */
export function diffObjects(before: unknown, after: unknown): AuditChange[] {
  const a = (before && typeof before === 'object' ? before : {}) as Record<string, unknown>;
  const b = (after && typeof after === 'object' ? after : {}) as Record<string, unknown>;
  const fields = [...new Set([...Object.keys(a), ...Object.keys(b)])].filter((field) => !IGNORED_FIELDS.has(field));
  const changes: AuditChange[] = [];
  for (const field of fields) {
    if (JSON.stringify(a[field]) === JSON.stringify(b[field])) continue;
    const isEmpty = (value: unknown) => value === undefined || value === null || value === '' || (Array.isArray(value) && value.length === 0);
    if (isEmpty(a[field]) && isEmpty(b[field])) continue;
    changes.push({ field, before: compactValue(a[field]), after: compactValue(b[field]) });
  }
  return changes;
}

export interface AuditInput {
  action: AuditAction;
  targetType?: AuditTargetType;
  targetId?: string | null;
  summary: string;
  /** 변경 전/후 값을 주면 바뀐 항목을 계산해 저장합니다. */
  before?: unknown;
  after?: unknown;
  changes?: AuditChange[];
  detail?: unknown;
  /** 요청이 없거나(스케줄러) 로그인 전이면 직접 지정 */
  username?: string;
}

export function recordAudit(request: FastifyRequest | null, input: AuditInput) {
  try {
    const option = AUDIT_ACTIONS.find((item) => item.value === input.action);
    const changes = input.changes ?? (input.before !== undefined || input.after !== undefined ? diffObjects(input.before, input.after) : []);
    insertAuditRow({
      at: new Date().toISOString(),
      username: input.username ?? request?.user?.username ?? 'system',
      action: input.action,
      targetType: input.targetType ?? option?.targetType ?? 'AUTH',
      targetId: input.targetId ?? null,
      summary: input.summary,
      changes: changes.length ? JSON.stringify(changes) : null,
      detail: input.detail === undefined ? null : JSON.stringify(input.detail),
      ip: request?.ip ?? null,
      requestId: request ? String(request.id) : null,
    });
  } catch (error) {
    logger.error({ err: error, action: input.action, targetId: input.targetId }, '감사 로그 기록 실패');
  }
}

type AuditRow = {
  id: number;
  at: string;
  username: string;
  action: string;
  target_type: string;
  target_id: string | null;
  summary: string;
  changes: string | null;
  detail: string | null;
  ip: string | null;
  request_id: string | null;
};

function parseJson(value: string | null, fallback: unknown) {
  if (!value) return fallback;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function toEntry(row: AuditRow): AuditLogEntry {
  return {
    id: row.id,
    at: row.at,
    username: row.username,
    action: row.action as AuditAction,
    targetType: row.target_type as AuditTargetType,
    targetId: row.target_id,
    summary: row.summary,
    changes: parseJson(row.changes, []) as AuditChange[],
    detail: parseJson(row.detail, null),
    ip: row.ip,
    requestId: row.request_id,
  };
}

export function listAuditLogs(query: AuditLogQuery = {}): AuditLogPage {
  const page = Math.max(1, Math.floor(Number(query.page) || 1));
  const pageSize = Math.min(200, Math.max(1, Math.floor(Number(query.pageSize) || 50)));
  const where: string[] = [];
  const params: string[] = [];

  if (query.from) { where.push('at >= ?'); params.push(String(query.from)); }
  if (query.to) { where.push('at <= ?'); params.push(String(query.to)); }
  if (query.username?.trim()) { where.push('username LIKE ? COLLATE NOCASE'); params.push(`%${query.username.trim()}%`); }
  if (query.action) { where.push('action = ?'); params.push(String(query.action)); }
  if (query.targetType) { where.push('target_type = ?'); params.push(String(query.targetType)); }
  if (query.q?.trim()) {
    where.push('(target_id LIKE ? COLLATE NOCASE OR summary LIKE ? COLLATE NOCASE)');
    params.push(`%${query.q.trim()}%`, `%${query.q.trim()}%`);
  }

  const clause = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const total = countAuditRows(clause, params);
  const rows = listAuditRows<AuditRow>(clause, params, pageSize, (page - 1) * pageSize);
  return { items: rows.map(toEntry), total, page, pageSize };
}

/** 보관 기간(OPSBOX_AUDIT_RETENTION_DAYS, 기본 365일, 0이면 계속 보관)이 지난 기록 삭제 */
export function purgeOldAuditLogs() {
  const days = Number(process.env.OPSBOX_AUDIT_RETENTION_DAYS ?? 365);
  if (!Number.isFinite(days) || days <= 0) return 0;
  const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
  const removed = deleteAuditRowsBefore(cutoff);
  if (removed) logger.info({ removed, cutoff }, '보관 기간이 지난 감사 로그를 삭제했습니다');
  return removed;
}
