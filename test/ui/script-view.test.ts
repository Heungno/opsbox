import assert from 'node:assert/strict';
import { beforeEach, test } from 'node:test';

import { FakeElement, installFakeDocument } from '../helpers/fakeDom';
import { customScriptItems, filterTemplates, renderTemplateList, templateGroup, templateMeta } from '../../src/public/settings/script-management/script-view.js';

beforeEach(installFakeDocument);

const ITEMS = [
  { value: 'START', label: '시작' }, { value: 'CPU', label: 'CPU' },
  { value: 'WEB_LOG', label: 'WEB 로그', role: 'WEB' }, { value: 'DB_INSTANCE_STATUS', label: 'DB 상태', role: 'DB' },
];
const part = (id: string, item: string, extra: Record<string, unknown> = {}) => ({ id, name: id, kind: 'SCRIPT_PART', os: 'Windows', item, enabled: true, ...extra });

test('스크립트 관리: 묶음은 시스템(시작·저장)·공통·역할(공통코드 scriptItems의 role)·DB 쿼리', () => {
  assert.equal(templateGroup(part('a', 'START'), ITEMS), 'SYSTEM');
  assert.equal(templateGroup(part('b', 'CPU'), ITEMS), 'COMMON');
  assert.equal(templateGroup(part('c', 'WEB_LOG'), ITEMS), 'WEB');
  assert.equal(templateGroup({ id: 'q', kind: 'QUERY', dbms: 'MSSQL' }, ITEMS), 'DB');
});

test('스크립트 관리: 종류·OS·묶음·항목으로 거르고, 쿼리는 OS가 없으면 Windows', () => {
  const list = [part('a', 'CPU'), part('b', 'WEB_LOG', { os: 'Linux' }), { id: 'q', name: 'q', kind: 'QUERY', dbms: 'MSSQL', enabled: true }];
  assert.deepEqual(filterTemplates(list, { os: 'Windows', group: 'ALL' }, ITEMS).map((t: any) => t.id), ['a', 'q']);
  assert.deepEqual(filterTemplates(list, { group: 'WEB' }, ITEMS).map((t: any) => t.id), ['b']);
  assert.deepEqual(filterTemplates(list, { kind: 'SCRIPT_PART', item: 'CPU', group: 'ALL' }, ITEMS).map((t: any) => t.id), ['a']);
});

test('스크립트 관리: 목록 한 줄 설명과 점검 만들기 배지·관리 링크', () => {
  assert.equal(templateMeta(part('a', 'CPU', { enabled: false })), '점검 항목 · CPU · Windows · 중지');
  assert.equal(templateMeta({ kind: 'QUERY', dbms: 'PostgreSQL', enabled: true }), 'DB 쿼리 · DBMS · PostgreSQL · 사용');
  const host = new FakeElement('div');
  renderTemplateList(host, [part('g', 'CUSTOM_X', { generatedState: 'DETACHED' })], { selectedId: 'g', onOpen() {}, onDelete() {} });
  assert.match(host.textContent, /직접 편집됨/);
  assert.equal(host.find('a')[0].textContent, '정책에서 관리');
  assert.equal(host.find('button').length, 0, '점검 만들기 조각은 여기서 삭제하지 않음');
  assert.ok(host.children[0].className.includes('is-selected'));
});

test('스크립트 관리: 정책의 사용자 항목(CUSTOM_)을 항목 목록에 더한다', () => {
  const items = customScriptItems([{ os: 'Linux', category: 'WEB', items: [{ id: 'CUSTOM_A', name: '사용자 점검' }, { id: 'CPU', name: 'CPU' }] }]);
  assert.deepEqual(items.map((i: any) => [i.value, i.label, i.role]), [['CUSTOM_A', '사용자 점검 · WEB', 'WEB']]);
});

const cmd = { id: 'c', name: 'JEUS 6', kind: 'COMMAND', product: 'JEUS', item: 'WAS_ENGINE_STATUS', enabled: true };
test('스크립트 관리: 관리 명령은 항목의 역할 묶음에, OS 필터와 상관없이 보인다', () => {
  const items = [...ITEMS, { value: 'WAS_ENGINE_STATUS', label: 'WAS 엔진 상태', role: 'WAS' }];
  assert.equal(templateGroup(cmd, items), 'WAS');
  assert.deepEqual(filterTemplates([cmd], { os: 'Linux' }, items).map((t: any) => t.id), ['c']);
  assert.deepEqual(filterTemplates([cmd], { kind: 'COMMAND', item: 'WAS_ENGINE_STATUS' }, items).map((t: any) => t.id), ['c']);
});
test('스크립트 관리: 관리 명령 한 줄 설명', () => {
  assert.equal(templateMeta(cmd), '관리 명령 · JEUS · WAS_ENGINE_STATUS · 사용');
});
