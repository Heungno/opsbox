import { TEST_ROOT } from './helpers/env';

import assert from 'node:assert/strict';
import { spawn, type ChildProcess } from 'node:child_process';
import path from 'node:path';
import { after, before, test } from 'node:test';

/*
 * 콘솔 로그: 요청은 응답이 끝날 때 한 줄로, req/res 같은 JSON 블록은 콘솔에 펼치지 않는다.
 * (자세한 필드는 파일 로그에만 남김) 실제 서버 프로세스를 띄워 표준 출력을 확인합니다.
 */
const port = 30000 + Math.floor(Math.random() * 20000);
let server: ChildProcess;
let output = '';
const plain = () => output.replace(/\u001b\[[0-9;]*m/g, '');

before(async () => {
  server = spawn(process.execPath, ['--import', 'tsx', path.join(__dirname, '..', 'src', 'server.ts')], {
    cwd: path.join(__dirname, '..'),
    env: { ...process.env, OPSBOX_PORT: String(port), OPSBOX_LOG_FILE: 'false', OPSBOX_LOG_LEVEL: 'info', OPSBOX_DB_PATH: path.join(TEST_ROOT, 'console.db') },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  server.stdout!.on('data', (chunk) => { output += chunk; });
  server.stderr!.on('data', (chunk) => { output += chunk; });
  for (let i = 0; i < 100 && !plain().includes('OpsBox 시작'); i++) await new Promise((resolve) => setTimeout(resolve, 200));
  await fetch(`http://127.0.0.1:${port}/api/health`);
  await fetch(`http://127.0.0.1:${port}/api/servers`);
  await new Promise((resolve) => setTimeout(resolve, 800));
});
after(() => server?.kill());

test('요청은 메서드·경로·상태·처리 시간·요청 ID를 담은 한 줄로 남는다', () => {
  assert.match(plain(), /INFO: GET \/api\/health → 200 \(\d+ms\) \[[0-9a-f]{12}\]/);
  assert.match(plain(), /GET \/api\/servers → 401 \(\d+ms\) \[[0-9a-f]{12}\]/);
});

test('요청 시작·완료 로그와 req/res JSON 블록은 콘솔에 나오지 않는다', () => {
  assert.doesNotMatch(plain(), /incoming request|request completed/);
  assert.doesNotMatch(plain(), /remotePort|"statusCode"|responseTime/);
});

test('요청 오류는 상태·코드·메시지를 한 줄로 보여 준다', () => {
  assert.match(plain(), /WARN: 요청 오류 \(401 UNAUTHENTICATED\): 로그인이 필요합니다\. 다시 로그인해 주세요\. \[[0-9a-f]{12}\]/);
});

test('요청과 관계없는 로그의 세부 내용은 계속 보여 준다', () => {
  assert.match(plain(), /OpsBox 시작\n\s+address: "http:\/\/localhost:\d+"/);
});
