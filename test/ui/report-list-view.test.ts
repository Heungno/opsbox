import assert from 'node:assert/strict';
import { beforeEach, test } from 'node:test';

import { FakeElement, installFakeDocument } from '../helpers/fakeDom';
import { filterReports, renderReportTable } from '../../src/public/reports/report-list-view.js';

beforeEach(() => { installFakeDocument(); });

const report = (serverId: string, checkDate: string, health = 'Healthy') => ({ serverId, serverName: `${serverId} 이름`, serverType: 'WEB', serverTypes: ['WEB'], checkDate, health, cpu: 1, memory: 2, disk: 3, fileName: `${serverId}_${checkDate}.json` });
const REPORTS = [report('A', '2026-01-01 00:00:00'), report('B', '2026-01-03 00:00:00', 'Critical'), report('A', '2026-01-02 00:00:00')];

test('보고서 목록: 서버로 거르고 최신순', () => {
  assert.deepEqual(filterReports(REPORTS, { serverIds: new Set(['A']) }).map((r: any) => r.checkDate), ['2026-01-02 00:00:00', '2026-01-01 00:00:00']);
  assert.deepEqual(filterReports(REPORTS, { serverIds: null }).map((r: any) => r.serverId), ['B', 'A', 'A']);
  assert.deepEqual(filterReports(REPORTS, { serverIds: new Set() }), []);
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
