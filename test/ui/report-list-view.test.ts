import assert from 'node:assert/strict';
import { beforeEach, test } from 'node:test';

import { FakeElement, installFakeDocument } from '../helpers/fakeDom';
import { filterReports, renderReportSummary, renderReportTable, summarizeReports } from '../../src/public/reports/report-list-view.js';

beforeEach(() => { installFakeDocument(); });

const report = (serverId: string, checkDate: string, health = 'Healthy') => ({ serverId, serverName: `${serverId} 이름`, serverType: 'WEB', serverTypes: ['WEB'], checkDate, health, cpu: 1, memory: 2, disk: 3, fileName: `${serverId}_${checkDate}.json` });
const REPORTS = [report('A', '2026-01-01 00:00:00'), report('B', '2026-01-03 00:00:00', 'Critical'), report('A', '2026-01-02 00:00:00')];

test('보고서 목록: 서버·상태로 거르고 최신순', () => {
  assert.deepEqual(filterReports(REPORTS, { serverIds: new Set(['A']), health: null }).map((r: any) => r.checkDate), ['2026-01-02 00:00:00', '2026-01-01 00:00:00']);
  assert.deepEqual(filterReports(REPORTS, { serverIds: null, health: 'Critical' }).map((r: any) => r.serverId), ['B']);
  assert.deepEqual(filterReports(REPORTS, { serverIds: new Set(), health: null }), []);
});

test('보고서 목록: 요약은 건수·상태별 수·최근 점검', () => {
  assert.deepEqual(summarizeReports(REPORTS), { total: 3, healthy: 2, warning: 0, critical: 1, latest: { checkDate: '2026-01-03 00:00:00', serverName: 'B 이름' } });
  assert.deepEqual(summarizeReports([]), { total: 0, healthy: 0, warning: 0, critical: 0, latest: null });
});

test('보고서 목록: 요약 카드 — 상태 카드는 눌림 표시와 토글', () => {
  const box = new FakeElement('div');
  const picked: Array<string | null> = [];
  renderReportSummary(box, summarizeReports(REPORTS), { activeHealth: 'Warning', onHealth: (h: string | null) => picked.push(h) });
  assert.deepEqual(box.find('span').map((s) => s.textContent), ['보고서', '정상', '경고', '위험', '최근 점검']);
  const buttons = box.find('button', 'summary-card');
  assert.deepEqual(buttons.map((b) => [b.getAttribute('data-health'), b.getAttribute('aria-pressed')]), [['Healthy', 'false'], ['Warning', 'true'], ['Critical', 'false']]);
  buttons[1].dispatch('click');
  buttons[2].dispatch('click');
  assert.deepEqual(picked, [null, 'Critical']);
  assert.match(box.textContent, /2026-01-03 00:00:00B 이름/);

  renderReportSummary(box, summarizeReports([]), { activeHealth: null, onHealth: () => {} });
  assert.equal(box.find('strong').at(-1)!.textContent, '-');
});

test('보고서 목록: 표 — 칸 순서, 서버 이름 (ID), 0건 안내', () => {
  const box = new FakeElement('div');
  renderReportTable(box, []);
  assert.equal(box.textContent, '조건에 맞는 보고서가 없습니다.');
  renderReportTable(box, [REPORTS[0]]);
  assert.deepEqual(box.find('th').map((th) => th.textContent), ['점검일시', '서버', '상태', 'CPU', 'MEM', 'DISK', '보고서']);
  assert.equal(box.find('td')[1].textContent, 'A 이름 (A)');
  assert.equal(box.find('a')[0].href, `/reports/detail?serverId=A&file=${encodeURIComponent('A_2026-01-01 00:00:00.json')}`);
});
