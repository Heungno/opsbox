import './helpers/env';

import assert from 'node:assert/strict';
import { test } from 'node:test';

import { app } from '../src/server';
import { createUser } from '../src/features/auth/service';
import { resetLoginThrottle } from '../src/features/auth/login-throttle';

/*
 * 내 정보: 본인 표시 이름·비밀번호 변경
 * - 비밀번호를 바꾸면 다른 브라우저의 로그인(이전 세션)은 끊기고, 바꾼 브라우저는 새 쿠키로 계속 쓴다
 * - 현재 비밀번호를 틀리면 로그인 실패처럼 잠금 횟수에 들어간다
 */
const PASSWORD = 'old-password-123';

async function loginCookie(username: string, password = PASSWORD) {
  const response = await app.inject({ method: 'POST', url: '/api/auth/login', payload: { username, password } });
  assert.equal(response.statusCode, 200, response.body);
  return String(response.headers['set-cookie']).split(';')[0];
}
const cookieOf = (response: { headers: Record<string, unknown> }) => String(response.headers['set-cookie'] ?? '').split(';')[0];
const me = async (cookie: string) => (await app.inject({ method: 'GET', url: '/api/auth/me', headers: { cookie } })).json().data;
const auditActions = async (cookie: string) => (await app.inject({ method: 'GET', url: '/api/audit-logs?pageSize=50', headers: { cookie } })).json().data.map((item: any) => item.action);

test('표시 이름을 바꾸면 바로 반영되고, 다른 브라우저 세션에도 새 이름이 보인다', async () => {
  createUser('acct-name', '처음이름', PASSWORD);
  const first = await loginCookie('acct-name');
  const second = await loginCookie('acct-name');

  const response = await app.inject({ method: 'PUT', url: '/api/auth/me', headers: { cookie: first }, payload: { displayName: '  새 이름  ' } });
  assert.equal(response.statusCode, 200, response.body);
  assert.deepEqual(response.json().data, { username: 'acct-name', displayName: '새 이름' });
  assert.equal((await me(first)).displayName, '새 이름');
  assert.equal((await me(second)).displayName, '새 이름');

  const page = await app.inject({ method: 'GET', url: '/account', headers: { cookie: second } });
  assert.equal(page.statusCode, 200);
  assert.match(page.body, /<strong id="current-user-name" title="새 이름">새 이름<\/strong>/);
  assert.ok((await auditActions(first)).includes('USER_PROFILE_UPDATE'));
});

test('표시 이름은 비우거나 너무 길거나 제어 문자를 넣을 수 없다', async () => {
  createUser('acct-bad-name', '이름', PASSWORD);
  const cookie = await loginCookie('acct-bad-name');
  for (const displayName of ['', '   ', 'x'.repeat(51), '줄\n바꿈', 123]) {
    const response = await app.inject({ method: 'PUT', url: '/api/auth/me', headers: { cookie }, payload: { displayName } });
    assert.equal(response.statusCode, 400, JSON.stringify(displayName));
    assert.equal(response.json().code, 'VALIDATION_ERROR');
  }
  assert.equal((await me(cookie)).displayName, '이름');
});

test('비밀번호를 바꾸면 이전 세션은 끊기고, 바꾼 브라우저는 새 쿠키로 계속 쓰며, 새 비밀번호로 로그인된다', async () => {
  resetLoginThrottle();
  createUser('acct-pw', '비번', PASSWORD);
  const mine = await loginCookie('acct-pw');
  const other = await loginCookie('acct-pw');

  const response = await app.inject({
    method: 'PUT', url: '/api/auth/password', headers: { cookie: mine },
    payload: { currentPassword: PASSWORD, newPassword: 'new-password-456' },
  });
  assert.equal(response.statusCode, 200, response.body);
  const renewed = cookieOf(response);
  assert.match(renewed, /^opsbox_session=.+/);

  assert.equal(await me(other), null, '다른 브라우저 세션은 끊김');
  assert.equal(await me(mine), null, '바꾸기 전 쿠키도 끊김');
  assert.equal((await me(renewed)).username, 'acct-pw', '새로 받은 쿠키는 그대로 사용');

  assert.equal((await app.inject({ method: 'POST', url: '/api/auth/login', payload: { username: 'acct-pw', password: PASSWORD } })).statusCode, 401);
  await loginCookie('acct-pw', 'new-password-456');
  const actions = await auditActions(renewed);
  assert.ok(actions.includes('USER_PASSWORD_CHANGE'));
  const detail = (await app.inject({ method: 'GET', url: '/api/audit-logs?pageSize=50', headers: { cookie: renewed } })).body;
  assert.doesNotMatch(detail, /new-password-456|old-password-123/, '감사 로그에 비밀번호가 남지 않음');
});

test('새 비밀번호 규칙: 12자 이상, 현재와 달라야 함', async () => {
  resetLoginThrottle();
  createUser('acct-pw-rule', '규칙', PASSWORD);
  const cookie = await loginCookie('acct-pw-rule');
  for (const newPassword of ['short-pw', PASSWORD, '', 'x'.repeat(257)]) {
    const response = await app.inject({ method: 'PUT', url: '/api/auth/password', headers: { cookie }, payload: { currentPassword: PASSWORD, newPassword } });
    assert.equal(response.statusCode, 400, newPassword);
  }
  assert.equal((await me(cookie)).username, 'acct-pw-rule', '실패하면 세션은 그대로');
});

test('현재 비밀번호를 틀리면 401이고, 5번 틀리면 잠긴다', async () => {
  resetLoginThrottle();
  createUser('acct-pw-wrong', '틀림', PASSWORD);
  const cookie = await loginCookie('acct-pw-wrong');
  const attempt = () => app.inject({ method: 'PUT', url: '/api/auth/password', headers: { cookie }, payload: { currentPassword: 'wrong-password-x', newPassword: 'new-password-456' } });
  for (let i = 0; i < 5; i++) assert.equal((await attempt()).statusCode, 401);
  assert.equal((await attempt()).statusCode, 429);
  assert.equal((await me(cookie)).username, 'acct-pw-wrong', '틀려도 로그아웃되지는 않음');
  resetLoginThrottle();
});

test('로그인하지 않으면 내 정보 API와 화면을 쓸 수 없다', async () => {
  assert.equal((await app.inject({ method: 'PUT', url: '/api/auth/me', payload: { displayName: 'x' } })).statusCode, 401);
  assert.equal((await app.inject({ method: 'PUT', url: '/api/auth/password', payload: { currentPassword: 'a', newPassword: 'b' } })).statusCode, 401);
  const page = await app.inject({ method: 'GET', url: '/account' });
  assert.equal(page.statusCode, 302);
});
