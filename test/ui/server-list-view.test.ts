import assert from 'node:assert/strict';
import { beforeEach, test } from 'node:test';

import { FakeElement, installFakeDocument } from '../helpers/fakeDom';
import { resetCodes, setCodes } from '../../src/public/shared/js/codes.js';
import { filterServers, renderRoleProductFields, renderRoleTabs, renderServerRows, renderSummaryCards, summarizeServers } from '../../src/public/settings/server-management/server-list-view.js';

const ROLES = [{ value: 'WEB', label: 'WEB' }, { value: 'WAS', label: 'WAS' }, { value: 'OTHER', label: '기타 서버' }];
beforeEach(() => { installFakeDocument(); resetCodes(); setCodes({ serverRoles: ROLES, productsByRole: { WEB: ['Nginx', 'IIS'], WAS: ['JEUS'] } }); });

const server = (id: string, roles: string[], extra: Record<string, unknown> = {}) => ({ id, name: `${id} 서버`, ip: '10.0.0.1', os: 'Linux', roles, products: {}, enabled: true, ...extra });

test('서버 목록: 요약 숫자는 사용 중인 서버만, 역할은 공통코드 순서', () => {
  const summary = summarizeServers([server('A', ['WEB']), server('B', ['WEB', 'WAS']), server('C', ['OTHER'], { enabled: false })], ROLES);
  assert.deepEqual(summary, { total: 2, byRole: { WEB: 2, WAS: 1, OTHER: 0 } });
  const cards = new FakeElement('section');
  renderSummaryCards(cards, summary, ROLES);
  assert.deepEqual(cards.find('span').map((span) => span.textContent), ['Total', 'WEB', 'WAS', '기타 서버']);
  assert.deepEqual(cards.find('strong').map((s) => s.textContent), ['2', '2', '1', '0']);
});

test('서버 목록: 역할 탭은 공통코드 이름과 검색 결과 건수', () => {
  const tabs = new FakeElement('div');
  renderRoleTabs(tabs, ROLES, [server('A', ['WEB']), server('B', ['OTHER'])], 'OTHER');
  const buttons = tabs.find('button');
  assert.deepEqual(buttons.map((b) => b.textContent), ['전체 2', 'WEB 1', 'WAS 0', '기타 서버 1']);
  assert.deepEqual(buttons.map((b) => b.getAttribute('aria-selected')), ['false', 'false', 'false', 'true']);
});

test('서버 목록: 검색어(ID·이름·IP·역할·제품)와 역할 탭으로 거른다', () => {
  const list = [server('WEB-1', ['WEB'], { products: { WEB: 'Nginx' } }), server('APP-1', ['WAS'])];
  assert.deepEqual(filterServers(list, { keyword: 'nginx', role: 'ALL' }).map((s) => s.id), ['WEB-1']);
  assert.deepEqual(filterServers(list, { keyword: '', role: 'WAS' }).map((s) => s.id), ['APP-1']);
});

test('서버 목록: 미사용 서버 행은 배지와 [다시 사용], 누르면 onToggle', () => {
  const tbody = new FakeElement('tbody');
  const toggled: string[] = [];
  renderServerRows(tbody, [server('A', ['OTHER'], { enabled: false })], { onToggle: (s: any) => toggled.push(s.id) });
  const row = tbody.children[0];
  assert.equal(row.className, 'server-inactive');
  assert.match(row.textContent, /기타 서버/);
  assert.equal(row.find('span', 'server-inactive-badge')[0].textContent, '미사용');
  const button = row.find('button')[0];
  assert.equal(button.textContent, '다시 사용');
  button.dispatch('click');
  assert.deepEqual(toggled, ['A']);
});

test('서버 폼: 역할마다 제품 선택(제품 목록이 있는 역할만), 고른 값 읽기', () => {
  const box = new FakeElement('div');
  const fields = renderRoleProductFields(box, ['WEB'], { WEB: 'IIS' });
  assert.equal(box.find('select').length, 2, '기타에는 제품 선택 없음');
  assert.deepEqual(fields.read(), { roles: ['WEB'], products: { WEB: 'IIS' } });
  const wasCheckbox = box.find('input')[1];
  wasCheckbox.checked = true;
  wasCheckbox.dispatch('change');
  box.find('select')[1].value = 'JEUS';
  assert.deepEqual(fields.read(), { roles: ['WEB', 'WAS'], products: { WEB: 'IIS', WAS: 'JEUS' } });
});

test('역할 선택: 사용 안 함이 된 역할을 가진 서버는 그 역할 체크가 남아 저장 시 지워지지 않는다', () => {
  setCodes({ serverRoles: ROLES, productsByRole: {}, _labels: { serverRoles: { LEGACY: '예전 역할' } } });
  const container = new FakeElement('div');
  const fields = renderRoleProductFields(container, ['WEB', 'LEGACY']);
  assert.ok(container.textContent.includes('예전 역할'));
  assert.deepEqual(fields.read().roles, ['WEB', 'LEGACY']);
});
