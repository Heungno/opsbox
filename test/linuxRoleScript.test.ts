import { TEST_ROOT, makeDir } from './helpers/env';

import assert from 'node:assert/strict';
import { spawn, spawnSync, ChildProcess } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { after, before, test } from 'node:test';

import { createServer } from '../src/services/serverService';
import { generateScript } from '../src/services/scriptService';
import { getHealthStatus, parseResultJson } from '../src/services/resultService';

/*
 * Linux 역할별(WEB·WAS) 점검 조각 테스트
 * 가짜 java 프로세스(bash 복사본)와 그 옆의 가짜 jstat으로 Heap·Heap Dump 점검을,
 * 임시 로그 파일로 로그 점검을 실제 bash 실행으로 확인합니다. (Android Termux에서도 실행 가능)
 */
const canRunBash = process.platform === 'linux' || process.platform === 'android';

const shared = makeDir('share');
const scriptDir = makeDir('scripts');
const logDir = makeDir('logs', 'web');
const dumpDir = makeDir('dumps');
const fakeJdk = makeDir('jdk', 'bin');

const now = new Date();
const pad = (n: number) => String(n).padStart(2, '0');
const stamp = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
const old = new Date(now.getTime() - 30 * 86400_000);
const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const apacheStamp = `${pad(now.getDate())}/${months[now.getMonth()]}/${now.getFullYear()}:${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;

fs.writeFileSync(path.join(logDir, 'app.log'), [
  `${stamp(old)} ERROR 오래된 오류 (기간 밖이라 세지 않음)`,
  `${stamp(now)} ERROR 접속 실패 "따옴표" 와 역슬래시 \\ 와\t탭`,
  `${stamp(now)} WARN 응답 지연`,
  `${stamp(now)} INFO 정상 처리`,
  `127.0.0.1 - - [${apacheStamp} +0900] "GET /none HTTP/1.1" 404 12`,
].join('\n') + '\n');
fs.writeFileSync(path.join(logDir, 'ignored.gz'), 'ERROR 압축 파일은 읽지 않음\n');
fs.writeFileSync(path.join(dumpDir, 'java_pid1.hprof'), Buffer.alloc(2048));

// 가짜 JDK: java(= bash 복사본)와 jstat -gc 출력을 흉내 내는 스크립트
const bashPath = spawnSync('bash', ['-c', 'command -v bash'], { encoding: 'utf8' }).stdout.trim() || '/bin/bash';
const fakeJava = path.join(fakeJdk, 'java');
fs.copyFileSync(bashPath, fakeJava);
fs.chmodSync(fakeJava, 0o755);
fs.writeFileSync(path.join(fakeJdk, 'jstat'), `#!${bashPath}
echo ' S0C    S1C    S0U    S1U      EC       EU        OC         OU       MC     MU    YGC     YGCT    FGC    FGCT     GCT'
echo '1024.0 1024.0  0.0    512.0  8192.0   4096.0   20480.0    10240.0  4864.0 4600.0     5    0.050   1      0.100    0.150'
`);
fs.chmodSync(path.join(fakeJdk, 'jstat'), 0o755);

createServer({
  id: 'LNX-ROLE', name: '역할 서버', type: 'WEB', roles: ['WEB', 'WAS', 'DB'], products: { WEB: 'Nginx', WAS: 'Apache Tomcat', DB: 'PostgreSQL' },
  os: 'Linux', ip: '10.0.0.10', sharedPath: shared,
  policyIds: { BASIC: 'linux-basic-default', WEB: 'linux-web-default', WAS: 'linux-was-default', DB: 'linux-db-default' },
  roleChecks: {
    WEB: ['WEB_ENGINE_STATUS', 'WEB_WAS_CONNECTION', 'WEB_REQUEST_VOLUME', 'WEB_LOG'],
    WAS: ['WAS_JVM_HEAP', 'WAS_THREAD_POOL', 'WAS_LONG_RUNNING_THREAD', 'WAS_DB_CONNECTION_POOL', 'WAS_DEPLOYMENT', 'WAS_HEAP_DUMP', 'WAS_STARTUP_SCRIPT', 'WAS_LOG'],
    DB: ['DB_INSTANCE_STATUS'],
  },
  rolePolicySettings: {
    WEB_LOG: { logDirectories: [logDir], periodDays: 7 },
    WAS_LOG: { logDirectories: ['/no/such/was-logs'], periodDays: 3 },
  },
  processes: [], directories: [],
} as any);

let javaProcess: ChildProcess | undefined;
let json: any;
let savedText = '';

before(() => {
  if (!canRunBash) return;
  // comm이 java인 프로세스. 반복문이라 bash가 sleep으로 바뀌지 않고, 끝낼 때 남는 sleep도 1초 안에 끝납니다.
  javaProcess = spawn(fakeJava, ['-c', 'while :; do sleep 1; done', 'java', `-XX:HeapDumpPath=${dumpDir}`], { stdio: 'ignore' });
  spawnSync('sleep', ['0.3']);
  const scriptPath = path.join(scriptDir, 'LNX-ROLE.sh');
  fs.writeFileSync(scriptPath, generateScript('LNX-ROLE'));
  const run = spawnSync('bash', [scriptPath], { cwd: scriptDir, encoding: 'utf8', timeout: 60_000 });
  assert.equal(run.status, 0, `실행 실패\n${run.stdout}\n${run.stderr}`);
  const saved = /Result JSON: (.+)$/m.exec(run.stdout)?.[1];
  assert.ok(saved, run.stdout);
  savedText = fs.readFileSync(saved, 'utf8');
  json = JSON.parse(savedText);
});

after(() => { javaProcess?.kill(); });

const roleItem = (role: string, item: string) => json.checks.rolePolicies[role].items.find((entry: any) => entry.item === item);

test('정책에 있는 역할별 항목이 순서대로 이름과 함께 기록된다', { skip: !canRunBash }, () => {
  assert.deepEqual(json.checks.rolePolicies.WEB.items.map((entry: any) => entry.item), ['WEB_ENGINE_STATUS', 'WEB_WAS_CONNECTION', 'WEB_REQUEST_VOLUME', 'WEB_LOG']);
  assert.equal(json.checks.rolePolicies.WAS.items.length, 8);
  assert.equal(roleItem('WEB', 'WEB_LOG').name, 'WEB 로그 상태');
  assert.ok(roleItem('WAS', 'WAS_JVM_HEAP').result, '보고서 표시 정의(result) 포함');
  assert.equal(json.checks.web.product, 'Nginx');
  assert.equal(json.checks.web.detail.product, 'Nginx');
});

test('WEB 로그: 기간 안의 줄만 세고, 따옴표·역슬래시가 든 줄도 올바른 JSON으로 남긴다', { skip: !canRunBash }, () => {
  const log = roleItem('WEB', 'WEB_LOG');
  assert.equal(log.status, 'Critical');
  assert.equal(log.detail.checkedFileCount, 1, '.gz 파일은 제외');
  assert.equal(log.detail.categories.errorException, 1, '30일 전 오류는 제외');
  assert.equal(log.detail.categories.warning, 1);
  assert.ok(log.detail.categories.http4xx >= 1);
  assert.ok(log.detail.samples.some((sample: any) => sample.text.includes('"따옴표" 와 역슬래시 \\ 와')));
  assert.ok(log.detail.samples.some((sample: any) => sample.text.includes('404') && sample.timestamp));
});

test('WAS 로그: 없는 폴더는 미수집과 안내 메시지로 남는다', { skip: !canRunBash }, () => {
  const log = roleItem('WAS', 'WAS_LOG');
  assert.equal(log.status, 'NotCollected');
  assert.match(log.detail.message, /존재하지 않는 경로/);
  assert.equal(log.detail.periodDays, 3);
});

test('WAS Heap: java 옆의 jstat으로 사용률을 계산한다', { skip: !canRunBash }, () => {
  const heap = roleItem('WAS', 'WAS_JVM_HEAP');
  const entry = heap.detail.find((item: any) => item.processId === javaProcess?.pid);
  assert.ok(entry, JSON.stringify(heap.detail));
  assert.equal(entry.heapUsagePercent, 48.3);
  assert.equal(entry.heapCapacityMB, 30);
  assert.equal(entry.status, 'Healthy');
  assert.ok(json.checks.was.items.some((item: any) => item.heapUsagePercent === 48.3), '보고서 WAS 표에도 기록');
});

test('WAS Heap Dump·배포·미지원 항목', { skip: !canRunBash }, () => {
  const dump = roleItem('WAS', 'WAS_HEAP_DUMP');
  assert.equal(dump.status, 'Warning');
  assert.equal(dump.detail.existingFileCount, 1);
  assert.equal(roleItem('WAS', 'WAS_DEPLOYMENT').status, 'Healthy');
  assert.equal(roleItem('WAS', 'WAS_THREAD_POOL').status, 'NotCollected');
  assert.match(roleItem('WAS', 'WAS_THREAD_POOL').detail.message, /JMX/);
  assert.equal(json.checks.rolePolicies.WAS.status, 'Warning');
});

test('DB 항목은 서버 DB 제품(PostgreSQL)용 기본 쿼리로 DB 쿼리 실행기가 기록한다', { skip: !canRunBash }, () => {
  const db = roleItem('DB', 'DB_INSTANCE_STATUS');
  assert.equal(db.detail.queryName, 'PostgreSQL 쿼리 · DB 인스턴스·접속 상태');
  assert.equal(db.detail.queries.length, 1, '대상을 비우면 기본 접속 1곳');
  assert.equal(json.checks.database.product, 'PostgreSQL');
});

test('OpsBox가 결과를 읽어 종합 상태를 판정한다', { skip: !canRunBash }, () => {
  const parsed = parseResultJson(savedText);
  assert.equal(parsed.server, 'LNX-ROLE');
  assert.equal(getHealthStatus(parsed), 'Critical');
  assert.equal(json.summary.status, 'Critical');
  assert.ok(TEST_ROOT);
});
