import assert from 'node:assert/strict';
import { beforeEach, test } from 'node:test';

import { FakeElement, installFakeDocument } from '../helpers/fakeDom';
import { codeList, resetCodes, setCodes } from '../../src/public/shared/js/codes.js';
import { groupReports, renderReportTree } from '../../src/public/reports/report-list-view.js';

beforeEach(() => { installFakeDocument(); resetCodes(); });

const report = (serverId: string, roles: string[], checkDate: string) => ({ serverId, serverName: serverId, serverType: roles[0], serverTypes: roles, checkDate, health: 'Healthy', fileName: `${serverId}_${checkDate}.json` });

test('보고서 목록: 역할 묶음 순서와 이름은 공통코드를 따른다', () => {
  setCodes({ serverRoles: [{ value: 'DB', label: '데이터베이스' }, { value: 'WEB', label: 'WEB' }, { value: 'OTHER', label: '기타 서버' }] });
  const groups = groupReports([report('A', ['OTHER'], '2026-01-01 00:00:00'), report('B', ['WEB', 'DB'], '2026-01-02 00:00:00')], codeList('serverRoles').map((c) => c.value));
  assert.deepEqual(groups.map((g) => [g.role, g.label, g.servers.map((s) => s.serverId)]), [
    ['DB', '데이터베이스', ['B']], ['WEB', 'WEB', ['B']], ['OTHER', '기타 서버', ['A']],
  ]);
});

test('보고서 목록: 공통코드에 없는 역할은 기타로, 서버 안에서는 최신 점검부터', () => {
  setCodes({ serverRoles: [{ value: 'WEB', label: 'WEB' }, { value: 'OTHER', label: '기타' }] });
  const groups = groupReports([report('A', ['NEW'], '2026-01-01 00:00:00'), report('A', ['NEW'], '2026-01-03 00:00:00')], ['WEB', 'OTHER']);
  const other = groups.find((g) => g.role === 'OTHER')!;
  assert.deepEqual(other.servers[0].items.map((i: any) => i.checkDate), ['2026-01-03 00:00:00', '2026-01-01 00:00:00']);
});

test('보고서 목록: 공통코드를 못 불러와도 역할 값으로 묶어 보여 준다', () => {
  const groups = groupReports([report('A', ['WEB'], '2026-01-01 00:00:00')], []);
  assert.equal(groups.find((g) => g.servers.length)?.label, 'WEB');
});

test('보고서 목록: 트리에 서버 이름과 건수', () => {
  setCodes({ serverRoles: [{ value: 'WEB', label: 'WEB' }] });
  const tree = new FakeElement('div');
  renderReportTree(tree, groupReports([report('A', ['WEB'], '2026-01-01 00:00:00')], ['WEB']));
  assert.match(tree.textContent, /A \(A\)/);
  assert.match(tree.textContent, /1개 서버 · 1건/);
});
