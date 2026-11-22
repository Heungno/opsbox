import './helpers/env';

import assert from 'node:assert/strict';
import { randomBytes, scryptSync } from 'node:crypto';
import { before, test } from 'node:test';

import { db } from '../src/db';
import { app } from '../src/server';
import { getRawCommonCodes, saveCommonCodes } from '../src/features/common-codes/service';
import { defaultQueryTemplateId } from '../src/features/scripts/db-query-defaults';
import { BUILDER_TYPES } from '../src/features/scripts/check-builder/types';

/* 화면이 쓰는 이름·목록 API: 공통코드 이름표, 점검 만들기 종류, DB 기본 쿼리 접두어 */
let cookie = '';
before(async () => {
  const salt = randomBytes(32);
  db.prepare('INSERT OR REPLACE INTO users (username, display_name, password_salt, password_hash) VALUES (?, ?, ?, ?)')
    .run('codeuser', '코드', salt.toString('hex'), scryptSync('pass1234', salt, 64).toString('hex'));
  const login = await app.inject({ method: 'POST', url: '/api/auth/login', payload: { username: 'codeuser', password: 'pass1234' } });
  cookie = String(login.headers['set-cookie']).split(';')[0];
});
const get = async (url: string) => (await app.inject({ method: 'GET', url, headers: { cookie } })).json().data;

test('공통코드: 기본값에 변경 이력 대상 이름(auditTargets)이 있다', async () => {
  const codes = await get('/api/common-codes');
  assert.deepEqual(codes.auditTargets.map((code: any) => [code.value, code.label]), [
    ['AUTH', '로그인'], ['SERVER', '서버'], ['POLICY', '점검 정책'], ['TEMPLATE', '템플릿'],
    ['COMMON_CODE', '공통코드'], ['RESULT', '점검 결과'], ['SCRIPT', '스크립트'], ['SETTINGS', '설정'],
  ]);
});

test('공통코드 API: 비활성 코드 이름도 _labels로 준다(그룹 코드는 그룹::값)', async () => {
  const raw = getRawCommonCodes();
  saveCommonCodes({ ...raw, _codeMeta: { ...raw._codeMeta, 'serverRoles::::OTHER': { enabled: false } } });
  const codes = await get('/api/common-codes');
  assert.equal(codes.serverRoles.some((code: any) => code.value === 'OTHER'), false);
  assert.equal(codes._labels.serverRoles.OTHER, '기타');
  assert.equal(codes._labels.productsByRole['WEB::Nginx'], 'Nginx');
  saveCommonCodes(raw);
  assert.equal('_labels' in (await get('/api/common-codes/manage')), false, '관리 화면 문서에는 넣지 않음(저장할 때 섞이지 않게)');
});

test('점검 만들기 종류 API: 종류·이름·도움말과 판정 수준 이름', async () => {
  const meta = await get('/api/check-builder/types');
  assert.deepEqual(meta.types.map((type: any) => type.value), [...BUILDER_TYPES]);
  assert.equal(meta.types[0].label, '명령 결과 숫자 비교');
  assert.match(meta.types[0].help, /주의·위험 기준과 비교/);
  assert.deepEqual(meta.levels, [{ value: 'Critical', label: '위험' }, { value: 'Warning', label: '주의' }]);
});

test('DB 기본 쿼리 접두어 API는 서버의 기본 쿼리 계산과 같다', async () => {
  const prefixes = await get('/api/scripts/db-query-prefixes');
  for (const dbms of ['MSSQL', 'PostgreSQL', 'MariaDB', 'CUBRID']) {
    assert.equal(`${prefixes[dbms]}-DB_INSTANCE_STATUS`, defaultQueryTemplateId(dbms, 'DB_INSTANCE_STATUS'), dbms);
  }
});
