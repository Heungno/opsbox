import assert from 'node:assert/strict';
import { beforeEach, test } from 'node:test';

import { FakeElement, installFakeDocument } from './helpers/fakeDom';

/*
 * 보고서 항목 상자: 항목 하나 = 상자 하나 (제목 옆 상태, 아래 결과)
 */
beforeEach(installFakeDocument);

const table = { type: 'TABLE', columns: [{ key: 'target', label: '대상' }, { key: 'value', label: '값' }] };
const items = [
  { item: 'CUSTOM_A', name: 'Swap 사용률', status: 'Warning', result: { components: [{ type: 'SUMMARY' }, table, { type: 'CONSOLE' }] }, detail: { rows: [{ target: '이 서버', value: '61' }], output: '61' } },
  { item: 'CUSTOM_B', name: '측정 항목', status: 'Healthy', result: { components: [{ type: 'SUMMARY' }, { type: 'METRIC' }] }, detail: { value: 12 } },
  { item: 'CUSTOM_C', name: '요약만', status: 'NotCollected', message: '서버 상세에서 값을 입력하세요.', result: { components: [{ type: 'SUMMARY' }] }, detail: {} },
];
const render = async (list: unknown[] = items, options: Record<string, unknown> = {}) => {
  const { renderItemBoxes } = await import('../src/public/reports/report-item-box.js');
  const container = new FakeElement('div');
  renderItemBoxes(container, list, options);
  return container;
};
const boxes = (container: FakeElement) => container.find('section', 'report-item-box');

test('항목마다 상자 하나, 제목 옆에 상태 배지', async () => {
  const container = await render();
  assert.equal(boxes(container).length, 3);
  const [first] = boxes(container);
  assert.equal(first.getAttribute('data-item'), 'CUSTOM_A');
  assert.equal(first.find('h3')[0].textContent, 'Swap 사용률');
  const badge = first.find('span', 'server-badge')[0];
  assert.equal(badge.textContent, 'Warning');
  assert.ok(badge.className.includes('badge-warning'));
  assert.ok(boxes(container)[2].find('span', 'server-badge')[0].className.includes('badge-muted'), '미수집은 회색');
});

test('따로 떨어진 "· 요약" 상자는 없다', async () => {
  const container = await render();
  assert.doesNotMatch(container.textContent, /· 요약/);
  assert.equal(container.find('section', 'report-subsection').length, 0);
});

test('요약 메시지는 제목 아래 한 줄', async () => {
  const box = boxes(await render())[2];
  assert.equal(box.find('p', 'report-item-message')[0].textContent, '서버 상세에서 값을 입력하세요.');
  assert.equal(box.find('div', 'report-item-body').length, 0, '결과가 없으면 본문 없음');
});

test('내용 블록이 둘 이상이면 작은 소제목, 하나면 없음', async () => {
  const [withTwo, withOne] = boxes(await render());
  assert.deepEqual(withTwo.find('h4').map((node) => node.textContent), ['표', '콘솔 결과']);
  assert.equal(withTwo.find('td').map((cell) => cell.textContent).join(','), '이 서버,61');
  assert.equal(withTwo.find('pre')[0].textContent, '61');
  assert.equal(withOne.find('h4').length, 0);
  assert.match(withOne.find('table')[0].textContent, /value\s*12/);
});

test('추가 내용: replace 는 일반 결과 대신, prepend 는 일반 결과 앞에', async () => {
  const dedicated = new FakeElement('table');
  dedicated.className = 'dedicated';
  const replaced = boxes(await render([items[0]], { extras: { CUSTOM_A: { nodes: [dedicated], mode: 'replace' } } }))[0];
  assert.equal(replaced.find('table', 'dedicated').length, 1);
  assert.equal(replaced.find('pre').length, 0);
  assert.equal(replaced.find('h4').length, 0, '블록 하나뿐이라 소제목 없음');

  const engine = new FakeElement('table');
  engine.className = 'engine';
  const prepended = boxes(await render([items[0]], { extras: { CUSTOM_A: { nodes: [engine], mode: 'prepend', label: 'DB 엔진 상세' } } }))[0];
  const body = prepended.find('div', 'report-item-body')[0];
  assert.equal(body.all().find((node) => node.tagName === 'table')?.className, 'engine', '추가 내용이 먼저');
  assert.deepEqual(prepended.find('h4').map((node) => node.textContent), ['DB 엔진 상세', '표', '콘솔 결과']);
});

test('항목 이름·결과 값은 글자로만 들어가고 HTML로 해석되지 않는다', async () => {
  const container = await render([{ ...items[0], name: '<img src=x onerror=alert(1)>', detail: { rows: [{ target: '<b>x</b>', value: '1' }], output: '<script>' } }]);
  assert.equal(container.find('img').length, 0);
  assert.equal(container.find('b').length, 0);
  assert.equal(container.find('script').length, 0);
  assert.match(container.textContent, /<img src=x onerror=alert\(1\)>/);
});

test('DB 쿼리 결과(queries)는 쿼리별 소제목과 표로', async () => {
  const query = { item: 'DB_INSTANCE_STATUS', name: 'DB 인스턴스', status: 'Healthy', result: { components: [{ type: 'SUMMARY' }, { type: 'TABLE' }] },
    detail: { queries: [{ name: 'PostgreSQL 쿼리', target: 'localhost', columns: ['databaseName', 'state'], rows: [['app', 'ONLINE']] }] } };
  const box = boxes(await render([query]))[0];
  assert.match(box.find('h4')[0].textContent, /PostgreSQL 쿼리 · localhost/);
  assert.equal(box.find('td').map((cell) => cell.textContent).join(','), 'app,ONLINE');
});
