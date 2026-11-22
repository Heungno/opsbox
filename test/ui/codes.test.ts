import assert from 'node:assert/strict';
import { beforeEach, test } from 'node:test';

import { codeLabel, codeList, getCodes, loadCodes, resetCodes, roleLabel, setCodes } from '../../src/public/shared/js/codes.js';
import { resetStatusLabels, statusLabel } from '../../src/public/shared/js/status.js';

/* 화면 공통코드 도우미: 이름과 선택 목록은 공통코드에서, 못 불러와도 값은 보인다 */
beforeEach(() => { resetCodes(); resetStatusLabels(); });

test('codeLabel: 공통코드 이름, 모르면 값 그대로, 불러오기 전에도 값', () => {
  assert.equal(roleLabel('OTHER'), 'OTHER');
  setCodes({ serverRoles: [{ value: 'WEB', label: 'WEB' }, { value: 'OTHER', label: '기타' }] });
  assert.equal(roleLabel('OTHER'), '기타');
  assert.equal(codeLabel('serverRoles', 'NOPE'), 'NOPE');
  assert.equal(codeLabel('serverRoles', ''), '');
});

test('codeLabel: 비활성 코드도 _labels로 이름을 찾고, 선택 목록에서는 빠진다', () => {
  setCodes({ serverRoles: [{ value: 'WEB', label: 'WEB' }], _labels: { serverRoles: { OTHER: '기타 서버' } } });
  assert.equal(roleLabel('OTHER'), '기타 서버');
  assert.deepEqual(codeList('serverRoles'), [{ value: 'WEB', label: 'WEB' }]);
});

test('codeList: 그룹 문자열 코드는 value=label, 없는 분류·그룹은 빈 목록', () => {
  setCodes({ productsByRole: { WEB: ['Nginx'] }, resultViews: [{ value: 'TABLE', label: '표' }] });
  assert.deepEqual(codeList('productsByRole', 'WEB'), [{ value: 'Nginx', label: 'Nginx' }]);
  assert.deepEqual(codeList('productsByRole', 'DB'), []);
  assert.deepEqual(codeList('nothing'), []);
  assert.equal(codeLabel('productsByRole', 'Nginx', 'WEB'), 'Nginx');
  assert.equal(codeLabel('resultViews', 'TABLE'), '표');
});

test('loadCodes: 실패해도 던지지 않고 빈 공통코드로 계속한다', async () => {
  await loadCodes(async () => { throw new Error('network'); });
  assert.deepEqual(getCodes(), {});
  assert.equal(roleLabel('OTHER'), 'OTHER');
});

test('loadCodes: 한 번만 불러오고, 상태 이름도 함께 채운다', async () => {
  let calls = 0;
  const fetcher = async () => { calls += 1; return { healthStatuses: [{ value: 'Warning', label: '주의' }] }; };
  await loadCodes(fetcher);
  await loadCodes(fetcher);
  assert.equal(calls, 1);
  assert.equal(statusLabel('Warning'), '주의');
});
