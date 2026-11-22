/*
 * 서버 상세 › 점검 정책: 화면 상태와 무관한 계산 (정책 항목, DB 쿼리 선택, 기본 스크립트, 결과 예시 항목)
 * DB 기본 쿼리 접두어는 서버(GET /api/scripts/db-query-prefixes)에서 받아 넘깁니다.
 */
import { codeLabel, codeList } from '../../shared/js/codes.js';

const upper = (value) => String(value || '').trim().toLocaleUpperCase();

/** 정책에서 사용하는 점검 항목 id (사용 중인 항목만) */
export function policyCheckIds(policy) {
  return (policy?.items ?? []).filter((item) => item.enabled !== false).map((item) => item.id);
}

/** 정책 탭: 기본 + 서버 역할 중 역할 정책이 있는 분류 (공통코드 policyCategories 순서·이름) */
export function policyRoleTabs(roles) {
  return policyCategories(roles).filter(({ value }) => value === 'BASIC' || roles.includes(value));
}

/** 정책 분류 목록. 공통코드를 못 불러왔으면 기본 + 서버 역할 순서(화면이 멈추지 않게) */
function policyCategories(roles) {
  const codes = codeList('policyCategories');
  return codes.length ? codes : [{ value: 'BASIC', label: 'BASIC' }, ...roles.map((role) => ({ value: role, label: role }))];
}

/** DB 제품별 기본 쿼리 템플릿 id (prefixes: 제품 → 접두어) */
export function defaultQueryTemplateId(prefixes, dbms, item) {
  const prefix = Object.entries(prefixes || {}).find(([product]) => upper(product) === upper(dbms))?.[1];
  return prefix ? `${prefix}-${item}` : '';
}

/** 그 DB 제품에서 쓸 수 있는(사용 중인) 쿼리 템플릿 */
export function compatibleDbQueries(templates, dbms) {
  if (!dbms) return [];
  return templates.filter((template) => template.enabled && template.kind === 'QUERY' && upper(template.dbms || 'MSSQL') === upper(dbms));
}

/** 실제로 쓸 쿼리 id: 선택한 쿼리가 제품용이면 그것, 아니면 제품 기본 쿼리, 없으면 '' */
export function resolveQueryTemplateId(templates, prefixes, dbms, item, selectedId) {
  const compatible = compatibleDbQueries(templates, dbms);
  if (selectedId && compatible.some((template) => template.id === selectedId)) return selectedId;
  const fallbackId = defaultQueryTemplateId(prefixes, dbms, item);
  return compatible.some((template) => template.id === fallbackId) ? fallbackId : '';
}

/** 항목의 OS 기본 스크립트 조각 */
export function defaultScriptTemplate(templates, os, item) {
  const prefix = `${String(os || '').toUpperCase()}-PART-`;
  return templates.find((template) => template.id === `${prefix}${item}` && template.os === os && template.kind === 'SCRIPT_PART')
    || templates.find((template) => template.kind === 'SCRIPT_PART' && template.os === os && template.item === item && template.id.startsWith(prefix));
}

export function isDefaultScriptTemplate(template, os, item) {
  return template.id === `WINDOWS-PART-${item}` || template.id === `${String(os || '').toUpperCase()}-PART-${item}`;
}

/** 기본 스크립트 이름 (항목 이름은 공통코드 scriptItems) */
export function defaultScriptTemplateName(os, item) {
  return `${os || 'Windows'} 점검 항목 · ${codeLabel('scriptItems', item)}`;
}

/** 최종 결과 예시에 들어가는 항목: 공통 자원 + 기본 정책 사용자 항목 + 입력한 목록 + 역할 항목 */
export function activeScriptItems({ server, roles, roleChecks, basicPolicy, scriptItems }) {
  const items = ['HOST_INFO', 'CPU', 'MEMORY', 'UPTIME', 'DISK'];
  const builtInIds = new Set(scriptItems.map((item) => item.value));
  items.push(...(basicPolicy?.items ?? []).filter((item) => item.enabled && !builtInIds.has(item.id)).map((item) => item.id));
  if (server.processes?.length) items.push('PROCESS');
  if (server.directories?.length) items.push('DIRECTORY');
  if (server.fileChecks?.length) items.push('FILE_SIZE');
  if (server.ports?.length) items.push('PORT');
  if (server.httpChecks?.length && roles.some((role) => role === 'WEB' || role === 'WAS')) items.push('HTTP');
  for (const { value: role } of policyCategories(roles)) if (role !== 'BASIC' && roles.includes(role)) items.push(...(roleChecks[role] ?? []));
  return items;
}

/** DB 접속 대상 입력 안내 (Windows는 MSSQL만) */
export function dbTargetHint(product, isWindows) {
  if (isWindows) {
    return product === 'MSSQL'
      ? { label: 'MSSQL 인스턴스 대상 (한 줄에 하나씩)', placeholder: '예: .\\testdb 또는 localhost,1433', help: 'Windows 통합 인증을 사용합니다.' }
      : null;
  }
  const hints = {
    PostgreSQL: { label: 'PostgreSQL 접속 대상 (한 줄에 하나씩, 비우면 이 서버)', placeholder: '예: localhost:5432/appdb', help: '비워 두면 이 서버의 PostgreSQL에 로컬로 접속합니다(root로 실행하면 postgres 계정). 계정·비밀번호는 실행 계정의 ~/.pgpass 또는 PGUSER·PGPASSWORD 환경 변수를 씁니다.' },
    MariaDB: { label: 'MariaDB 접속 대상 (한 줄에 하나씩, 비우면 이 서버)', placeholder: '예: 127.0.0.1:3306 또는 /run/mysqld/mysqld.sock', help: '비워 두면 로컬 소켓으로 접속합니다(root는 unix_socket 인증). 계정은 실행 계정의 ~/.my.cnf 또는 OPSBOX_DB_USER·MYSQL_PWD 환경 변수를 씁니다.' },
    MSSQL: { label: 'MSSQL 접속 대상 (한 줄에 하나씩, 비우면 localhost)', placeholder: '예: localhost,1433', help: 'sqlcmd(mssql-tools)로 실행합니다. SQLCMDUSER·SQLCMDPASSWORD 환경 변수가 있으면 SQL 인증, 없으면 -E(Kerberos)를 씁니다.' },
    CUBRID: { label: 'CUBRID 대상 DB (한 줄에 하나씩, 필수)', placeholder: '예: demodb@localhost', help: 'csql로 실행합니다. 계정은 OPSBOX_CUBRID_USER(기본 dba)·OPSBOX_CUBRID_PASSWORD 환경 변수를 씁니다.' },
  };
  return hints[product] ?? null;
}
