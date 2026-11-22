import assert from 'node:assert/strict';
import { beforeEach, test } from 'node:test';

import { FakeElement, installFakeDocument } from '../helpers/fakeDom';
import { resetCodes, setCodes } from '../../src/public/shared/js/codes.js';
import { renderAuditRows, targetText } from '../../src/public/settings/audit-logs/audit-logs-view.js';

beforeEach(() => { installFakeDocument(); resetCodes(); });

test('변경 이력: 대상 이름은 auditTargets, 모르면 값', () => {
  setCodes({ auditTargets: [{ value: 'SETTINGS', label: '설정' }] });
  assert.equal(targetText({ targetType: 'SETTINGS', targetId: 'result-paths' }), '설정 · result-paths');
  assert.equal(targetText({ targetType: 'NEW' }), 'NEW');
});

test('변경 이력: 행을 누르면 상세(변경 전·후 표)가 열린다', () => {
  const tbody = new FakeElement('tbody');
  renderAuditRows(tbody, [{ id: 1, at: '2026-11-22T00:00:00.000Z', username: 'demo', action: 'SERVER_DEACTIVATE', targetType: 'SERVER', targetId: 'A', summary: '서버 미사용', changes: [{ field: 'enabled', before: true, after: false }], ip: '1.1.1.1' }], { SERVER_DEACTIVATE: '서버 미사용' });
  const [row, detail] = tbody.children;
  assert.equal(detail.hidden, true);
  row.dispatch('click');
  assert.equal(detail.hidden, false);
  assert.deepEqual(detail.find('th').map((th) => th.textContent), ['항목', '변경 전', '변경 후']);
  assert.equal(row.find('span', 'server-badge')[0].textContent, '서버 미사용');
});
