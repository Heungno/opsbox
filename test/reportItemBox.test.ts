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
  assert.equal(badge.textContent, '경고', '공통코드 상태 이름');
  assert.ok(badge.className.includes('badge-warning'));
  assert.ok(boxes(container)[2].find('span', 'server-badge')[0].className.includes('badge-muted'), '미수집은 회색');
  assert.equal(boxes(container)[2].find('span', 'server-badge')[0].textContent, '미수집');
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

test('쿼리 결과(queries)는 표시 방식(로그 표·JSON 등)과 관계없이 쿼리 표로 한 번만 그린다', async () => {
  const queries = [{ target: 'db01', columns: ['databaseName', 'usagePercent'], rows: [['PORTAL', '12']] }];
  const log = { item: 'DB_TRANSACTION_LOG', name: '트랜잭션 로그', status: 'Healthy', result: { components: [{ type: 'SUMMARY' }, { type: 'LOG_TABLE' }] }, detail: { queries } };
  const json = { item: 'DB_REPLICATION', name: '복제', status: 'NotCollected', result: { components: [{ type: 'SUMMARY' }, { type: 'TABLE' }, { type: 'JSON' }] }, detail: { queries } };
  for (const box of boxes(await render([log, json]))) {
    assert.equal(box.find('pre').length, 0, 'JSON 원문 없음');
    assert.equal(box.find('table').length, 1, '쿼리 표 한 번');
    assert.equal(box.find('td').map((cell) => cell.textContent).join(','), 'PORTAL,12');
    assert.doesNotMatch(box.textContent, /표시할 로그 데이터가 없습니다/);
  }
});

test('측정값은 숫자만 보여 주고, 숫자가 없으면 그 칸을 만들지 않는다', async () => {
  const metric = { item: 'WEB_REQUEST_VOLUME', name: '요청 처리량', status: 'NotCollected', message: '수집 설정이 없습니다.', result: { components: [{ type: 'SUMMARY' }, { type: 'METRIC' }] }, detail: { product: 'WebtoB', status: 'NotCollected', message: '수집 설정이 없습니다.' } };
  const box = boxes(await render([metric]))[0];
  assert.doesNotMatch(box.textContent, /product|WebtoB/);
  assert.equal(box.find('div', 'report-item-body').length, 0);
});

test('결과가 비어 있고 안내 메시지가 있으면 "데이터 없음" 칸을 덧붙이지 않는다', async () => {
  const empty = { item: 'WEB_WAS_CONNECTION', name: '연동 상태', status: 'NotCollected', result: { components: [{ type: 'SUMMARY' }, { type: 'TABLE' }] }, detail: { message: '대상이 설정되지 않았습니다.' } };
  const box = boxes(await render([empty]))[0];
  assert.match(box.textContent, /대상이 설정되지 않았습니다/);
  assert.doesNotMatch(box.textContent, /표시할 행 데이터가 없습니다/);
  // 메시지가 없으면 빈 결과 안내는 그대로
  const bare = boxes(await render([{ ...empty, detail: {} }]))[0];
  assert.match(bare.textContent, /표시할 행 데이터가 없습니다/);
});

test('열 이름이 설정되지 않은 쿼리 표의 상태 열은 "상태"로 보인다', async () => {
  const item = { item: 'X', name: 'x', status: 'Healthy', result: { components: [{ type: 'SUMMARY' }, { type: 'LOG_TABLE' }] }, detail: { queries: [{ target: 't', columns: ['__OPSBOX_STATUS', 'logSizeMB'], rows: [['Healthy', '10']] }] } };
  assert.deepEqual(boxes(await render([item]))[0].find('th').map((cell) => cell.textContent), ['상태', 'logSizeMB']);
});

test('표의 상태 열(status·__OPSBOX_STATUS) 값은 상태 이름으로 보인다', async () => {
  const builder = { item: 'A', name: 'a', status: 'Warning', result: { components: [{ type: 'SUMMARY' }, { type: 'TABLE', columns: [{ key: 'target', label: '대상' }, { key: 'status', label: '상태' }] }] }, detail: { rows: [{ target: 'x', status: 'Warning' }] } };
  const query = { item: 'B', name: 'b', status: 'Healthy', result: { components: [{ type: 'SUMMARY' }, { type: 'TABLE' }] }, detail: { queries: [{ target: 't', columns: ['__OPSBOX_STATUS', 'db'], rows: [['Healthy', 'app']] }] } };
  const [first, second] = boxes(await render([builder, query]));
  assert.deepEqual(first.find('td').map((cell) => cell.textContent), ['x', '경고']);
  assert.deepEqual(second.find('td').map((cell) => cell.textContent), ['정상', 'app']);
});

test('내용 블록 소제목은 공통코드 resultViews 이름(공통코드에서 바꾼 이름 반영)', async () => {
  const { setCodes, resetCodes } = await import('../src/public/shared/js/codes.js');
  setCodes({ resultViews: [{ value: 'TABLE', label: '결과 표' }, { value: 'CONSOLE', label: '콘솔' }] });
  try {
    const box = boxes(await render([items[0]]))[0];
    assert.deepEqual(box.find('h4').map((node) => node.textContent), ['결과 표', '콘솔']);
  } finally {
    resetCodes();
  }
});

test('로그 점검(WEB_LOG·WAS_LOG)은 로그 표 위에 검사 범위와 에러 유형별 건수 표시등을 보여 준다', async () => {
  const log = { item: 'WEB_LOG', name: 'WEB 로그', status: 'Critical', result: { components: [{ type: 'SUMMARY' }, { type: 'LOG_TABLE' }] },
    detail: { status: 'Critical', periodDays: 7, checkedFileCount: 2, scannedLineCount: 12400, matchedLineCount: 9, categories: { fatal: 1, errorException: 3, warning: 2, http5xx: 0, http4xx: 1 },
      readErrorCount: 0, samples: [{ path: '/var/log/nginx/error.log', timestamp: '2026-11-22 10:00:00', text: 'ERROR upstream timed out' }] } };
  const meters = (box: FakeElement) => box.find('div', 'report-log-meters')[0]?.find('span', 'server-badge') ?? [];
  const box = boxes(await render([log]))[0];
  assert.equal(box.find('p', 'report-log-scope')[0].textContent, '최근 7일 로그 파일 2개, 12,400줄을 검사해 9줄을 찾았습니다.');
  assert.deepEqual(meters(box).map((meter) => meter.textContent),
    ['Fatal 1', 'Error/Exception 3', 'HTTP 5xx 0', 'Warning 2', 'HTTP 4xx 1'], '위험 유형 먼저, 경고 유형 다음');
  // 상태 배지와 같은 표시등: Fatal·Error·5xx 는 위험, Warning·4xx 는 경고, 0건은 꺼진 점
  assert.deepEqual(meters(box).map((meter) => meter.className), ['server-badge badge-danger', 'server-badge badge-danger', 'server-badge badge-muted', 'server-badge badge-warning', 'server-badge badge-warning']);
  assert.equal(box.find('td').map((cell) => cell.textContent).join(','), '2026-11-22 10:00:00,/var/log/nginx/error.log,ERROR upstream timed out', '로그 표는 그대로');
  assert.equal(box.find('h4').length, 0, '블록은 하나(로그)라 소제목 없음');
  assert.equal(box.find('p', 'report-log-read-error').length, 0);

  // 발견 0건이어도 다섯 가지 모두 보이고 모두 꺼짐, 빈 로그 안내는 덧붙이지 않음
  const clean = boxes(await render([{ ...log, status: 'Healthy', detail: { ...log.detail, matchedLineCount: 0, categories: { fatal: 0, errorException: 0, warning: 0, http5xx: 0, http4xx: 0 }, samples: [] } }]))[0];
  assert.equal(meters(clean).length, 5);
  assert.ok(meters(clean).every((meter) => meter.className === 'server-badge badge-muted'));
  assert.doesNotMatch(clean.textContent, /표시할 로그 데이터가 없습니다/);
  // 읽기 실패는 건수 아래 한 줄
  const failed = boxes(await render([{ ...log, detail: { ...log.detail, readErrorCount: 1, readErrors: [{ path: '/var/log/x.log', message: 'Permission denied' }] } }]))[0];
  assert.equal(failed.find('p', 'report-log-read-error')[0].textContent, '읽지 못한 파일 1개: /var/log/x.log (Permission denied)');
  // 미수집(categories 비어 있음)은 건수 없이 안내 메시지만
  const missing = boxes(await render([{ ...log, status: 'NotCollected', detail: { status: 'NotCollected', message: '서버 정책에서 WEB 로그 폴더를 지정하세요.', categories: {}, periodDays: 7 } }]))[0];
  assert.equal(missing.find('div', 'report-log-counts').length, 0);
  assert.match(missing.textContent, /WEB 로그 폴더를 지정하세요/);
});
