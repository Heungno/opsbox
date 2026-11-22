import './helpers/env';

import assert from 'node:assert/strict';
import { test } from 'node:test';

import { activateServer, createServer, deactivateServer } from '../src/features/servers/service';
import { storeUploadedResult } from '../src/features/results/importer';
import { getAllReports } from '../src/features/reports/service';
import { getDashboardSummary, getRecentChecks } from '../src/features/dashboard/service';

createServer({ id: 'WEB-A', name: '웹 A', type: 'WEB', roles: ['WEB'], products: { WEB: 'Nginx' }, os: 'Linux', ip: '10.0.0.1' } as any);
createServer({ id: 'DB-B', name: '디비 B', type: 'WAS', roles: ['WAS'], products: { WAS: 'Apache Tomcat' }, os: 'Windows', ip: '10.0.0.2' } as any);

function v2(serverId: string, collectedAt: string, status: string, extra: Record<string, unknown> = {}) {
  return Buffer.from(JSON.stringify({
    schemaVersion: 2,
    server: { id: serverId, name: serverId, roles: ['WEB'], products: {} },
    collectedAt,
    host: { hostname: `${serverId.toLowerCase()}-host` },
    resources: { cpu: { usagePercent: 11 }, memory: { usagePercent: 22 }, disk: { maxUsagePercent: 33, volumes: [{ usagePercent: 44 }] } },
    checks: {},
    summary: { status },
    ...extra,
  }));
}

storeUploadedResult(v2('WEB-A', '2026-11-01 09:00:00', 'Healthy'), 'a1.json');
storeUploadedResult(v2('WEB-A', '2026-11-15 09:00:00', 'Warning'), 'a2.json');
storeUploadedResult(v2('DB-B', '2026-11-10 09:00:00', 'Critical'), 'b1.json');
storeUploadedResult(Buffer.from(JSON.stringify({
  schemaVersion: 2,
  server: { id: 'DB-B', name: 'DB-B', roles: ['WAS'], products: {} },
  collectedAt: '2026-11-20 08:00:00',
  host: { hostname: 'old-host' },
  resources: { cpu: { usagePercent: 5 }, memory: { usagePercent: 6 }, disk: { volumes: [{ usagePercent: 70, status: 'Healthy' }] } },
  checks: {},
  summary: { status: 'Healthy' },
})), 'b-old.json');

test('점검 일시가 없는 결과는 가져오지 않는다(목록에 빈 날짜가 생기지 않음)', () => {
  assert.throws(() => storeUploadedResult(Buffer.from(JSON.stringify({ schemaVersion: 2, server: { id: 'DB-B' }, host: { hostname: 'no-date' }, checks: {} })), 'b-nodate.json'), /점검 일시\(collectedAt\)/);
});

test('보고서 목록: 모든 서버의 결과를 최신 점검 순으로, 서버 정보와 요약 수치를 붙여 돌려준다', () => {
  const reports = getAllReports();
  assert.deepEqual(reports.map((r) => r.fileName), ['b-old.json', 'a2.json', 'b1.json', 'a1.json']);
  const a2 = reports.find((r) => r.fileName === 'a2.json')!;
  assert.equal(a2.serverId, 'WEB-A');
  assert.equal(a2.serverName, '웹 A');
  assert.equal(a2.os, 'Linux');
  assert.deepEqual(a2.serverTypes, ['WEB']);
  assert.equal(a2.hostname, 'web-a-host');
  assert.equal(a2.checkDate, '2026-11-15 09:00:00');
  assert.equal(a2.health, 'Warning');
  assert.equal(a2.cpu, 11);
  assert.equal(a2.memory, 22);
  assert.equal(a2.disk, 44, '디스크는 볼륨 중 최대 사용률');

  const old = reports.find((r) => r.fileName === 'b-old.json')!;
  assert.equal(old.hostname, 'old-host');
  assert.equal(old.cpu, 5);
  assert.equal(old.disk, 70);
});

test('보고서 목록: 서버(ID·이름 일부)와 날짜 범위(양 끝 포함)로 거른다', () => {
  assert.deepEqual(getAllReports({ serverId: 'web' }).map((r) => r.fileName), ['a2.json', 'a1.json']);
  assert.deepEqual(getAllReports({ serverId: '디비' }).map((r) => r.fileName), ['b-old.json', 'b1.json']);
  assert.deepEqual(getAllReports({ startDate: '2026-11-10', endDate: '2026-11-15' }).map((r) => r.fileName), ['a2.json', 'b1.json']);
  assert.deepEqual(getAllReports({ serverId: 'NONE' }), []);
});

test('미사용 서버의 보고서도 목록에 나오고, 대시보드에서는 빠진다', () => {
  deactivateServer('DB-B');
  assert.ok(getAllReports().some((r) => r.serverId === 'DB-B'));
  assert.ok(getAllReports({ serverId: '디비' }).length > 0, '서버 이름 검색도 미사용 서버 포함');
  assert.equal(getRecentChecks().some((c) => c.serverId === 'DB-B'), false);
  assert.equal(getDashboardSummary().total, 1);
  activateServer('DB-B');
  assert.equal(getDashboardSummary().total, 2);
});
