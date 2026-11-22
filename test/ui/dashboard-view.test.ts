import assert from 'node:assert/strict';
import { beforeEach, test } from 'node:test';

import { FakeElement, installFakeDocument } from '../helpers/fakeDom';
import { resetCodes, setCodes } from '../../src/public/shared/js/codes.js';
import { fleetCounts, renderRecentChecks } from '../../src/public/dashboard/dashboard-view.js';

beforeEach(() => { installFakeDocument(); resetCodes(); });

const check = { serverId: 'B-1', serverName: '배치', serverType: 'OTHER', checkDate: '2026-11-22 09:00:00', health: 'Warning', cpu: 1, memory: 2, disk: 3, fileName: 'B-1_x.json' };

test('대시보드: 최근 점검 표의 역할 이름은 공통코드', () => {
  setCodes({ serverRoles: [{ value: 'OTHER', label: '기타 서버' }] });
  const tbody = new FakeElement('tbody');
  renderRecentChecks(tbody, [check]);
  const cells = tbody.find('td');
  assert.equal(cells[1].textContent, '기타 서버');
  assert.equal(tbody.find('a', 'btn')[0].href, '/reports/detail?serverId=B-1&file=B-1_x.json');
});

test('대시보드: 상태 분포는 기록 없는 서버를 따로 센다', () => {
  assert.deepEqual(fleetCounts({ total: 10, healthy: 5, warning: 2, critical: 1 }), { healthy: 5, warning: 2, critical: 1, unknown: 2 });
  assert.deepEqual(fleetCounts({ total: 1, healthy: 3 }), { healthy: 3, warning: 0, critical: 0, unknown: 0 });
});

test('대시보드: 유형별 서버 수의 역할 이름은 공통코드', async () => {
  const { applyRoleLabels } = await import('../../src/public/dashboard/dashboard-view.js');
  setCodes({ serverRoles: [{ value: 'OTHER', label: '기타 장비' }] });
  const dt = new FakeElement('dt');
  dt.setAttribute('data-role', 'OTHER');
  dt.textContent = '기타';
  applyRoleLabels([dt]);
  assert.equal(dt.textContent, '기타 장비');
});
