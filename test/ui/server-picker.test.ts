import assert from 'node:assert/strict';
import { beforeEach, test } from 'node:test';

import { FakeElement, installFakeDocument } from '../helpers/fakeDom';
import { resetCodes, setCodes } from '../../src/public/shared/js/codes.js';
import { pickerMatches, renderPickerList } from '../../src/public/shared/js/server-picker.js';

beforeEach(() => { installFakeDocument(); resetCodes(); setCodes({ serverRoles: [{ value: 'WEB', label: 'WEB' }, { value: 'WAS', label: 'WAS' }, { value: 'OTHER', label: '기타' }] }); });

const server = (id: string, roles: string[], extra: Record<string, unknown> = {}) => ({ id, name: `${id} 서버`, ip: '10.0.0.2', os: 'Linux', roles, enabled: true, ...extra });

test('서버 목록 패널: 검색(ID·이름·IP)과 역할 탭으로 거른다', () => {
  const servers = [server('A', ['WEB'], { ip: '10.0.0.1' }), server('B', ['WAS'], { name: '결제' })];
  assert.deepEqual(pickerMatches(servers, { keyword: '결제', role: 'ALL' }).map((s: any) => s.id), ['B']);
  assert.deepEqual(pickerMatches(servers, { keyword: '10.0.0.1', role: 'WAS' }).map((s: any) => s.id), []);
  assert.deepEqual(pickerMatches(servers, { keyword: '', role: 'WEB' }).map((s: any) => s.id), ['A']);
});

test('서버 목록 패널: 전체 항목, 선택 표시, 미사용 표시, 클릭·Enter로 고른다', () => {
  const list = new FakeElement('div');
  const picked: Array<string | null> = [];
  renderPickerList(list, [server('A', ['WEB'], { enabled: false })], { selectedId: null, allLabel: '전체 서버', onSelect: (id: string | null) => picked.push(id) });
  const items = list.find('div', 'template-list-item');
  assert.equal(items.length, 2);
  assert.equal(items[0].textContent, '전체 서버');
  assert.deepEqual(items.map((item) => item.classList.contains('is-selected')), [true, false]);
  assert.match(items[1].find('small')[0].textContent, / · 미사용$/);
  assert.equal(items[1].getAttribute('role'), 'button');
  items[1].dispatch('click');
  items[0].dispatch('keydown', { key: 'Enter' });
  assert.deepEqual(picked, ['A', null]);
});

test('서버 목록 패널: 전체 항목이 없으면 선택한 서버만 표시', () => {
  const list = new FakeElement('div');
  renderPickerList(list, [server('A', ['WEB']), server('B', ['WEB'])], { selectedId: 'B', onSelect: () => {} });
  const items = list.find('div', 'template-list-item');
  assert.deepEqual(items.map((item) => item.classList.contains('is-selected')), [false, true]);
  assert.equal(items[0].find('strong')[0].textContent, 'A 서버');
});
