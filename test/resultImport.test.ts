import { TEST_ROOT, makeDir } from './helpers/env';

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';

import { db } from '../src/db/database';
import { activateServer, createServer, deactivateServer } from '../src/features/servers/service';
import { importResults, storeUploadedResult } from '../src/features/results/importer';
import { decryptBackup } from '../src/features/results/backup-crypto';

const shared = makeDir('share');
const inbox = path.join(shared, 'results');
fs.mkdirSync(inbox);

for (const id of ['SRV-A', 'SRV-B']) {
  createServer({ id, name: id, type: 'WEB', roles: ['WEB'], products: { WEB: 'Nginx' }, os: 'Linux', ip: '10.0.0.1', sharedPath: shared } as any);
}

function result(serverId: string, collectedAt: string, extra: Record<string, unknown> = {}) {
  return JSON.stringify({
    schemaVersion: 2,
    server: { id: serverId, name: serverId, roles: ['WEB'], products: {} },
    collectedAt,
    resources: { cpu: { usagePercent: 10 }, memory: { usagePercent: 20 }, disk: { maxUsagePercent: 30, volumes: [] } },
    checks: {},
    summary: { status: 'Healthy' },
    ...extra,
  });
}

function rows() {
  return db.prepare('SELECT server_id, file_name, check_date, backup_path FROM check_results ORDER BY id').all() as Array<Record<string, string>>;
}

test('수신함 바로 아래 파일은 파일 안의 서버 ID로 가져오고, 백업은 점검 연도/서버 폴더로 정리한다', () => {
  fs.writeFileSync(path.join(inbox, 'anything.json'), result('SRV-A', '2025-12-31 23:00:00'));
  const summary = importResults();
  assert.equal(summary.imported, 1);
  assert.equal(summary.failed, 0);
  const [row] = rows();
  assert.equal(row.server_id, 'SRV-A');
  assert.equal(row.check_date, '2025-12-31 23:00:00');
  assert.equal(row.backup_path, path.join(TEST_ROOT, 'backup', '2025', 'SRV-A', 'anything.json.enc'));
  assert.equal(JSON.parse(decryptBackup(fs.readFileSync(row.backup_path)).toString()).server.id, 'SRV-A');
  assert.equal(fs.existsSync(path.join(inbox, 'anything.json')), false, '가져온 원본은 지운다');
});

test('이전 방식 폴더(results/<연도>/<서버ID>/)도 읽는다', () => {
  const legacy = path.join(inbox, '2026', 'SRV-B');
  fs.mkdirSync(legacy, { recursive: true });
  fs.writeFileSync(path.join(legacy, 'b.json'), result('SRV-B', '2026-01-02 03:04:05'));
  assert.equal(importResults().imported, 1);
  assert.equal(rows().at(-1)?.server_id, 'SRV-B');
});

test('폴더 이름과 파일 안의 서버 ID가 다르면 가져오지 않고 원본을 남긴다', () => {
  const wrong = path.join(inbox, '2026', 'SRV-B');
  fs.writeFileSync(path.join(wrong, 'wrong.json'), result('SRV-A', '2026-02-02 00:00:00'));
  const summary = importResults();
  assert.equal(summary.imported, 0);
  assert.equal(summary.failed, 1);
  assert.match(summary.errors[0].message, /폴더\(SRV-B\)와 다릅니다/);
  assert.ok(fs.existsSync(path.join(wrong, 'wrong.json')));
  fs.rmSync(path.join(wrong, 'wrong.json'));
});

test('등록되지 않은 서버나 서버 ID 없는 파일은 가져오지 않는다', () => {
  fs.writeFileSync(path.join(inbox, 'unknown.json'), result('NO-SUCH', '2026-03-01 00:00:00'));
  fs.writeFileSync(path.join(inbox, 'noid.json'), JSON.stringify({ ...JSON.parse(result('X', '2026-03-01 00:00:00')), server: { roles: ['WEB'] } }));
  const summary = importResults();
  assert.equal(summary.failed, 2);
  const messages = summary.errors.map((error) => error.message).join('\n');
  assert.match(messages, /등록되지 않은 서버 ID입니다: NO-SUCH/);
  assert.match(messages, /서버 ID가 없습니다/);
  fs.rmSync(path.join(inbox, 'unknown.json'));
  fs.rmSync(path.join(inbox, 'noid.json'));
});

test('같은 내용은 한 번만 저장한다', () => {
  const content = result('SRV-A', '2026-04-01 00:00:00');
  fs.writeFileSync(path.join(inbox, 'dup1.json'), content);
  fs.writeFileSync(path.join(inbox, 'dup2.json'), content);
  const summary = importResults();
  assert.equal(summary.imported, 1);
  assert.equal(summary.duplicates, 1);
});

test('화면에서 올린 파일도 같은 검증을 거친다', () => {
  const content = Buffer.from(result('SRV-A', '2026-05-01 00:00:00'));
  const stored = storeUploadedResult(content, '../../etc/evil name.json', 'SRV-A');
  assert.equal(stored.outcome, 'imported');
  assert.equal(stored.fileName, 'evil_name.json', '경로와 특수문자를 제거한다');
  assert.equal(storeUploadedResult(content, 'again.json', 'SRV-A').outcome, 'duplicate');
  assert.throws(() => storeUploadedResult(content, 'x.json', 'SRV-B'), /SRV-A 서버의 결과입니다/);
  assert.throws(() => storeUploadedResult(Buffer.from('not json'), 'x.json', 'SRV-A'), /JSON 형식이 아닙니다/);
  assert.throws(() => storeUploadedResult(Buffer.from(result('NO-SUCH', '2026-05-01 00:00:00')), 'x.json'), /등록되지 않은 서버/);
});

test('미사용 서버의 결과는 가져오지 않고 원본을 남긴다', () => {
  deactivateServer('SRV-B');
  fs.writeFileSync(path.join(inbox, 'off.json'), result('SRV-B', '2026-04-01 00:00:00'));
  const summary = importResults();
  assert.equal(summary.imported, 0);
  assert.match(summary.errors[0].message, /미사용 서버의 결과입니다: SRV-B\. 서버 목록에서 \[다시 사용\]을 누른 뒤 가져오세요\./);
  assert.ok(fs.existsSync(path.join(inbox, 'off.json')));
  assert.throws(() => storeUploadedResult(Buffer.from(result('SRV-B', '2026-04-02 00:00:00')), 'up.json', 'SRV-B'), /미사용 서버의 결과입니다: SRV-B/);
  activateServer('SRV-B');
  assert.equal(importResults().imported, 1);
});

test('schemaVersion 2가 아니거나 점검 일시 형식이 다르면 가져오지 않는다', () => {
  assert.throws(() => storeUploadedResult(Buffer.from(JSON.stringify({ server: 'SRV-A', checkDate: '2026-01-01 00:00:00' })), 'v1.json'), /지원하지 않는 결과 형식입니다\(schemaVersion 2만 지원\)/);
  assert.throws(() => storeUploadedResult(Buffer.from(result('SRV-A', '2026-01-01T00:00:00Z')), 't.json'), /점검 일시\(collectedAt\) 형식이 올바르지 않습니다: 2026-01-01T00:00:00Z/);
  assert.throws(() => storeUploadedResult(Buffer.from(result('SRV-A', '')), 'empty.json'), /점검 일시\(collectedAt\) 형식이 올바르지 않습니다/);
});

test('호스트 이름은 가져올 때 열에 저장한다', () => {
  storeUploadedResult(Buffer.from(result('SRV-A', '2026-05-01 00:00:00', { host: { hostname: 'web-a.local' } })), 'host.json');
  const row = db.prepare("SELECT hostname FROM check_results WHERE file_name = 'host.json'").get() as { hostname: string };
  assert.equal(row.hostname, 'web-a.local');
});
