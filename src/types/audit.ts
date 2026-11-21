/** 감사 로그(변경 이력) 작업 종류 */
export type AuditAction =
  | 'LOGIN_SUCCESS'
  | 'LOGIN_FAILURE'
  | 'LOGOUT'
  | 'SERVER_CREATE'
  | 'SERVER_UPDATE'
  | 'SERVER_DELETE'
  | 'SERVER_CHECK_CONFIG_UPDATE'
  | 'POLICY_CREATE'
  | 'POLICY_UPDATE'
  | 'POLICY_DELETE'
  | 'TEMPLATE_CREATE'
  | 'TEMPLATE_UPDATE'
  | 'TEMPLATE_DELETE'
  | 'TEMPLATE_RESTORE'
  | 'COMMON_CODE_UPDATE'
  | 'RESULT_IMPORT'
  | 'SCRIPT_DOWNLOAD';

export type AuditTargetType = 'AUTH' | 'SERVER' | 'POLICY' | 'TEMPLATE' | 'COMMON_CODE' | 'RESULT' | 'SCRIPT';

/** 바뀐 항목 한 건 (값이 길면 요약 문자열로 저장) */
export interface AuditChange {
  field: string;
  before?: unknown;
  after?: unknown;
}

export interface AuditLogEntry {
  id: number;
  /** ISO 시각 (UTC) */
  at: string;
  username: string;
  action: AuditAction;
  targetType: AuditTargetType;
  targetId: string | null;
  summary: string;
  changes: AuditChange[];
  detail: unknown;
  ip: string | null;
  requestId: string | null;
}

export interface AuditLogQuery {
  /** ISO 시각 이상 */
  from?: string;
  /** ISO 시각 이하 */
  to?: string;
  username?: string;
  action?: AuditAction | string;
  targetType?: AuditTargetType | string;
  /** 대상 ID·요약 검색어 */
  q?: string;
  page?: number | string;
  pageSize?: number | string;
}

export interface AuditLogPage {
  items: AuditLogEntry[];
  total: number;
  page: number;
  pageSize: number;
}

export interface AuditActionOption {
  value: AuditAction;
  label: string;
  targetType: AuditTargetType;
}
