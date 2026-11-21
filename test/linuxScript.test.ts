import { TEST_ROOT, makeDir } from './helpers/env';

import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';

import { db } from '../src/db/database';
import { createServer } from '../src/services/serverService';
import { generateScript } from '../src/services/scriptService';
import { parseResultJson, getHealthStatus } from '../src/services/resultService';

const isLinux = process.platform === 'linux';
const shared = makeDir('share');
const scriptDir = makeDir('scripts');
const marker = path.join(TEST_ROOT, 'injected');

createServer({
  id: 'LNX-01', name: '리눅스 서버', type: 'WEB', roles: ['WEB'], products: { WEB: 'Nginx' }, os: 'Linux', ip: '10.0.0.9', sharedPath: shared,
  policyIds: { BASIC: 'linux-basic-default' }, roleChecks: { WEB: ['WEB_ENGINE_STATUS'] },
  processes: [{ name: 'node' }, { name: "no-such-proc's" }, { name: `$(touch ${marker})` }],
  directories: [{ path: os.tmpdir() }, { path: '/no/such dir' }],
  fileChecks: [{ path: '/etc/hostname', warningSizeMB: 1, criticalSizeMB: 2 }],
  ports: [{ port: 65001, protocol: 'TCP', description: `따옴표 " 와 역슬래시 \\ 와 '` }],
  httpChecks: [{ name: '연결 실패', url: 'http://127.0.0.1:1/', expectedStatus: 200 }],
} as any);

const script = generateScript('LNX-01');
const scriptPath = path.join(scriptDir, 'LNX-01.sh');
fs.writeFileSync(scriptPath, script);

function runScript(shell: string, args: string[] = []) {
  const run = spawnSync(shell, [scriptPath, ...args], { cwd: scriptDir, encoding: 'utf8', timeout: 60_000 });
  assert.equal(run.status, 0, `${shell} 실행 실패\n${run.stdout}\n${run.stderr}`);
  const saved = /Result JSON: (.+)$/m.exec(run.stdout)?.[1];
  assert.ok(saved, `결과 경로가 출력되지 않음\n${run.stdout}`);
  return { saved, output: run.stdout, json: JSON.parse(fs.readFileSync(saved, 'utf8')) };
}

test('기존 DB가 아니라 새 DB에도 Linux 기본 템플릿과 정책 항목이 들어간다', () => {
  const count = (db.prepare("SELECT COUNT(*) AS c FROM templates WHERE id LIKE 'LINUX-PART-%'").get() as { c: number }).c;
  assert.equal(count, 24);
  const policy = JSON.parse((db.prepare("SELECT data FROM policies WHERE id = 'linux-basic-default'").get() as { data: string }).data);
  assert.deepEqual(policy.items.map((item: { id: string }) => item.id).slice(-5), ['PROCESS', 'DIRECTORY', 'FILE_SIZE', 'PORT', 'HTTP']);
});

test('생성된 스크립트는 bash로 시작하고 문법 오류가 없다', { skip: !isLinux }, () => {
  assert.ok(script.startsWith('#!/bin/bash\n'));
  assert.ok(!script.includes('\r'), '줄바꿈은 LF');
  execFileSync('bash', ['-n', scriptPath]);
});

test('bash로 실행하면 공유 폴더 results에 OpsBox가 읽을 수 있는 결과를 저장한다', { skip: !isLinux }, () => {
  const { saved, json } = runScript('bash');
  assert.equal(path.dirname(saved), path.join(shared, 'results'));
  assert.match(path.basename(saved), /^LNX-01_\d{8}_\d{6}\.json$/);
  assert.equal(json.schemaVersion, 2);
  assert.equal(json.server.id, 'LNX-01');
  assert.ok(json.host.osName, 'OS 이름 수집');

  const items = json.checks;
  assert.equal(items.processes.items.find((p: any) => p.name === 'node').running, true);
  assert.equal(items.processes.items.find((p: any) => p.name === "no-such-proc's").running, false);
  assert.equal(items.directories.items.find((d: any) => d.path === '/no/such dir').exists, false);
  assert.equal(items.ports.items[0].description, `따옴표 " 와 역슬래시 \\ 와 '`);
  assert.equal(items.http.items[0].success, false);
  assert.equal(items.rolePolicies.WEB.items[0].status, 'NotCollected');
  assert.equal(json.summary.status, 'Critical');

  const parsed = parseResultJson(fs.readFileSync(saved, 'utf8'));
  assert.equal(parsed.server, 'LNX-01');
  assert.equal(getHealthStatus(parsed), 'Critical');
  fs.rmSync(saved);
});

test('설정 값에 든 셸 명령은 실행되지 않는다', { skip: !isLinux }, () => {
  runScript('bash');
  assert.equal(fs.existsSync(marker), false);
});

test('sh로 실행해도 bash로 다시 실행되고, 결과 폴더에 쓸 수 없으면 스크립트 폴더에 저장한다', { skip: !isLinux }, () => {
  const { saved, output } = runScript('sh', ['/proc/opsbox-not-writable']);
  assert.equal(path.dirname(saved), scriptDir);
  assert.match(output, /\[결과 파일 올리기\]/);
});
