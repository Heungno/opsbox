import assert from 'node:assert/strict';
import { beforeEach, test } from 'node:test';

import { resetCodes, setCodes } from '../../src/public/shared/js/codes.js';
import { effectiveResultPath, healthOf, roleBadgeText } from '../../src/public/settings/server-management/server-overview.js';
import { activeScriptItems, compatibleDbQueries, dbTargetHint, defaultQueryTemplateId, defaultScriptTemplate, defaultScriptTemplateName, policyCheckIds, policyRoleTabs, resolveQueryTemplateId } from '../../src/public/settings/server-management/server-policy-form.js';
import { scriptCommand, scriptDescription } from '../../src/public/settings/server-management/server-script-panel.js';

beforeEach(() => {
  resetCodes();
  setCodes({
    serverRoles: [{ value: 'WEB', label: 'WEB' }, { value: 'OTHER', label: '기타 서버' }],
    policyCategories: [{ value: 'BASIC', label: '기본' }, { value: 'WEB', label: 'WEB' }, { value: 'WAS', label: 'WAS' }, { value: 'DB', label: 'DB' }],
    scriptItems: [{ value: 'CPU', label: 'CPU 사용률' }],
  });
});

const PREFIXES = { MSSQL: 'WINDOWS-QUERY', PostgreSQL: 'POSTGRESQL-QUERY' };
const query = (id: string, dbms: string, enabled = true) => ({ id, kind: 'QUERY', dbms, enabled });

test('정책 사용 항목: enabled 항목 id만 (1단계 checks 회귀 방지)', () => {
  assert.deepEqual(policyCheckIds({ items: [{ id: 'A', enabled: true }, { id: 'B', enabled: false }, { id: 'C' }] }), ['A', 'C']);
  assert.deepEqual(policyCheckIds(undefined), []);
});

test('DB 기본 쿼리: 접두어 API 맵으로 계산(제품 이름 대소문자 무관), 저장 전 추가한 항목도', () => {
  assert.equal(defaultQueryTemplateId(PREFIXES, 'PostgreSQL', 'DB_SESSION'), 'POSTGRESQL-QUERY-DB_SESSION');
  assert.equal(defaultQueryTemplateId(PREFIXES, 'POSTGRESQL', 'DB_SESSION'), 'POSTGRESQL-QUERY-DB_SESSION');
  assert.equal(defaultQueryTemplateId(PREFIXES, 'CUBRID', 'X'), '');
});

test('DB 쿼리 선택: 선택한 쿼리가 제품용이면 그것, 아니면 제품 기본 쿼리, 없으면 빈 값', () => {
  const templates = [query('POSTGRESQL-QUERY-DB_SESSION', 'PostgreSQL'), query('MY-PG', 'PostgreSQL'), query('MSSQL-1', 'MSSQL'), query('OFF', 'PostgreSQL', false)];
  assert.deepEqual(compatibleDbQueries(templates, 'PostgreSQL').map((t: any) => t.id), ['POSTGRESQL-QUERY-DB_SESSION', 'MY-PG']);
  assert.equal(resolveQueryTemplateId(templates, PREFIXES, 'PostgreSQL', 'DB_SESSION', 'MY-PG'), 'MY-PG');
  assert.equal(resolveQueryTemplateId(templates, PREFIXES, 'PostgreSQL', 'DB_SESSION', 'MSSQL-1'), 'POSTGRESQL-QUERY-DB_SESSION');
  assert.equal(resolveQueryTemplateId(templates, PREFIXES, 'PostgreSQL', 'NONE', ''), '');
});

test('정책 탭: 기본 + 서버 역할 중 역할 정책이 있는 것(공통코드 policyCategories 순서)', () => {
  assert.deepEqual(policyRoleTabs(['OTHER', 'WEB']).map((t: any) => [t.value, t.label]), [['BASIC', '기본'], ['WEB', 'WEB']]);
});

test('최종 결과 예시 항목: 공통 자원 + 사용자 기본 항목 + 입력한 목록 + 역할 항목', () => {
  const items = activeScriptItems({ server: { processes: [{ name: 'x' }], ports: [], httpChecks: [{}] }, roles: ['WEB'], roleChecks: { WEB: ['WEB_LOG'] }, basicPolicy: { items: [{ id: 'CUSTOM_A', enabled: true }, { id: 'CPU', enabled: true }] }, scriptItems: [{ value: 'CPU' }] });
  assert.deepEqual(items, ['HOST_INFO', 'CPU', 'MEMORY', 'UPTIME', 'DISK', 'CUSTOM_A', 'PROCESS', 'HTTP', 'WEB_LOG']);
});

test('기본 스크립트: OS 기본 조각을 찾고, 이름은 공통코드 항목 이름', () => {
  const templates = [{ id: 'LINUX-PART-CPU', kind: 'SCRIPT_PART', os: 'Linux', item: 'CPU' }];
  assert.equal(defaultScriptTemplate(templates, 'Linux', 'CPU')?.id, 'LINUX-PART-CPU');
  assert.equal(defaultScriptTemplate(templates, 'Windows', 'CPU'), undefined);
  assert.equal(defaultScriptTemplateName('Linux', 'CPU'), 'Linux 점검 항목 · CPU 사용률');
});

test('DB 접속 대상 안내: Windows는 MSSQL만, Linux는 제품별', () => {
  assert.match(dbTargetHint('MSSQL', true)!.label, /MSSQL 인스턴스/);
  assert.equal(dbTargetHint('PostgreSQL', true), null);
  assert.match(dbTargetHint('CUBRID', false)!.label, /필수/);
});

test('결과 저장 경로 표시: 서버 지정 → OS 기본값 → 스크립트 폴더', () => {
  const settings = { windows: '\\\\NAS\\r', linux: '' };
  assert.deepEqual(effectiveResultPath({ os: 'Linux', resultPath: '/x' }, settings), { path: '/x', source: '이 서버만 지정' });
  assert.deepEqual(effectiveResultPath({ os: 'Windows' }, settings), { path: '\\\\NAS\\r', source: 'Windows 기본값' });
  assert.equal(effectiveResultPath({ os: 'Linux' }, settings).path, '');
});

test('최근 점검 상태: 결과에 기록된 종합 상태를 먼저 쓴다(보고서와 같은 규칙)', () => {
  assert.equal(healthOf({ summary: { status: 'Healthy' }, cpu: 99 }), 'Healthy');
  assert.equal(healthOf({ cpu: 95 }), 'Critical');
  assert.equal(healthOf({ cpu: 10, disks: [{ status: 'Warning' }] }), 'Warning');
});

test('역할 배지: 공통코드 이름을 + 로', () => {
  assert.equal(roleBadgeText(['WEB', 'OTHER']), 'WEB + 기타 서버');
});

test('스크립트 실행 안내: 서버 ID를 따옴표로, OS별 설명', () => {
  assert.match(scriptCommand({ id: "A'B", os: 'Linux' }), /bash '\.\/A'\\''B\.sh'/);
  assert.match(scriptCommand({ id: 'W1', os: 'Windows' }), /-Filter 'W1\*\.ps1'/);
  assert.match(scriptDescription({ os: 'Windows' }), /\$resultDirectory/);
  assert.match(scriptDescription({ os: 'Linux' }), /bash로 실행하세요/);
});

test('공통코드를 못 불러와도 정책 탭에 기본과 서버 역할이 나온다', () => {
  resetCodes();
  assert.deepEqual(policyRoleTabs(['WEB']).map((t: any) => t.value), ['BASIC', 'WEB']);
});

test('디렉터리 행: 임계값 칸이 비면 값을 보내지 않는다(스크립트 기본값 사용), 숫자는 그대로', async () => {
  const { directoryFromInputs } = await import('../../src/public/settings/server-management/server-policy-form.js');
  assert.deepEqual(directoryFromInputs(' /data ', '', ''), { path: '/data' });
  assert.deepEqual(directoryFromInputs('/data', '75', '95'), { path: '/data', warningPercent: 75, criticalPercent: 95 });
  assert.deepEqual(directoryFromInputs('/data', '0', ' '), { path: '/data', warningPercent: 0 });
});
