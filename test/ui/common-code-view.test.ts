import assert from 'node:assert/strict';
import { beforeEach, test } from 'node:test';

import { FakeElement, installFakeDocument } from '../helpers/fakeDom';
import { applyEdit, codeRows, countCodes, groupsOf, removeRow, renderCodeTable } from '../../src/public/settings/common-code-management/common-code-view.js';

beforeEach(installFakeDocument);

const doc = () => ({
  serverRoles: [{ value: 'WEB', label: 'WEB' }, { value: 'OTHER', label: '기타', sortOrder: 0 }],
  productsByRole: { WEB: ['Nginx', 'IIS'], DB: [] },
  scriptItems: [{ value: 'START', label: '시작' }, { value: 'CPU', label: 'CPU' }],
  _codeMeta: { 'productsByRole::WEB::IIS': { enabled: false, sortOrder: -1 } } as Record<string, any>,
});

test('공통코드 관리: _codeMeta가 항목 값보다 우선, 정렬은 sortOrder → 원래 순서', () => {
  const rows = codeRows(doc(), 'productsByRole', 'WEB');
  assert.deepEqual(rows.map((r: any) => [r.value, r.enabled, r.sortOrder]), [['IIS', false, -1], ['Nginx', true, 0]]);
  assert.deepEqual(codeRows(doc(), 'serverRoles', '').map((r: any) => r.value), ['WEB', 'OTHER'], '같은 sortOrder면 원래 순서');
});

test('공통코드 관리: 그룹 목록·코드 수, 시작/저장 코드는 보호', () => {
  assert.deepEqual(groupsOf(doc(), 'productsByRole'), ['WEB', 'DB']);
  assert.deepEqual(groupsOf(doc(), 'serverRoles'), ['']);
  assert.equal(countCodes(doc(), 'productsByRole'), 2);
  assert.equal(codeRows(doc(), 'scriptItems', '').find((r: any) => r.value === 'START').protected, true);
});

test('공통코드 관리: 문자열 코드를 끄면 _codeMeta에 기록, 같은 값이 있으면 오류', () => {
  const codes = doc();
  const row = codeRows(codes, 'productsByRole', 'WEB').find((r: any) => r.value === 'Nginx');
  assert.equal(applyEdit(codes, 'productsByRole', 'WEB', row, { value: 'Nginx', label: 'Nginx', enabled: false, sortOrder: 2 }), null);
  assert.deepEqual(codes._codeMeta['productsByRole::WEB::Nginx'], { label: '', enabled: false, sortOrder: 2 });
  assert.equal(applyEdit(codes, 'productsByRole', 'WEB', null, { value: 'IIS', label: 'IIS', enabled: true, sortOrder: 0 }), '같은 코드 값이 이미 있습니다.');
});

test('공통코드 관리: 객체 코드는 항목에 사용 여부·순서를 넣고, 지우면 _codeMeta 정리', () => {
  const codes = doc();
  assert.equal(applyEdit(codes, 'serverRoles', '', null, { value: 'DB', label: '데이터베이스', enabled: true, sortOrder: 5 }), null);
  assert.deepEqual(codes.serverRoles.at(-1), { value: 'DB', label: '데이터베이스', enabled: true, sortOrder: 5 });
  const iis = codeRows(codes, 'productsByRole', 'WEB').find((r: any) => r.value === 'IIS');
  removeRow(codes, 'productsByRole', iis);
  assert.deepEqual(codes.productsByRole.WEB, ['Nginx']);
  assert.equal('productsByRole::WEB::IIS' in codes._codeMeta, false);
});

test('공통코드 관리: 표의 보호 코드에는 삭제 대신 "시스템"', () => {
  const tbody = new FakeElement('tbody');
  renderCodeTable(tbody, [{ group: '', rows: codeRows(doc(), 'scriptItems', '') }], { onEdit() {}, onDelete() {} });
  const start = tbody.children[0];
  assert.equal(start.find('button').map((b) => b.textContent).join(), '수정');
  assert.match(start.textContent, /시스템/);
});
