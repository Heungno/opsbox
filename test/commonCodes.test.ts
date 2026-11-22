import './helpers/env';

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';

import { getCommonCodes, getRawCommonCodes, saveCommonCodes } from '../src/features/common-codes/service';

const SEED_FILE = path.join(__dirname, '..', 'seeds', 'common-codes.json');
const seed = () => JSON.parse(fs.readFileSync(SEED_FILE, 'utf8'));

test('공통코드: 새 DB에는 seeds/common-codes.json이 그대로 들어 있다', () => {
  assert.equal(JSON.stringify(getRawCommonCodes()), JSON.stringify(seed()));
});

test('공통코드: 시드 문서를 저장했다가 읽으면 같은 문서가 나온다', () => {
  saveCommonCodes(seed());
  assert.deepEqual(getRawCommonCodes(), seed());
});

test('공통코드: 끈 코드와 바꾼 순서가 저장 후에도 유지된다', () => {
  const raw = getRawCommonCodes();
  raw._codeMeta = { ...raw._codeMeta, 'serverRoles::::WAS': { enabled: false }, 'serverRoles::::DB': { sortOrder: -1 } };
  saveCommonCodes(raw);
  assert.deepEqual(getRawCommonCodes()._codeMeta?.['serverRoles::::WAS'], { enabled: false });
  const roles = getCommonCodes().serverRoles.map((code) => code.value);
  assert.equal(roles.includes('WAS'), false);
  assert.equal(roles[0], 'DB');
  saveCommonCodes(seed());
});

test('공통코드: 항목에 붙은 속성(설명·역할 등)과 그룹별 문자열 목록이 유지된다', () => {
  const raw = seed();
  raw.scriptItems.push({ value: 'MY_ITEM', label: '내 항목', group: 'BASIC', description: '설명', enabled: false, sortOrder: 3 });
  raw.productsByRole.WEB.push('Caddy');
  saveCommonCodes(raw);
  const saved = getRawCommonCodes();
  assert.deepEqual(saved.scriptItems.at(-1), { value: 'MY_ITEM', label: '내 항목', group: 'BASIC', description: '설명', enabled: false, sortOrder: 3 });
  assert.equal(saved.productsByRole.WEB.at(-1), 'Caddy');
  assert.equal(getCommonCodes().scriptItems.some((code) => code.value === 'MY_ITEM'), false, '끈 항목은 사용 목록에서 빠짐');
  saveCommonCodes(seed());
});

test('공통코드: 시스템 코드(START·SAVE)는 지울 수 없다', () => {
  const raw = getRawCommonCodes();
  raw.scriptItems = raw.scriptItems.filter((code) => code.value !== 'START');
  assert.throws(() => saveCommonCodes(raw), /시스템 코드는 삭제할 수 없습니다/);
});

test('공통코드: 같은 그룹에 같은 코드가 두 번 있으면 저장하지 않는다', () => {
  const raw = seed();
  raw.serverRoles.push({ value: 'WEB', label: '중복' });
  assert.throws(() => saveCommonCodes(raw), (error: any) => error.status === 400 && /같은 코드가 두 번 있습니다: serverRoles WEB/.test(error.message));
  assert.deepEqual(getRawCommonCodes(), seed(), '실패하면 이전 값 유지');
});

test('공통코드: 코드를 모두 지운 그룹도 빈 목록으로 남는다(그룹을 읽는 곳이 깨지지 않게)', () => {
  const raw = seed();
  raw.productsByRole.DB = [];
  raw.rolePolicies.DB = [];
  saveCommonCodes(raw);
  assert.deepEqual(getRawCommonCodes().productsByRole.DB, []);
  assert.deepEqual(getCommonCodes().rolePolicies.DB, []);
  assert.deepEqual(Object.keys(getRawCommonCodes().productsByRole), Object.keys(seed().productsByRole), '그룹 순서 유지');
  saveCommonCodes(seed());
});
