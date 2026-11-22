import { TEST_ROOT } from './helpers/env';

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';

// 수신함은 OpsBox 모듈을 불러오기 전에 정합니다(가져오기가 시작할 때 읽음).
const inboxA = path.join(TEST_ROOT, 'inbox-a');
const inboxB = path.join(TEST_ROOT, 'inbox-b');
process.env.OPSBOX_RESULT_INBOX = `${inboxA};${inboxB}`;

const { createServer } = require('../src/features/servers/service') as typeof import('../src/features/servers/service');
const { generateScript } = require('../src/features/scripts/service') as typeof import('../src/features/scripts/service');
const { importResults } = require('../src/features/results/importer') as typeof import('../src/features/results/importer');
const { getResultPathSettings, saveResultPathSettings } = require('../src/features/settings/service') as typeof import('../src/features/settings/service');

const linuxServer = (id: string) => ({ id, name: id, roles: ['OTHER'], products: {}, os: 'Linux', ip: '10.0.0.70', processes: [], directories: [] } as any);
const windowsServer = (id: string) => ({ id, name: id, roles: ['OTHER'], products: {}, os: 'Windows', ip: '10.0.0.71', processes: [], directories: [] } as any);
const result = (serverId: string, collectedAt: string) => JSON.stringify({
  schemaVersion: 2,
  server: { id: serverId, name: serverId, roles: ['OTHER'], products: {} },
  collectedAt,
  resources: { cpu: { usagePercent: 10 }, memory: { usagePercent: 20 }, disk: { maxUsagePercent: 30, volumes: [] } },
  checks: {},
  summary: { status: 'Healthy' },
});

test('결과 저장 경로: 서버 값 → OS 기본값 → 빈 값(스크립트 폴더) 순서', () => {
  saveResultPathSettings({ windows: '\\\\NAS\\opsbox\\results', linux: '/mnt/opsbox/results' });
  createServer(linuxServer('P-L1'));
  createServer({ ...linuxServer('P-L2'), resultPath: '/data/opsbox' });
  assert.match(generateScript('P-L1'), /OPSBOX_RESULT_DIR='\/mnt\/opsbox\/results'/);
  assert.match(generateScript('P-L2'), /OPSBOX_RESULT_DIR='\/data\/opsbox'/);
  saveResultPathSettings({ linux: '' });
  assert.match(generateScript('P-L1'), /OPSBOX_RESULT_DIR=''/);
  assert.equal(getResultPathSettings().windows, '\\\\NAS\\opsbox\\results', '보내지 않은 OS 값은 그대로');
});

test('결과 저장 경로: 서버 OS에 맞지 않는 경로는 거부', () => {
  assert.throws(() => createServer({ ...linuxServer('P-L3'), resultPath: 'D:\\share' }), /결과 저장 경로는 Linux 절대 경로여야 합니다/);
  assert.throws(() => createServer({ ...windowsServer('P-W9'), resultPath: '/mnt/x' }), /결과 저장 경로는 Windows 절대 경로여야 합니다/);
  assert.throws(() => saveResultPathSettings({ windows: '/mnt/x' }), /결과 저장 경로는 Windows 절대 경로여야 합니다/);
  assert.throws(() => saveResultPathSettings({ linux: 'relative/dir' }), /결과 저장 경로는 Linux 절대 경로여야 합니다/);
});

test('결과 저장 경로: 서버 응답에는 sharedPath 대신 resultPath(지정했을 때만)', () => {
  const server = createServer({ ...windowsServer('P-W2'), resultPath: 'D:\\opsbox\\results' });
  assert.equal(server.resultPath, 'D:\\opsbox\\results');
  assert.equal('sharedPath' in server, false);
  assert.equal('resultPath' in createServer(windowsServer('P-W3')), false);
});

test('Windows 스크립트는 하위 폴더 없이 <서버ID>_<시각>.json으로 저장', () => {
  createServer(windowsServer('P-W1'));
  const script = generateScript('P-W1');
  assert.doesNotMatch(script, /Get-Date -Format 'yyyy'\)\) \$opsboxConfig\.server\.id/);
  assert.match(script, /"\$\(\$opsboxConfig\.server\.id\)_\$opsboxRunStamp\.json"/);
  assert.match(script, /\$opsboxConfig\.server\.resultDirectory/);
});

test('수신함: OPSBOX_RESULT_INBOX의 각 폴더 바로 아래 파일만 가져온다', () => {
  fs.mkdirSync(path.join(inboxA, '2026', 'P-L1'), { recursive: true });
  fs.mkdirSync(inboxB, { recursive: true });
  fs.writeFileSync(path.join(inboxA, 'a.json'), result('P-L1', '2026-06-01 00:00:00'));
  fs.writeFileSync(path.join(inboxB, 'b.json'), result('P-L1', '2026-06-02 00:00:00'));
  fs.writeFileSync(path.join(inboxA, '2026', 'P-L1', 'old.json'), result('P-L1', '2026-06-03 00:00:00'));
  assert.equal(importResults().imported, 2);
  assert.ok(fs.existsSync(path.join(inboxA, '2026', 'P-L1', 'old.json')), '하위 폴더 파일은 건드리지 않음');
  assert.deepEqual(getResultPathSettings().inboxes, [inboxA, inboxB]);
});
