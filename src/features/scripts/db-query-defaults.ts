import type { ManagedTemplate } from '../templates/types';

/*
 * DB 제품별 기본 쿼리 템플릿
 *
 * 정책 항목(DB_INSTANCE_STATUS 등)마다 서버의 DB 제품에 맞는 기본 쿼리가 있습니다.
 *   MSSQL: WINDOWS-QUERY-<항목> (Windows·Linux 공통, T-SQL)
 *   PostgreSQL / MariaDB / CUBRID: <제품>-QUERY-<항목>
 * 화면(server-detail.js)에도 같은 규칙이 있으니 바꿀 때 함께 고치세요.
 */
const DEFAULT_QUERY_PREFIX: Record<string, string> = {
  MSSQL: 'WINDOWS-QUERY',
  PostgreSQL: 'POSTGRESQL-QUERY',
  MariaDB: 'MARIADB-QUERY',
  CUBRID: 'CUBRID-QUERY',
};

/** Linux 점검 스크립트가 쿼리를 실행할 수 있는 DB 제품 */
export const LINUX_DB_PRODUCTS: readonly string[] = ['PostgreSQL', 'MariaDB', 'MSSQL', 'CUBRID'];

export function defaultQueryTemplateId(dbms: string | undefined, item: string): string | undefined {
  const prefix = DEFAULT_QUERY_PREFIX[dbms ?? ''];
  return prefix ? `${prefix}-${item}` : undefined;
}

export function isQueryFor(template: ManagedTemplate | undefined, dbms: string | undefined): template is ManagedTemplate {
  return !!template && template.enabled && template.kind === 'QUERY' && (template.dbms ?? 'MSSQL') === dbms;
}

/**
 * 항목에 실제로 쓸 쿼리: 선택한 쿼리가 서버 DB 제품용이면 그것, 아니면 제품의 기본 쿼리.
 * (Linux DB 정책은 제품과 무관하게 공유하므로, 다른 제품용 쿼리 id가 남아 있어도 제품 기본값으로 바꿉니다)
 */
export function resolveQueryTemplate(
  getTemplate: (id: string) => ManagedTemplate | undefined,
  dbms: string | undefined,
  item: string,
  selectedId?: string,
): ManagedTemplate | undefined {
  const selected = selectedId ? getTemplate(selectedId) : undefined;
  if (isQueryFor(selected, dbms)) return selected;
  const fallbackId = defaultQueryTemplateId(dbms, item);
  const fallback = fallbackId ? getTemplate(fallbackId) : undefined;
  return isQueryFor(fallback, dbms) ? fallback : undefined;
}
